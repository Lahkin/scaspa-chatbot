"""Every Pydantic request/response model for the API lives here.

Pydantic v2 at every boundary — CLAUDE.md Style.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# --------------------------------------------------------------------- health


class IndexStatus(BaseModel):
    """State of the Chroma knowledge index backing the assistant."""

    ready: bool = Field(description="Whether the index can currently serve retrieval")
    document_count: int | None = Field(
        default=None, description="Indexed chunk count, or null if unknown"
    )
    collection: str | None = Field(default=None, description="Chroma collection name")
    built_at: datetime | None = Field(
        default=None, description="When the index was last rebuilt, or null if never"
    )


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
