/**
 * Mock payloads. **Dev and test only.**
 *
 * Every figure here is deliberately fake — `44.44`, `22.22`, `kb-014` — following
 * the same convention as the backend's fixture knowledge base and CLAUDE.md rule 5.
 * A mock fare that looks plausible is a mock fare that ends up quoted in a slide,
 * and then quoted to a passenger.
 *
 * Shapes come from `docs/api-contract.md` and are typed against `lib/types.ts`, so
 * a contract change that lands in the types breaks this file at compile time
 * rather than at demo time.
 */

import type {
  ChartSpec,
  ChatResponse,
  Citation,
  ErrorEnvelope,
  HealthResponse,
  ResponseMeta,
  ToolCall,
} from '@/lib/types';

export const CONVERSATION_ID = '9131b944-2243-4d1e-8e87-1486a9d41f28';
export const REQUEST_ID = 'ec970bed4d2b4a178f84a2f7a3619985';
export const KB_VERSION = '2026-06-01';

/** SCASPA's own number. It ends every failure message, so a user always has a next step. */
export const SCASPA_PHONE = '869-465-8121 / 2 / 3';

const CONTACT_BLOCK =
  '\n\nYou can reach SCASPA directly:\n' +
  `  Telephone: ${SCASPA_PHONE}\n` +
  '  Post: P.O. Box 963, Bird Rock, Basseterre, St. Kitts';

// ── Citations ────────────────────────────────────────────────────────────────

export const CITATION_FARES: Citation = {
  kb_id: 'kb-014',
  category: 'ferry',
  subcategory: 'fares',
  source_url: 'https://example.invalid/ferry-terminal/fares',
  source_type: 'official-site',
  as_of: '2026-04-01',
  confidence: 'confirmed',
};

export const CITATION_SCHEDULE: Citation = {
  kb_id: 'kb-008',
  category: 'ferry',
  subcategory: 'schedule',
  source_url: 'https://example.invalid/ferry-terminal/schedule',
  source_type: 'official-site',
  as_of: '2026-04-01',
  confidence: 'confirmed',
};

export const CITATIONS = [CITATION_FARES, CITATION_SCHEDULE];

// ── The answer ───────────────────────────────────────────────────────────────

/**
 * Contains `[kb-014]` on purpose: the streaming mock splits that exact marker
 * across two `token` events, which is the case the contract warns about and the
 * one a naive per-frame parser gets wrong.
 */
export const ANSWER =
  'The placeholder one-way adult fare on the Basseterre to Charlestown ferry is ' +
  'XCD 44.44 [kb-014]. A child under 12 travels for XCD 22.22 [kb-014]. The last ' +
  'sailing back from Nevis on a weekday is 18:00 [kb-008]. That information was ' +
  'verified on 2026-04-01, so please confirm with SCASPA before you travel.';

export const TOOL_CALLS: ToolCall[] = [
  {
    name: 'search_scaspa_knowledge',
    summary: 'Searching SCASPA knowledge base — ferry fares',
    ms: 148,
  },
];

export const META: ResponseMeta = {
  request_id: REQUEST_ID,
  latency_ms: 1284,
  retrieved_count: 5,
  best_score: 0.5767650604248047,
  cited_ids: ['kb-014', 'kb-008'],
  hallucinated_citations: [],
  unverified_figures: [],
  kb_version: KB_VERSION,
};

export const CHAT_RESPONSE: ChatResponse = {
  answer: ANSWER,
  conversation_id: CONVERSATION_ID,
  grounded: true,
  refusal: false,
  refusal_category: null,
  citations: CITATIONS,
  chart: null,
  tool_calls: TOOL_CALLS,
  meta: META,
};

/**
 * A refusal. **HTTP 200, and not an error** — the contract is explicit that errors
 * are for when the service broke, not for when the answer is "I can't help with
 * that". The phone number is already inside `answer`; do not append another.
 */
export const REFUSAL_RESPONSE: ChatResponse = {
  answer:
    'That is not something I can advise on. Questions about customs, immigration, ' +
    'tax or legal matters, about a specific shipment, booking or payment, or about ' +
    'vessel, aircraft or vehicle operations need to go to SCASPA staff directly — ' +
    'they can see the details of your case, and I cannot.' +
    CONTACT_BLOCK,
  conversation_id: CONVERSATION_ID,
  grounded: false,
  refusal: true,
  refusal_category: 'personal_record',
  citations: [],
  chart: null,
  tool_calls: [],
  meta: {
    ...META,
    latency_ms: 0,
    retrieved_count: 0,
    best_score: 0,
    cited_ids: [],
  },
};

/**
 * `grounded: false` on a real answer.
 *
 * Worth having as its own toggle because it is the one most likely to be
 * mishandled: it is tempting to render a warning banner, and the contract says
 * plainly not to. It is an internal integrity signal for a debug panel, not a
 * correctness claim to put in front of a traveller.
 */
export const UNGROUNDED_RESPONSE: ChatResponse = {
  ...CHAT_RESPONSE,
  grounded: false,
  meta: { ...META, unverified_figures: ['XCD 44.44'] },
};

/**
 * Markers in the text, nothing in `citations`.
 *
 * This is the reconciliation case: every `[kb-xxx]` chip rendered while streaming
 * must be dropped or made inert once this arrives, because none of them were
 * verified.
 */
export const EMPTY_CITATIONS_RESPONSE: ChatResponse = {
  ...CHAT_RESPONSE,
  citations: [],
  grounded: false,
  meta: {
    ...META,
    cited_ids: [],
    hallucinated_citations: ['kb-014', 'kb-008'],
  },
};

// ── Chart ────────────────────────────────────────────────────────────────────

/** Every figure is illustrative, and the caption says so — which is mandatory. */
export const CHART: ChartSpec = {
  type: 'bar',
  title: 'Monthly cruise passengers',
  x_label: 'Month',
  y_label: 'Passengers',
  series: [
    {
      name: 'Cruise passengers',
      points: [
        { x: 'January', y: 1111 },
        { x: 'February', y: 2222 },
        { x: 'March', y: 3333 },
      ],
    },
  ],
  caption: 'Illustrative sample figures, not official SCASPA statistics.',
  source: 'kb-101',
};

// ── Errors ───────────────────────────────────────────────────────────────────

function envelope(code: ErrorEnvelope['error']['code'], message: string): ErrorEnvelope {
  return { error: { code, message, request_id: REQUEST_ID } };
}

/**
 * Every message ends with the phone number, exactly as the real backend does, so a
 * user standing at a terminal always has something to do next. A mock that returns
 * a bare "Internal error" trains the UI to render something the real server never
 * sends.
 */
export const ERROR_RATE_LIMITED = envelope(
  'UPSTREAM_RATE_LIMITED',
  'The assistant is busy right now. Please try again in a moment, or call SCASPA on ' +
    `${SCASPA_PHONE}.`
);

export const ERROR_INTERNAL = envelope(
  'INTERNAL',
  'Something went wrong at our end. Please try again, or call SCASPA on ' + `${SCASPA_PHONE}.`
);

export const ERROR_UPSTREAM_TIMEOUT = envelope(
  'UPSTREAM_TIMEOUT',
  'The assistant took too long to answer. Please try again, or call SCASPA on ' + `${SCASPA_PHONE}.`
);

export const ERROR_VALIDATION = envelope(
  'VALIDATION_ERROR',
  'That question is too long. Please shorten it to 1000 characters or fewer.'
);

// ── Health ───────────────────────────────────────────────────────────────────

export const HEALTH: HealthResponse = {
  status: 'ok',
  env: 'dev',
  version: '0.1.0',
  uptime_s: 8.209,
  request_id: '0e82068ee0c442148571a61fe1f03562',
  models: {
    chat: 'mock-chat-model',
    embedding: 'mock-embedding-model',
    transcribe: 'mock-transcribe-model',
    tts: 'mock-tts-model',
  },
  index: {
    ready: true,
    kb_version: KB_VERSION,
    kb_rows: 10,
    kb_rows_rejected: 0,
    kb_csv_filename: 'sample_kb.csv',
    kb_updated_at: KB_VERSION,
    index_built_at: '2026-07-29T18:01:50.730567Z',
    embedding_model: 'mock-embedding-model',
    web_docs: 0,
    message: null,
  },
};

// ── Voice ────────────────────────────────────────────────────────────────────

export const STT_TEXT = 'What time is the last ferry back from Nevis?';

/**
 * A short silent MP3, built rather than embedded as base64 so it can be read.
 *
 * Ten MPEG-1 Layer III frames: 128 kbps, 44.1 kHz, no padding. Header bytes
 * `FF FB 90 00` then 413 zero bytes per frame — about 0.26 seconds of silence.
 * Enough for an `<audio>` element to load, report a duration and fire `ended`,
 * which is all the client needs to be exercised against.
 */
export function silentMp3(): Uint8Array {
  const FRAME_SIZE = 417;
  const FRAMES = 10;
  const bytes = new Uint8Array(FRAME_SIZE * FRAMES);
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const offset = frame * FRAME_SIZE;
    bytes[offset] = 0xff;
    bytes[offset + 1] = 0xfb;
    bytes[offset + 2] = 0x90;
    bytes[offset + 3] = 0x00;
    // The remaining 413 bytes stay zero: silence.
  }
  return bytes;
}
