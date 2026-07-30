/**
 * MSW request handlers. **Dev and test only** — never imported by production code.
 *
 * CI has no backend, so every test runs against these. They must therefore match
 * `docs/api-contract.md` exactly: a mock that is kinder than the real server
 * produces tests that pass against a product that does not work.
 *
 * Fidelity choices worth knowing:
 *   - Error bodies are the real envelope, and every message ends with the phone
 *     number, because the real ones do.
 *   - The 429/503 carries a `Retry-After` header. A client that ignores it and
 *     retries immediately should be able to observe itself doing so.
 *   - A refusal is **HTTP 200**. It is not an error and must not be mocked as one.
 *   - `/api/chat` and `/api/chat/stream` return the same content, which is the
 *     contract's central promise — streaming changes when you see the answer,
 *     never what it says.
 */

import { HttpResponse, http } from 'msw';
import { config } from '@/lib/config';
import type { ChatRequest } from '@/lib/types';
import {
  CHAT_RESPONSE,
  EMPTY_CITATIONS_RESPONSE,
  ERROR_INTERNAL,
  ERROR_RATE_LIMITED,
  ERROR_UPSTREAM_TIMEOUT,
  ERROR_VALIDATION,
  CITATIONS_WITH_VOLATILITY,
  CITATION_LOW,
  HALLUCINATED_ANSWER,
  HEALTH,
  TABLE_ANSWER,
  REFUSAL_RESPONSE,
  STT_TEXT,
  UNGROUNDED_RESPONSE,
  silentMp3,
} from './fixtures';
import { getScenario } from './scenarios';
import { SSE_HEADERS, chatStream } from './sse';

const base = config.apiBaseUrl;

/** 1–1000 characters, whitespace-only rejected — the real validation rule. */
function invalidMessage(body: Partial<ChatRequest>): boolean {
  const message = body.message;
  return typeof message !== 'string' || message.trim().length === 0 || message.length > 1000;
}

async function readBody(request: Request): Promise<Partial<ChatRequest>> {
  try {
    return (await request.json()) as Partial<ChatRequest>;
  } catch {
    return {};
  }
}

export const handlers = [
  // ── POST /api/chat ─────────────────────────────────────────────────────────
  http.post(`${base}/api/chat`, async ({ request }) => {
    const body = await readBody(request);
    if (invalidMessage(body)) {
      return HttpResponse.json(ERROR_VALIDATION, { status: 422 });
    }

    switch (getScenario()) {
      case 'rate_limited':
        // Retry-After is in seconds. The server has already retried with backoff by
        // the time this arrives, so an immediate client retry loop will not help.
        return HttpResponse.json(ERROR_RATE_LIMITED, {
          status: 503,
          headers: { 'Retry-After': '8' },
        });

      case 'internal_error':
        return HttpResponse.json(ERROR_INTERNAL, { status: 500 });

      case 'upstream_timeout':
        return HttpResponse.json(ERROR_UPSTREAM_TIMEOUT, { status: 504 });

      // A refusal is a successful response. Not 4xx, not 5xx.
      case 'refusal':
        return HttpResponse.json(REFUSAL_RESPONSE);

      case 'ungrounded':
        return HttpResponse.json(UNGROUNDED_RESPONSE);

      case 'empty_citations':
        return HttpResponse.json(EMPTY_CITATIONS_RESPONSE);

      case 'table':
        return HttpResponse.json({ ...CHAT_RESPONSE, answer: TABLE_ANSWER });

      case 'hallucinated_marker':
        return HttpResponse.json({ ...CHAT_RESPONSE, answer: HALLUCINATED_ANSWER });

      case 'volatility':
        return HttpResponse.json({
          ...CHAT_RESPONSE,
          citations: [...CITATIONS_WITH_VOLATILITY, CITATION_LOW],
        });

      // Neither of these has a non-streaming equivalent — they are stream-only
      // failures — so the JSON endpoint answers normally.
      case 'stream_error':
      case 'stream_stall':
      case 'happy':
      default:
        return HttpResponse.json(CHAT_RESPONSE);
    }
  }),

  // ── POST /api/chat/stream ──────────────────────────────────────────────────
  http.post(`${base}/api/chat/stream`, async ({ request }) => {
    const body = await readBody(request);

    // Validation happens *before* streaming starts, so a bad body gets a normal
    // 422 with the usual envelope rather than an error event.
    if (invalidMessage(body)) {
      return HttpResponse.json(ERROR_VALIDATION, { status: 422 });
    }

    switch (getScenario()) {
      case 'rate_limited':
        return HttpResponse.json(ERROR_RATE_LIMITED, {
          status: 503,
          headers: { 'Retry-After': '8' },
        });

      case 'internal_error':
        return HttpResponse.json(ERROR_INTERNAL, { status: 500 });

      case 'upstream_timeout':
        return HttpResponse.json(ERROR_UPSTREAM_TIMEOUT, { status: 504 });

      case 'stream_error':
        return new HttpResponse(
          chatStream({
            errorMidStream: {
              code: 'INTERNAL',
              message: ERROR_INTERNAL.error.message,
            },
          }),
          { headers: SSE_HEADERS }
        );

      case 'stream_stall':
        return new HttpResponse(chatStream({ stall: true }), { headers: SSE_HEADERS });

      case 'refusal':
        return new HttpResponse(
          chatStream({
            answer: REFUSAL_RESPONSE.answer,
            skipTools: true,
            grounded: false,
            emptyCitations: true,
          }),
          { headers: SSE_HEADERS }
        );

      case 'ungrounded':
        return new HttpResponse(chatStream({ grounded: false }), { headers: SSE_HEADERS });

      case 'table':
        return new HttpResponse(chatStream({ answer: TABLE_ANSWER }), { headers: SSE_HEADERS });

      case 'hallucinated_marker':
        return new HttpResponse(chatStream({ answer: HALLUCINATED_ANSWER }), {
          headers: SSE_HEADERS,
        });

      case 'volatility':
        return new HttpResponse(
          chatStream({ citations: [...CITATIONS_WITH_VOLATILITY, CITATION_LOW] }),
          { headers: SSE_HEADERS }
        );

      case 'empty_citations':
        return new HttpResponse(chatStream({ emptyCitations: true, grounded: false }), {
          headers: SSE_HEADERS,
        });

      case 'happy':
      default:
        return new HttpResponse(chatStream(), { headers: SSE_HEADERS });
    }
  }),

  // ── GET /api/health ────────────────────────────────────────────────────────
  http.get(`${base}/api/health`, () => HttpResponse.json(HEALTH)),

  // ── POST /api/stt ──────────────────────────────────────────────────────────
  // Multipart, field name `audio`. The whole response is the transcript — and it
  // goes in the input box, never straight into /api/chat, so a misheard terminal
  // name can be corrected before it becomes a confident answer to the wrong
  // question.
  http.post(`${base}/api/stt`, () => HttpResponse.json({ text: STT_TEXT })),

  // ── POST /api/tts ──────────────────────────────────────────────────────────
  http.post(`${base}/api/tts`, () => {
    const bytes = silentMp3();
    return new HttpResponse(bytes, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
        ETag: '"mock-tts-silent"',
        'X-TTS-Cache': 'miss',
      },
    });
  }),

  // ── POST /api/tts/preview ──────────────────────────────────────────────────
  // Sanitised text, no provider call, no cost. Markers removed, currency and phone
  // numbers expanded — the fastest way to find a sanitisation bug.
  http.post(`${base}/api/tts/preview`, () =>
    HttpResponse.json({
      text:
        'The placeholder one-way adult fare on the Basseterre to Charlestown ferry ' +
        'is 44.44 East Caribbean dollars.',
    })
  ),
];
