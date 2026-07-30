"""Operator endpoint. Registered only when ADMIN_SECRET is set.

An unset secret **removes the route**, rather than exposing an unauthenticated
one. That ordering matters: a route that checks a secret it does not have is one
refactor away from checking nothing.

Authentication is a shared secret from the environment, compared with
`secrets.compare_digest`. That is enough for an operator stats page and is not
pretending to be more: it is a bearer token with no rotation and no audit trail,
which is stated here so nobody mistakes it for real access control.
"""

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from app.config import Settings, get_settings
from app.costs import SpendTracker, get_spend_tracker
from app.errors import AppError, ErrorCode
from app.rag.ingest import read_index_meta
from app.ratelimit import RateLimiter, get_rate_limiter
from app.schemas import AdminStats, ErrorEnvelope, SpendSummary

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])


class NotAuthorised(AppError):
    """Wrong or missing admin secret."""

    code = ErrorCode.NOT_FOUND
    status_code = 404
    # Deliberately a 404 with no hint: an operator route should not confirm it
    # exists to someone without the secret.
    message = "Not Found"


def require_secret(settings: Settings, provided: str | None) -> None:
    """Constant-time comparison against ADMIN_SECRET."""
    expected = settings.ADMIN_SECRET
    if not expected or not provided or not secrets.compare_digest(provided, expected):
        raise NotAuthorised


@router.get(
    "/admin/stats",
    response_model=AdminStats,
    summary="Operator statistics (requires the admin secret)",
    responses={404: {"model": ErrorEnvelope, "description": "Missing or wrong secret"}},
)
async def get_admin_stats(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    tracker: Annotated[SpendTracker, Depends(get_spend_tracker)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    x_admin_secret: Annotated[str | None, Header(alias="X-Admin-Secret")] = None,
) -> AdminStats:
    """Running spend estimate, index state and limiter state.

    The spend figure is an **estimate** from tokens this process observed. The
    authoritative control is the hard monthly cap on the OpenAI account; see
    docs/deploy.md. This is the early-warning light, not the fuse.
    """
    require_secret(settings, x_admin_secret)
    meta = read_index_meta(settings)
    today = tracker.estimate()

    return AdminStats(
        env=settings.ENV,
        request_id=getattr(request.state, "request_id", "-"),
        kb_version=meta.kb_version if meta else None,
        kb_rows=meta.kb_rows_indexed if meta else None,
        rate_limit_per_minute=limiter.limit_for("chat"),
        voice_rate_limit_per_minute=limiter.limit_for("voice"),
        tracked_clients=limiter.tracked_clients,
        today=SpendSummary(**vars(today)),
        history=[SpendSummary(**vars(day)) for day in tracker.history()],
    )
