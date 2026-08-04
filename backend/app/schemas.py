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
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.agent.prompts import SCASPA_PHONE

# --------------------------------------------------------------------- chat

# The retrieval filter values the knowledge base actually uses. Mirrored in the
# frontend's `Category` type.
#
# These are read off the researchers' export, not chosen here. The list was five
# while the index held a 12-row fixture; the delivered corpus
# (scaspa_kb_2026-07-31.csv) uses ten, and the five that were missing —
# `marine`, `payments`, `access`, `jobs`, `corporate` — cover 47 confirmed rows
# between them. They were reachable by semantic search but no client could filter
# to them and `classify_category` could never select one, so pilotage, tugs and
# MARSEC questions were competing against the whole corpus unfiltered.
#
# Adding a category here is only half the job: `app/rag/rewrite.py` needs
# decisive keywords for it, or the classifier still cannot choose it.
CATEGORIES: tuple[str, ...] = (
    "ferry",
    "cargo",
    "cruise",
    "airport",
    "general",
    "marine",
    "payments",
    "access",
    "jobs",
    "corporate",
)


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
    volatility: str | None = Field(
        default=None,
        description=(
            "low, medium or high — how fast this fact goes stale. Drives how prominently "
            "the client asks the reader to confirm before travelling. Null for a source "
            "with no volatility on record, which a client must read as the cautious case."
        ),
    )
    label: str | None = Field(
        default=None,
        description="Human-readable name for the row: the KB `question`. Null when unknown.",
    )
    snippet: str | None = Field(
        default=None,
        description=(
            "Short excerpt of the row's stored answer, truncated on a word boundary. "
            "Copied verbatim from the indexed row — never model output, never summarised."
        ),
    )


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
        default=None,
        description=f"Optional retrieval filter. One of: {', '.join(CATEGORIES)}.",
        examples=["ferry"],
    )

    @field_validator("message")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        """Reject whitespace-only messages with a readable reason, not a 500."""
        if not v.strip():
            raise ValueError("message must contain at least one non-whitespace character")
        return v.strip()

    @field_validator("category")
    @classmethod
    def _known_category(cls, v: str | None) -> str | None:
        """Reject an unknown category rather than filtering retrieval to nothing.

        The filter is applied as a Chroma metadata equality, so `"Ferry"` or
        `"ferries"` matches no row at all and the caller gets a confident "I do
        not have that" for a question the knowledge base answers. A typo in a
        filter should be a 422, not a silent no-answer.
        """
        if v is None:
            return None
        normalised = v.strip().lower()
        if not normalised:
            return None
        if normalised not in CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(CATEGORIES)}")
        return normalised


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
    question_sanitised: str | None = Field(
        default=None,
        description=(
            "The question as it was actually sent to the model, when input safety changed "
            "it — otherwise null. Instruction-like phrasing is replaced in place with the "
            "marker '[instruction-like text removed]', so the position in the sentence is "
            "preserved and a client can show the user exactly what went. The user's own "
            "words changed on screen; that needs explaining where it happened"
        ),
    )
    answer_replaced: bool = Field(
        default=False,
        description=(
            "True when the drafted answer carried figures that could not be matched to a "
            "retrieved row and was replaced. The client shows a correction notice; without "
            "this flag it cannot tell a replaced figure from an original one"
        ),
    )
    step_limit_reached: bool = Field(
        default=False,
        description=(
            "True when the agent ran out of tool calls before it could finish. A distinct "
            "signal from 'not in our data': one is answered by asking a simpler question, "
            "the other never will be"
        ),
    )
    citations: list[Citation] = Field(default_factory=list, description="Verified sources")
    chart: ChartSpec | None = Field(default=None, description="A chart to render, or null")
    card: "AssistantCard | None" = Field(
        default=None,
        description=(
            "An interactive card to render below the answer, or null. Rows are populated "
            "from the operational feed, never from model output — see the card block below."
        ),
    )
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


# --------------------------------------------------------- operations data
#
# Vessel arrivals, flight schedules and the tariff table: the structured
# surfaces the UI mockups render as cards and tables.
#
# ## Why these are not the assistant
#
# `app/agent/prompts.py` rule 10 forbids the assistant from claiming live
# status — it cannot see whether a berth is occupied or a flight is delayed,
# and it must never infer that from a published schedule. These endpoints are a
# **separate, non-LLM path**: they serve a data feed, they say where it came
# from and how old it is, and no model output is involved at any point.
#
# That separation is what makes both true at once. The panel can show "EN
# ROUTE" because a feed said so and the card says which feed and when; the
# assistant still declines to say it in prose, because the assistant has no
# feed. See docs/decisions.md 0020.


SourceKind = Literal["live", "fixture", "unavailable"]


class DataSource(BaseModel):
    """Where a set of operational records came from, and how much to trust it.

    Mandatory on every operations response and **mandatory to render**, for the
    same reason `ChartSpec.caption` is: a table of vessel arrivals is believed
    on sight, and nothing in the rows themselves tells a reader whether they are
    looking at a real feed or at sample data.
    """

    kind: SourceKind = Field(description="live, fixture, or unavailable")
    label: str = Field(description="Human-readable origin, safe to render as-is")
    as_of: datetime | None = Field(
        default=None, description="When this data was produced. Null when unknown"
    )
    notice: str | None = Field(
        default=None,
        description=(
            "A warning the client must display. Always present for a fixture source "
            "and for an unavailable one; null only for a live feed."
        ),
    )

    @model_validator(mode="after")
    def _fixture_must_warn(self) -> "DataSource":
        """A fixture that does not announce itself is the whole problem.

        CLAUDE.md rule 5 bans seed data mistakable for a real SCASPA fact. The
        values are obviously fake, but "obviously" is doing a lot of work on a
        screen that looks like an operations console — so the notice is
        structural rather than a convention someone has to remember.
        """
        if self.kind in {"fixture", "unavailable"} and not (self.notice or "").strip():
            raise ValueError(f"a {self.kind} source must carry a notice explaining itself")
        return self


VesselStatus = Literal["at_berth", "en_route", "scheduled", "departed", "unknown"]
FlightStatus = Literal["on_time", "delayed", "landed", "arrived", "boarding", "cancelled"]
FlightDirection = Literal["arrival", "departure"]


class VesselArrival(BaseModel):
    """One vessel movement."""

    id: str = Field(description="Stable id for this record within the feed")
    name: str = Field(description="Vessel name as published")
    imo: str | None = Field(default=None, description="IMO number, or null if not published")
    vessel_type: str = Field(default="", description="Container, Cruise, Tanker, …")
    agent: str = Field(default="", description="Shipping agent")
    berth: str = Field(default="", description="Berth or pier assignment")
    status: VesselStatus = Field(default="unknown")
    # `eta` and `ata` are separate fields rather than one timestamp plus a flag,
    # because the difference is the whole point: an ETA is a prediction and an
    # ATA is a record of something that happened. Collapsing them lets a UI
    # present a guess as a fact.
    eta: datetime | None = Field(default=None, description="Estimated arrival. A prediction")
    ata: datetime | None = Field(default=None, description="Actual arrival. A record")


class VesselMetrics(BaseModel):
    """The stat tiles above the vessel table. Every field nullable — see below."""

    # Null, never 0. A feed that does not report berth occupancy must not render
    # as "0 vessels at berth", which reads as an empty port rather than as an
    # unknown. Same rule as IndexStatus.
    vessels_at_berth: int | None = Field(default=None)
    berth_capacity: int | None = Field(default=None)
    arrivals_next_24h: int | None = Field(default=None)
    daily_cargo_teu: int | None = Field(default=None)


class VesselArrivalsResponse(BaseModel):
    """GET /api/vessels."""

    source: DataSource
    vessels: list[VesselArrival] = Field(default_factory=list)
    metrics: VesselMetrics = Field(default_factory=VesselMetrics)
    total: int = Field(default=0, description="Matching records before paging")
    request_id: str = Field(default="")


class Flight(BaseModel):
    """One flight movement."""

    id: str
    flight_no: str = Field(description="e.g. AA 2245")
    airline: str = Field(default="", description="Operating airline, spelled out")
    airline_code: str = Field(default="", description="Two-letter code, for the avatar")
    direction: FlightDirection = Field(default="arrival")
    # For an arrival this is where it came from; for a departure, where it goes.
    port: str = Field(default="", description="Other end of the route, spelled out")
    port_code: str = Field(default="", description="IATA code, e.g. MIA")
    gate: str | None = Field(default=None)
    status: FlightStatus = Field(default="on_time")
    scheduled_time: datetime | None = Field(default=None)
    estimated_time: datetime | None = Field(
        default=None,
        description="Only when it differs from scheduled. The revised time for a delay",
    )


class FlightMetrics(BaseModel):
    """The stat tiles above the flight table. Nullable for the same reason."""

    total_flights: int | None = Field(default=None)
    on_time_percent: float | None = Field(default=None)
    gates_active: int | None = Field(default=None)
    gates_total: int | None = Field(default=None)


class OperationalAdvisory(BaseModel):
    """The weather / runway panel beside the flight table.

    Published advisory text only. No forecast is produced here and none is
    inferred — this is a passthrough of whatever the source stated.
    """

    headline: str = Field(description="e.g. 'Partly cloudy'")
    detail: str = Field(default="", description="e.g. 'Winds SE at 14kts'")
    temperature_c: float | None = Field(default=None)
    systems_status: str = Field(default="", description="e.g. 'All runway systems operational'")


class FlightSchedulesResponse(BaseModel):
    """GET /api/flights."""

    source: DataSource
    flights: list[Flight] = Field(default_factory=list)
    metrics: FlightMetrics = Field(default_factory=FlightMetrics)
    advisory: OperationalAdvisory | None = Field(default=None)
    total: int = Field(default=0)
    request_id: str = Field(default="")


# ── The panels the mockups show and no feed has ever filled ──────────────────
#
# Vessel positions, gate occupancy, marine advisories. Until now each of these
# was a panel that stated its own absence, which was the honest answer while
# there was no source at all.
#
# They are modelled here so that a source CAN fill them — the fixture one does,
# obviously-fakely, and a real AIS or AODB integration would too. Every response
# carries the same mandatory `DataSource` as the rest of the operations surface,
# so a reader is never left to guess whether a position on a map is real. The
# boot guard in `main.py` still refuses to start with fixtures when ENV=prod, so
# sample positions cannot reach a passenger.

VesselPositionSource = Literal["ais", "manual", "estimated"]


class VesselPosition(BaseModel):
    """Where a vessel is, according to whoever is reporting it.

    `reported_by` is not decoration. An AIS transponder, a harbour master typing
    into a form and a dead-reckoning estimate are three different claims, and a
    map that draws them identically invites a reader to treat the third as the
    first.
    """

    id: str = Field(description="Matches VesselArrival.id where the same vessel is in both")
    name: str = Field(description="Vessel name as published")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    heading_degrees: float | None = Field(default=None, ge=0, lt=360)
    speed_knots: float | None = Field(default=None, ge=0)
    reported_by: VesselPositionSource = Field(default="ais")
    reported_at: datetime | None = Field(default=None)


class VesselPositionsResponse(BaseModel):
    """GET /api/ops/positions."""

    source: DataSource
    positions: list[VesselPosition] = Field(default_factory=list)
    total: int = Field(default=0)
    request_id: str = Field(default="")


GateStatus = Literal["occupied", "boarding", "free", "closed"]


class GateAssignment(BaseModel):
    """One stand on the apron."""

    gate: str = Field(description="Gate or stand designator")
    status: GateStatus = Field(default="free")
    flight_number: str | None = Field(default=None)
    airline: str = Field(default="")
    # Null, never "now". A gate with no published time is unknown, and rendering
    # it as imminent is the same class of error as VesselMetrics' null-not-zero.
    scheduled_at: datetime | None = Field(default=None)


class GateMapResponse(BaseModel):
    """GET /api/ops/gates."""

    source: DataSource
    gates: list[GateAssignment] = Field(default_factory=list)
    # Counted from `gates` by the source, not by the client — two places
    # computing "how many are active" is two places to disagree.
    active: int = Field(default=0)
    total: int = Field(default=0)
    request_id: str = Field(default="")


AdvisorySeverity = Literal["low", "moderate", "high"]


class MarineAdvisory(BaseModel):
    """A published notice to mariners, passed through verbatim.

    Distinct from `OperationalAdvisory`, which is the airport's. A swell warning
    for Basseterre and a runway status are not the same kind of statement and
    must not share a model — the moment they do, one screen starts rendering the
    other's text under the wrong heading.

    Nothing here is forecast or inferred. `headline` and `detail` are whatever
    the source stated; this service does not produce marine weather and must
    never appear to.
    """

    id: str = Field(description="Stable id within the feed")
    port: str = Field(description="Which facility the notice concerns")
    headline: str = Field(description="e.g. 'Sample swell advisory'")
    detail: str = Field(default="")
    severity: AdvisorySeverity = Field(default="low")
    issued_at: datetime | None = Field(default=None)


class MarineAdvisoriesResponse(BaseModel):
    """GET /api/ops/advisories."""

    source: DataSource
    advisories: list[MarineAdvisory] = Field(default_factory=list)
    total: int = Field(default=0)
    request_id: str = Field(default="")


class OperatorProfile(BaseModel):
    """The console's operator identity panel.

    ── READ THIS BEFORE USING IT FOR ANYTHING ───────────────────────────────

    This is **not** an authenticated user. This product has no sign-in, no
    session and no user record; `frontend/CLAUDE.md` rule 2 forbids all three,
    and rule 9 here forbids logging a user identifier at all. Nothing on this
    model is derived from who is asking, because nothing about who is asking is
    ever known.

    It exists so the design's `profile_settings` screen can be built and
    reviewed. It is served **only** by the fixture source, which `main.py`
    refuses to boot with when ENV=prod — so the one way this reaches a real user
    is a deployment that is already refusing to start.

    `is_demo` is a required, always-true literal rather than a bool: a field
    that could be False is a field somebody will eventually set to False.
    """

    is_demo: Literal[True] = True
    display_name: str
    division: str = Field(default="")
    agent_id: str = Field(default="")
    jurisdiction: str = Field(default="")
    role: str = Field(default="")
    last_sync: datetime | None = Field(default=None)
    active: bool = Field(default=False)
    verified: bool = Field(default=False)
    # Rendered as prominently as the card itself. The screen must say what it is.
    notice: str = Field(min_length=1)


class OperatorProfileResponse(BaseModel):
    """GET /api/ops/profile. `profile` is null on every non-fixture source."""

    source: DataSource
    profile: OperatorProfile | None = Field(default=None)
    request_id: str = Field(default="")


TariffCategory = Literal["maritime", "aviation", "cargo", "passenger"]


class TariffRow(BaseModel):
    """One published charge."""

    code: str = Field(description="Tariff code, e.g. MAR-001")
    service: str = Field(description="What is being charged for")
    basis: str = Field(description="Unit the rate applies to, e.g. '24h/Ft'")
    amount: float = Field(ge=0, description="The published figure, exactly as published")
    currency: str = Field(default="XCD")
    category: TariffCategory
    kb_id: str | None = Field(
        default=None, description="Knowledge-base row this rate was published in, if indexed"
    )
    as_of: str = Field(default="", description="ISO date the rate was verified")


class TariffTableResponse(BaseModel):
    """GET /api/tariffs."""

    source: DataSource
    tariffs: list[TariffRow] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list, description="Category chips to render")
    total: int = Field(default=0)
    request_id: str = Field(default="")


# ------------------------------------------------------------ tariff quote


class TariffQuoteRequest(BaseModel):
    """POST /api/tariffs/quote.

    Every field is optional because the two calculators in the design collect
    different inputs — the assistant card asks about containers, the tariffs
    page asks about a vessel. Whichever arrive, only the line items they support
    are priced, and the response says which rates were applied.
    """

    category: TariffCategory = Field(default="maritime")
    vessel_type: str | None = Field(default=None)
    length_ft: float | None = Field(default=None, ge=0, le=2000)
    stay_days: int | None = Field(default=None, ge=0, le=365)
    container_size: Literal["20ft", "40ft"] | None = Field(default=None)
    units: int | None = Field(default=None, ge=0, le=10_000)
    storage_days: int | None = Field(default=None, ge=0, le=365)
    currency: str = Field(default="XCD")

    @field_validator("currency")
    @classmethod
    def _only_xcd(cls, v: str) -> str:
        """One currency, because converting one is inventing a figure.

        Prompt rule 4 forbids converting a published fee to another currency,
        and a calculator that silently applied a rate of exchange would do
        exactly that with more authority than a sentence.
        """
        if v.strip().upper() != "XCD":
            raise ValueError("only XCD is supported; converting a published fee is not")
        return "XCD"


class TariffLineItem(BaseModel):
    """One priced line. `amount` is `rate * quantity`, computed here, never by a model."""

    code: str = Field(description="The tariff code this line applies")
    label: str = Field(description="Readable name of the charge")
    basis: str = Field(description="What the rate is per")
    rate: float = Field(description="The published rate, exactly as published")
    quantity: float = Field(description="How many units of `basis`")
    quantity_label: str = Field(default="", description="Readable quantity, e.g. '5 days'")
    amount: float = Field(description="rate × quantity, rounded to 2dp")
    kb_id: str | None = Field(default=None, description="Citation for `rate`")


# The sentence that has to appear under every total.
#
# Long, and deliberately so. It is the only thing standing between a helpful
# calculator and someone budgeting a shipment against a number this tool made
# up out of published parts. It names the three things it is NOT, because
# "estimate" alone is read as "approximately correct" rather than as "not
# binding on anyone".
TARIFF_ESTIMATE_DISCLAIMER = (
    "Estimate only. Each rate above is a published SCASPA tariff, but the total is "
    "calculated by this tool from the details you entered — it is not an invoice, "
    "not an official customs assessment, and not a valuation. Charges depend on "
    "measurements, exemptions and classifications that are confirmed by SCASPA on "
    f"invoicing. Do not rely on this figure: confirm it with SCASPA on {SCASPA_PHONE}."
)


class TariffQuote(BaseModel):
    """POST /api/tariffs/quote response.

    `total` is **derived**. Every `rate` is published and cited; the arithmetic
    on top of them is this tool's, which is why `derived` is a required literal
    rather than a flag someone could forget to set, and why `disclaimer` cannot
    be empty.
    """

    line_items: list[TariffLineItem] = Field(default_factory=list)
    unpriced: list[str] = Field(
        default_factory=list,
        description=(
            "Codes that applied to this movement but have no published rate, so they are "
            "in no line above and in no figure below. NON-EMPTY MEANS THE TOTAL IS SHORT "
            "BY A WHOLE CHARGE — the client must say 'Total so far' and name the gap. The "
            "standard 'confirmed on invoice' disclaimer does not cover a missing charge"
        ),
    )
    subtotal: float = Field(default=0.0)
    total: float = Field(default=0.0)
    currency: str = Field(default="XCD")
    derived: Literal[True] = Field(
        default=True,
        description="Always true. The total is computed, not published. Render it as such",
    )
    disclaimer: str = Field(
        default=TARIFF_ESTIMATE_DISCLAIMER,
        min_length=1,
        description="Mandatory. Must be displayed with the total, never collapsed or truncated",
    )
    source: DataSource
    request_id: str = Field(default="")

    @field_validator("disclaimer")
    @classmethod
    def _disclaimer_is_real(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("a derived total must carry its disclaimer")
        return v


# ----------------------------------------------------------------- support


class ContactPoint(BaseModel):
    """One published way to reach SCASPA."""

    label: str
    value: str
    kind: Literal["phone", "email", "post", "extension", "web"] = "phone"


class ContactLocation(BaseModel):
    """One facility and its published contact routes."""

    name: str
    address: str = ""
    status: str = Field(default="", description="Published operational status, if any")
    contacts: list[ContactPoint] = Field(default_factory=list)


class SupportDirectory(BaseModel):
    """GET /api/support/directory."""

    source: DataSource
    locations: list[ContactLocation] = Field(default_factory=list)
    emergency: str | None = Field(
        default=None, description="Banner text for the emergency protocol strip"
    )
    departments: list[str] = Field(
        default_factory=list, description="Values accepted by the ticket form"
    )
    request_id: str = Field(default="")


class SupportTicketRequest(BaseModel):
    """POST /api/support/ticket.

    ## What this deliberately does not take

    No name, no email, no phone, no attachment. The design showed all four, and
    they are absent on purpose: `docs/privacy.md` states that nothing here can
    link a conversation to a person, and CLAUDE.md rule 9 forbids logging a user
    identifier. Accepting a name and an email would make that false, and it
    would make it false quietly.

    What the caller gets instead is a reference code to quote when they call or
    email SCASPA themselves. That keeps the escalation useful and keeps the
    privacy claim true — see `SupportTicketResponse.next_step`.
    """

    department: str = Field(min_length=1, max_length=80)
    subject: str = Field(min_length=1, max_length=200)
    details: str = Field(min_length=1, max_length=4000)
    include_transcript: bool = Field(
        default=False,
        description=(
            "Attach the conversation to the ticket. Requires conversation_id. "
            "Off by default: a transcript is the user's words and is only sent when asked."
        ),
    )
    conversation_id: str | None = Field(default=None)

    @field_validator("department", "subject", "details")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must contain at least one non-whitespace character")
        return v.strip()


class SupportTicketResponse(BaseModel):
    """The receipt. `reference` is what the user quotes when they get in touch."""

    reference: str = Field(description="e.g. SC-4821. Random; carries no information")
    department: str
    expected_response: str = Field(description="Published turnaround, safe to render as-is")
    next_step: str = Field(
        description=(
            "What the user must do now. Mandatory, because no contact detail was "
            "taken and nobody will reach out unprompted."
        )
    )
    transcript_included: bool = Field(default=False)
    request_id: str = Field(default="")


# ------------------------------------------------------------ assistant cards
#
# A structured card the interface renders beneath an answer: an arrivals board,
# a fee calculator, a support ticket form.
#
# ## The model requests a card. It never fills one in.
#
# Exactly the `ChartSpec` bargain, for the same reason. `make_chart` lets the
# model *describe* a chart and then checks every figure against a retrieved row;
# a card works the same way, except the model supplies no figures at all. It
# names a kind and, at most, a filter — and `app.ops.cards` populates the rows
# from the operational feed and stamps the `DataSource` on.
#
# That is what keeps this consistent with prompt rule 10, which forbids the
# assistant from claiming live status. It still cannot: nothing it writes ends
# up in these rows, and the card carries its own provenance wherever it is
# shown. The assistant may *attach* an arrivals board; it may not *say* what is
# on one. See docs/decisions.md 0023.


CardKind = Literal["vessel_arrivals", "flight_schedules", "tariff_calculator", "support_ticket"]


class CardRequest(BaseModel):
    """What the model asked for. Never leaves the server.

    Deliberately tiny: a kind, and the few knobs a model could reasonably know
    from the conversation. Every field a model could use to assert a fact is
    absent by construction.
    """

    kind: CardKind
    # Optional filters, passed to the feed. Not data.
    direction: FlightDirection | None = None
    category: TariffCategory | None = None
    department: str | None = None
    subject: str | None = None


class VesselArrivalsCard(BaseModel):
    """An arrivals board under an answer. Rows come from the feed, never the model."""

    kind: Literal["vessel_arrivals"] = "vessel_arrivals"
    title: str = "Vessel arrivals"
    source: DataSource
    vessels: list[VesselArrival] = Field(default_factory=list)
    total: int = 0
    href: str = "/vessels"


class FlightSchedulesCard(BaseModel):
    """A flight board under an answer. Same rule."""

    kind: Literal["flight_schedules"] = "flight_schedules"
    title: str = "Flight schedules"
    source: DataSource
    flights: list[Flight] = Field(default_factory=list)
    total: int = 0
    href: str = "/flights"


class TariffCalculatorCard(BaseModel):
    """The calculator, offered inline.

    Carries **no figures** — not even a prefilled quantity. It is an empty form
    the user drives, and the total comes back from `POST /api/tariffs/quote`
    with its mandatory disclaimer attached. A card that arrived pre-totalled
    would be the model producing an estimate, which rule 4 forbids outright.
    """

    kind: Literal["tariff_calculator"] = "tariff_calculator"
    title: str = "Estimate port charges"
    category: TariffCategory = "cargo"
    href: str = "/tariffs"


class SupportTicketCard(BaseModel):
    """The escalation form, offered inline.

    `subject` is a summary of the user's own question, written by the model.
    That is model *text* about the conversation, not a claim about SCASPA, which
    is why it is the one string here the model supplies. It is length-capped and
    the user edits it before sending.
    """

    kind: Literal["support_ticket"] = "support_ticket"
    title: str = "Raise a support ticket"
    department: str = "Something else"
    subject: str = Field(default="", max_length=200)
    href: str = "/support"


AssistantCard = Annotated[
    VesselArrivalsCard | FlightSchedulesCard | TariffCalculatorCard | SupportTicketCard,
    Field(discriminator="kind"),
]


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


# -------------------------------------------------------------------- admin


class SpendSummary(BaseModel):
    """One day's estimated spend. An estimate, not a bill."""

    day: str
    turns: int
    prompt_tokens: int
    completion_tokens: int
    embedding_tokens: int
    transcribe_seconds: float
    tts_characters: int
    chat_usd: float
    embedding_usd: float
    voice_usd: float
    total_usd: float
    daily_limit_usd: float
    over_threshold: bool
    note: str = ""


class AdminStats(BaseModel):
    """GET /api/admin/stats. Operator information; contains no user data."""

    env: str
    request_id: str
    kb_version: str | None = None
    kb_rows: int | None = None
    rate_limit_per_minute: int
    voice_rate_limit_per_minute: int
    tracked_clients: int = Field(
        description="Distinct rate-limit keys currently tracked. Hashed, not IPs"
    )
    today: SpendSummary
    history: list[SpendSummary] = Field(default_factory=list)


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
