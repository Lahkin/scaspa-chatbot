"""FastAPI application factory, middleware, error handlers and router wiring.

Keep this file to app creation and wiring. Business logic belongs in agent/,
rag/ and voice/ — CLAUDE.md rule 7.
"""

import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.errors import AppError, ErrorCode, RateLimitedError, log_app_error
from app.observability import JsonFormatter
from app.routers import admin, chat, health, operations, support, voice
from app.schemas import ErrorDetail, ErrorEnvelope
from app.watchtower import scheduler

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

# Response headers a cross-origin browser client is allowed to read.
#
# Only `Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`,
# `Expires`, `Last-Modified` and `Pragma` are CORS-safelisted; everything else is
# invisible to JavaScript unless it is named here. That is not a formality:
#
# * `Retry-After` carries the real rate-limit wait. Without it the client counts
#   down from its own conservative guess, which looks exactly like a working
#   countdown while inviting the user to retry early and collect another 429.
# * `X-TTS-Cache` is documented as something the client may read, so it has to be
#   readable.
#
# None of this shows up in server-side testing — Node does not enforce CORS, so
# `npm run check:integration` reads these headers happily either way. It only
# appears in a browser.
EXPOSED_HEADERS = [REQUEST_ID_HEADER, "Retry-After", "X-TTS-Cache"]


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
        JsonFormatter()
        if settings.LOG_JSON
        else logging.Formatter("%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s")
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
        response = error_response(exc.code, exc.message, exc.status_code, request_id)
        if isinstance(exc, RateLimitedError) and exc.retry_after:
            # A client that cannot see when to retry will retry immediately.
            response.headers["Retry-After"] = str(exc.retry_after)
        return response

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
        if "category" in field:
            # A client bug rather than a user's mistake, so the sentence is aimed
            # at whoever is integrating. It never reaches a traveller: the UI
            # picks the category, the user never types one.
            #
            # Body and query are told apart because the accepted sets differ.
            # `GET /api/tariffs?category=` takes all six groups the schedule is
            # divided into; `POST /api/tariffs/quote` takes the two the
            # calculator can price. An integrator who sent `storage` to the
            # quote sent a value that is valid on the other endpoint, so
            # "unknown" alone would send them looking for a typo they did not
            # make. Naming the two leaks nothing: both are published contract
            # values.
            if field and field[0] == "body":
                return (
                    "That quote asked for a category the calculator cannot "
                    "price. Send 'vessel_dues' or 'cargo'."
                )
            return "That request used an unknown category filter."
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start and stop the Watchtower sweep alongside the application.

    ## Why the scheduler lives in the API process at all

    A separate worker or a system cron would be the textbook answer, and both
    were considered. This deployment is one container; adding a second process
    to run one job every six hours would introduce a supervisor, a second image
    and a second thing that can be down without anybody noticing — to replace a
    task that is a few lines and cancels cleanly.

    The two things that usually make this a bad idea are handled rather than
    ignored: multiple workers would each run their own sweep, so
    `scheduler_lease` in SQLite settles which one does; and the fetch is
    blocking, so it goes to a thread instead of stalling every in-flight chat
    stream. See app/watchtower/scheduler.py.

    Nothing here is allowed to prevent the API from serving. If the task cannot
    be created the application still comes up — a port that answers questions
    with a stale schedule is worth much more than one that refuses to boot.
    """
    task = None
    try:
        task = scheduler.start(app.state, get_settings())
    except Exception:
        logger.exception("watchtower_scheduler_start_failed")
    try:
        yield
    finally:
        await scheduler.stop(task)


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        lifespan=lifespan,
        title="Pilot API — SCASPA Digital Guide",
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

    if settings.ENV == "prod" and settings.OPS_DATA_SOURCE.strip().lower() == "fixture":
        # Sample vessel and flight data in production would put an invented
        # arrivals board in front of someone who came to check a real sailing —
        # CLAUDE.md rule 5, and the most consequential way to break it, because
        # an operations table is believed on sight.
        #
        # Refused at boot, like the wildcard origin above, rather than checked
        # per request: a guard that runs once cannot be bypassed by a route
        # someone adds later. The safe setting is `none`, which serves an honest
        # empty state.
        raise ValueError(
            "OPS_DATA_SOURCE must not be 'fixture' when ENV=prod — it serves invented "
            "vessel and flight data. Use 'none' until a real feed is configured."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
        expose_headers=EXPOSED_HEADERS,
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
    app.include_router(voice.router, prefix="/api")
    app.include_router(operations.router, prefix="/api")
    app.include_router(support.router, prefix="/api")

    # The admin route does not exist unless a secret is configured. An
    # unauthenticated operator endpoint is worse than none, so absence is the
    # default rather than a check that could be refactored away.
    if settings.admin_enabled:
        app.include_router(admin.router, prefix="/api")
    else:
        logger.info("admin_route_disabled reason=ADMIN_SECRET_not_set")

    return app


app = create_app()
