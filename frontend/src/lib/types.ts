/**
 * TypeScript mirrors of the backend's schemas, transcribed from
 * `docs/api-contract.md`.
 *
 * **Field names are the contract's, not ones I would have chosen.** `x_label`
 * stays `x_label`. `uptime_s` stays `uptime_s`. Renaming a field to something
 * more idiomatic here means every mapping is a place the two sides can silently
 * drift, and drift is not visible until integration day — when it presents as an
 * `undefined` in a component nobody has touched.
 *
 * If the contract and this file disagree, **the contract wins** and the mismatch
 * is raised with the backend team rather than patched here.
 *
 * These are compile-time only and are erased at runtime. They prove nothing about
 * what actually arrived over the wire — that is `lib/schemas.ts`'s job
 * (CLAUDE.md rule 8).
 */

// ── Requests ─────────────────────────────────────────────────────────────────

/** Optional retrieval filter. The contract lists exactly these five. */
export type Category = 'ferry' | 'cargo' | 'cruise' | 'airport' | 'general';

export interface ChatRequest {
  /** 1–1000 characters. Whitespace-only is rejected with VALIDATION_ERROR. */
  message: string;
  /** Omit on the first request; send back whatever you were given. */
  conversation_id?: string | null;
  category?: Category | null;
}

// ── Citations ────────────────────────────────────────────────────────────────

/** The five values the knowledge base actually uses. */
export type SourceType =
  'official-site' | 'official-pdf' | 'client-interview' | 'press' | 'regulator';

/**
 * How fast this fact goes stale. `high` is a schedule; `low` is "there is Wi-Fi".
 *
 * Sent on every citation. It arrives as `null` — never as a guess — for a row
 * with no volatility on record, and `volatilityOf` then applies **high**,
 * because the failure that matters is a stale ferry time shown quietly.
 */
export type Volatility = 'low' | 'medium' | 'high';

export interface Citation {
  kb_id: string;
  category: string;
  subcategory: string;
  source_url: string;
  /**
   * One of `SourceType` in practice, but typed `string`: a backend that adds a
   * sixth kind should not fail zod parsing and cost someone their answer.
   * `sourceTypeLabel` maps the known values and falls back for anything else.
   */
  source_type: string;
  /** The date this row was verified. Rendered to the user — it is why they can trust it. */
  as_of: string;
  confidence: string;

  // ── Sent, but nullable ─────────────────────────────────────────────────────
  // All three come from the indexed row, and the backend sends null rather than
  // a guess when a row has none. Null and absent are handled identically, and
  // neither is ever filled in client-side.

  /** KB `volatility`. Null or absent → treated as `high`, the cautious default. */
  volatility?: Volatility | null | undefined;
  /** KB `question` — a human label for the row. Null → derived from category. */
  label?: string | null | undefined;
  /**
   * An excerpt of the KB `answer`, truncated server-side on a word boundary so a
   * figure can never be cut in half. Null → the excerpt slot is omitted, not
   * invented. A scraped page has no curated answer and so has no snippet.
   */
  snippet?: string | null | undefined;
}

// ── Charts ───────────────────────────────────────────────────────────────────

/** The contract is explicit: "Nothing else is supported." */
export type ChartType = 'line' | 'bar' | 'area';

export interface ChartPoint {
  x: string | number;
  y: number;
}

export interface ChartSeries {
  name: string;
  /** Maximum 40 points — beyond that it is unreadable on a phone, which is where the users are. */
  points: ChartPoint[];
}

export interface ChartSpec {
  type: ChartType;
  title: string;
  /** Contract spelling. Not `xLabel`. */
  x_label: string;
  y_label: string;
  /** 1–4 series. */
  series: ChartSeries[];
  /**
   * **Always present, and must always be rendered.** It is the only way a reader
   * can tell a published tariff from an illustration, and a chart is believed
   * more readily than a sentence — so a chart without its caption is worse than
   * no chart at all.
   */
  caption: string;
  /** The single `kb-xxx` row every figure in this chart came from. */
  source: string;
}

// ── Tools ────────────────────────────────────────────────────────────────────

/** The five tools, so a client can pick an icon per name. */
export type KnownToolName =
  | 'search_scaspa_knowledge'
  | 'search_site_content'
  | 'make_chart'
  | 'calculate'
  | 'escalate_to_human'
  | 'show_card';

/**
 * A tool name as it arrives.
 *
 * The union with `string` is deliberate and it is not laziness: it keeps
 * autocomplete on the five known names while making it a *type error* to write a
 * `switch` over them without a default. A sixth tool must degrade to a generic
 * icon, not throw away the answer it was reporting progress on.
 */
export type ToolName = KnownToolName | (string & {});

export interface ToolCall {
  name: ToolName;
  /** Written to be rendered directly, e.g. "Searching SCASPA knowledge base — ferry fares". */
  summary: string;
  /** Measured duration in milliseconds. */
  ms: number;
}

// ── Response metadata ────────────────────────────────────────────────────────

export interface ResponseMeta {
  request_id: string;
  latency_ms: number;
  retrieved_count: number;
  best_score: number;
  cited_ids: string[];
  hallucinated_citations: string[];
  unverified_figures: string[];
  /** Null when the index carries no version. Never read a missing version as "0". */
  kb_version: string | null;
}

/** `vessel_or_aircraft_operations` | `personal_record` | null, per the contract. */
export type RefusalCategory = 'vessel_or_aircraft_operations' | 'personal_record' | null;

export interface ChatResponse {
  /** Verified text. Unverifiable citation markers have already been stripped. */
  answer: string;
  conversation_id: string;
  /**
   * **Not a correctness guarantee.** It means every `[kb-xxx]` marker and every
   * money/time value traces to a row that was really retrieved. A false claim
   * carrying a valid citation still passes. Internal integrity signal only — do
   * not present it to a user as "this is correct".
   */
  grounded: boolean;
  /** True when the assistant declined. Still HTTP 200 — a no-answer is not an error. */
  refusal: boolean;
  /**
   * Optional because the contract's own no-answer sample omits the key entirely
   * while the response table lists it. Raised with the backend team; treated as
   * possibly-absent here so a missing key cannot throw.
   */
  refusal_category?: RefusalCategory;
  citations: Citation[];
  /** Usually null. */
  chart: ChartSpec | null;
  /**
   * An interactive card to render below the answer, or null.
   *
   * **Its rows never came from the model.** The assistant names a kind; the
   * backend fills the rows from the operational feed and stamps the feed's
   * `DataSource` on. That is what lets a card show a berth status in the same
   * answer where the assistant declines to state one — see `AssistantCard`.
   */
  card: AssistantCard | null;
  /** Tools the agent used this turn, in order. */
  tool_calls: ToolCall[];
  meta: ResponseMeta;
}

// ── Health ───────────────────────────────────────────────────────────────────

export interface ModelNames {
  chat: string;
  embedding: string;
  transcribe: string;
  tts: string;
}

export interface IndexStatus {
  ready: boolean;
  /**
   * Unknown values are `null`, never `0`. A client must not read "never built" as
   * "built and empty", so every nullable field below stays nullable.
   */
  kb_version: string | null;
  kb_rows: number | null;
  kb_rows_rejected: number | null;
  kb_csv_filename: string | null;
  kb_updated_at: string | null;
  index_built_at: string | null;
  embedding_model: string | null;
  web_docs: number | null;
  message: string | null;
}

export interface HealthResponse {
  /** `degraded` when the index is missing or empty. Still HTTP 200. */
  status: 'ok' | 'degraded';
  env: string;
  version: string;
  uptime_s: number;
  request_id: string;
  /** `models` appears here and **only** here. Never in a chat response or an error. */
  models: ModelNames;
  index: IndexStatus;
}

// ── Errors ───────────────────────────────────────────────────────────────────

/** Switch on `code`, never on `message`. */
export type ErrorCode =
  /**
   * 429, per-IP client rate limiting. A different thing from
   * `UPSTREAM_RATE_LIMITED`, which is the model provider throttling *us* on a
   * 503 — different cause, different copy, different retry advice. Both are in
   * the contract's error table; `backend/tests/test_contract.py` pins the set.
   */
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INDEX_MISSING'
  | 'RETRIEVAL_EMPTY'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL';

/**
 * The error object inside the envelope, as it arrives on the wire.
 *
 * Named `...Body` because `ApiError` is the *thrown* class in `lib/api.ts` — the
 * one carrying status and retryAfter as well. Two different things, and calling
 * both `ApiError` is how a catch block ends up reading a field that was never
 * there.
 */
export interface ApiErrorBody {
  code: ErrorCode;
  /** Written for a traveller and **safe to display as-is**. Ends with the SCASPA phone number. */
  message: string;
  request_id: string;
}

/** Every non-2xx response has exactly this shape. */
export interface ErrorEnvelope {
  error: ApiErrorBody;
}

// ── Voice ────────────────────────────────────────────────────────────────────

/**
 * `POST /api/stt`. The whole response, deliberately.
 *
 * **Do not chain this straight into `/api/chat`.** It goes in the input box so the
 * user can fix a misheard terminal name or figure first.
 */
export interface SttResponse {
  text: string;
}

/** `POST /api/tts` body, and `POST /api/tts/preview` request and response. */
export interface TtsRequest {
  /** Send the `answer` field verbatim — the server sanitises it. */
  text: string;
}

export interface TtsPreviewResponse {
  text: string;
}

// ── Stream events ────────────────────────────────────────────────────────────

/**
 * The SSE event sequence, as a discriminated union on `event`.
 *
 * Guarantees from the contract that the client may rely on:
 *   - `meta` is **always first**, before any token.
 *   - `citations` arrives **after the last token** — validation needs the finished
 *     text, so it cannot come earlier.
 *   - `chart`, when present, is after `citations` and always before `done`.
 *   - The stream always ends with `done` **or** `error`, never silence.
 *
 * Tokens stream **raw**, including `[kb-014]` markers, and a frame boundary can
 * fall inside a marker: `"...ticket [kb-0"` then `"08]. That"`. Accumulate before
 * parsing; never parse markers per frame.
 */
export interface StreamMetaEvent {
  event: 'meta';
  data: { conversation_id: string };
}

export interface StreamTokenEvent {
  event: 'token';
  data: { text: string };
}

export interface StreamToolStartEvent {
  event: 'tool_start';
  data: { name: ToolName; summary: string };
}

export interface StreamToolEndEvent {
  event: 'tool_end';
  data: { name: ToolName; summary: string; ms: number };
}

export interface StreamCitationsEvent {
  event: 'citations';
  data: { citations: Citation[] };
}

/** Payload is a complete ChartSpec — same shape as the `chart` field on POST /api/chat. */
export interface StreamChartEvent {
  event: 'chart';
  data: ChartSpec;
}

/**
 * Payload is a complete, populated `AssistantCard` — the same shape as the
 * `card` field on `POST /api/chat`, so the two endpoints cannot drift. Arrives
 * after `citations` and always before `done`.
 */
export interface StreamCardEvent {
  event: 'card';
  data: AssistantCard;
}

/**
 * Rare, and not in the list this prompt asked for — but it is in the contract, so
 * it is here.
 *
 * If the agent hits its tool-call cap, the tokens already streamed were an
 * internal message, not an answer. Discard everything accumulated from `token` and
 * render `text` instead. `done` will then report `refusal: true`.
 *
 * Leaving it out of the union would not stop it arriving; it would make the client
 * render an internal control message to a user as though it were the answer.
 * Raised with the backend team as a gap in this prompt's spec, not in the contract.
 */
export interface StreamReplaceEvent {
  event: 'replace';
  data: { text: string };
}

export interface StreamDoneEvent {
  event: 'done';
  data: {
    latency_ms: number;
    grounded: boolean;
    refusal: boolean;
    /** Lets a streamed refusal pick the same specific copy the JSON endpoint can. */
    refusal_category?: RefusalCategory;
    kb_version: string | null;
  };
}

/**
 * Once headers are sent the status code is fixed at 200, so a mid-stream failure
 * arrives as this rather than as an HTTP error. Handle it at any point after `meta`.
 */
export interface StreamErrorEvent {
  event: 'error';
  data: ApiErrorBody;
}

export type StreamEvent =
  | StreamMetaEvent
  | StreamTokenEvent
  | StreamToolStartEvent
  | StreamToolEndEvent
  | StreamCitationsEvent
  | StreamChartEvent
  | StreamCardEvent
  | StreamReplaceEvent
  | StreamDoneEvent
  | StreamErrorEvent;

/** The `event:` names, useful for parsing and for exhaustiveness checks. */
export type StreamEventName = StreamEvent['event'];

// ── Operations: vessels, flights, tariffs ────────────────────────────────────
//
// From `GET /api/vessels`, `/api/flights` and `/api/tariffs`, which are a
// **separate, non-LLM path**. The assistant cannot see live operations and is
// forbidden from claiming it can (`app/agent/prompts.py` rule 10); these
// endpoints serve a feed and state where it came from. A panel may therefore
// show a berth status that the assistant will not put in a sentence.

/** Where a set of records came from, and how much to trust it. */
export type SourceKind = 'live' | 'fixture' | 'unavailable';

export interface DataSource {
  kind: SourceKind;
  /** Human-readable origin, safe to render as-is. */
  label: string;
  /** ISO timestamp. Null when the source did not say. */
  as_of: string | null;
  /**
   * **Render this whenever it is present.**
   *
   * Non-null for every `fixture` and `unavailable` source — the backend's schema
   * refuses to build one without it. A table of vessel arrivals is believed on
   * sight, and nothing in the rows tells a reader they are looking at sample
   * data. This string is the only thing that does.
   */
  notice: string | null;
}

export type VesselStatus = 'at_berth' | 'en_route' | 'scheduled' | 'departed' | 'unknown';

export interface VesselArrival {
  id: string;
  name: string;
  imo: string | null;
  vessel_type: string;
  agent: string;
  berth: string;
  status: VesselStatus;
  /**
   * `eta` is a prediction; `ata` is a record of something that happened. Two
   * fields rather than one timestamp plus a flag, precisely so a UI cannot
   * present a guess as a fact by losing the distinction.
   */
  eta: string | null;
  ata: string | null;
}

/** Every field nullable: unknown is `null`, never `0`. */
export interface VesselMetrics {
  vessels_at_berth: number | null;
  berth_capacity: number | null;
  arrivals_next_24h: number | null;
  daily_cargo_teu: number | null;
}

export interface VesselArrivalsResponse {
  source: DataSource;
  vessels: VesselArrival[];
  metrics: VesselMetrics;
  /** Matching records before paging, so pagination can be rendered. */
  total: number;
  request_id: string;
}

export type FlightStatus = 'on_time' | 'delayed' | 'landed' | 'arrived' | 'boarding' | 'cancelled';

export type FlightDirection = 'arrival' | 'departure';

export interface Flight {
  id: string;
  flight_no: string;
  airline: string;
  airline_code: string;
  direction: FlightDirection;
  /** The other end of the route: origin for an arrival, destination for a departure. */
  port: string;
  port_code: string;
  gate: string | null;
  status: FlightStatus;
  scheduled_time: string | null;
  /** Only present when it differs from scheduled — the revised time for a delay. */
  estimated_time: string | null;
}

export interface FlightMetrics {
  total_flights: number | null;
  on_time_percent: number | null;
  gates_active: number | null;
  gates_total: number | null;
}

export interface OperationalAdvisory {
  headline: string;
  detail: string;
  temperature_c: number | null;
  systems_status: string;
}

export interface FlightSchedulesResponse {
  source: DataSource;
  flights: Flight[];
  metrics: FlightMetrics;
  advisory: OperationalAdvisory | null;
  total: number;
  request_id: string;
}

/** Who says where a vessel is. An AIS fix and a typed-in position differ. */
export type VesselPositionSource = 'ais' | 'manual' | 'estimated';

export interface VesselPosition {
  /** Matches `VesselArrival.id`, so the map and the table agree. */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  heading_degrees: number | null;
  /** Null means not reported. It does not mean stationary. */
  speed_knots: number | null;
  reported_by: VesselPositionSource;
  reported_at: string | null;
}

export interface VesselPositionsResponse {
  source: DataSource;
  positions: VesselPosition[];
  total: number;
  request_id: string;
}

export type GateStatus = 'occupied' | 'boarding' | 'free' | 'closed';

export interface GateAssignment {
  gate: string;
  status: GateStatus;
  flight_number: string | null;
  airline: string;
  scheduled_at: string | null;
}

export interface GateMapResponse {
  source: DataSource;
  gates: GateAssignment[];
  /** Counted by the backend. Do not recompute — see the schema note. */
  active: number;
  total: number;
  request_id: string;
}

export type AdvisorySeverity = 'low' | 'moderate' | 'high';

/**
 * A notice to mariners, passed through verbatim.
 *
 * Distinct from `OperationalAdvisory`, which is the airport's. An empty list
 * means nothing was published to this assistant — it does **not** mean
 * conditions are fine, and the panel must not let it read that way.
 */
export interface MarineAdvisory {
  id: string;
  port: string;
  headline: string;
  detail: string;
  severity: AdvisorySeverity;
  issued_at: string | null;
}

export interface MarineAdvisoriesResponse {
  source: DataSource;
  advisories: MarineAdvisory[];
  total: number;
  request_id: string;
}

/**
 * The console identity card — a demo, never a user.
 *
 * This product has no sign-in and never learns who is asking. The endpoint
 * behind this reads nothing about the caller and returns the same invented card
 * to everyone; it is null unless the backend is running the fixture feed, which
 * it refuses to do in production.
 */
export interface OperatorProfile {
  is_demo: true;
  display_name: string;
  division: string;
  agent_id: string;
  jurisdiction: string;
  role: string;
  last_sync: string | null;
  active: boolean;
  verified: boolean;
  /** Rendered as prominently as the card itself. Never empty. */
  notice: string;
}

export interface OperatorProfileResponse {
  source: DataSource;
  profile: OperatorProfile | null;
  request_id: string;
}

export type TariffCategory = 'maritime' | 'aviation' | 'cargo' | 'passenger';

export interface TariffRow {
  code: string;
  service: string;
  /** The unit the rate applies to, e.g. "per ft per 24h". */
  basis: string;
  amount: number;
  currency: string;
  category: TariffCategory;
  /** The knowledge-base row this rate was published in, when it is indexed. */
  kb_id: string | null;
  as_of: string;
}

export interface TariffTableResponse {
  source: DataSource;
  tariffs: TariffRow[];
  /** Category chips. Derived from the whole table, not the filtered slice. */
  categories: string[];
  total: number;
  request_id: string;
}

// ── The fee calculator ───────────────────────────────────────────────────────

export interface TariffQuoteRequest {
  category: TariffCategory;
  vessel_type?: string | null;
  length_ft?: number | null;
  stay_days?: number | null;
  container_size?: '20ft' | '40ft' | null;
  units?: number | null;
  storage_days?: number | null;
  /** XCD only. Converting a published fee applies a rate nobody published. */
  currency?: 'XCD';
}

export interface TariffLineItem {
  code: string;
  label: string;
  basis: string;
  /** The published rate, exactly as published. */
  rate: number;
  quantity: number;
  quantity_label: string;
  /** `rate × quantity`, rounded — so the printed lines add up to the printed total. */
  amount: number;
  kb_id: string | null;
}

export interface TariffQuote {
  line_items: TariffLineItem[];
  subtotal: number;
  total: number;
  currency: string;
  /**
   * Always `true`, and typed as the literal so it cannot be read as optional.
   *
   * The total appears in no published source. Every `rate` above it is published
   * and cited; the arithmetic on top is the tool's own.
   */
  derived: true;
  /**
   * **Mandatory to display with the total. Never collapse or truncate it.**
   *
   * It names what the figure is not — not an invoice, not an official customs
   * assessment, not a valuation. A total shown without it is the product making
   * exactly the claim it was built not to make.
   */
  disclaimer: string;
  source: DataSource;
  request_id: string;
}

// ── Support ──────────────────────────────────────────────────────────────────

export interface ContactPoint {
  label: string;
  value: string;
  kind: 'phone' | 'email' | 'post' | 'extension' | 'web';
}

export interface ContactLocation {
  name: string;
  address: string;
  status: string;
  contacts: ContactPoint[];
}

export interface SupportDirectory {
  source: DataSource;
  locations: ContactLocation[];
  emergency: string | null;
  /** The values the ticket form's department select may send. */
  departments: string[];
  request_id: string;
}

/**
 * `POST /api/support/ticket`.
 *
 * **There is no name, email, phone or attachment field, and adding one here
 * would not help** — the backend does not accept them. `docs/privacy.md` states
 * that nothing in this service can link a conversation to a person, and a ticket
 * carrying an email address would make that false.
 *
 * The exchange is inverted instead: describe the problem, get a reference, quote
 * it when you contact SCASPA. `SupportTicketResponse.next_step` says so.
 */
export interface SupportTicketRequest {
  department: string;
  subject: string;
  details: string;
  /** Off by default. A transcript is the user's own words and goes only when asked. */
  include_transcript?: boolean;
  conversation_id?: string | null;
}

export interface SupportTicketResponse {
  reference: string;
  department: string;
  expected_response: string;
  /**
   * **Always render this.** Nobody will make contact first, because no contact
   * detail was taken. A receipt that omits it reads as "we'll be in touch".
   */
  next_step: string;
  transcript_included: boolean;
  request_id: string;
}

// ── Assistant cards ──────────────────────────────────────────────────────────
//
// A structured card rendered beneath an answer: an arrivals board, the fee
// calculator, a ticket form.
//
// ## The model requests a card and never fills one in
//
// Exactly the `ChartSpec` bargain. `make_chart` lets the model describe a chart
// and then checks every figure against a retrieved row; a card goes further —
// the model supplies no figures at all, because `show_card` has no parameter
// that could carry one. The rows come from the feed, server-side, after the
// answer is written.
//
// So a `vessel_arrivals` card is not the assistant claiming a berth is
// occupied. It is the interface showing a feed, with the feed's own provenance
// attached, in the same breath as the assistant declining to describe it.

export type CardKind =
  'vessel_arrivals' | 'flight_schedules' | 'tariff_calculator' | 'support_ticket';

export interface VesselArrivalsCard {
  kind: 'vessel_arrivals';
  title: string;
  /** **Render the notice.** Same obligation as the standalone panels. */
  source: DataSource;
  vessels: VesselArrival[];
  /** Matching records in the feed. The card shows the first few. */
  total: number;
  /** Where "see all" goes. */
  href: string;
}

export interface FlightSchedulesCard {
  kind: 'flight_schedules';
  title: string;
  source: DataSource;
  flights: Flight[];
  total: number;
  href: string;
}

/**
 * The calculator, offered inline.
 *
 * Carries **no figures** — not even a prefilled quantity. It is an empty form
 * the user drives, and the total comes back from `POST /api/tariffs/quote` with
 * its mandatory disclaimer. A pre-totalled card would be the model producing an
 * estimate, which its own rules forbid outright.
 */
export interface TariffCalculatorCard {
  kind: 'tariff_calculator';
  title: string;
  category: TariffCategory;
  href: string;
}

/**
 * The escalation form, offered inline.
 *
 * `subject` is the model's one-line summary of the user's own question — model
 * text about the conversation, not a claim about SCASPA, and the user edits it
 * before sending. Length-capped server-side.
 */
export interface SupportTicketCard {
  kind: 'support_ticket';
  title: string;
  department: string;
  subject: string;
  href: string;
}

export type AssistantCard =
  VesselArrivalsCard | FlightSchedulesCard | TariffCalculatorCard | SupportTicketCard;
