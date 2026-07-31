"""Vessel, flight and tariff endpoints.

Thin: validate, call a service, return — CLAUDE.md rule 7. Every decision about
what the data means lives in `app/ops/`.

**No model is called from this module.** These endpoints are the non-LLM data
path described in `app/ops/__init__.py`, which is what lets a panel show a
berth status while the assistant continues to refuse to claim one.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.ops.source import (
    OpsSource,
    filter_flights,
    filter_tariffs,
    filter_vessels,
    get_ops_source,
    paginate,
)
from app.ops.tariffs import build_quote, total_of
from app.ratelimit import RateLimiter, get_rate_limiter
from app.schemas import (
    ErrorEnvelope,
    FlightSchedulesResponse,
    TariffQuote,
    TariffQuoteRequest,
    TariffTableResponse,
    VesselArrivalsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["operations"])

DEFAULT_LIMIT = 25
MAX_LIMIT = 100


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "-")


@router.get(
    "/vessels",
    response_model=VesselArrivalsResponse,
    summary="Vessel arrivals and berth occupancy",
    responses={429: {"model": ErrorEnvelope, "description": "Too many requests"}},
)
async def get_vessels(
    request: Request,
    source: Annotated[OpsSource, Depends(get_ops_source)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    q: Annotated[str | None, Query(max_length=100, description="Vessel name or IMO")] = None,
    vessel_type: Annotated[str | None, Query(max_length=40)] = None,
    berth: Annotated[str | None, Query(max_length=40)] = None,
    status: Annotated[str | None, Query(max_length=20)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> VesselArrivalsResponse:
    """Vessel movements from the configured feed.

    **200 with an empty list when no feed is configured**, not an error. Nothing
    is broken in that case: SCASPA has not published one. `source.notice` says
    so in words the client renders directly.
    """
    from app.routers.chat import enforce_rate_limit

    enforce_rate_limit(request, limiter, scope="ops")

    matched = filter_vessels(source.vessels(), q, vessel_type, berth, status)
    return VesselArrivalsResponse(
        source=source.describe(),
        vessels=paginate(matched, limit, offset),
        metrics=source.vessel_metrics(),
        total=len(matched),
        request_id=_request_id(request),
    )


@router.get(
    "/flights",
    response_model=FlightSchedulesResponse,
    summary="Flight arrivals and departures at RLB International",
    responses={429: {"model": ErrorEnvelope, "description": "Too many requests"}},
)
async def get_flights(
    request: Request,
    source: Annotated[OpsSource, Depends(get_ops_source)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    q: Annotated[str | None, Query(max_length=100, description="Flight number or port")] = None,
    airline: Annotated[str | None, Query(max_length=60)] = None,
    status: Annotated[str | None, Query(max_length=20)] = None,
    direction: Annotated[str | None, Query(max_length=10)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> FlightSchedulesResponse:
    """Flight movements from the configured feed. Same empty-not-error rule."""
    from app.routers.chat import enforce_rate_limit

    enforce_rate_limit(request, limiter, scope="ops")

    matched = filter_flights(source.flights(), q, airline, status, direction)
    return FlightSchedulesResponse(
        source=source.describe(),
        flights=paginate(matched, limit, offset),
        metrics=source.flight_metrics(),
        advisory=source.advisory(),
        total=len(matched),
        request_id=_request_id(request),
    )


@router.get(
    "/tariffs",
    response_model=TariffTableResponse,
    summary="Published schedule of port charges",
    responses={429: {"model": ErrorEnvelope, "description": "Too many requests"}},
)
async def get_tariffs(
    request: Request,
    source: Annotated[OpsSource, Depends(get_ops_source)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=20)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = MAX_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TariffTableResponse:
    """The published rate table, filtered by the category chips and the search box."""
    from app.routers.chat import enforce_rate_limit

    enforce_rate_limit(request, limiter, scope="ops")

    rows = source.tariffs()
    matched = filter_tariffs(rows, q, category)
    # Chips come from the whole table, not the filtered slice — otherwise
    # selecting a category removes every other chip and there is no way back.
    categories = sorted({row.category for row in rows})
    return TariffTableResponse(
        source=source.describe(),
        tariffs=paginate(matched, limit, offset),
        categories=categories,
        total=len(matched),
        request_id=_request_id(request),
    )


@router.post(
    "/tariffs/quote",
    response_model=TariffQuote,
    summary="Estimate port charges from published rates",
    responses={
        422: {"model": ErrorEnvelope, "description": "Unusable inputs"},
        429: {"model": ErrorEnvelope, "description": "Too many requests"},
    },
)
async def post_tariff_quote(
    payload: TariffQuoteRequest,
    request: Request,
    source: Annotated[OpsSource, Depends(get_ops_source)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> TariffQuote:
    """Apply published rates to the details given and total them.

    The total is **derived** — it appears in no published source. It is computed
    here in code, never by a model, from rates that are each shown with their
    own line so the arithmetic can be checked by hand. `disclaimer` is mandatory
    and names what the figure is not: not an invoice, not a customs assessment,
    not a valuation. See `app/ops/tariffs.py` and docs/decisions.md 0020.
    """
    from app.routers.chat import enforce_rate_limit

    enforce_rate_limit(request, limiter, scope="ops")

    lines, unpriced = build_quote(payload, source)
    subtotal = total_of(lines)

    logger.info(
        "tariff_quote category=%s lines=%d unpriced=%d total=%.2f",
        payload.category,
        len(lines),
        len(unpriced),
        subtotal,
    )

    return TariffQuote(
        line_items=lines,
        subtotal=subtotal,
        # Equal today. Separate fields because a real tariff schedule grows a
        # surcharge or a rebate on top of the subtotal, and a client that
        # rendered one number would have to be rebuilt rather than re-pointed.
        total=subtotal,
        currency="XCD",
        source=source.describe(),
        request_id=_request_id(request),
    )
