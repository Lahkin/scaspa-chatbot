/**
 * Exercise every endpoint against a **real, locally running backend**.
 *
 * Run this on the first day both halves exist, and after any contract change:
 *
 *   cd backend && uv run uvicorn app.main:app --reload     # terminal 1
 *   cd frontend && npm run check:integration               # terminal 2
 *
 * It is a Node script rather than a Vitest suite on purpose: the whole point is
 * that **nothing is mocked**. A test file in this project runs against MSW, which
 * is exactly the thing that cannot tell you whether the two halves agree.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ IF THE BROWSER REPORTS A CORS ERROR, THE FIX IS IN THE BACKEND.           │
 * │                                                                           │
 * │ Add the frontend's origin to `ALLOWED_ORIGINS` in the backend's `.env`    │
 * │ (default `http://localhost:5173`) and restart it. There is no fetch       │
 * │ option, no header and no `mode:` value that fixes a CORS error from the   │
 * │ client side — the whole mechanism exists to stop exactly that. An         │
 * │ afternoon is routinely lost to this.                                     │
 * │                                                                           │
 * │ Note this script itself runs in Node, which does **not** enforce CORS.   │
 * │ So a green run here does not prove the browser will be happy: it proves   │
 * │ the shapes agree. The origin preflight below is what checks CORS, and it  │
 * │ is the check to read first when the app fails but this script passes.     │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

const BASE = process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(name, detail = '') {
  passed += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, why) {
  skipped += 1;
  console.log(`  SKIP  ${name} — ${why}`);
}

function check(name, condition, detail = '') {
  if (condition) pass(name, detail);
  else fail(name, detail);
  return condition;
}

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  const contentType = response.headers.get('content-type') ?? '';
  // The same content-type guard the client uses: a proxy's HTML error page must
  // not reach a JSON parser and produce "Unexpected token '<'".
  if (!contentType.includes('application/json')) {
    return { response, body: null, contentType };
  }
  return { response, body: await response.json(), contentType };
}

console.log(`\nIntegration check against ${BASE}\n`);

// ── 0. Is it even there? ─────────────────────────────────────────────────────
try {
  await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
} catch {
  console.log(`  The backend is not answering on ${BASE}.`);
  console.log('  Start it with:  cd backend && uv run uvicorn app.main:app --reload\n');
  process.exit(1);
}

// ── 1. CORS preflight ────────────────────────────────────────────────────────
// Read this first if the app fails in a browser but everything below passes.
console.log('CORS');
{
  const response = await fetch(`${BASE}/api/chat`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const ok = allowOrigin === ORIGIN || allowOrigin === '*';
  check(
    `preflight allows ${ORIGIN}`,
    ok,
    ok
      ? `allow-origin: ${allowOrigin}`
      : `got ${allowOrigin ?? '(no header)'} — add ${ORIGIN} to ALLOWED_ORIGINS in the backend .env and restart`
  );
  if (allowOrigin === '*') {
    console.log('  NOTE  a wildcard origin is rejected at boot when ENV=prod. Fine locally.');
  }
}

// ── 2. GET /api/health ───────────────────────────────────────────────────────
console.log('\nGET /api/health');
let health = null;
{
  const { response, body, contentType } = await json('/api/health');
  check('200', response.status === 200, `status ${response.status}`);
  check('application/json', contentType.includes('application/json'), contentType);
  if (body) {
    health = body;
    check("status is 'ok' or 'degraded'", ['ok', 'degraded'].includes(body.status), body.status);
    for (const field of ['env', 'version', 'uptime_s', 'request_id', 'models', 'index']) {
      check(`has ${field}`, body[field] !== undefined);
    }
    for (const field of ['chat', 'embedding', 'transcribe', 'tts']) {
      check(`models.${field}`, typeof body.models?.[field] === 'string');
    }
    for (const field of [
      'ready',
      'kb_version',
      'kb_rows',
      'kb_rows_rejected',
      'kb_csv_filename',
      'kb_updated_at',
      'index_built_at',
      'embedding_model',
      'web_docs',
      'message',
    ]) {
      check(`index.${field} present`, field in (body.index ?? {}));
    }
    // Unknown values must be null, never 0 — a client must not read "never built"
    // as "built and empty".
    const zeroed = ['kb_rows', 'kb_rows_rejected', 'web_docs'].filter(
      (field) => body.index?.[field] === 0 && body.index?.ready === false
    );
    check('unknown index values are null, not 0', zeroed.length === 0, zeroed.join(', '));
  }
}

// ── 3. POST /api/chat ────────────────────────────────────────────────────────
console.log('\nPOST /api/chat');
let conversationId = null;
if (health?.index?.ready === false) {
  skip('a normal answer', 'the index is not built — run: uv run python scripts/build_index.py');
} else {
  const { response, body } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How much is a ferry ticket?' }),
  });

  if (check('200', response.status === 200, `status ${response.status}`) && body) {
    conversationId = body.conversation_id;
    for (const field of [
      'answer',
      'conversation_id',
      'grounded',
      'refusal',
      'citations',
      'chart',
      'tool_calls',
      'meta',
    ]) {
      check(`has ${field}`, body[field] !== undefined);
    }
    check(
      'answer is a non-empty string',
      typeof body.answer === 'string' && body.answer.length > 0
    );
    check('citations is an array', Array.isArray(body.citations));

    for (const citation of body.citations ?? []) {
      for (const field of [
        'kb_id',
        'category',
        'subcategory',
        'source_url',
        'source_type',
        'as_of',
        'confidence',
      ]) {
        check(`citation.${field}`, citation[field] !== undefined);
      }
      // The three the UI wants and the contract does not carry yet — see
      // docs/decisions.md F005. Reported, not failed: their absence is the known
      // state, and this line is how anyone notices the day it changes.
      const proposed = ['volatility', 'label', 'snippet'].filter((f) => citation[f] !== undefined);
      console.log(
        proposed.length > 0
          ? `  NOTE  citation carries proposed fields: ${proposed.join(', ')} — update lib/types.ts`
          : '  NOTE  citations still lack volatility/label/snippet (expected; see F005)'
      );
      break;
    }

    for (const field of [
      'request_id',
      'latency_ms',
      'retrieved_count',
      'best_score',
      'cited_ids',
      'hallucinated_citations',
      'unverified_figures',
      'kb_version',
    ]) {
      check(`meta.${field}`, body.meta?.[field] !== undefined);
    }

    // Every marker left in the text must be backed by a citation — the backend's
    // own guarantee, and the thing the client's reconciliation is a second line
    // of defence for.
    const markers = [...String(body.answer).matchAll(/\[(kb-\d{3,4})\]/g)].map((m) => m[1]);
    const cited = new Set((body.citations ?? []).map((c) => c.kb_id));
    const orphans = markers.filter((id) => !cited.has(id));
    check('every marker in the answer has a citation', orphans.length === 0, orphans.join(', '));
  }
}

// ── 4. conversation_id round trip ────────────────────────────────────────────
console.log('\nconversation_id');
if (!conversationId) {
  skip('round trip', 'no conversation_id from the first call');
} else {
  const { body } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'And for a child?', conversation_id: conversationId }),
  });
  check(
    'a known id is echoed back',
    body?.conversation_id === conversationId,
    body?.conversation_id
  );

  // MEASURED, and different from the assumption this was written against.
  //
  // The backend does `payload.conversation_id or store.new_id()` — it *adopts*
  // any well-formed id you send and only mints one when none arrives. It does
  // not replace an expired id with a fresh one.
  //
  // The client's rule ("always overwrite the stored value with whatever comes
  // back") is still right and is now simply a no-op here. What this asserts is
  // the property the client actually depends on: a response always carries a
  // usable id, whether echoed or minted.
  const { response: unknownResponse, body: unknownBody } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'How much is a ferry ticket?',
      conversation_id: '00000000-0000-4000-8000-000000000000',
    }),
  });
  check('an unknown id is accepted, not rejected', unknownResponse.status === 200);
  check(
    'a response always carries a usable conversation_id',
    typeof unknownBody?.conversation_id === 'string' && unknownBody.conversation_id.length > 0,
    unknownBody?.conversation_id
  );
  if (unknownBody?.conversation_id === '00000000-0000-4000-8000-000000000000') {
    console.log('  NOTE  the backend adopts a client-supplied id rather than minting a new one.');
    console.log('        Harmless here (a conversation holds only text, no identity), but it');
    console.log('        means an expired id is reused rather than rotated. Worth confirming.');
  }
}

// ── 5. Validation ────────────────────────────────────────────────────────────
console.log('\nValidation (the client should make these unreachable)');
{
  const { response, body } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '   ' }),
  });
  check('whitespace-only is 422', response.status === 422, `status ${response.status}`);
  check('error envelope shape', body?.error?.code === 'VALIDATION_ERROR', body?.error?.code);
  check('message is safe to display', typeof body?.error?.message === 'string');
  check('has a request_id to correlate', typeof body?.error?.request_id === 'string');
}
{
  const { response, body } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'a'.repeat(1001) }),
  });
  check('over 1000 characters is 422', response.status === 422, `status ${response.status}`);
  check('code is VALIDATION_ERROR', body?.error?.code === 'VALIDATION_ERROR');
}

// ── 6. Errors never leak internals ───────────────────────────────────────────
console.log('\nError bodies');
{
  const { response, body } = await json('/api/does-not-exist');
  check('unknown route is 404', response.status === 404, `status ${response.status}`);
  const text = JSON.stringify(body ?? '');
  check('no stack trace', !/Traceback|File "|\.py",/.test(text));
  check('no filesystem path', !/\/(home|Users|app)\//.test(text));
  check('no model name', !/gpt-|text-embedding|openai/i.test(text));
}

// ── 7. Voice ─────────────────────────────────────────────────────────────────
console.log('\nVoice');
{
  const response = await fetch(`${BASE}/api/stt`, { method: 'POST' });
  if (response.status === 404) {
    // The contract says these are placeholders and unregistered.
    skip('POST /api/stt', 'not registered yet — expected, see the contract');
    skip('POST /api/tts', 'not registered yet — expected, see the contract');
  } else {
    check('empty upload is rejected', response.status === 422, `status ${response.status}`);

    // A fresh string, so a warm cache cannot make this look healthier than it is.
    const tts = await fetch(`${BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Uncached check ${process.pid} ${Math.round(performance.now())}.`,
      }),
    });
    const contentType = tts.headers.get('content-type') ?? '';

    if (tts.status >= 500 || tts.status === 503) {
      // Distinguish "the voice provider is not configured" from "the shape is
      // wrong". Without an OPENAI_API_KEY this is the expected state, and
      // reporting it as a contract failure would cry wolf.
      skip('POST /api/tts', `provider unavailable (status ${tts.status}) — is OPENAI_API_KEY set?`);
    } else {
      check('tts returns audio', contentType.includes('audio/'), contentType);
      check('tts is cacheable', (tts.headers.get('cache-control') ?? '').includes('max-age'));
    }
  }
}

// ── 8. Streaming, smoke only ─────────────────────────────────────────────────
console.log('\nPOST /api/chat/stream (smoke)');
if (health?.index?.ready === false) {
  skip('stream', 'the index is not built');
} else {
  const response = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message: 'How much is a ferry ticket?' }),
  });
  check(
    'text/event-stream',
    (response.headers.get('content-type') ?? '').includes('text/event-stream'),
    response.headers.get('content-type') ?? ''
  );
  check('X-Accel-Buffering: no', response.headers.get('x-accel-buffering') === 'no');

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
  }
  const events = [...buffer.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
  check('meta is first', events[0] === 'meta', events.slice(0, 3).join(', '));
  check('ends with done or error', ['done', 'error'].includes(events.at(-1) ?? ''), events.at(-1));
  const lastToken = events.lastIndexOf('token');
  const citations = events.indexOf('citations');
  check(
    'citations after the last token',
    citations === -1 || citations > lastToken,
    `citations@${citations}, lastToken@${lastToken}`
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
if (failed > 0) {
  console.log('If the failures are shape mismatches, the contract and the backend have');
  console.log('drifted: fix docs/api-contract.md and lib/schemas.ts together, in one change.\n');
}
process.exit(failed === 0 ? 0 : 1);
