"""Retry policy tests. No network, no waiting — `sleep` is injected."""

import pytest

from app.config import Settings
from app.errors import UpstreamRateLimitedError, UpstreamTimeoutError
from app.upstream import call_with_retry, is_retryable


class StatusError(Exception):
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"HTTP {status_code}")


class RateLimitError(Exception):
    status_code = 429


class APITimeoutError(Exception):
    pass


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        OPENAI_MAX_ATTEMPTS=3,
        OPENAI_BACKOFF_BASE_SECONDS=0.5,
    )


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504, 529])
def test_server_side_failures_are_retryable(status: int) -> None:
    assert is_retryable(StatusError(status)) is True


@pytest.mark.parametrize("status", [400, 401, 403, 404, 422])
def test_client_side_failures_are_not_retryable(status: int) -> None:
    """Retrying a bad request just makes the user wait longer for the same error."""
    assert is_retryable(StatusError(status)) is False


def test_timeouts_are_retryable() -> None:
    assert is_retryable(APITimeoutError()) is True
    assert is_retryable(TimeoutError()) is True


def test_success_first_time_makes_no_retries(settings) -> None:
    calls = []
    result = call_with_retry(
        lambda: calls.append(1) or "ok", settings=settings, sleep=lambda _: None
    )

    assert result == "ok"
    assert len(calls) == 1


def test_retries_then_succeeds(settings) -> None:
    attempts = {"n": 0}

    def flaky():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise StatusError(503)
        return "ok"

    assert call_with_retry(flaky, settings=settings, sleep=lambda _: None) == "ok"
    assert attempts["n"] == 3


def test_backoff_is_exponential(settings) -> None:
    delays: list[float] = []

    def always_fails():
        raise StatusError(503)

    with pytest.raises(UpstreamTimeoutError):
        call_with_retry(always_fails, settings=settings, sleep=delays.append)

    assert delays == [0.5, 1.0], "0.5 * 2^0, then 0.5 * 2^1; no sleep after the last attempt"


def test_attempts_are_bounded(settings) -> None:
    calls = []

    def always_fails():
        calls.append(1)
        raise StatusError(503)

    with pytest.raises(UpstreamTimeoutError):
        call_with_retry(always_fails, settings=settings, sleep=lambda _: None)

    assert len(calls) == settings.OPENAI_MAX_ATTEMPTS


def test_rate_limit_maps_to_its_own_error(settings) -> None:
    def rate_limited():
        raise RateLimitError()

    with pytest.raises(UpstreamRateLimitedError) as exc:
        call_with_retry(rate_limited, settings=settings, sleep=lambda _: None)

    assert "SCASPA" in exc.value.message
    assert "869-465-8121" in exc.value.message, "a stranded traveller needs the phone number"


def test_timeout_maps_to_its_own_error(settings) -> None:
    def slow():
        raise APITimeoutError()

    with pytest.raises(UpstreamTimeoutError) as exc:
        call_with_retry(slow, settings=settings, sleep=lambda _: None)

    assert "869-465-8121" in exc.value.message


def test_non_retryable_propagates_unchanged(settings) -> None:
    def bad_request():
        raise StatusError(400)

    with pytest.raises(StatusError):
        call_with_retry(bad_request, settings=settings, sleep=lambda _: None)


def test_upstream_detail_never_reaches_the_user_message(settings) -> None:
    def fails():
        raise StatusError(503)

    with pytest.raises(UpstreamTimeoutError) as exc:
        call_with_retry(fails, settings=settings, sleep=lambda _: None)

    assert "StatusError" not in exc.value.message
    assert "StatusError" in exc.value.log_detail, "detail is kept for the log only"
