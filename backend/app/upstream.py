"""Timeout and bounded retry for OpenAI calls.

Retries **only** on 429 and 5xx — the two classes where trying again can
plausibly succeed. A 400 or a 401 is retried zero times: the request is wrong or
the key is wrong, and repeating it just burns time while a traveller waits.

Backoff is exponential from `OPENAI_BACKOFF_BASE_SECONDS`. `sleep` is injectable
so tests assert the backoff schedule without actually waiting.
"""

import logging
from collections.abc import Callable
from typing import TypeVar

from app.config import Settings, get_settings
from app.errors import UpstreamRateLimitedError, UpstreamTimeoutError

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Retryable server-side statuses. 429 is rate limiting; 5xx is the provider
# failing. Everything else is our fault and will fail again identically.
RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504, 529})


def _status_of(exc: BaseException) -> int | None:
    """Best-effort HTTP status for an exception, across SDK versions."""
    for attribute in ("status_code", "http_status", "code"):
        value = getattr(exc, attribute, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    return status if isinstance(status, int) else None


def _is_timeout(exc: BaseException) -> bool:
    if isinstance(exc, TimeoutError):
        return True
    # Matches openai.APITimeoutError / httpx timeouts without importing either,
    # so this keeps working if the SDK reorganises its exception tree.
    return "timeout" in type(exc).__name__.lower()


def _is_rate_limited(exc: BaseException) -> bool:
    if _status_of(exc) == 429:
        return True
    return "ratelimit" in type(exc).__name__.replace("_", "").lower()


def is_retryable(exc: BaseException) -> bool:
    """Whether retrying this exception could plausibly succeed."""
    if _is_timeout(exc) or _is_rate_limited(exc):
        return True
    status = _status_of(exc)
    return status in RETRYABLE_STATUSES if status is not None else False


def classify_failure(exc: BaseException) -> UpstreamTimeoutError | UpstreamRateLimitedError:
    """Map a final upstream failure onto the client-facing error."""
    detail = f"{type(exc).__name__}: {exc}"
    if _is_rate_limited(exc):
        return UpstreamRateLimitedError(log_detail=detail)
    return UpstreamTimeoutError(log_detail=detail)


def call_with_retry(
    fn: Callable[[], T],
    *,
    settings: Settings | None = None,
    sleep: Callable[[float], None] | None = None,
) -> T:
    """Run `fn`, retrying retryable upstream failures with exponential backoff.

    Raises `UpstreamRateLimitedError` or `UpstreamTimeoutError` when every
    attempt is exhausted. Non-retryable exceptions propagate immediately.
    """
    settings = settings or get_settings()
    if sleep is None:
        import time

        sleep = time.sleep

    attempts = settings.OPENAI_MAX_ATTEMPTS
    last: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — classified immediately below
            if not is_retryable(exc):
                raise
            last = exc
            if attempt == attempts:
                break
            delay = settings.OPENAI_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
            logger.warning(
                "upstream_retry attempt=%d/%d delay=%.2fs error=%s",
                attempt,
                attempts,
                delay,
                type(exc).__name__,
            )
            sleep(delay)

    assert last is not None  # noqa: S101 — only reachable after a caught failure
    logger.error("upstream_failed attempts=%d error=%s", attempts, type(last).__name__)
    raise classify_failure(last) from last
