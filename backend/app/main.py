"""FastAPI application factory and router registration.

Keep this file to app creation, middleware and router wiring. Business logic
belongs in agent/, rag/ and voice/ — CLAUDE.md rule 7.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.routers import health

APP_VERSION = "0.1.0"
REQUEST_ID_HEADER = "X-Request-ID"

# Carries the current request id so every log line emitted while handling a
# request can be correlated without threading the id through call signatures.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIDLogFilter(logging.Filter):
    """Inject the current request id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


def configure_logging(settings: Settings) -> None:
    """Set up root logging so each line carries its request id.

    Question text and latency are logged elsewhere; IP addresses, audio and user
    identifiers are never logged — CLAUDE.md rule 9.
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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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

    app.include_router(health.router, prefix="/api")
    # chat and voice routers are registered here once their endpoints exist.

    return app


app = create_app()
