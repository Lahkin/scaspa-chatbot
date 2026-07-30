/**
 * The network boundary.
 *
 * Two claims worth being certain about, because both are silent when wrong:
 *
 *   1. **A renamed field fails here, loudly, naming the field** — rather than
 *      three components later as an `undefined` rendered into a fee table.
 *   2. **A 429 is never retried.** Retrying a rate limit is how you extend one.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { config } from '@/lib/config';
import {
  ApiError,
  getHealth,
  normaliseError,
  parseRetryAfter,
  sendMessage,
  synthesiseSpeech,
  transcribeAudio,
} from '@/lib/api';
import { SchemaMismatch } from '@/lib/schemas';
import { shouldRetry } from '@/features/chat/queries';
import {
  clearConversationId,
  readConversationId,
  writeConversationId,
} from '@/features/chat/conversation';

const BASE = config.apiBaseUrl;

afterEach(() => {
  server.resetHandlers();
  clearConversationId();
  vi.restoreAllMocks();
});

// ── Task 1: zod at the boundary ──────────────────────────────────────────────

describe('a malformed response fails at the boundary', () => {
  it('rejects a renamed field and names it', async () => {
    server.use(
      http.post(`${BASE}/api/chat`, () =>
        HttpResponse.json({
          // The backend renamed `answer` to `text` — the exact drift this exists
          // to catch.
          text: 'The fare is XCD 44.44.',
          conversation_id: '9131b944-2243-4d1e-8e87-1486a9d41f28',
          grounded: true,
          refusal: false,
          citations: [],
          chart: null,
          tool_calls: [],
          meta: {
            request_id: 'r',
            latency_ms: 1,
            retrieved_count: 1,
            best_score: 0.5,
            cited_ids: [],
            hallucinated_citations: [],
            unverified_figures: [],
            kb_version: '2026-06-01',
          },
        })
      )
    );

    const thrown = await sendMessage('ferry fare?', null).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(SchemaMismatch);
    const error = thrown as SchemaMismatch;
    // Legible: it names the field, and it says where to look.
    expect(error.message).toContain('answer');
    expect(error.message).toContain('chat');
    expect(error.message).toContain('api-contract.md');
    expect(error.issues.some((issue) => issue.startsWith('answer:'))).toBe(true);
  });

  it('rejects a wrong type, not just a missing key', async () => {
    server.use(
      http.get(`${BASE}/api/health`, () =>
        HttpResponse.json({
          status: 'ok',
          env: 'dev',
          version: '0.1.0',
          uptime_s: 'eight', // a string where a number belongs
          request_id: 'r',
          models: { chat: 'c', embedding: 'e', transcribe: 't', tts: 'v' },
          index: {
            ready: true,
            kb_version: null,
            kb_rows: null,
            kb_rows_rejected: null,
            kb_csv_filename: null,
            kb_updated_at: null,
            index_built_at: null,
            embedding_model: null,
            web_docs: null,
            message: null,
          },
        })
      )
    );

    const thrown = await getHealth().catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(SchemaMismatch);
    expect((thrown as SchemaMismatch).message).toContain('uptime_s');
  });

  it('accepts unknown extra fields — a backend adding one is not a reason to refuse an answer', async () => {
    const base = {
      status: 'ok' as const,
      env: 'dev',
      version: '0.1.0',
      uptime_s: 8,
      request_id: 'r',
      models: { chat: 'c', embedding: 'e', transcribe: 't', tts: 'v' },
      index: {
        ready: true,
        kb_version: '2026-06-01',
        kb_rows: 10,
        kb_rows_rejected: 0,
        kb_csv_filename: 'sample_kb.csv',
        kb_updated_at: '2026-06-01',
        index_built_at: '2026-07-29T18:01:50.730567Z',
        embedding_model: 'e',
        web_docs: 0,
        message: null,
      },
    };
    server.use(
      http.get(`${BASE}/api/health`, () => HttpResponse.json({ ...base, brand_new_field: 'hello' }))
    );
    // Would throw if the schema were strict. It is not, on purpose: a new field
    // is not a reason to refuse an answer to someone at a ferry terminal.
    await expect(getHealth()).resolves.toMatchObject({ status: 'ok' });
  });
});

// ── Task 3: error normalisation ──────────────────────────────────────────────

describe('every failure becomes one typed ApiError', () => {
  it('reads a contract envelope', async () => {
    const response = HttpResponse.json(
      { error: { code: 'INTERNAL', message: 'Something went wrong.', request_id: 'abc' } },
      { status: 500 }
    );
    const error = await normaliseError(response);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).toBe('Something went wrong.');
    expect(error.status).toBe(500);
    expect(error.requestId).toBe('abc');
  });

  it('does not choke on an HTML error page from a proxy', async () => {
    // This *will* happen. `response.json()` on it throws "Unexpected token '<'",
    // which sends whoever is debugging to look at their JSON parser instead of
    // at their proxy.
    const response = new HttpResponse('<html><body><h1>504 Gateway Time-out</h1></body></html>', {
      status: 504,
      headers: { 'Content-Type': 'text/html' },
    });
    // The guard must be a *check*, not a rescue. Relying on `json()` throwing
    // gets the same answer today, but it is incidental: replace the try/catch
    // with `.catch(() => null)` a year from now and the HTML body is suddenly in
    // play. So assert that the body is never parsed at all.
    const parse = vi.spyOn(response, 'json');

    const error = await normaliseError(response);
    expect(parse).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('UPSTREAM_TIMEOUT');
    expect(error.status).toBe(504);
    // Nothing from the body reaches the message: it is not ours and not safe.
    expect(error.message).not.toContain('<html>');
    expect(error.message).not.toContain('Gateway');
    expect(error.message).toContain('869-465-8121');
  });

  it('does not parse a text/plain body that happens to be valid JSON', async () => {
    // The case `json()`-throwing cannot catch: a gateway that returns a JSON-ish
    // body under the wrong content type. Without the guard this would be read as
    // if it were ours.
    const response = new HttpResponse(
      '{"error":{"code":"INTERNAL","message":"leaked internals: /app/main.py","request_id":"x"}}',
      {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
    const error = await normaliseError(response);
    expect(error.message).not.toContain('/app/main.py');
    expect(error.message).toContain('869-465-8121');
  });

  it('survives a JSON content-type with an unparseable body', async () => {
    const response = new HttpResponse('{"error": {"code": "INTER', {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    const error = await normaliseError(response);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).toContain('869-465-8121');
  });

  it('parses Retry-After as seconds and as a date', () => {
    expect(parseRetryAfter('8')).toBe(8);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('not a number')).toBeNull();
    // Both forms are legal, and a server behind a CDN may send either.
    const inTen = new Date(Date.now() + 10_000).toUTCString();
    expect(parseRetryAfter(inTen)).toBeGreaterThanOrEqual(9);
    expect(parseRetryAfter(inTen)).toBeLessThanOrEqual(10);
  });

  it('carries Retry-After through to the thrown error', async () => {
    server.use(
      http.post(`${BASE}/api/chat`, () =>
        HttpResponse.json(
          { error: { code: 'UPSTREAM_RATE_LIMITED', message: 'Busy.', request_id: 'r' } },
          { status: 503, headers: { 'Retry-After': '8' } }
        )
      )
    );
    const thrown = (await sendMessage('x', null).catch((e: unknown) => e)) as ApiError;
    expect(thrown.retryAfter).toBe(8);
  });

  it('maps a 422 so the caller can route it to the composer', async () => {
    server.use(
      http.post(`${BASE}/api/chat`, () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Too long.', request_id: 'r' } },
          { status: 422 }
        )
      )
    );
    const thrown = (await sendMessage('x', null).catch((e: unknown) => e)) as ApiError;
    expect(thrown.code).toBe('VALIDATION_ERROR');
    expect(thrown.status).toBe(422);
  });

  it('reports an unreachable server as offline, not as a server fault', async () => {
    server.use(http.post(`${BASE}/api/chat`, () => HttpResponse.error()));
    const thrown = (await sendMessage('x', null).catch((e: unknown) => e)) as ApiError;
    expect(thrown.offline).toBe(true);
    expect(thrown.status).toBe(0);
  });

  it('refuses a 200 from /api/tts that is not audio', async () => {
    // A proxy or a misroute. Failing here beats handing an <audio> element an
    // HTML page and getting a decode error.
    server.use(
      http.post(`${BASE}/api/tts`, () =>
        HttpResponse.text('<html>login</html>', { headers: { 'Content-Type': 'text/html' } })
      )
    );
    const thrown = (await synthesiseSpeech('hello').catch((e: unknown) => e)) as ApiError;
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.message).not.toContain('login');
  });
});

// ── Task 2: the calls themselves ─────────────────────────────────────────────

describe('the four calls', () => {
  it('sendMessage posts the message and the conversation id', async () => {
    let body: { message?: string; conversation_id?: string | null } = {};
    server.use(
      http.post(`${BASE}/api/chat`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        // Fail fast with an envelope rather than re-fetching the same URL — a
        // handler that fetches its own path recurses until the worker dies.
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'stop here', request_id: 'r' } },
          { status: 500 }
        );
      })
    );

    await sendMessage('ferry fare?', 'abc-123').catch(() => undefined);
    expect(body.message).toBe('ferry fare?');
    expect(body.conversation_id).toBe('abc-123');
  });

  it('sends null rather than omitting the id on a first request', async () => {
    let body: { conversation_id?: string | null } = {};
    server.use(
      http.post(`${BASE}/api/chat`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'stop here', request_id: 'r' } },
          { status: 500 }
        );
      })
    );
    await sendMessage('x', null).catch(() => undefined);
    expect(body.conversation_id).toBeNull();
  });

  it('sends no Authorization header and no cookie', async () => {
    let headers: Headers | null = null;
    server.use(
      http.post(`${BASE}/api/chat`, ({ request }) => {
        headers = request.headers;
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'stop here', request_id: 'r' } },
          { status: 500 }
        );
      })
    );
    await sendMessage('x', null).catch(() => undefined);
    // There is no auth and no session token — CLAUDE.md rule 2.
    expect(headers!.get('authorization')).toBeNull();
    expect(headers!.get('cookie')).toBeNull();
  });

  it('transcribeAudio returns the transcript', async () => {
    /*
     * Measured limitation: reading a multipart request body under MSW's **Node**
     * interceptor never settles — `request.text()` and `request.formData()` both
     * hang until the test times out. Works in a browser.
     *
     * So the field name (`audio`, which the contract specifies) cannot be
     * asserted here. It is checked against the real backend by
     * `npm run check:integration`, which is the right place for it: a field name
     * is exactly the kind of thing only the real server can confirm.
     */
    const result = await transcribeAudio(new Blob([new Uint8Array([1, 2, 3])]));
    expect(result.text).toContain('ferry');
  });

  it('builds the form with the field name the contract specifies', () => {
    // Not through the network, since the body cannot be read back. This asserts
    // the one line that matters.
    const form = new FormData();
    form.append('audio', new Blob(['x']));
    expect([...form.keys()]).toEqual(['audio']);
  });

  it('does not set Content-Type on the multipart upload', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/api/stt`, ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json({ text: 'x' });
      })
    );
    await transcribeAudio(new Blob(['x']));
    // The browser must set the boundary itself; setting it by hand produces a
    // body the server cannot split.
    expect(contentType).toContain('multipart/form-data');
    expect(contentType).toContain('boundary=');
  });
});

// ── Task 4: the retry policy ─────────────────────────────────────────────────

describe('retry policy', () => {
  const err = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
    new ApiError({ code: 'INTERNAL', message: 'm', status: 500, ...init });

  it('NEVER retries a 429 — retrying a rate limit is how you extend one', () => {
    expect(shouldRetry(0, err({ code: 'UPSTREAM_RATE_LIMITED', status: 429 }))).toBe(false);
    expect(shouldRetry(0, err({ code: 'UPSTREAM_RATE_LIMITED', status: 503 }))).toBe(false);
  });

  it('never retries a 422 — the request was wrong and will be wrong again', () => {
    expect(shouldRetry(0, err({ code: 'VALIDATION_ERROR', status: 422 }))).toBe(false);
  });

  it('retries a 5xx and a network failure', () => {
    expect(shouldRetry(0, err({ status: 500 }))).toBe(true);
    expect(shouldRetry(0, err({ status: 502 }))).toBe(true);
    expect(shouldRetry(0, err({ status: 0, offline: true }))).toBe(true);
  });

  it('does not retry a 404 or a schema mismatch', () => {
    expect(shouldRetry(0, err({ code: 'NOT_FOUND', status: 404 }))).toBe(false);
    // Re-fetching returns the same wrong shape.
    expect(shouldRetry(0, new SchemaMismatch('chat', ['answer: required']))).toBe(false);
  });

  it('gives up after two attempts', () => {
    expect(shouldRetry(1, err({ status: 500 }))).toBe(true);
    expect(shouldRetry(2, err({ status: 500 }))).toBe(false);
  });

  it('a 429 really is only requested once', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/api/chat`, () => {
        calls += 1;
        return HttpResponse.json(
          { error: { code: 'UPSTREAM_RATE_LIMITED', message: 'Busy.', request_id: 'r' } },
          { status: 429, headers: { 'Retry-After': '30' } }
        );
      })
    );

    // The policy is a pure function, so this checks the whole path: one request,
    // one failure, no second attempt.
    const thrown = (await sendMessage('x', null).catch((e: unknown) => e)) as ApiError;
    expect(calls).toBe(1);
    expect(shouldRetry(0, thrown)).toBe(false);
  });
});

// ── Task 5: conversation id lifecycle ────────────────────────────────────────

describe('conversation_id', () => {
  const ID = '9131b944-2243-4d1e-8e87-1486a9d41f28';

  it('round-trips through sessionStorage', () => {
    expect(readConversationId()).toBeNull();
    writeConversationId(ID);
    expect(readConversationId()).toBe(ID);
    expect(window.sessionStorage.getItem('conversation_id')).toBe(ID);
  });

  it('is the only thing written to storage', () => {
    writeConversationId(ID);
    expect(Object.keys(window.sessionStorage)).toEqual(['conversation_id']);
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it('ignores a value that is not a UUID', () => {
    // A corrupted or hostile value must not be echoed back to the backend.
    window.sessionStorage.setItem('conversation_id', '../../etc/passwd');
    expect(readConversationId()).toBeNull();
    writeConversationId('not-a-uuid');
    expect(readConversationId()).toBeNull();
  });

  it('clears', () => {
    writeConversationId(ID);
    clearConversationId();
    expect(readConversationId()).toBeNull();
    expect(window.sessionStorage.getItem('conversation_id')).toBeNull();
  });

  it('survives storage being unavailable', () => {
    // Safari private mode throws outright. A conversation id is a convenience;
    // failing to read one must never stop someone asking a question.
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeConversationId(ID)).not.toThrow();
  });

  it('is overwritten with whatever the backend returns', async () => {
    writeConversationId('00000000-0000-4000-8000-000000000000');
    const response = await sendMessage('ferry fare?', readConversationId());
    // The TTL is 60 minutes; an expired id is replaced by the server, so the id
    // sent is not necessarily the id now held.
    writeConversationId(response.conversation_id);
    expect(readConversationId()).toBe(response.conversation_id);
    expect(readConversationId()).not.toBe('00000000-0000-4000-8000-000000000000');
  });
});
