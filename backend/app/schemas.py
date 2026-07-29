"""Every Pydantic request/response model for the API lives here.

Pydantic v2 at every boundary — CLAUDE.md Style.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

# --------------------------------------------------------------------- health


class IndexStatus(BaseModel):
    """State of the Chroma knowledge index backing the assistant.

    Populated from `data/index_meta.json`, written by `scripts/build_index.py`.
    When that file is absent the index has never been built: `ready` is false and
    every detail is null rather than zero, so "unknown" is never mistaken for
    "empty".
    """

    ready: bool = Field(description="Whether the index can currently serve retrieval")
    kb_version: str | None = Field(
        default=None, description="Knowledge-base version, usually the export date"
    )
    kb_rows: int | None = Field(default=None, description="Confirmed rows indexed")
    kb_rows_rejected: int | None = Field(
        default=None, description="Rows rejected at the last build"
    )
    kb_csv_filename: str | None = Field(
        default=None, description="Resolved filename of the indexed CSV"
    )
    kb_updated_at: date | None = Field(
        default=None, description="Newest as_of date among indexed rows"
    )
    index_built_at: datetime | None = Field(
        default=None, description="When the index was last built"
    )
    embedding_model: str | None = Field(default=None, description="Model used to embed the index")
    web_docs: int | None = Field(default=None, description="Scraped web chunks indexed")
    message: str | None = Field(default=None, description="Explanation when the index is not ready")


class HealthResponse(BaseModel):
    """GET /api/health payload."""

    status: Literal["ok", "degraded"] = Field(description="Overall service health")
    env: str = Field(description="Deployment environment, from ENV")
    version: str = Field(description="Backend application version")
    request_id: str = Field(description="Request id stamped by the request-ID middleware")
    index: IndexStatus = Field(description="Knowledge index status")


class ErrorResponse(BaseModel):
    """Uniform error envelope."""

    detail: str = Field(description="Human-readable error message")
    request_id: str | None = Field(default=None, description="Request id, for log correlation")
