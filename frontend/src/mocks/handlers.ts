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
  CITATIONS_EVERY_VOLATILITY,
  CITATION_LOW,
  HALLUCINATED_ANSWER,
  ERROR_INDEX_MISSING,
  ERROR_RETRIEVAL_EMPTY,
  HEALTH,
  HEALTH_DEGRADED,
  HEALTH_STALE,
  NO_ANSWER_RESPONSE,
  TABLE_ANSWER,
  REFUSAL_RESPONSE,
  STT_TEXT,
  UNGROUNDED_RESPONSE,
  silentMp3,
} from './fixtures';
import { CHART_CRUISE_PASSENGERS } from './chartFixtures';
import {
  CARD_TARIFF,
  CARD_TICKET,
  CARD_VESSELS,
  FIXTURE_SOURCE,
  MOCK_DIRECTORY,
  MOCK_DISCLAIMER,
  MOCK_FLIGHTS,
  MOCK_GATES,
  MOCK_MARINE_ADVISORIES,
  MOCK_OPERATOR_PROFILE,
  MOCK_POSITIONS,
  MOCK_TARIFFS,
  MOCK_VESSELS,
  UNAVAILABLE_SOURCE,
} from './opsFixtures';
import { getScenario, sleep } from './scenarios';
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

/**
 * Apply every `?key=value` equality filter the real endpoint implements.
 *
 * The audit's **E-7**: the mock honoured two parameters and silently ignored
 * five, so a screen could send one the server acts on and no test would notice
 * it had no effect — which is precisely how the client-side status filter
 * survived on `/vessels` under a server-side total.
 */
function applyEquals<T>(
  rows: T[],
  params: URLSearchParams,
  fields: Record<string, (row: T) => string | null>
): T[] {
  let out = rows;
  for (const [key, read] of Object.entries(fields)) {
    const wanted = params.get(key)?.trim();
    if (wanted) out = out.filter((row) => read(row) === wanted);
  }
  return out;
}

/**
 * `limit`/`offset`, so pagination is exercised rather than assumed.
 *
 * Also **E-7**. `total` must be counted by the caller *before* this runs: the
 * range readout says "Showing 1–25 of 100", and a total counted after paging
 * would always equal the page.
 */
function page<T>(rows: T[], params: URLSearchParams, fallback = 25): T[] {
  const limit = Number(params.get('limit') ?? fallback);
  const offset = Number(params.get('offset') ?? 0);
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const size = Number.isFinite(limit) && limit > 0 ? limit : fallback;
  return rows.slice(start, start + size);
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

      case 'chart':
        return HttpResponse.json({ ...CHAT_RESPONSE, chart: CHART_CRUISE_PASSENGERS });

      /*
       * The prose and the card say different things, and both are true.
       *
       * "I cannot see live movements" is the assistant speaking, which is bound
       * by prompt rule 10. The board beneath it is the feed speaking, with its
       * own source notice. Getting this pairing wrong in either direction is the
       * failure the whole card design exists to prevent, so it is a scenario.
       */
      case 'card_vessels':
        return HttpResponse.json({
          ...CHAT_RESPONSE,
          answer:
            "I cannot see live vessel movements — this assistant answers from published information and has no operational feed of its own. The arrivals board below comes straight from SCASPA's feed and states its own source and age.",
          citations: [],
          card: CARD_VESSELS,
        });

      case 'card_tariff':
        return HttpResponse.json({
          ...CHAT_RESPONSE,
          answer:
            "I do not have a single published figure that answers that. The calculator below applies SCASPA's published rates to the details you enter.",
          citations: [],
          card: CARD_TARIFF,
        });

      case 'card_ticket':
        return HttpResponse.json({
          ...CHAT_RESPONSE,
          answer:
            'I do not have a confident answer for that one. I can pass it to a SCASPA officer.',
          citations: [],
          card: CARD_TICKET,
        });

      case 'no_answer':
        // HTTP 200. A no-answer is not an error.
        return HttpResponse.json(NO_ANSWER_RESPONSE);

      case 'index_missing':
        return HttpResponse.json(ERROR_INDEX_MISSING, { status: 503 });

      case 'retrieval_empty':
        return HttpResponse.json(ERROR_RETRIEVAL_EMPTY, { status: 503 });

      case 'volatility':
        return HttpResponse.json({
          ...CHAT_RESPONSE,
          citations: [...CITATIONS_EVERY_VOLATILITY, CITATION_LOW],
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
            // The whole point of the two refusal scenarios: this one knows *why*
            // it refused and the no-answer below does not. They must be
            // distinguishable over the stream, not only over `POST /api/chat`.
            refusalCategory: REFUSAL_RESPONSE.refusal_category ?? null,
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

      case 'chart':
        return new HttpResponse(chatStream({ chart: CHART_CRUISE_PASSENGERS }), {
          headers: SSE_HEADERS,
        });

      case 'card_vessels':
        return new HttpResponse(
          chatStream({
            answer:
              "I cannot see live vessel movements — this assistant answers from published information and has no operational feed of its own. The arrivals board below comes straight from SCASPA's feed and states its own source and age.",
            emptyCitations: true,
            card: CARD_VESSELS,
          }),
          { headers: SSE_HEADERS }
        );

      case 'card_tariff':
        return new HttpResponse(
          chatStream({
            answer:
              "I do not have a single published figure that answers that. The calculator below applies SCASPA's published rates to the details you enter.",
            emptyCitations: true,
            card: CARD_TARIFF,
          }),
          { headers: SSE_HEADERS }
        );

      case 'card_ticket':
        return new HttpResponse(
          chatStream({
            answer:
              'I do not have a confident answer for that one. I can pass it to a SCASPA officer.',
            skipTools: true,
            emptyCitations: true,
            card: CARD_TICKET,
          }),
          { headers: SSE_HEADERS }
        );

      case 'no_answer':
        return new HttpResponse(
          chatStream({
            answer: NO_ANSWER_RESPONSE.answer,
            skipTools: true,
            grounded: false,
            emptyCitations: true,
          }),
          { headers: SSE_HEADERS }
        );

      case 'index_missing':
        return HttpResponse.json(ERROR_INDEX_MISSING, { status: 503 });

      case 'retrieval_empty':
        return HttpResponse.json(ERROR_RETRIEVAL_EMPTY, { status: 503 });

      case 'slow':
        // Long enough for the elapsed counter to appear and be read.
        await sleep(8000);
        return new HttpResponse(chatStream(), { headers: SSE_HEADERS });

      case 'volatility':
        return new HttpResponse(
          chatStream({ citations: [...CITATIONS_EVERY_VOLATILITY, CITATION_LOW] }),
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
  http.get(`${base}/api/health`, () => {
    switch (getScenario()) {
      case 'degraded_health':
        // Degraded is still HTTP 200 — the contract is explicit.
        return HttpResponse.json(HEALTH_DEGRADED);
      case 'stale_index':
        return HttpResponse.json(HEALTH_STALE);
      default:
        return HttpResponse.json(HEALTH);
    }
  }),

  // ── POST /api/stt ──────────────────────────────────────────────────────────
  // Multipart, field name `audio`. The whole response is the transcript — and it
  // goes in the input box, never straight into /api/chat, so a misheard terminal
  // name can be corrected before it becomes a confident answer to the wrong
  // question.
  http.post(`${base}/api/stt`, () => {
    if (getScenario() === 'voice_stt_fails') {
      return HttpResponse.json(
        {
          error: {
            code: 'INTERNAL',
            message: 'Transcription is unavailable. Please call SCASPA on 869-465-8121 / 2 / 3.',
            request_id: 'mock',
          },
        },
        { status: 503 }
      );
    }
    return HttpResponse.json({ text: STT_TEXT });
  }),

  // ── POST /api/tts ──────────────────────────────────────────────────────────
  http.post(`${base}/api/tts`, () => {
    if (getScenario() === 'voice_tts_fails') {
      return HttpResponse.json(
        {
          error: {
            code: 'INTERNAL',
            message: 'Speech is unavailable just now.',
            request_id: 'mock',
          },
        },
        { status: 503 }
      );
    }
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

  // ── GET /api/vessels ───────────────────────────────────────────────────────
  //
  // The `ops_unavailable` scenario is the important one, not an afterthought:
  // `OPS_DATA_SOURCE=none` is the production default, so an empty board with a
  // notice is what a real deployment shows until a feed exists. It has to be as
  // easy to look at as the populated one.
  http.get(`${base}/api/vessels`, ({ request }) => {
    if (getScenario() === 'ops_unavailable') {
      return HttpResponse.json({
        source: UNAVAILABLE_SOURCE,
        vessels: [],
        metrics: {
          vessels_at_berth: null,
          berth_capacity: null,
          arrivals_next_24h: null,
          daily_cargo_teu: null,
          arrivals_today: null,
        },
        total: 0,
        request_id: 'mock-vessels',
      });
    }

    const params = new URL(request.url).searchParams;
    const query = (params.get('q') ?? '').toLowerCase();

    /*
     * Every filter the real endpoint implements, applied in the same order —
     * E-7 in the audit's divergence table. The mock used to honour `q` and
     * `status` and silently ignore `vessel_type`, `berth`, `facility`, `limit`
     * and `offset`, so a screen could send a parameter the real server acts on
     * and the tests would never notice it had no effect.
     */
    let vessels = MOCK_VESSELS;
    if (query) {
      vessels = vessels.filter(
        (v) => v.name.toLowerCase().includes(query) || (v.imo ?? '').toLowerCase().includes(query)
      );
    }
    vessels = applyEquals(vessels, params, {
      status: (v) => v.status,
      vessel_type: (v) => v.vessel_type,
      berth: (v) => v.berth,
      facility: (v) => v.facility,
    });

    // `total` is matches BEFORE paging — that is what makes the range readout
    // true — and the page is the slice.
    const total = vessels.length;
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      vessels: page(vessels, params),
      metrics: {
        vessels_at_berth: 4,
        berth_capacity: 11,
        arrivals_next_24h: 7,
        daily_cargo_teu: 1111,
        arrivals_today: 5,
      },
      total,
      request_id: 'mock-vessels',
    });
  }),

  // ── GET /api/flights ───────────────────────────────────────────────────────
  http.get(`${base}/api/flights`, ({ request }) => {
    // E-6: the no-feed branch existed on `/api/vessels` only, so the flights
    // screen's `NoFeedState` — the production default — could not be reached
    // from a mock at all.
    if (getScenario() === 'ops_unavailable') {
      return HttpResponse.json({
        source: UNAVAILABLE_SOURCE,
        flights: [],
        metrics: {
          total_flights: null,
          on_time_percent: null,
          gates_active: null,
          gates_total: null,
          arrivals_today: null,
          departures_today: null,
          delayed: null,
        },
        advisory: null,
        total: 0,
        request_id: 'mock-flights',
      });
    }

    const params = new URL(request.url).searchParams;
    const query = (params.get('q') ?? '').toLowerCase();

    let flights = MOCK_FLIGHTS;
    if (query) {
      flights = flights.filter(
        (f) =>
          f.flight_no.toLowerCase().includes(query) ||
          f.port.toLowerCase().includes(query) ||
          f.port_code.toLowerCase().includes(query)
      );
    }
    flights = applyEquals(flights, params, {
      direction: (f) => f.direction,
      status: (f) => f.status,
      facility: (f) => f.facility,
    });
    // `airline` matches either the spelled-out name or the code, as the server's
    // `filter_flights` does.
    const airline = params.get('airline')?.trim().toLowerCase();
    if (airline) {
      flights = flights.filter(
        (f) => f.airline.toLowerCase() === airline || f.airline_code.toLowerCase() === airline
      );
    }

    const total = flights.length;
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      flights: page(flights, params),
      metrics: {
        total_flights: 12,
        on_time_percent: 77.7,
        gates_active: 4,
        gates_total: 8,
        arrivals_today: 7,
        departures_today: 5,
        delayed: 2,
      },
      advisory: {
        headline: 'Sample conditions',
        detail: 'Placeholder advisory — not a real forecast',
        temperature_c: 11.1,
        systems_status: 'Sample status — not a real operational report',
      },
      total,
      request_id: 'mock-flights',
    });
  }),

  // ── GET /api/ops/positions ─────────────────────────────────────────────────
  //
  // The four panels that had no feed. Each mirrors the backend's shape exactly,
  // including the `active`/`total` counts being computed rather than restated —
  // a mock that hardcodes a count is a mock that cannot catch the bug where the
  // count and the rows disagree.
  http.get(`${base}/api/ops/positions`, () => {
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      positions: MOCK_POSITIONS,
      total: MOCK_POSITIONS.length,
      request_id: 'mock-positions',
    });
  }),

  // ── GET /api/ops/gates ─────────────────────────────────────────────────────
  http.get(`${base}/api/ops/gates`, () => {
    const active = MOCK_GATES.filter(
      (gate) => gate.status === 'occupied' || gate.status === 'boarding'
    ).length;
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      gates: MOCK_GATES,
      active,
      total: MOCK_GATES.length,
      request_id: 'mock-gates',
    });
  }),

  // ── GET /api/ops/advisories ────────────────────────────────────────────────
  http.get(`${base}/api/ops/advisories`, () => {
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      advisories: MOCK_MARINE_ADVISORIES,
      total: MOCK_MARINE_ADVISORIES.length,
      request_id: 'mock-advisories',
    });
  }),

  // ── GET /api/ops/profile ───────────────────────────────────────────────────
  //
  // Takes no account of the request, because there is nothing about the caller
  // to take account of. Same card for everyone, which is what the backend test
  // `test_the_profile_endpoint_reads_nothing_about_the_caller` pins.
  http.get(`${base}/api/ops/profile`, () => {
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      profile: MOCK_OPERATOR_PROFILE,
      request_id: 'mock-profile',
    });
  }),

  // ── GET /api/tariffs ───────────────────────────────────────────────────────
  http.get(`${base}/api/tariffs`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const category = params.get('category');
    const facility = params.get('facility');
    const query = (params.get('q') ?? '').toLowerCase();

    let tariffs = MOCK_TARIFFS;
    if (category) tariffs = tariffs.filter((t) => t.category === category);
    if (facility) {
      // Facility-specific rates AND the port-wide ones, as `filter_tariffs`
      // does: a charge published for the whole port applies at the facility
      // being asked about, and dropping it would understate what a caller owes.
      tariffs = tariffs.filter((t) => t.facility === facility || t.facility === null);
    }
    if (query) {
      tariffs = tariffs.filter(
        (t) => t.service.toLowerCase().includes(query) || t.code.toLowerCase().includes(query)
      );
    }

    const total = tariffs.length;
    return HttpResponse.json({
      source: FIXTURE_SOURCE,
      tariffs: page(tariffs, params, 100),
      // E-2: this was the hardcoded pair `['cargo', 'vessel_dues']`, so four of
      // the six chips could never appear under a mock. Computed from the WHOLE
      // table, exactly as the server does — otherwise selecting a category
      // removes every other chip and there is no way back.
      categories: [...new Set(MOCK_TARIFFS.map((t) => t.category))].sort(),
      total,
      request_id: 'mock-tariffs',
    });
  }),

  // ── POST /api/tariffs/quote ────────────────────────────────────────────────
  //
  // The arithmetic is real, against the mock rates above, because a quote whose
  // lines do not add up to its total is precisely the bug this screen must never
  // ship — and a mock that returned a hardcoded total could not catch it.
  http.post(`${base}/api/tariffs/quote`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const units = Number(body['units'] ?? 0);
    const storageDays = Number(body['storage_days'] ?? 0);
    const size = body['container_size'] === '40ft' ? 'SMP-011' : 'SMP-010';

    const rateOf = (code: string) => MOCK_TARIFFS.find((t) => t.code === code)?.amount ?? 0;
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

    const lines = [];
    if (units > 0) {
      lines.push({
        code: size,
        label: MOCK_TARIFFS.find((t) => t.code === size)?.service ?? '',
        basis: 'per container',
        rate: rateOf(size),
        quantity: units,
        quantity_label: `${units} container${units === 1 ? '' : 's'}`,
        amount: round(rateOf(size) * units),
        kb_id: null,
      });
      lines.push({
        code: 'SMP-012',
        label: 'Sample container handling',
        basis: 'per container',
        rate: rateOf('SMP-012'),
        quantity: units,
        quantity_label: `${units} container${units === 1 ? '' : 's'}`,
        amount: round(rateOf('SMP-012') * units),
        kb_id: null,
      });
      if (storageDays > 0) {
        lines.push({
          code: 'SMP-013',
          label: 'Sample container storage',
          basis: 'per container per day',
          rate: rateOf('SMP-013'),
          quantity: units * storageDays,
          quantity_label: `${units} container${units === 1 ? '' : 's'} × ${storageDays} day${storageDays === 1 ? '' : 's'}`,
          amount: round(rateOf('SMP-013') * units * storageDays),
          kb_id: null,
        });
      }
    }

    const subtotal = round(lines.reduce((sum, line) => sum + line.amount, 0));

    return HttpResponse.json({
      line_items: lines,
      // E-8: the field was omitted entirely and survived only because zod
      // defaults it to `[]`. The backend always sends the key, so a mock that
      // does not cannot exercise §5.11's "Total so far" rendering at all —
      // which is the one path where a quote is short by a whole charge.
      unpriced: [],
      subtotal,
      total: subtotal,
      currency: 'XCD',
      derived: true,
      disclaimer: MOCK_DISCLAIMER,
      source: FIXTURE_SOURCE,
      request_id: 'mock-quote',
    });
  }),

  // ── Support ────────────────────────────────────────────────────────────────
  http.get(`${base}/api/support/directory`, () => HttpResponse.json(MOCK_DIRECTORY)),

  http.post(`${base}/api/support/ticket`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Narrow before stringifying: a client sending `department: {}` would
    // otherwise render "[object Object]" in the receipt, which is a real class of
    // bug and one the linter is right to refuse.
    const sent = body['department'];
    const department = typeof sent === 'string' && sent.trim() ? sent : 'Something else';
    const reference = 'SC-4821';

    return HttpResponse.json({
      reference,
      department,
      expected_response: 'within 1 business day',
      next_step:
        `Quote reference ${reference} when you contact SCASPA. Nobody will contact you ` +
        'first: this ticket carries no name, email or phone number, because this ' +
        'assistant does not collect them. Call 869-465-8121 / 2 / 3.',
      transcript_included: false,
      request_id: 'mock-ticket',
    });
  }),
];
