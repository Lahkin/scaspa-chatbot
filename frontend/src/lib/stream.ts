/**
 * SSE-over-POST: fetch + ReadableStream, parsed by hand.
 *
 * `EventSource` is deliberately not used and must never be — CLAUDE.md rule 3.
 * It can only issue GET requests and the chat endpoint is a POST with a JSON
 * body. There is no workaround; the lint config makes `new EventSource(...)` an
 * error so this is enforced rather than remembered.
 *
 * ### The two things this has to get right
 *
 * **1. A frame can be split across chunks.** TCP does not care where the frames
 * are. A chunk may end mid-JSON, mid-`data:` line, or between the two newlines
 * that terminate a frame. So bytes are accumulated in a buffer and only complete
 * frames — those terminated by a blank line — are taken off it. The mock splits
 * the first token frame mid-JSON on purpose, which is what keeps this honest.
 *
 * **2. Cancellation is a race, not an abort.** Measured in F003: under MSW's
 * Node interceptor `body.cancel()` never settles and `AbortController.abort()`
 * does not reject a read that is already pending. Both work in a real browser,
 * but a timeout that depends on the read rejecting is untestable and, on a flaky
 * mobile connection, slower than it looks. So the read is raced against a timer
 * and consumption stops when the timer wins; the abort is cleanup afterwards,
 * not the mechanism.
 */

import { config } from './config';
import { toApiFailure } from './api';
import { isKnownStreamEvent, streamPayloadSchemas } from './schemas';
import type { StreamEvent } from './types';

/** One `event:` / `data:` pair, already validated against its payload schema. */
export type ParsedEvent = StreamEvent;

export class StreamTimeout extends Error {
  constructor(ms: number) {
    super(`The assistant stopped responding after ${Math.round(ms / 1000)} seconds.`);
    this.name = 'StreamTimeout';
  }
}

/**
 * Pull complete frames out of an accumulating buffer.
 *
 * Returns the frames found and whatever is left over. The leftover is the whole
 * point: it is the half-frame that the next chunk completes.
 */
export function takeFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;

  for (;;) {
    // SSE terminates a frame with a blank line. \r\n\r\n is tolerated because
    // proxies rewrite line endings.
    const match = /\r?\n\r?\n/.exec(rest);
    if (!match) break;
    frames.push(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
  }

  return { frames, rest };
}

/**
 * Parse one frame's text into a typed event.
 *
 * Returns null for anything unrecognised — a comment line (`: keep-alive`), an
 * event name this client does not know, or a payload that fails its schema. An
 * unknown event is not an error: the backend is allowed to add events, and a
 * client that throws on one it has not been taught is a client that breaks on
 * the next deploy.
 */
export function parseFrame(frame: string): ParsedEvent | null {
  let name = '';
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }

  if (!name || dataLines.length === 0) return null;
  if (!isKnownStreamEvent(name)) return null;

  let json: unknown;
  try {
    json = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }

  const result = streamPayloadSchemas[name].safeParse(json);
  if (!result.success) return null;

  return { event: name, data: result.data } as ParsedEvent;
}

export interface StreamOptions {
  message: string;
  conversationId?: string | null;
  signal?: AbortSignal;
  /** Overrides `config.streamTimeoutMs`. */
  timeoutMs?: number;
}

/**
 * Open the stream and yield events as they arrive.
 *
 * Throws `StreamTimeout` if nothing arrives for `timeoutMs` — measured between
 * chunks, not from the start, so a long answer is not cut off mid-sentence while
 * a genuinely dead connection still ends.
 */
export async function* streamChat(options: StreamOptions): AsyncGenerator<ParsedEvent, void, void> {
  const timeoutMs = options.timeoutMs ?? config.streamTimeoutMs;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);

  const response = await fetch(`${config.apiBaseUrl}/api/chat/stream`, {
    method: 'POST',
    // No Authorization header, no cookie. There is no auth and no session token —
    // CLAUDE.md rule 2.
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      message: options.message,
      conversation_id: options.conversationId ?? null,
    }),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    options.signal?.removeEventListener('abort', onAbort);
    // Validation and upstream failures happen *before* streaming starts, so they
    // arrive as a normal HTTP error with the usual envelope. Converted here into
    // an ApiFailure carrying the backend's own user-facing message, rather than
    // thrown as a raw Response — a caller should never have to know that the
    // failure happened to come from fetch.
    throw await toApiFailure(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      // The race described above. `timer` resolves to a sentinel rather than
      // rejecting, so a lost race is ordinary control flow.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      });

      const next = await Promise.race([reader.read(), deadline]);
      if (timer !== undefined) clearTimeout(timer);

      if (next === 'timeout') throw new StreamTimeout(timeoutMs);
      if (next.done) break;

      buffer += decoder.decode(next.value, { stream: true });
      const { frames, rest } = takeFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    // Cleanup, not mechanism. Best-effort and never awaited: under MSW-node
    // `cancel()` does not settle, and waiting on it here would hang the caller.
    controller.abort();
    void reader.cancel().catch(() => {});
  }
}
