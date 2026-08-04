/**
 * Every fetch call in the application lives in this file and `lib/stream.ts` —
 * CLAUDE.md rule 7, enforced by an ESLint rule rather than by review.
 *
 * Keeping the network surface in two modules is what makes it possible to state,
 * and check, that there is no Authorization header, no cookie, and no request to
 * any host but the configured backend.
 *
 * Everything here does the same four things in the same order:
 *
 *   1. build the URL from `VITE_API_BASE_URL`
 *   2. attach an `AbortSignal.timeout()`
 *   3. normalise any failure into a typed `ApiError`
 *   4. parse the body through zod before it can reach state
 */

import { config } from './config';
import {
  chatResponseSchema,
  errorEnvelopeSchema,
  flightSchedulesResponseSchema,
  gateMapResponseSchema,
  healthResponseSchema,
  marineAdvisoriesResponseSchema,
  operatorProfileResponseSchema,
  parseOrThrow,
  sttResponseSchema,
  supportDirectorySchema,
  supportTicketResponseSchema,
  tariffQuoteSchema,
  tariffTableResponseSchema,
  ttsPreviewResponseSchema,
  vesselArrivalsResponseSchema,
  vesselPositionsResponseSchema,
} from './schemas';
import type {
  ApiErrorBody,
  Category,
  ChatResponse,
  ErrorCode,
  FlightSchedulesResponse,
  GateMapResponse,
  HealthResponse,
  MarineAdvisoriesResponse,
  OperatorProfileResponse,
  SttResponse,
  SupportDirectory,
  SupportTicketRequest,
  SupportTicketResponse,
  TariffQuote,
  TariffQuoteRequest,
  TariffTableResponse,
  VesselArrivalsResponse,
  VesselPositionsResponse,
} from './types';

/**
 * A failure, typed.
 *
 * `code` selects the approved user-facing copy; `status`, `retryAfter` and
 * `requestId` are for the client's own decisions and for a dev-console log. None
 * of the latter three is ever rendered.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Seconds, from `Retry-After`. Null when the server did not say. */
  readonly retryAfter: number | null;
  readonly requestId: string | undefined;
  /**
   * The request never reached a server.
   *
   * Distinguished from a 5xx because the user-facing answer differs: "you appear
   * to be offline" is actionable, "something went wrong at our end" is not, and
   * telling someone on dead hotel wifi that *we* broke sends them to ring a phone
   * number about our uptime.
   */
  readonly offline: boolean;

  constructor(init: {
    code: ErrorCode;
    message: string;
    status: number;
    retryAfter?: number | null;
    requestId?: string | undefined;
    offline?: boolean;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.retryAfter = init.retryAfter ?? null;
    this.requestId = init.requestId;
    this.offline = init.offline ?? false;
  }

  /** The wire shape, for the parts of the app that still speak in envelopes. */
  get body(): ApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      request_id: this.requestId ?? 'client-side',
    };
  }
}

/**
 * The one sentence shown when the client has to supply its own.
 *
 * Used when the response body is *not* a contract envelope — a proxy's HTML error
 * page, a truncated body, a network failure. Rendering whatever arrived is exactly
 * how a stack trace or an upstream provider name ends up on a passenger's screen.
 */
const FALLBACK_MESSAGE =
  'Something went wrong reaching SCASPA. Please try again, or call SCASPA on ' +
  '869-465-8121 / 2 / 3.';

// ── Error normalisation, in one place ────────────────────────────────────────

/**
 * Turn any non-2xx response into an `ApiError`.
 *
 * The cases, and why each is here rather than discovered later:
 *
 * - **A contract envelope.** The normal path. `message` is written for a
 *   traveller and is safe to display as-is.
 * - **429 / 503 with `Retry-After`.** Parsed into seconds so the UI can count
 *   down instead of guessing.
 * - **422 validation.** A code, so the caller can route it to the composer rather
 *   than to a generic error panel.
 * - **An HTML error page from a proxy.** This *will* happen — a gateway timeout, a
 *   misconfigured route, a captive portal — and calling `response.json()` on it
 *   throws `Unexpected token '<'`, which sends whoever is debugging to look at
 *   their JSON parser instead of at their proxy. **So the content-type is checked
 *   before parsing**, and a non-JSON body becomes a plain failure with the status
 *   preserved and nothing of the body shown.
 */
export async function normaliseError(response: Response): Promise<ApiError> {
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  const status = response.status;

  /*
   * `Retry-After` is not a CORS-safelisted response header.
   *
   * Cross-origin, JavaScript cannot read it unless the server sends
   * `Access-Control-Expose-Headers: Retry-After`. When it cannot, the countdown
   * falls back to a fixed guess and looks exactly like a working one — which is
   * why this warns rather than staying quiet.
   *
   * THE BACKEND NOW EXPOSES IT. `app/main.py` names `Retry-After` in
   * `EXPOSED_HEADERS` alongside `X-Request-ID` and `X-TTS-Cache`, so the real
   * wait is readable and the rate-limit countdown shows a true number rather
   * than a guess. `docs/backend-issues.md` #5 is closed.
   *
   * The warning stays. It is now a regression check rather than a known bug: if
   * that header list is ever trimmed, the countdown silently degrades back into
   * a plausible-looking fiction, and this line in the dev console is the only
   * thing that would say so.
   */
  if (import.meta.env.DEV && (status === 429 || status === 503) && retryAfter === null) {
    console.warn(
      '[api] a rate-limit response carried no readable Retry-After. If the server ' +
        'sent one, it is not in Access-Control-Expose-Headers and the browser is ' +
        'hiding it — the countdown is a guess. Fix is in the backend CORS config.'
    );
  }
  const contentType = response.headers.get('Content-Type') ?? '';

  const fallback = () =>
    new ApiError({
      code: statusToCode(status),
      message: FALLBACK_MESSAGE,
      status,
      retryAfter,
    });

  // Not JSON — an HTML error page, a plain-text gateway message, an empty body.
  // Nothing is read from it: it is not ours and it is not safe to show.
  if (!contentType.toLowerCase().includes('application/json')) return fallback();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A JSON content-type with an unparseable body: truncated, or a connection
    // dropped mid-write.
    return fallback();
  }

  const envelope = errorEnvelopeSchema.safeParse(payload);
  if (!envelope.success) return fallback();

  return new ApiError({
    code: envelope.data.error.code,
    message: envelope.data.error.message,
    status,
    retryAfter,
    requestId: envelope.data.error.request_id,
  });
}

/**
 * `Retry-After` is either delta-seconds or an HTTP date. Both are legal, and a
 * server behind a CDN may send either.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);

  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

/** A last-resort mapping when the body did not tell us. */
function statusToCode(status: number): ErrorCode {
  /*
   * 400 is not on `ErrorCode` — the backend does not send it — so it cannot be
   * returned from here. `ApiError` carries the status alongside the code, and
   * `kindOf` in features/chat maps a 400 to the client-side `BAD_REQUEST` kind
   * so it gets §3.11's own copy rather than the generic INTERNAL apology.
   */
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'VALIDATION_ERROR';
  // 429 is the client being limited; 503 is the model provider throttling the
  // backend. Different causes, different copy.
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'UPSTREAM_RATE_LIMITED';
  if (status === 504) return 'UPSTREAM_TIMEOUT';
  return 'INTERNAL';
}

/**
 * A failure that never reached a server: no wifi, DNS gone, a captive portal —
 * **or CORS**, which is indistinguishable from the client side.
 *
 * The browser refuses to tell JavaScript why a cross-origin request failed; the
 * reason only ever appears in the console. So a CORS misconfiguration arrives
 * here as a bare rejected fetch and, for a *user*, "you appear to be offline" is
 * the right thing to show — they can act on neither, and there is nothing more
 * specific worth saying.
 *
 * For a *developer* it is the wrong thing entirely, and it is how an afternoon
 * gets lost. So when the browser says it is online and the request still could
 * not be made, dev gets a pointed hint naming the actual first suspect.
 */
function unreachable(): ApiError {
  if (import.meta.env.DEV && typeof navigator !== 'undefined' && navigator.onLine) {
    console.warn(
      `[api] Could not reach ${config.apiBaseUrl}, but the browser reports it is online.\n` +
        `  The likeliest cause is CORS. Check the console above for an "Access to fetch ... ` +
        `blocked by CORS policy" line.\n` +
        `  THE FIX IS IN THE BACKEND: add this page's origin (${
          typeof window === 'undefined' ? 'your dev origin' : window.location.origin
        }) to ALLOWED_ORIGINS in backend/.env and restart it.\n` +
        `  No fetch option, header or mode setting can fix a CORS error from the client.\n` +
        `  Second suspect: the backend is not running. Start it with\n` +
        `    cd backend && uv run uvicorn app.main:app --reload`
    );
  }
  return new ApiError({
    code: 'INTERNAL',
    message:
      'I could not reach SCASPA just now. Please check your connection and try again, ' +
      'or call SCASPA on 869-465-8121 / 2 / 3.',
    status: 0,
    offline: true,
  });
}

/** A request that ran past its deadline. */
function timedOut(): ApiError {
  return new ApiError({
    code: 'UPSTREAM_TIMEOUT',
    message: 'That took too long. Please try again, or call SCASPA on 869-465-8121 / 2 / 3.',
    status: 0,
  });
}

// ── The request helper every call goes through ───────────────────────────────

interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  body?: BodyInit;
  headers?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

async function request(options: RequestOptions): Promise<Response> {
  const { path, method = 'GET', body, headers, timeoutMs, signal } = options;

  // `AbortSignal.any` so a caller's own cancellation and the deadline both work.
  // Passing only the caller's signal would silently discard the timeout.
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      // No Authorization header and no cookie: there is no auth and no session
      // token — CLAUDE.md rule 2. `credentials` is left at its default so a
      // cross-origin call cannot carry one by accident.
      ...(headers ? { headers } : {}),
      ...(body !== undefined ? { body } : {}),
      signal: combined,
    });
  } catch (thrown) {
    // A caller's deliberate abort is not a failure to report.
    if (signal?.aborted) throw thrown;
    // fetch rejects with an AbortError when either signal fires; `timeout.aborted`
    // is what distinguishes our deadline from a dropped connection.
    if (timeout.aborted) throw timedOut();
    throw unreachable();
  }

  if (!response.ok) throw await normaliseError(response);
  return response;
}

// ── The calls ────────────────────────────────────────────────────────────────

/**
 * Non-streaming chat. Same content as the stream; the text is fully verified
 * before it is sent, with unverifiable citation markers already stripped.
 */
export async function sendMessage(
  message: string,
  conversationId: string | null,
  init?: { signal?: AbortSignal | undefined; category?: Category | null | undefined }
): Promise<ChatResponse> {
  const response = await request({
    path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatBody(message, conversationId, init?.category)),
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(chatResponseSchema, await response.json(), 'chat') as ChatResponse;
}

/**
 * The `POST /api/chat` body, shared with `lib/stream.ts` so the two endpoints
 * cannot start sending different requests for the same question.
 *
 * `category` is **omitted when absent**, not sent as null. The backend rejects an
 * unknown category with a 422 rather than filtering retrieval down to nothing —
 * so the key is only present when there is a real value to put in it.
 */
export function chatBody(
  message: string,
  conversationId: string | null,
  category?: Category | null
): Record<string, unknown> {
  return {
    message,
    conversation_id: conversationId,
    ...(category ? { category } : {}),
  };
}

export async function getHealth(init?: {
  signal?: AbortSignal | undefined;
}): Promise<HealthResponse> {
  const response = await request({
    path: '/api/health',
    // Health must answer fast or it is not telling us anything useful.
    timeoutMs: config.healthTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(healthResponseSchema, await response.json(), 'health');
}

/**
 * Transcribe recorded audio. Multipart, field name `audio`.
 *
 * The transcript goes in the input box, **never straight into `sendMessage`** —
 * the contract is explicit, and a confident answer to a misheard question is both
 * a bad experience and a bad demo moment.
 */
export async function transcribeAudio(
  audio: Blob,
  init?: { signal?: AbortSignal | undefined }
): Promise<SttResponse> {
  const form = new FormData();
  form.append('audio', audio);
  const response = await request({
    path: '/api/stt',
    method: 'POST',
    // Deliberately no Content-Type: the browser must set the multipart boundary
    // itself, and setting it by hand produces a body the server cannot split.
    body: form,
    timeoutMs: config.uploadTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(sttResponseSchema, await response.json(), 'transcription');
}

/**
 * Synthesise speech. Returns audio bytes, not JSON — so there is no schema, and
 * the content type is checked instead.
 *
 * Send the `answer` field verbatim: the server sanitises markdown, citation
 * markers, URLs and phone numbers itself.
 */
export async function synthesiseSpeech(
  text: string,
  init?: { signal?: AbortSignal | undefined }
): Promise<Blob> {
  const response = await request({
    path: '/api/tts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    timeoutMs: config.uploadTimeoutMs,
    signal: init?.signal,
  });

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('audio/')) {
    // A 200 that is not audio is a proxy or a misroute. Failing here beats handing
    // an <audio> element an HTML page and getting a decode error.
    throw new ApiError({
      code: 'INTERNAL',
      message: FALLBACK_MESSAGE,
      status: response.status,
    });
  }
  return response.blob();
}

/** Sanitised text, no provider call, no cost. The fastest way to find a sanitisation bug. */
export async function previewSpeech(
  text: string,
  init?: { signal?: AbortSignal | undefined }
): Promise<string> {
  const response = await request({
    path: '/api/tts/preview',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(ttsPreviewResponseSchema, await response.json(), 'speech preview').text;
}

// ── Operations ───────────────────────────────────────────────────────────────
//
// A separate, non-LLM path. Every response carries a `source` saying where the
// records came from and how old they are, and a `notice` the UI must render for
// anything that is not a live feed.
//
// None of these throws when there is no feed configured: the backend answers 200
// with an empty list and an explanatory notice, which the UI renders as its empty
// state. A 503 would put a red error panel in front of someone over a feature
// that was never switched on.

/**
 * Build a query string, dropping every empty value so the URL stays readable.
 *
 * Takes `object` rather than an index-signature type so the typed `*Query`
 * interfaces below can be passed straight in — an interface has no implicit
 * index signature, and widening each of them to `Record<string, …>` would throw
 * away the field names that make a typo a compile error.
 */
function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export interface VesselQuery {
  q?: string | undefined;
  vessel_type?: string | undefined;
  berth?: string | undefined;
  status?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function getVessels(
  params: VesselQuery = {},
  init?: { signal?: AbortSignal | undefined }
): Promise<VesselArrivalsResponse> {
  const response = await request({
    path: `/api/vessels${queryString(params)}`,
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(vesselArrivalsResponseSchema, await response.json(), 'vessel arrivals');
}

export interface FlightQuery {
  q?: string | undefined;
  airline?: string | undefined;
  status?: string | undefined;
  direction?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function getFlights(
  params: FlightQuery = {},
  init?: { signal?: AbortSignal | undefined }
): Promise<FlightSchedulesResponse> {
  const response = await request({
    path: `/api/flights${queryString(params)}`,
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(flightSchedulesResponseSchema, await response.json(), 'flight schedules');
}

export interface TariffQuery {
  q?: string | undefined;
  category?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/*
 * The four panels that had no feed until now.
 *
 * No query parameters on any of them: each returns the whole small set, and a
 * filter the backend does not implement is a filter the client would have to
 * fake. They are separate requests rather than fields on `/api/vessels` and
 * `/api/flights` so that a screen which does not draw a map does not pay for
 * one — and so a future real AIS integration can be slow without making the
 * arrivals table slow with it.
 */
export async function getVesselPositions(init?: {
  signal?: AbortSignal | undefined;
}): Promise<VesselPositionsResponse> {
  const response = await request({
    path: '/api/ops/positions',
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(vesselPositionsResponseSchema, await response.json(), 'vessel positions');
}

export async function getGateMap(init?: {
  signal?: AbortSignal | undefined;
}): Promise<GateMapResponse> {
  const response = await request({
    path: '/api/ops/gates',
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(gateMapResponseSchema, await response.json(), 'gate map');
}

export async function getMarineAdvisories(init?: {
  signal?: AbortSignal | undefined;
}): Promise<MarineAdvisoriesResponse> {
  const response = await request({
    path: '/api/ops/advisories',
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(marineAdvisoriesResponseSchema, await response.json(), 'marine advisories');
}

/** The demo identity card. Sends no credential, because there is none to send. */
export async function getOperatorProfile(init?: {
  signal?: AbortSignal | undefined;
}): Promise<OperatorProfileResponse> {
  const response = await request({
    path: '/api/ops/profile',
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(operatorProfileResponseSchema, await response.json(), 'operator profile');
}

export async function getTariffs(
  params: TariffQuery = {},
  init?: { signal?: AbortSignal | undefined }
): Promise<TariffTableResponse> {
  const response = await request({
    path: `/api/tariffs${queryString(params)}`,
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(tariffTableResponseSchema, await response.json(), 'tariff table');
}

/**
 * Price a movement against the published rates.
 *
 * The returned `total` is **derived** and its `disclaimer` is mandatory —
 * `tariffQuoteSchema` refuses a quote that arrives without one, rather than
 * rendering a bare figure. See the note on that schema.
 */
export async function requestTariffQuote(
  body: TariffQuoteRequest,
  init?: { signal?: AbortSignal | undefined }
): Promise<TariffQuote> {
  const response = await request({
    path: '/api/tariffs/quote',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(tariffQuoteSchema, await response.json(), 'tariff quote');
}

// ── Support ──────────────────────────────────────────────────────────────────

export async function getSupportDirectory(init?: {
  signal?: AbortSignal | undefined;
}): Promise<SupportDirectory> {
  const response = await request({
    path: '/api/support/directory',
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(supportDirectorySchema, await response.json(), 'support directory');
}

/**
 * Raise a support ticket.
 *
 * `SupportTicketRequest` has no name, email or phone field and none may be added
 * — the backend does not accept them, and accepting them would break the privacy
 * claim in `docs/privacy.md`. The user gets a reference to quote instead, and
 * `next_step` tells them so.
 */
export async function submitSupportTicket(
  body: SupportTicketRequest,
  init?: { signal?: AbortSignal | undefined }
): Promise<SupportTicketResponse> {
  const response = await request({
    path: '/api/support/ticket',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(supportTicketResponseSchema, await response.json(), 'support ticket');
}

/**
 * Kept for `lib/stream.ts`, which owns its own fetch because SSE needs the raw
 * body. It shares this module's normalisation so both paths fail identically.
 */
export const toApiFailure = normaliseError;
