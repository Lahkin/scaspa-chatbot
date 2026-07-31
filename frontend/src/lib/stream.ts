/**
 * SSE over POST: fetch + `response.body.getReader()` + `TextDecoder`.
 *
 * **`EventSource` is not usable here and never will be** — CLAUDE.md rule 3. It
 * issues GET only and cannot carry a body; the endpoint is `POST /api/chat/stream`
 * with a JSON body. There is no workaround, and the lint config makes
 * `new EventSource(...)` an error so it is enforced rather than remembered.
 *
 * `@microsoft/fetch-event-source` would have supported POST. It is not used: the
 * frame handling is the part that breaks, so it is written here, in `lib/sse.ts`,
 * where it can be read and tested directly rather than trusted.
 *
 * This module owns the wire. It knows nothing about React, messages or citations
 * — it turns bytes into validated events and hands them to callbacks.
 */

import { normaliseError, ApiError, chatBody } from './api';
import { config } from './config';
import { SseParser, parseFrameData } from './sse';
import { isKnownStreamEvent, streamPayloadSchemas } from './schemas';
import type {
  ApiErrorBody,
  AssistantCard,
  Category,
  ChartSpec,
  Citation,
  RefusalCategory,
  ToolName,
} from './types';

/**
 * One callback per event the contract defines.
 *
 * A typed object rather than a single `(event) => void`: the caller ends up
 * switching on a string either way, and doing it here means an event the contract
 * adds shows up as a missing property rather than as a silently unhandled case.
 */
export interface StreamHandlers {
  /** Always first, before any token. Adopt `conversation_id` immediately. */
  onMeta?: (data: { conversation_id: string }) => void;
  onToken?: (data: { text: string }) => void;
  onToolStart?: (data: { name: ToolName; summary: string }) => void;
  onToolEnd?: (data: { name: ToolName; summary: string; ms: number }) => void;
  /** After the last token — validation needs the finished text. */
  onCitations?: (data: { citations: Citation[] }) => void;
  onChart?: (data: ChartSpec) => void;
  /**
   * A populated card, after `citations` and before `done`.
   *
   * The payload is identical to the `card` field on `POST /api/chat` — the
   * backend fills the rows from the feed and re-emits, so a client cannot end up
   * with a different card depending on which endpoint answered.
   */
  onCard?: (data: AssistantCard) => void;
  /**
   * The tool-call cap was hit. Everything streamed so far was an internal
   * message, not an answer: discard it and render this instead.
   */
  onReplace?: (data: { text: string }) => void;
  onDone?: (data: {
    latency_ms: number;
    grounded: boolean;
    refusal: boolean;
    /** Absent on a plain no-answer; present when a specific refusal gate fired. */
    refusal_category?: RefusalCategory;
    kb_version: string | null;
  }) => void;
  /** Once headers are sent the status is fixed at 200, so a failure arrives here. */
  onError?: (data: ApiErrorBody) => void;
}

export interface StreamRequest {
  message: string;
  conversationId?: string | null;
  /** Optional retrieval filter. Omitted from the body when absent. */
  category?: Category | null | undefined;
}

/** Thrown when the response was not a stream at all. */
export class NotAStream extends Error {
  readonly contentType: string;

  constructor(contentType: string) {
    super(
      `Expected text/event-stream, got "${contentType || '(none)'}". ` +
        `A proxy or gateway has intercepted the request.`
    );
    this.name = 'NotAStream';
    this.contentType = contentType;
  }
}

export interface StreamResult {
  /** True once `done` arrived. False if the stream ended any other way. */
  completed: boolean;
  /** True if an `error` event was dispatched. */
  errored: boolean;
}

/**
 * Open the stream and drive the handlers until it ends.
 *
 * Resolves when the connection closes. Throws `ApiError` for a failure that
 * happened *before* streaming began — those arrive as a normal HTTP error with the
 * usual envelope, because validation runs before the first byte is written.
 */
export async function streamMessage(
  request: StreamRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<StreamResult> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Declares the intent. A proxy that is going to mangle SSE will often
        // reveal itself in the response to this.
        Accept: 'text/event-stream',
      },
      // No Authorization header and no cookie: there is no auth and no session
      // token — CLAUDE.md rule 2.
      //
      // Body built by the same function `POST /api/chat` uses. The two endpoints
      // promise identical content for the same question, and they cannot keep
      // that promise if they can drift on what they send.
      body: JSON.stringify(
        chatBody(request.message, request.conversationId ?? null, request.category)
      ),
      ...(signal ? { signal } : {}),
    });
  } catch (thrown) {
    // A deliberate cancel is not a failure to report.
    if (signal?.aborted) throw thrown;
    throw new ApiError({
      code: 'INTERNAL',
      message:
        'I could not reach SCASPA just now. Please check your connection and try again, ' +
        'or call SCASPA on 869-465-8121 / 2 / 3.',
      status: 0,
      offline: true,
    });
  }

  // Validation and upstream failures happen *before* streaming starts, so they
  // arrive as an ordinary HTTP error carrying the usual envelope.
  if (!response.ok) throw await normaliseError(response);

  /*
   * Check it is actually a stream before reading a byte.
   *
   * Two distinct wrong answers, and conflating them costs an afternoon:
   *
   *   application/json — the backend returned an error envelope with a 200, or a
   *     shape change. Parse it and throw a real ApiError.
   *   text/html — a proxy, gateway or captive portal intercepted the request. The
   *     body is somebody else's HTML and must never be read or shown.
   *
   * Without this, both are fed to the frame parser, which finds no `data:` lines
   * and reports an empty stream — a symptom pointing nowhere near the cause.
   */
  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();

  if (contentType.includes('application/json')) {
    throw await normaliseError(response);
  }

  if (!contentType.includes('text/event-stream')) {
    throw new NotAStream(contentType);
  }

  if (!response.body) throw new NotAStream(contentType);

  const parser = new SseParser();
  // One decoder for the whole stream. `{ stream: true }` below makes it hold a
  // partial multi-byte sequence across a chunk boundary — without it, a chunk
  // that splits the middle of "—" or an accented character in a French place
  // name emits U+FFFD and the answer is visibly corrupted.
  const decoder = new TextDecoder('utf-8');
  const reader = response.body.getReader();

  const result: StreamResult = { completed: false, errored: false };

  try {
    for (;;) {
      /*
       * Check the signal ourselves rather than relying on the read rejecting.
       *
       * Measured (F003): under MSW's Node interceptor an abort does **not**
       * reject a pending read, so a test could not observe cancellation at all.
       * But it is not only a test concern — a reader part-way through a buffered
       * chunk keeps delivering what it already has, so a user who presses Stop
       * would watch several more tokens appear after they pressed it.
       *
       * Checking here makes the stop immediate and makes cancellation testable,
       * regardless of how the underlying reader behaves.
       */
      if (signal?.aborted) break;

      const { done, value } = await reader.read();

      if (signal?.aborted) break;

      if (done) {
        // Drain anything the server left unterminated.
        for (const frame of parser.flush()) {
          if (dispatch(frame.event, frame.data, handlers, result)) break;
        }
        break;
      }

      const text = decoder.decode(value, { stream: true });
      for (const frame of parser.push(text)) {
        // `error` closes the connection; nothing after it is meaningful.
        if (dispatch(frame.event, frame.data, handlers, result)) {
          return result;
        }
      }
    }
  } finally {
    // Releasing the lock is what actually lets the connection be collected. A
    // leaked reader keeps the connection open, and the backend explicitly detects
    // a live connection to decide whether to keep generating — so a leak here
    // keeps burning tokens for an answer nobody is reading.
    try {
      // `cancel()` tells the source to stop producing — this is the half that
      // reaches the backend and lets it stop generating. Not awaited: under
      // MSW-node it never settles, and waiting would hang the caller.
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    } catch {
      // Already released, or the stream errored. Nothing to do.
    }
  }

  return result;
}

/**
 * Validate one frame and call its handler.
 *
 * Returns true when the stream should stop — only `error` does that.
 */
function dispatch(
  event: string,
  data: string,
  handlers: StreamHandlers,
  result: StreamResult
): boolean {
  // An event this client does not know is not an error. The backend is allowed to
  // add events, and a client that throws on one it has not been taught is a
  // client that breaks on the next deploy.
  if (!isKnownStreamEvent(event)) {
    if (event !== '' && import.meta.env.DEV) {
      console.warn(`[stream] ignoring unknown event "${event}"`);
    }
    return false;
  }

  const payload = parseFrameData({ event, data });
  if (!payload.ok) return false; // malformed; already warned

  const parsed = streamPayloadSchemas[event].safeParse(payload.value);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.warn(
        `[stream] "${event}" did not match its schema and was skipped: ` +
          parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')
      );
    }
    return false;
  }

  switch (event) {
    case 'meta':
      // Adopted immediately, before any token, so the conversation is correct
      // even if the user navigates away mid-answer.
      handlers.onMeta?.(parsed.data as { conversation_id: string });
      return false;
    case 'token':
      handlers.onToken?.(parsed.data as { text: string });
      return false;
    case 'tool_start':
      handlers.onToolStart?.(parsed.data as { name: ToolName; summary: string });
      return false;
    case 'tool_end':
      handlers.onToolEnd?.(parsed.data as { name: ToolName; summary: string; ms: number });
      return false;
    case 'citations':
      handlers.onCitations?.(parsed.data as { citations: Citation[] });
      return false;
    case 'chart':
      handlers.onChart?.(parsed.data as ChartSpec);
      return false;
    case 'card':
      handlers.onCard?.(parsed.data as AssistantCard);
      return false;
    case 'replace':
      handlers.onReplace?.(parsed.data as { text: string });
      return false;
    case 'done':
      result.completed = true;
      handlers.onDone?.(
        parsed.data as {
          latency_ms: number;
          grounded: boolean;
          refusal: boolean;
          refusal_category?: RefusalCategory;
          kb_version: string | null;
        }
      );
      return false;
    case 'error':
      result.errored = true;
      handlers.onError?.(parsed.data as ApiErrorBody);
      // The connection closes after an error event; nothing further arrives.
      return true;
    default:
      return false;
  }
}
