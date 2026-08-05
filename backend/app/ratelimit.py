"""Per-client rate limiting. A public endpoint with no limits is an invitation.

## The IP is a key, never a record

The client IP is hashed with a per-process salt and used as a dictionary key in
memory. It is **never logged, never persisted, and never returned**. The salt is
random per process, so two runs cannot be correlated even if the memory were
dumped, and the counter itself expires within a minute.

That is the whole reason this is defensible: the limiter needs to distinguish
clients, and it does not need to know who they are.

## Each scope is budgeted by what it costs

Three scopes, and the split is by expense rather than by tidiness:

* **chat** — a model call plus embeddings. The expensive one, and the base limit.
* **voice** — billed per second and per character; one recording costs several
  text turns, so it gets a *lower* cap.
* **ops** — reading vessels, flights or tariffs. No model, no embedding, just a
  dictionary lookup, so it gets a *higher* cap.

The ops split is not a nicety. Browsing an arrivals board is a handful of
requests — a search, a filter, a refresh — and if those came out of the chat
budget then paging through vessel arrivals would leave a traveller unable to ask
a question, having spent their allowance on page views they never thought of as
requests.
"""

import hashlib
import logging
import secrets
import threading
import time
from dataclasses import dataclass, field

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60

# Voice costs several times a text turn, so it gets its own tighter budget.
VOICE_LIMIT_DIVISOR = 3
MIN_VOICE_LIMIT = 3

# Reading a data feed costs a dictionary lookup. Browsing a board is naturally
# several requests, and they must not come out of the budget for asking a
# question.
OPS_LIMIT_MULTIPLIER = 4

# Random per process. Rotating on restart means a hashed key cannot be matched
# against one from an earlier run.
_SALT = secrets.token_bytes(16)


def client_key(ip: str | None) -> str:
    """A stable, non-reversible key for one client within this process."""
    return hashlib.blake2b((ip or "unknown").encode("utf-8"), key=_SALT, digest_size=16).hexdigest()


@dataclass
class Decision:
    """Outcome of one rate-limit check."""

    allowed: bool
    limit: int
    remaining: int
    retry_after: int = 0


@dataclass
class _Bucket:
    hits: list[float] = field(default_factory=list)


class RateLimiter:
    """Fixed-window-per-key limiter, in memory, thread-safe.

    Not shared between workers: two uvicorn processes each enforce the limit
    separately, so the effective ceiling is the limit times the worker count.
    Accepted for the same reason as the conversation store — sharing it would mean
    external storage keyed by client, which is exactly the record we are avoiding.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._buckets: dict[tuple[str, str], _Bucket] = {}
        self._lock = threading.Lock()

    def limit_for(self, scope: str) -> int:
        base = self._settings.RATE_LIMIT_PER_MINUTE
        if scope == "voice":
            return max(MIN_VOICE_LIMIT, base // VOICE_LIMIT_DIVISOR)
        if scope == "ops":
            return base * OPS_LIMIT_MULTIPLIER
        return base

    def check(self, ip: str | None, scope: str = "chat") -> Decision:
        """Record a hit and say whether it is allowed."""
        limit = self.limit_for(scope)
        key = (client_key(ip), scope)
        now = time.monotonic()
        cutoff = now - WINDOW_SECONDS

        with self._lock:
            self._prune(cutoff)
            bucket = self._buckets.setdefault(key, _Bucket())
            bucket.hits = [t for t in bucket.hits if t > cutoff]

            if len(bucket.hits) >= limit:
                oldest = min(bucket.hits)
                retry_after = max(1, int(oldest + WINDOW_SECONDS - now) + 1)
                # The scope and the limit are logged. The key is not, and the IP
                # certainly is not — CLAUDE.md rule 9.
                logger.warning(
                    "rate_limited scope=%s limit=%d retry_after=%d", scope, limit, retry_after
                )
                return Decision(allowed=False, limit=limit, remaining=0, retry_after=retry_after)

            bucket.hits.append(now)
            return Decision(allowed=True, limit=limit, remaining=limit - len(bucket.hits))

    def _prune(self, cutoff: float) -> None:
        """Drop empty buckets so memory does not grow with unique clients."""
        stale = [k for k, b in self._buckets.items() if not [t for t in b.hits if t > cutoff]]
        for key in stale:
            del self._buckets[key]

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    @property
    def tracked_clients(self) -> int:
        with self._lock:
            return len(self._buckets)


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    """Process-wide limiter. A FastAPI dependency, overridable in tests."""
    global _limiter  # noqa: PLW0603 — one per process by design
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter


def reset_rate_limiter() -> None:
    global _limiter  # noqa: PLW0603
    _limiter = None
