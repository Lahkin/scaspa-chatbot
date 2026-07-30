/**
 * The streaming mock. **Dev and test only.**
 *
 * This is a real `text/event-stream`: real frames, real chunk boundaries, real
 * delays. It is deliberately awkward in two specific ways, because both are things
 * the network does and neither is something a convenient mock would ever do.
 *
 * **1. A frame is split across two chunks.** The first `token` frame is enqueued
 * as two separate chunks, cut in the middle of its JSON. A parser that assumes one
 * chunk is one frame — or even that a chunk ends on a frame boundary — produces a
 * JSON parse error on the very first token.
 *
 * **2. A `[kb-014]` marker is split across two `token` events.** One event ends
 * `...XCD 44.44 [kb-0` and the next begins `14].`. This is the case
 * `docs/api-contract.md` warns about explicitly: markers must be parsed on
 * accumulated text, never per frame. A client that renders citation chips
 * frame-by-frame shows a broken `[kb-0` to the user.
 *
 * Neither is a trick. The server cannot strip markers mid-stream precisely because
 * it cannot do it safely across a frame boundary, and TCP does not care where the
 * frames are. If the streaming code cannot survive this, it will not survive a
 * cruise terminal's wifi.
 */

import type { StreamEvent } from '@/lib/types';
import { ANSWER, CITATIONS, CONVERSATION_ID, KB_VERSION, REQUEST_ID, TOOL_CALLS } from './fixtures';
import { sleep } from './scenarios';

const encoder = new TextEncoder();

/** One SSE frame, wire format. */
export function frame(event: StreamEvent['event'], data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Split the answer into token-sized pieces, then force a split **inside** the
 * first `[kb-014]` marker.
 *
 * Done by construction rather than by chance: a random split might land somewhere
 * harmless and the test would pass for the wrong reason.
 */
export function tokenize(answer: string = ANSWER): string[] {
  // Keep the whitespace attached to the preceding word, the way a real tokeniser
  // emits it — so reassembling is plain concatenation with no joins.
  const pieces = answer.match(/\S+\s*/g) ?? [];

  const out: string[] = [];
  let alreadySplit = false;
  for (const piece of pieces) {
    const marker = piece.indexOf('[kb-014]');
    if (!alreadySplit && marker !== -1) {
      // Cut three characters into the marker: '[kb-0' | '14]'.
      const cut = marker + 5;
      out.push(piece.slice(0, cut));
      out.push(piece.slice(cut));
      alreadySplit = true;
      continue;
    }
    out.push(piece);
  }

  if (!alreadySplit) {
    throw new Error(
      'The streaming mock could not find a [kb-014] marker to split. The whole ' +
        'point of this fixture is that a marker crosses a frame boundary — fix the ' +
        'fixture rather than removing the check.'
    );
  }
  return out;
}

interface Enqueue {
  (text: string): void;
}

/**
 * Write one frame as **two** chunks, cut at `at` characters in.
 *
 * The cut lands mid-JSON, so a parser that tries `JSON.parse` on whatever arrived
 * fails immediately. That is the intended lesson.
 */
function writeSplit(enqueue: Enqueue, text: string, at: number): void {
  enqueue(text.slice(0, at));
  enqueue(text.slice(at));
}

export interface StreamOptions {
  /** Emit an `error` event partway through the tokens instead of finishing. */
  errorMidStream?: { code: 'INTERNAL' | 'UPSTREAM_TIMEOUT'; message: string };
  /** Emit two tokens and then nothing at all: no done, no error, no close. */
  stall?: boolean;
  /** Send `citations` with an empty array — every streamed marker was unverified. */
  emptyCitations?: boolean;
  /** Reported on the `done` frame. */
  grounded?: boolean;
  /** Replace the answer text (used by the refusal scenario). */
  answer?: string;
  /** Skip tool events (a refusal never reaches a tool). */
  skipTools?: boolean;
}

/**
 * Build the response body.
 *
 * `ReadableStream` rather than a string, because a string body arrives as one
 * chunk and would quietly undo everything above.
 */
export function chatStream(options: StreamOptions = {}): ReadableStream<Uint8Array> {
  const {
    errorMidStream,
    stall = false,
    emptyCitations = false,
    grounded = true,
    answer = ANSWER,
    skipTools = false,
  } = options;

  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue: Enqueue = (text) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(text));
      };

      try {
        // `meta` is always first, before any token, so the client can attach
        // conversation state immediately.
        enqueue(frame('meta', { conversation_id: CONVERSATION_ID }));

        if (!skipTools) {
          // ~150ms of apparent thinking. Tool events are the only visible sign the
          // assistant is doing research rather than stalling.
          await sleep(150);
          const tool = TOOL_CALLS[0];
          if (tool) {
            enqueue(frame('tool_start', { name: tool.name, summary: tool.summary }));
            await sleep(tool.ms);
            enqueue(frame('tool_end', { name: tool.name, summary: tool.summary, ms: tool.ms }));
          }
        }

        const tokens = tokenize(answer);
        const errorAt = errorMidStream ? Math.floor(tokens.length / 2) : -1;

        for (let index = 0; index < tokens.length; index += 1) {
          if (cancelled) return;

          if (index === errorAt && errorMidStream) {
            // Headers went out long ago, so the status is fixed at 200. A failure
            // can only arrive as an event.
            enqueue(
              frame('error', {
                code: errorMidStream.code,
                message: errorMidStream.message,
                request_id: REQUEST_ID,
              })
            );
            controller.close();
            return;
          }

          const text = frame('token', { text: tokens[index] ?? '' });

          if (index === 0) {
            // The split frame. Cut inside the JSON payload, not on a newline.
            writeSplit(enqueue, text, text.indexOf('data: ') + 10);
          } else {
            enqueue(text);
          }

          if (stall && index === 1) {
            // Two tokens, then silence. No done, no error, no close — the
            // connection just hangs, which is what a dropped upstream looks like
            // from the browser. Only a client-side timeout gets out of this.
            return;
          }

          await sleep(20 + (index % 3) * 10); // 20–40ms, as the contract describes
        }

        // `citations` arrives after the last token: validation needs the finished
        // text, so it cannot come earlier.
        await sleep(30);
        enqueue(frame('citations', { citations: emptyCitations ? [] : CITATIONS }));

        enqueue(
          frame('done', {
            latency_ms: 1284,
            grounded,
            refusal: skipTools,
            kb_version: KB_VERSION,
          })
        );
        controller.close();
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },

    cancel() {
      // The client closed the connection. Server-side this cancels generation and
      // nothing further is charged; here it just stops the loop.
      cancelled = true;
    },
  });
}

/** Headers the real endpoint sends. `X-Accel-Buffering` matters: some proxies otherwise buffer the whole stream and defeat the point. */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;
