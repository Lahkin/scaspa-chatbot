"""Every Pydantic request/response model for the API lives here.

Pydantic v2 at every boundary — CLAUDE.md Style.

`chart` and `tool_calls` are present and always `null` / `[]` today. They are
declared now so the frontend can code against the final shape immediately and
not have to reshape when charts (Prompt 8) and tools (Prompt 5) land.

One field is deliberately absent from every client-facing model: the OpenAI
model name. It appears in `/api/health`, which is an operator endpoint, and
nowhere else — see `app/errors.py`.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# --------------------------------------------------------------------- chat


class Citation(BaseModel):
    """A verified citation.

    Built from the stored metadata of a knowledge-base row that was actually
    retrieved — never from model output. `kb_id` is the citation marker the
    answer text carries, e.g. `[kb-014]`.
    """

    kb_id: str = Field(description="Knowledge-base row id, matching the [kb-xxx] marker")
    category: str = Field(default="", description="Facility area, e.g. ferry")
    subcategory: str = Field(default="", description="Narrower topic, e.g. fares")
    source_url: str = Field(default="", description="Published SCASPA source")
    source_type: str = Field(default="", description="official-site, official-pdf, regulator, …")
    as_of: str = Field(default="", description="ISO date the fact was verified")
    confidence: str = Field(default="", description="Always 'confirmed' for indexed rows")


ChartType = Literal["line", "bar", "area"]

MAX_SERIES = 4
MAX_POINTS = 40

# A caption must say where the figures came from. Without one, a reader cannot
# tell a published tariff from an illustration — and a chart is believed far more
# readily than a sentence.
PROVENANCE_WORDS = (
    "official",
    "published",
    "audited",
    "illustrative",
    "illustration",
    "estimate",
    "estimated",
    "approximate",
    "sample",
    "placeholder",
    "not real",
)


class ChartPoint(BaseModel):
    """One point. `x` is a label or a number; `y` is always numeric."""

    x: str | float = Field(description="Category or position on the x axis")
    y: float = Field(description="The value. Must appear in the source knowledge-base row")


class ChartSeries(BaseModel):
    """One named line, bar group or band."""

    name: str = Field(min_length=1, description="Series label shown in the legend")
    points: list[ChartPoint] = Field(
        min_length=1,
        max_length=MAX_POINTS,
        description=f"1–{MAX_POINTS} points. Beyond that it is unreadable on a phone",
    )


class ChartSpec(BaseModel):
    """A chart specification. The model never draws; the frontend renders this.

    That separation is why charts stay on-brand and consistent, and why a model
    cannot hallucinate a chart into nonsense — it can only describe one, and every
    number it describes is checked against a retrieved knowledge-base row before
    this object is ever built.

    Field names mirror the frontend types exactly. Do not rename one.
    """

    type: ChartType = Field(description="line, bar or area. Nothing else is supported")
    title: str = Field(min_length=1, description="Short, factual chart title")
    x_label: str = Field(min_length=1, description="X axis label")
    y_label: str = Field(min_length=1, description="Y axis label, including units")
    series: list[ChartSeries] = Field(
        min_length=1, max_length=MAX_SERIES, description=f"1–{MAX_SERIES} series"
    )
    caption: str = Field(
        min_length=1,
        description=(
            "Mandatory. Must state whether the figures are official/published or "
            "illustrative/estimated."
        ),
    )
    source: str = Field(
        min_length=1, description="The knowledge-base row id the figures came from, e.g. kb-014"
    )

    @field_validator("caption")
    @classmethod
    def _caption_states_provenance(cls, v: str) -> str:
        """A caption that does not say where the numbers came from is not enough.

        Enforced here rather than asked for in the prompt, because a chart is
        believed more readily than a sentence and this is the one thing a reader
        cannot infer from the picture.
        """
        stripped = v.strip()
        if not stripped:
            raise ValueError("caption is required")
        if not any(word in stripped.lower() for word in PROVENANCE_WORDS):
            raise ValueError(
                "caption must say whether the figures are official/published or "
                "illustrative/estimated — a reader cannot tell from the chart alone"
            )
        return stripped


class ToolCall(BaseModel):
    """A tool the agent invoked while answering.

    **Always an empty list today.** Declared so the response shape is final.
    Arriving in Prompt 5.
    """

    name: str = Field(description="Tool name")
    summary: str = Field(default="", description="Short human-readable description")
    ms: int = Field(default=0, description="Duration in milliseconds")


class ResponseMeta(BaseModel):
    """Diagnostics for one answer.

    Safe to show in a debug panel. Contains no model name and no user data.
    """

    request_id: str = Field(description="Matches the X-Request-ID header")
    latency_ms: int = Field(description="Server-side time to produce the answer")
    retrieved_count: int = Field(description="Chunks considered")
    best_score: float = Field(description="Top retrieval similarity, 0–1, higher is better")
    cited_ids: list[str] = Field(default_factory=list, description="Verified ids in the answer")
    hallucinated_citations: list[str] = Field(
        default_factory=list,
        description="Ids the model invented; already stripped from the answer text",
    )
    unverified_figures: list[str] = Field(
        default_factory=list,
        description="Money/time values in the answer found in no retrieved chunk",
    )
    kb_version: str | None = Field(default=None, description="Knowledge-base version answered from")


class ChatRequest(BaseModel):
    """POST /api/chat body."""

    message: str = Field(
        min_length=1,
        max_length=1000,
        description="The user's question. 1–1000 characters.",
        examples=["How much is a ferry ticket?"],
    )
    conversation_id: str | None = Field(
        default=None,
        description="Omit on the first request; use the value returned in the response.",
    )
    category: str | None = Field(
        default=None, description="Optional retrieval filter, e.g. ferry, cargo, airport"
    )

    @field_validator("message")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        """Reject whitespace-only messages with a readable reason, not a 500."""
        if not v.strip():
            raise ValueError("message must contain at least one non-whitespace character")
        return v.strip()


class ChatResponse(BaseModel):
    """POST /api/chat response.

    `grounded: true` means every citation id and every money/time value in
    `answer` traces to a retrieved knowledge-base row. It does **not** mean the
    answer is correct — see docs/decisions.md 0007.
    """

    answer: str = Field(description="The answer, with unverifiable markers already stripped")
    conversation_id: str = Field(description="Send this back on the next request")
    grounded: bool = Field(description="Every id and figure traces to a retrieved row")
    refusal: bool = Field(description="True when the assistant declined to answer")
    refusal_category: str | None = Field(default=None, description="Which refusal applied, if any")
    citations: list[Citation] = Field(default_factory=list, description="Verified sources")
    chart: ChartSpec | None = Field(default=None, description="Always null today (Prompt 8)")
    tool_calls: list[ToolCall] = Field(
        default_factory=list, description="Always empty today (Prompt 5)"
    )
    meta: ResponseMeta = Field(description="Diagnostics")


# --------------------------------------------------------------------- voice


class SttResponse(BaseModel):
    """POST /api/stt response.

    Deliberately just the text. The transcript is **not** chained into the
    assistant — the frontend puts it in the input box so the user can correct a
    misheard terminal name or figure before asking.
    """

    text: str = Field(description="The transcript. Put this in the input box for the user to edit.")


class TtsRequest(BaseModel):
    """POST /api/tts body."""

    text: str = Field(
        min_length=1,
        max_length=8000,
        description="Text to speak. Markdown, [kb-xxx] markers and URLs are stripped first.",
        examples=["The one-way fare is XCD 44.44 [kb-008]."],
    )

    @field_validator("text")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must contain at least one non-whitespace character")
        return v


# ------------------------------------------------------------------- health


class ModelNames(BaseModel):
    """Configured model ids. Operator information."""

    chat: str
    embedding: str
    transcribe: str
    tts: str


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
    uptime_s: float = Field(description="Seconds since this process started serving")
    request_id: str = Field(description="Request id stamped by the request-ID middleware")
    models: ModelNames = Field(description="Configured model ids")
    index: IndexStatus = Field(description="Knowledge index status")


# -------------------------------------------------------------------- errors


class ErrorDetail(BaseModel):
    """The body of an error response."""

    code: str = Field(description="Stable machine-readable code; switch on this")
    message: str = Field(description="Human-readable, safe to show the user as-is")
    request_id: str | None = Field(default=None, description="For support and log correlation")


class ErrorEnvelope(BaseModel):
    """Every non-2xx response has this shape.

    Never contains a stack trace, a filesystem path, a model name or any
    upstream provider detail.
    """

    error: ErrorDetail
