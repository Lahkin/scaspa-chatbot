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
      // The three the UI renders. They arrive on every citation now, and null is
      // a legitimate value — the backend sends null rather than guessing a
      // volatility — so the assertion is that the *key* is present, not that it
      // is truthy. A missing key means an older backend and the UI would fall
      // back silently, which is exactly what this is here to stop.
      for (const field of ['volatility', 'label', 'snippet']) {
        check(`citation.${field} is present (may be null)`, field in citation);
      }
      // The one the safety story rests on: a volatility the client does not
      // recognise would be treated as `high`, but an *unexpected* value means the
      // two sides disagree about the vocabulary and that is worth saying.
      check(
        'citation.volatility is null or one of low/medium/high',
        citation.volatility === null || ['low', 'medium', 'high'].includes(citation.volatility),
        String(citation.volatility)
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

  // The backend adopts a **well-formed UUID** it has not seen, and mints a fresh
  // id for anything else.
  //
  // Adopting an unknown-but-valid id is deliberate rather than sloppy: the
  // conversation store is per-process, so an id this worker has never seen may
  // belong to a sibling. Membership cannot be the test; shape can.
  //
  // The client's rule ("always overwrite the stored value with whatever comes
  // back") holds either way. What this asserts is the property the client
  // actually depends on: a response always carries a usable id.
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
  // A string that is not a UUID was never minted by this server, so it must not
  // come back. Nothing is at stake in a conversation id — it keys question and
  // answer text and nothing else — but a server that echoes any string it is
  // handed invites someone to conclude otherwise.
  const { body: junkBody } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'How much is a ferry ticket?',
      conversation_id: '../../etc/passwd',
    }),
  });
  check(
    'a malformed id is replaced, not echoed',
    junkBody?.conversation_id !== '../../etc/passwd',
    junkBody?.conversation_id
  );
}

// ── 4b. The category filter ──────────────────────────────────────────────────
console.log('\nRetrieval filter');
{
  const { response: ok } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How much is a ferry ticket?', category: 'ferry' }),
  });
  check('a documented category is accepted', ok.status === 200, `status ${ok.status}`);

  // A category is applied as a metadata equality, so a typo matches no row and
  // the caller gets a confident "I do not have that" for a question the
  // knowledge base answers. It has to be a 422.
  const { response: bad, body: badBody } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'How much is a ferry ticket?', category: 'ferries' }),
  });
  check(
    'an unknown category is rejected, not silently ignored',
    bad.status === 422,
    `status ${bad.status}`
  );
  check('rejection uses the error envelope', badBody?.error?.code === 'VALIDATION_ERROR');
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
// ── CORS: the headers a browser is allowed to read ───────────────────────────
//
// **This script cannot detect the bug it is checking for.** Node does not
// enforce CORS, so `response.headers.get('Retry-After')` works here whether or
// not the server exposes it — and in a browser, cross-origin, it returns null
// and the rate-limit countdown silently becomes a guess that looks exactly like
// a real one. Found once in a browser; asserted here on the *advertisement*
// rather than on the read, because that is the only part visible from Node.
console.log('\nCORS exposed headers');
{
  const response = await fetch(`${BASE}/api/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  const exposed = (response.headers.get('access-control-expose-headers') ?? '').toLowerCase();
  for (const header of ['x-request-id', 'retry-after', 'x-tts-cache']) {
    check(`${header} is readable cross-origin`, exposed.includes(header), exposed || '(none)');
  }
}

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
      // Distinguish "the voice provider is not available to us" from "the shape
      // is wrong". Reporting the former as a contract failure would cry wolf —
      // voice is an enhancement and the text path is unaffected by design.
      //
      // Two causes, and they need different fixes: no OPENAI_API_KEY at all, or
      // a key whose project has no access to the configured speech model. The
      // second returns a 403 from OpenAI and looks identical from here, so the
      // hint names both rather than guessing.
      skip(
        'POST /api/tts',
        `provider unavailable (status ${tts.status}). Either OPENAI_API_KEY is unset, or the ` +
          `project behind it has no access to OPENAI_TTS_MODEL — check the backend log for ` +
          `"tts_failed", which carries the provider's own reason.`
      );
    } else {
      check('tts returns audio', contentType.includes('audio/'), contentType);
      check('tts is cacheable', (tts.headers.get('cache-control') ?? '').includes('max-age'));
    }
  }
}

// ── 7c. Operations: vessels, flights, tariffs ────────────────────────────────
//
// These are a separate, non-LLM path. The assistant cannot see live operations
// and is forbidden from claiming it can, so a panel that shows a berth status
// has to say where the status came from — which is what `source` is for, and
// what most of this block checks.
console.log('\nOperations feed');
{
  for (const [path, key] of [
    ['/api/vessels', 'vessels'],
    ['/api/flights', 'flights'],
    ['/api/tariffs', 'tariffs'],
  ]) {
    const { response, body } = await json(path);

    // 200 even with no feed configured. A 503 would put a red error panel in
    // front of someone over a feature that was never switched on.
    check(`GET ${path} is 200`, response.status === 200, `status ${response.status}`);
    if (!body) continue;

    check(`${path} returns an array of ${key}`, Array.isArray(body[key]));
    check(`${path} reports a total`, typeof body.total === 'number');

    const source = body.source ?? {};
    check(
      `${path} declares its source kind`,
      ['live', 'fixture', 'unavailable'].includes(source.kind),
      String(source.kind)
    );
    // The safety property. A table of arrivals is believed on sight, and only
    // this string tells a reader they are looking at sample data.
    if (source.kind !== 'live') {
      check(
        `${path} carries the notice its non-live source requires`,
        typeof source.notice === 'string' && source.notice.length > 0,
        source.kind
      );
    }
    check(`${path} states an age or explicitly null`, 'as_of' in source);
  }

  // Unknown metrics must be null, never 0 — the same rule the index status has
  // always followed. "0 vessels at berth" describes an empty port.
  const { body: vessels } = await json('/api/vessels');
  const metrics = vessels?.metrics ?? {};
  const zeroed = Object.entries(metrics).filter(
    ([, value]) => value === 0 && (vessels?.vessels ?? []).length === 0
  );
  check(
    'unknown vessel metrics are null, not 0',
    zeroed.length === 0,
    zeroed.map(([k]) => k).join(', ')
  );
}

// ── 7d. The fee calculator ───────────────────────────────────────────────────
//
// The one endpoint in this API that returns a figure appearing in no published
// source. Everything here is about the guard rails around that.
console.log('\nFee calculator');
{
  const { response, body } = await json('/api/tariffs/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'cargo', container_size: '40ft', units: 2, storage_days: 5 }),
  });

  check('a quote is 200', response.status === 200, `status ${response.status}`);
  if (body) {
    check('the total is flagged derived', body.derived === true);
    check(
      'the disclaimer is present and non-empty',
      typeof body.disclaimer === 'string' && body.disclaimer.length > 0
    );
    check(
      'the disclaimer names what the figure is NOT',
      (body.disclaimer ?? '').includes('not an official customs assessment'),
      'must not read as an invoice or an assessment'
    );
    check('the disclaimer routes to a human', (body.disclaimer ?? '').includes('869-465-8121'));

    // The printed lines must add up to the printed total, or a reader who checks
    // the arithmetic finds it off by a cent and distrusts the whole card.
    const lines = body.line_items ?? [];
    const summed = Math.round(lines.reduce((total, line) => total + line.amount, 0) * 100) / 100;
    check(
      'the line items add up to the subtotal',
      summed === body.subtotal,
      `${summed} vs ${body.subtotal}`
    );

    // Every rate must exist in the published table. A calculator that invents a
    // rate is the failure this whole design guards against.
    const { body: table } = await json('/api/tariffs');
    const published = new Map((table?.tariffs ?? []).map((row) => [row.code, row.amount]));
    const invented = lines.filter((line) => published.get(line.code) !== line.rate);
    check(
      'every rate applied is a published rate',
      invented.length === 0,
      invented.map((line) => line.code).join(', ')
    );
  }

  // Converting a published fee applies a rate nobody published — prompt rule 4.
  const { response: converted } = await json('/api/tariffs/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'cargo', units: 1, currency: 'USD' }),
  });
  check('a currency conversion is refused', converted.status === 422, `status ${converted.status}`);
}

// ── 7e. Support ──────────────────────────────────────────────────────────────
console.log('\nSupport');
{
  const { body: directory } = await json('/api/support/directory');
  // JSON.stringify, not String(). `String(someObject)` is "[object Object]", so
  // a substring check against it passes for absolutely everything — which is how
  // the "no invented extensions" assertion below was green while testing nothing.
  const published = JSON.stringify(directory ?? {});

  check('the directory publishes the real phone number', published.includes('869-465-8121'));
  check('the ticket form has department options', (directory?.departments ?? []).length > 0);

  // The mockup's extension list is invented and must not have been reproduced.
  // A wrong extension for a security gate is worse than no extension.
  const invented = ['9110', '2240', '4450', '3315', '1102', '4481'].filter((ext) =>
    published.includes(ext)
  );
  check('no invented extensions were published', invented.length === 0, invented.join(', '));

  const { response, body: ticket } = await json('/api/support/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      department: 'Port operations',
      subject: 'Integration check',
      details: 'Raised by npm run check:integration.',
      // Sent on purpose: the endpoint must not accept, echo or store any of them.
      full_name: 'A Person',
      email: 'person@example.invalid',
    }),
  });

  check('a ticket is accepted', response.status === 200, `status ${response.status}`);
  if (ticket) {
    check('a reference is returned', typeof ticket.reference === 'string' && ticket.reference);
    check(
      'the receipt says nobody will make contact first',
      (ticket.next_step ?? '').length > 0 && (ticket.next_step ?? '').includes('869-465-8121')
    );
    // docs/privacy.md: nothing here can link a conversation to a person.
    const serialised = JSON.stringify(ticket);
    check('no name was stored or echoed', !serialised.includes('A Person'));
    check('no email was stored or echoed', !serialised.includes('person@example.invalid'));
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

  // The `done` payload, field by field. The client's schema requires every one
  // of these, and a `done` that fails to parse leaves the answer stuck
  // mid-stream forever — there is no later event to recover on.
  const doneFrame = [...buffer.matchAll(/^event: done\ndata: (.+)$/gm)].at(-1)?.[1];
  let done;
  try {
    done = doneFrame ? JSON.parse(doneFrame) : null;
  } catch {
    done = null;
  }
  check('done carries a parseable payload', done !== null);
  if (done) {
    for (const field of ['latency_ms', 'grounded', 'refusal', 'refusal_category', 'kb_version']) {
      check(`done.${field} is present`, field in done);
    }
  }
}

// ── 7b. A streamed refusal can say *why* ─────────────────────────────────────
//
// The two refusals look the same over the wire apart from this field. Without
// it a boundary refusal ("I cannot look up your container") renders with the
// generic no-answer framing, which is honest but says the wrong thing.
console.log('\nStreamed refusal');
if (health?.index?.ready === false) {
  skip('streamed refusal', 'the index is not built');
} else {
  const response = await fetch(`${BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message: 'where is my container?' }),
  });
  const text = await response.text();
  const frame = [...text.matchAll(/^event: done\ndata: (.+)$/gm)].at(-1)?.[1];
  const done = frame ? JSON.parse(frame) : null;

  check('a boundary question is refused', done?.refusal === true);
  check(
    'the stream says which refusal it was',
    done?.refusal_category === 'personal_record',
    String(done?.refusal_category)
  );

  // The same question over the JSON endpoint must agree. The contract's central
  // promise is that the two endpoints return identical content.
  const { body: posted } = await json('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'where is my container?' }),
  });
  check(
    'both endpoints agree on the refusal category',
    posted?.refusal_category === done?.refusal_category,
    `${posted?.refusal_category} vs ${done?.refusal_category}`
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
if (failed > 0) {
  console.log('If the failures are shape mismatches, the contract and the backend have');
  console.log('drifted: fix docs/api-contract.md and lib/schemas.ts together, in one change.\n');
}
process.exit(failed === 0 ? 0 : 1);
