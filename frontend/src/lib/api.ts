/**
 * Every fetch call in the application lives in this file and `lib/stream.ts` —
 * CLAUDE.md rule 7, enforced by an ESLint rule rather than by review.
 *
 * Keeping the network surface in two modules is what makes it possible to state,
 * and check, that there is no Authorization header, no cookie, and no request to
 * any host but the configured backend.
 */

import { config } from './config';
import { chatResponseSchema, errorEnvelopeSchema } from './schemas';
import type { ApiError, ChatResponse, HealthResponse, SttResponse } from './types';

/** A failure carrying the backend's own user-facing message. */
export class ApiFailure extends Error {
  readonly error: ApiError;
  readonly status: number;
  /** Seconds, from `Retry-After`. Null when the server did not say. */
  readonly retryAfterS: number | null;
  /**
   * The request never reached a server.
   *
   * Distinguished from a 5xx because the user-facing answer is different: "you
   * appear to be offline" is actionable, "something went wrong at our end" is
   * not, and telling someone on a dead hotel wifi that *we* broke sends them to
   * ring a phone number about our uptime.
   */
  readonly offline: boolean;

  constructor(error: ApiError, status: number, retryAfterS: number | null = null, offline = false) {
    super(error.message);
    this.name = 'ApiFailure';
    this.error = error;
    this.status = status;
    this.retryAfterS = retryAfterS;
    this.offline = offline;
  }
}

const NETWORK_FAILURE: ApiError = {
  code: 'INTERNAL',
  message:
    'I could not reach SCASPA just now. Please check your connection and try again, ' +
    'or call SCASPA on 869-465-8121 / 2 / 3.',
  request_id: 'client-side',
};

/**
 * Turn any non-2xx response into an `ApiFailure` carrying a message that is safe
 * to show.
 *
 * The contract guarantees an envelope on every error and that `message` is
 * written for a traveller. When the body is *not* an envelope — a proxy 502, an
 * HTML error page — the client supplies its own sentence rather than rendering
 * whatever arrived, because that is exactly where a stack trace or an upstream
 * provider name would leak onto the screen.
 */
export async function toApiFailure(response: Response): Promise<ApiFailure> {
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterS = retryAfterHeader ? Number(retryAfterHeader) : null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiFailure(NETWORK_FAILURE, response.status, retryAfterS);
  }

  const parsed = errorEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return new ApiFailure(NETWORK_FAILURE, response.status, retryAfterS);
  }

  return new ApiFailure(
    parsed.data.error,
    response.status,
    Number.isFinite(retryAfterS) ? retryAfterS : null
  );
}

async function getJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, init);
  } catch {
    // fetch rejects only on a network-level failure. `navigator.onLine` false is
    // conclusive; true is not (a captive portal answers DNS and drops the rest),
    // so a rejected fetch counts as offline either way.
    throw new ApiFailure(NETWORK_FAILURE, 0, null, true);
  }
  if (!response.ok) throw await toApiFailure(response);
  return response.json();
}

/** Non-streaming chat. Same content as the stream; the text is fully verified before it is sent. */
export async function postChat(
  message: string,
  conversationId: string | null
): Promise<ChatResponse> {
  const body = await getJson('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });
  return chatResponseSchema.parse(body) as ChatResponse;
}

export async function getHealth(): Promise<HealthResponse> {
  return (await getJson('/api/health')) as HealthResponse;
}

/**
 * Transcribe audio.
 *
 * The transcript goes in the input box, **never straight into /api/chat** — the
 * contract is explicit, and a confident answer to a misheard question is both a
 * bad experience and a bad demo moment.
 */
export async function postStt(audio: Blob): Promise<SttResponse> {
  const form = new FormData();
  form.append('audio', audio);
  return (await getJson('/api/stt', { method: 'POST', body: form })) as SttResponse;
}
