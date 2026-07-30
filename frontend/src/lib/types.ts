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
 * ⚠️ **Not currently sent by the API.** It is a column on every knowledge-base row
 * (`backend/app/rag/models.py`) but is not part of the `Citation` payload in
 * `docs/api-contract.md`. Raised with the backend team — see `docs/decisions.md`
 * F005. Until it arrives, a citation without it is treated as **high**, because
 * the failure that matters is a stale ferry time shown quietly.
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

  // ── Not in the contract yet ────────────────────────────────────────────────
  // All three exist on the knowledge-base row and none is exposed on the
  // Citation. Typed optional so the UI lights up the moment the backend sends
  // them, and degrades honestly until it does. Never fabricated client-side.

  /** KB `volatility`. Absent → treated as `high`. */
  volatility?: Volatility | undefined;
  /** KB `question` — a human label for the row. Absent → derived from category. */
  label?: string | undefined;
  /** An excerpt of the KB `answer`. Absent → the excerpt slot is omitted, not invented. */
  snippet?: string | undefined;
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
export type ToolName =
  | 'search_scaspa_knowledge'
  | 'search_site_content'
  | 'make_chart'
  | 'calculate'
  | 'escalate_to_human';

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
  kb_version: string;
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
  | 'VALIDATION_ERROR'
  | 'INDEX_MISSING'
  | 'RETRIEVAL_EMPTY'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiError {
  code: ErrorCode;
  /** Written for a traveller and **safe to display as-is**. Ends with the SCASPA phone number. */
  message: string;
  request_id: string;
}

/** Every non-2xx response has exactly this shape. */
export interface ErrorEnvelope {
  error: ApiError;
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
    kb_version: string;
  };
}

/**
 * Once headers are sent the status code is fixed at 200, so a mid-stream failure
 * arrives as this rather than as an HTTP error. Handle it at any point after `meta`.
 */
export interface StreamErrorEvent {
  event: 'error';
  data: ApiError;
}

export type StreamEvent =
  | StreamMetaEvent
  | StreamTokenEvent
  | StreamToolStartEvent
  | StreamToolEndEvent
  | StreamCitationsEvent
  | StreamChartEvent
  | StreamReplaceEvent
  | StreamDoneEvent
  | StreamErrorEvent;

/** The `event:` names, useful for parsing and for exhaustiveness checks. */
export type StreamEventName = StreamEvent['event'];
