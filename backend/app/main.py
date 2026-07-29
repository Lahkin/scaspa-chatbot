"""FastAPI application factory, middleware, error handlers and router wiring.

Keep this file to app creation and wiring. Business logic belongs in agent/,
rag/ and voice/ — CLAUDE.md rule 7.
"""

import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.errors import AppError, ErrorCode, log_app_error
from app.routers import chat, health
from app.schemas import ErrorDetail, ErrorEnvelope

APP_VERSION = "0.1.0"
REQUEST_ID_HEADER = "X-Request-ID"

# Set once at import so /api/health can report uptime.
STARTED_AT = time.monotonic()

# Carries the current request id so every log line emitted while handling a
# request can be correlated without threading the id through call signatures.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

logger = logging.getLogger(__name__)

ALLOWED_METHODS = ["GET", "POST", "OPTIONS"]
ALLOWED_HEADERS = ["Content-Type", "Accept", REQUEST_ID_HEADER]


class RequestIDLogFilter(logging.Filter):
    """Inject the current request id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


def configure_logging(settings: Settings) -> None:
    """Set up root logging so each line carries its request id.

    Question text and latency are logged; IP addresses, audio and user
    identifiers never are — CLAUDE.md rule 9.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s")
    )
    handler.addFilter(RequestIDLogFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.LOG_LEVEL.upper())


def error_response(
    code: ErrorCode | str,
    message: str,
    status_code: int,
    request_id: str,
) -> JSONResponse:
    """Build the one error shape the API ever returns."""
    envelope = ErrorEnvelope(
        error=ErrorDetail(code=str(code), message=message, request_id=request_id)
    )
    return JSONResponse(status_code=status_code, content=envelope.model_dump())


def register_exception_handlers(app: FastAPI) -> None:
    """One central place where an exception becomes a client response.

    Nothing internal escapes: no stack trace, no filesystem path, no model name,
    no upstream provider detail. Full detail goes to the log against the
    request id.
    """

    def _request_id(request: Request) -> str:
        return getattr(request.state, "request_id", "-")

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        request_id = _request_id(request)
        log_app_error(exc, request_id)
        return error_response(exc.code, exc.message, exc.status_code, request_id)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        request_id = _request_id(request)
        logger.info("validation_error request_id=%s errors=%s", request_id, exc.errors())
        return error_response(
            ErrorCode.VALIDATION_ERROR,
            _friendly_validation_message(exc),
            422,
            request_id,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        request_id = _request_id(request)
        code = ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.INTERNAL
        message = exc.detail if isinstance(exc.detail, str) else "Request could not be completed."
        return error_response(code, message, exc.status_code, request_id)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        request_id = _request_id(request)
        # exception() records the traceback server-side only.
        logger.exception("unhandled_error request_id=%s", request_id)
        return error_response(ErrorCode.INTERNAL, AppError.message, 500, request_id)


def _friendly_validation_message(exc: RequestValidationError) -> str:
    """Turn Pydantic's validation detail into something a traveller can act on.

    Never echoes the raw error, which can contain internal field paths.
    """
    settings = get_settings()
    for error in exc.errors():
        field = error.get("loc", ())
        if "message" in field:
            kind = error.get("type", "")
            if kind == "string_too_long":
                return (
                    f"That question is too long. Please shorten it to "
                    f"{settings.MAX_MESSAGE_CHARS} characters or fewer."
                )
            if kind in {"string_too_short", "missing"} or "non-whitespace" in error.get("msg", ""):
                return "Please type a question before sending."
    return "That request could not be read. Please check it and try again."


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title="SCASPA Assistant API",
        description=(
            "Backend for the SCASPA AI assistant. Answers questions about the Deep Water "
            "Harbour (cargo), Port Zante (cruise), the Basseterre Ferry Terminal and "
            "R.L. Bradshaw International Airport using verified SCASPA sources only, and "
            "cites every factual claim."
        ),
        version=APP_VERSION,
    )

    origins = settings.allowed_origins_list
    if settings.ENV == "prod" and "*" in origins:
        # A wildcard in production would let any site call the API with the
        # user's browser. Fail at boot rather than serve unsafely.
        raise ValueError("ALLOWED_ORIGINS must not contain '*' when ENV=prod")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
        expose_headers=[REQUEST_ID_HEADER],
    )

    @app.middleware("http")
    async def request_id_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Stamp every request with an id, echo it back, and bind it to logs."""
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        request.state.request_id = request_id
        token = request_id_ctx.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    register_exception_handlers(app)

    app.include_router(health.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")

    return app


app = create_app()
