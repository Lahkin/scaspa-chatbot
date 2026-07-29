"""Health endpoint.

Thin router: read the index metadata, map it to the schema, return — CLAUDE.md
rule 7.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.rag.ingest import index_meta_path, read_index_meta
from app.schemas import HealthResponse, IndexStatus

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Service health")
async def get_health(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthResponse:
    """Report service health and what is actually in the index.

    A missing `index_meta.json` is a normal, expected state on a fresh checkout —
    it reports `degraded` with an actionable message, never a 500.
    """
    meta = read_index_meta(settings)

    if meta is None:
        index = IndexStatus(
            ready=False,
            message=(
                f"No index metadata at {index_meta_path(settings)}. "
                "The index has not been built — run scripts/build_index.py."
            ),
        )
        return HealthResponse(
            status="degraded",
            env=settings.ENV,
            version=request.app.version,
            request_id=getattr(request.state, "request_id", "-"),
            index=index,
        )

    ready = meta.kb_rows_indexed > 0
    index = IndexStatus(
        ready=ready,
        kb_version=meta.kb_version,
        kb_rows=meta.kb_rows_indexed,
        kb_rows_rejected=meta.kb_rows_rejected,
        kb_csv_filename=meta.kb_csv_filename,
        kb_updated_at=meta.kb_updated_at,
        index_built_at=meta.index_built_at,
        embedding_model=meta.embedding_model,
        web_docs=meta.web_docs,
        message=None if ready else "Index metadata exists but no knowledge-base rows are indexed.",
    )
    return HealthResponse(
        status="ok" if ready else "degraded",
        env=settings.ENV,
        version=request.app.version,
        request_id=getattr(request.state, "request_id", "-"),
        index=index,
    )
