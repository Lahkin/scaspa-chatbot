"""Health endpoint.

Thin router: no logic beyond reporting configured state — CLAUDE.md rule 7.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.schemas import HealthResponse, IndexStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Service health")
async def get_health(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthResponse:
    """Report service health.

    Index fields are placeholders until the RAG layer exists; they report an
    unbuilt index rather than claiming readiness.
    """
    return HealthResponse(
        status="ok",
        env=settings.ENV,
        version=request.app.version,
        request_id=getattr(request.state, "request_id", "-"),
        index=IndexStatus(
            ready=False,
            document_count=None,
            collection=None,
            built_at=None,
        ),
    )
