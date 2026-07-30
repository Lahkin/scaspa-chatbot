"""Error taxonomy and the one place errors become HTTP responses.

Two rules govern everything here:

1. **Nothing internal reaches the client.** No stack trace, no filesystem path,
   no model name, no upstream provider detail. The client gets a stable `code`,
   a message written for a traveller, and the request id for correlation.
2. **Every message is actionable.** Someone reading it may be standing at a
   ferry terminal with luggage. "Internal server error" tells them nothing, so
   every message ends with the SCASPA phone number.

The full detail is logged server-side against the request id.
"""

import logging
from enum import StrEnum

from app.agent.prompts import SCASPA_PHONE

logger = logging.getLogger(__name__)


class ErrorCode(StrEnum):
    """Stable machine-readable codes. The frontend switches on these."""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    RETRIEVAL_EMPTY = "RETRIEVAL_EMPTY"
    RATE_LIMITED = "RATE_LIMITED"
    INDEX_MISSING = "INDEX_MISSING"
    UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT"
    UPSTREAM_RATE_LIMITED = "UPSTREAM_RATE_LIMITED"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL = "INTERNAL"


class AppError(Exception):
    """Base for errors that map to a client response.

    `message` is public and shown to the user as-is. Anything sensitive belongs
    in `log_detail`, which is logged and never serialised.
    """

    code: ErrorCode = ErrorCode.INTERNAL
    status_code: int = 500
    message: str = (
        f"Something went wrong on our side. Please try again in a moment, "
        f"or call SCASPA on {SCASPA_PHONE}."
    )

    def __init__(self, message: str | None = None, *, log_detail: str = "") -> None:
        self.message = message or self.message
        self.log_detail = log_detail
        super().__init__(self.message)


class ValidationError(AppError):
    code = ErrorCode.VALIDATION_ERROR
    status_code = 422
    message = "That question could not be read. Please rephrase it and try again."


class IndexMissingError(AppError):
    code = ErrorCode.INDEX_MISSING
    status_code = 503
    message = (
        f"The assistant's information is being updated and is not available right now. "
        f"Please try again shortly, or call SCASPA on {SCASPA_PHONE}."
    )


class RetrievalEmptyError(AppError):
    code = ErrorCode.RETRIEVAL_EMPTY
    status_code = 503
    message = (
        f"The assistant cannot search its information right now. "
        f"Please try again shortly, or call SCASPA on {SCASPA_PHONE}."
    )


class UpstreamTimeoutError(AppError):
    code = ErrorCode.UPSTREAM_TIMEOUT
    status_code = 504
    message = (
        f"That took too long to answer and timed out. Please try again. "
        f"If you need an answer now, call SCASPA on {SCASPA_PHONE}."
    )


class UpstreamRateLimitedError(AppError):
    code = ErrorCode.UPSTREAM_RATE_LIMITED
    status_code = 503
    message = (
        f"The assistant is busy right now. Please wait a moment and try again. "
        f"If you need an answer now, call SCASPA on {SCASPA_PHONE}."
    )


def log_app_error(error: AppError, request_id: str) -> None:
    """Record the private detail against the request id."""
    logger.warning(
        "app_error code=%s status=%d request_id=%s detail=%s",
        error.code,
        error.status_code,
        request_id,
        error.log_detail or "(none)",
    )


class RateLimitedError(AppError):
    """Too many requests from one client. Carries the Retry-After value."""

    code = ErrorCode.RATE_LIMITED
    status_code = 429
    message = (
        f"You have sent a lot of questions in a short time. Please wait a moment and "
        f"try again. If you need an answer now, call SCASPA on {SCASPA_PHONE}."
    )

    def __init__(
        self, retry_after: int = 60, message: str | None = None, *, log_detail: str = ""
    ) -> None:
        self.retry_after = retry_after
        super().__init__(message, log_detail=log_detail)
