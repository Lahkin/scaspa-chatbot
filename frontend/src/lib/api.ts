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
  healthResponseSchema,
  parseOrThrow,
  sttResponseSchema,
  ttsPreviewResponseSchema,
} from './schemas';
import type { ApiErrorBody, ChatResponse, ErrorCode, HealthResponse, SttResponse } from './types';

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
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 429 || status === 503) return 'UPSTREAM_RATE_LIMITED';
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
  init?: { signal?: AbortSignal | undefined }
): Promise<ChatResponse> {
  const response = await request({
    path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversation_id: conversationId }),
    timeoutMs: config.requestTimeoutMs,
    signal: init?.signal,
  });
  return parseOrThrow(chatResponseSchema, await response.json(), 'chat') as ChatResponse;
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

/**
 * Kept for `lib/stream.ts`, which owns its own fetch because SSE needs the raw
 * body. It shares this module's normalisation so both paths fail identically.
 */
export const toApiFailure = normaliseError;
