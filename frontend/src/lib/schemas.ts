/**
 * Zod schemas: runtime validation at the network boundary.
 *
 * CLAUDE.md rule 8. TypeScript types are erased at runtime and prove nothing
 * about what actually arrived — they describe what we *expect*. A backend that
 * ships a field rename, or a proxy that returns an HTML error page under a JSON
 * content type, produces `undefined` deep inside a component; parsing here turns
 * that into one clear failure at the edge.
 *
 * Deliberately **tolerant of extra keys** (zod's default): the backend adding a
 * field is not a reason to refuse an answer to someone standing at a ferry
 * terminal. Missing or wrong-typed fields are a different matter and do fail.
 */

import { z } from 'zod';

export const citationSchema = z.object({
  kb_id: z.string(),
  category: z.string(),
  subcategory: z.string(),
  source_url: z.string(),
  source_type: z.string(),
  as_of: z.string(),
  confidence: z.string(),
  /*
   * The backend sends all three, and sends `null` rather than a guess when a row
   * has no value on record.
   *
   * `.nullish()` rather than `.optional()`: null is the documented "not known"
   * and must survive parsing so `volatilityOf` can apply the cautious default,
   * and undefined still parses so an older backend does not fail the whole
   * response. An unrecognised volatility (a sixth level someone adds later) is
   * caught to null for the same reason — the cautious default is a better
   * outcome than refusing the answer.
   */
  volatility: z.enum(['low', 'medium', 'high']).nullish().catch(null),
  label: z.string().nullish(),
  snippet: z.string().nullish(),
});

/** The five the contract publishes. Used to pick an icon; see `toolCallSchema`. */
export const toolNameSchema = z.enum([
  'search_scaspa_knowledge',
  'search_site_content',
  'make_chart',
  'calculate',
  'escalate_to_human',
]);

/**
 * A tool name, tolerantly.
 *
 * The five above are what the contract publishes and `backend/tests/test_contract.py`
 * pins the agent to them. But this parses a *whole chat response*: a strict enum
 * means the day someone adds a sixth tool, `tool_calls` fails, `chatResponseSchema`
 * fails, and a user standing at a ferry terminal loses an answer that was
 * otherwise perfectly good — over a progress indicator's icon.
 *
 * So an unknown name passes through as a string and the UI falls back to a
 * generic icon. Strictness here buys nothing and costs the answer.
 */
export const anyToolNameSchema = z.union([toolNameSchema, z.string()]);

export const chartSpecSchema = z.object({
  type: z.enum(['line', 'bar', 'area']),
  title: z.string(),
  x_label: z.string(),
  y_label: z.string(),
  series: z.array(
    z.object({
      name: z.string(),
      points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })),
    })
  ),
  // Mandatory server-side, and the only way a reader tells a published tariff
  // from an illustration. Required here too — a chart without it is not rendered.
  caption: z.string(),
  source: z.string(),
});

export const toolCallSchema = z.object({
  name: anyToolNameSchema,
  summary: z.string(),
  ms: z.number(),
});

export const responseMetaSchema = z.object({
  request_id: z.string(),
  latency_ms: z.number(),
  retrieved_count: z.number(),
  best_score: z.number(),
  cited_ids: z.array(z.string()),
  hallucinated_citations: z.array(z.string()),
  unverified_figures: z.array(z.string()),
  /*
   * Nullable, and it matters.
   *
   * `ResponseMeta.kb_version` is `str | None` on the backend: it is read from
   * `data/index_meta.json`, and an index built before that file carried a
   * version has none. Requiring a string here means the *first* answer from a
   * freshly built index throws `SchemaMismatch` and the user loses it — a
   * failure that never appears against a seeded dev index and only shows up on a
   * new deploy, which is the worst place to find it.
   */
  kb_version: z.string().nullable(),
});

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * `notice` is `.nullable()`, not `.optional()`.
 *
 * The key is always sent. A *missing* key means the backend changed shape and
 * should fail here; a *null* value means "a live feed, nothing to warn about"
 * and is legitimate. Collapsing the two would let a fixture source that somehow
 * lost its notice render as a trustworthy one — which is the single worst
 * outcome for this particular field.
 */
export const dataSourceSchema = z.object({
  kind: z.enum(['live', 'fixture', 'unavailable']),
  label: z.string(),
  as_of: z.string().nullable(),
  notice: z.string().nullable(),
});

/**
 * The four facilities.
 *
 * `.nullish().catch(null)` rather than a hard failure, and the fallback is
 * deliberately `null` — "the feed did not say". A fifth facility appearing on
 * the wire must degrade to an unattributed record, never to a wrong one: this
 * value decides which berth a reader thinks a ship is at.
 */
export const facilitySchema = z
  .enum(['deep_water_harbour', 'port_zante', 'basseterre_ferry_terminal', 'rlb_airport'])
  .nullish()
  .catch(null)
  .transform((v) => v ?? null);

export const vesselArrivalSchema = z.object({
  id: z.string(),
  name: z.string(),
  imo: z.string().nullable(),
  vessel_type: z.string(),
  agent: z.string(),
  berth: z.string(),
  facility: facilitySchema,
  // `.catch` rather than a hard failure: a feed that adds a sixth status should
  // render one row oddly, not lose the whole arrivals board.
  status: z.enum(['at_berth', 'en_route', 'scheduled', 'departed', 'unknown']).catch('unknown'),
  eta: z.string().nullable(),
  ata: z.string().nullable(),
});

export const vesselMetricsSchema = z.object({
  vessels_at_berth: z.number().nullable(),
  berth_capacity: z.number().nullable(),
  arrivals_next_24h: z.number().nullable(),
  daily_cargo_teu: z.number().nullable(),
  // Strictly `.nullable()`, not `.nullish()`: the backend always sends the key,
  // and a mock that omits it should fail here rather than let the two halves
  // drift. Same reasoning as `mocks/opsFixtures.ts`' mirror rule.
  arrivals_today: z.number().nullable(),
});

export const vesselArrivalsResponseSchema = z.object({
  source: dataSourceSchema,
  vessels: z.array(vesselArrivalSchema),
  metrics: vesselMetricsSchema,
  total: z.number(),
  request_id: z.string(),
});

export const flightSchema = z.object({
  id: z.string(),
  flight_no: z.string(),
  airline: z.string(),
  airline_code: z.string(),
  direction: z.enum(['arrival', 'departure']).catch('arrival'),
  facility: facilitySchema,
  port: z.string(),
  port_code: z.string(),
  gate: z.string().nullable(),
  status: z
    .enum(['on_time', 'delayed', 'landed', 'arrived', 'boarding', 'cancelled'])
    .catch('on_time'),
  scheduled_time: z.string().nullable(),
  estimated_time: z.string().nullable(),
});

export const flightMetricsSchema = z.object({
  total_flights: z.number().nullable(),
  on_time_percent: z.number().nullable(),
  gates_active: z.number().nullable(),
  gates_total: z.number().nullable(),
  // §5.3's three tiles. Nullable, and null until a feed fills them — an
  // em dash under the right label beats a figure that answers a different
  // question.
  arrivals_today: z.number().nullable(),
  departures_today: z.number().nullable(),
  delayed: z.number().nullable(),
});

export const operationalAdvisorySchema = z.object({
  headline: z.string(),
  detail: z.string(),
  temperature_c: z.number().nullable(),
  systems_status: z.string(),
});

export const flightSchedulesResponseSchema = z.object({
  source: dataSourceSchema,
  flights: z.array(flightSchema),
  metrics: flightMetricsSchema,
  advisory: operationalAdvisorySchema.nullable(),
  total: z.number(),
  request_id: z.string(),
});

/*
 * The panels the design shows and no real feed has ever filled.
 *
 * Positions, gates and marine notices. Each is `unavailable` on every source
 * that has no AIS, no apron feed and no notices — which is every real one — and
 * the panels render their "not connected" state from an empty array rather than
 * from a separate flag.
 */

export const vesselPositionSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  heading_degrees: z.number().nullable(),
  // Null and 0 are different claims — "not reported" against "reported as
  // stationary" — so this is nullable rather than defaulted.
  speed_knots: z.number().nullable(),
  reported_by: z.enum(['ais', 'manual', 'estimated']).catch('estimated'),
  reported_at: z.string().nullable(),
});

export const vesselPositionsResponseSchema = z.object({
  source: dataSourceSchema,
  positions: z.array(vesselPositionSchema),
  total: z.number(),
  request_id: z.string(),
});

export const gateAssignmentSchema = z.object({
  gate: z.string(),
  status: z.enum(['occupied', 'boarding', 'free', 'closed']).catch('free'),
  flight_number: z.string().nullable(),
  airline: z.string(),
  scheduled_at: z.string().nullable(),
  facility: facilitySchema,
});

export const gateMapResponseSchema = z.object({
  source: dataSourceSchema,
  gates: z.array(gateAssignmentSchema),
  // Counted by the backend from the gates themselves. Not recomputed here —
  // two places deciding what "active" means is two places to disagree.
  active: z.number(),
  total: z.number(),
  request_id: z.string(),
});

export const marineAdvisorySchema = z.object({
  id: z.string(),
  port: z.string(),
  headline: z.string(),
  detail: z.string(),
  severity: z.enum(['low', 'moderate', 'high']).catch('low'),
  issued_at: z.string().nullable(),
});

export const marineAdvisoriesResponseSchema = z.object({
  source: dataSourceSchema,
  advisories: z.array(marineAdvisorySchema),
  total: z.number(),
  request_id: z.string(),
});

/*
 * The console identity card. NOT a user.
 *
 * There is no sign-in in this product (`frontend/CLAUDE.md` rule 2) and this
 * does not add one: the endpoint reads nothing about the caller and returns the
 * same invented card to everyone. It is null on every source but the fixture
 * one, and the backend refuses to boot with fixtures in production.
 *
 * `is_demo` is a literal `true`, so a payload claiming otherwise fails to parse
 * rather than rendering a fabricated officer as a real one.
 */
export const operatorProfileSchema = z.object({
  is_demo: z.literal(true),
  display_name: z.string(),
  division: z.string(),
  agent_id: z.string(),
  jurisdiction: z.string(),
  role: z.string(),
  last_sync: z.string().nullable(),
  active: z.boolean(),
  verified: z.boolean(),
  // Non-empty, and rendered as prominently as the card. A demo card with no
  // notice is the failure this whole screen has to avoid.
  notice: z.string().min(1),
});

export const operatorProfileResponseSchema = z.object({
  source: dataSourceSchema,
  // `.default(null)` as well as `.nullable()`: an absent field and an explicit
  // null both have to land on `null` rather than `undefined`, so no caller ever
  // has to distinguish "no demo profile" from "the key was missing".
  profile: operatorProfileSchema.nullable().catch(null).default(null),
  request_id: z.string(),
});

export const tariffRowSchema = z.object({
  code: z.string(),
  service: z.string(),
  basis: z.string(),
  amount: z.number(),
  currency: z.string(),
  category: z.enum(['cargo', 'vessel_dues', 'storage', 'passenger', 'security', 'aviation']),
  facility: facilitySchema,
  kb_id: z.string().nullable(),
  as_of: z.string(),
});

export const tariffTableResponseSchema = z.object({
  source: dataSourceSchema,
  tariffs: z.array(tariffRowSchema),
  categories: z.array(z.string()),
  total: z.number(),
  request_id: z.string(),
});

export const tariffLineItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  basis: z.string(),
  rate: z.number(),
  quantity: z.number(),
  quantity_label: z.string(),
  amount: z.number(),
  kb_id: z.string().nullable(),
});

/**
 * The two strict fields on this schema are the two that carry the safety claim.
 *
 * `derived` is `z.literal(true)` and `disclaimer` is `.min(1)`. Both are
 * required and neither is caught or defaulted: a quote that arrives without its
 * warning is **refused at the boundary** rather than rendered.
 *
 * That is a deliberate exception to this file's usual tolerance. Everywhere else
 * the rule is that a strange field should not cost someone their answer. Here
 * the failure mode runs the other way — a total rendered without the sentence
 * saying it is not an invoice or a customs assessment is worse than no total at
 * all, because someone will budget a shipment against it.
 */
export const tariffQuoteSchema = z.object({
  line_items: z.array(tariffLineItemSchema),
  /*
   * Codes that applied and had no published rate.
   *
   * Defaulted to empty rather than required, so an older backend still parses —
   * but note which way the default points. Empty means "nothing is missing",
   * and on a build that cannot report a gap that is a claim the client cannot
   * actually check. It is the only tolerable default (assuming a charge is
   * missing on every quote would be worse), and it is the reason
   * `QuoteResult` reads this field rather than inferring completeness from
   * the presence of line items.
   */
  unpriced: z.array(z.string()).default([]).catch([]),
  subtotal: z.number(),
  total: z.number(),
  currency: z.string(),
  derived: z.literal(true),
  disclaimer: z.string().min(1),
  source: dataSourceSchema,
  request_id: z.string(),
});

// ── Assistant cards ──────────────────────────────────────────────────────────

/**
 * A discriminated union on `kind`, matching the backend exactly.
 *
 * `z.discriminatedUnion` rather than `z.union`: it fails with "unknown kind"
 * instead of four stacked "expected literal" errors, which is the difference
 * between a diagnosable contract mismatch and a wall of noise.
 *
 * Strict on the data cards' `source`. A card whose provenance is missing is
 * refused at the boundary rather than rendered — the notice is the only thing
 * telling a reader whether an arrivals board is a live feed or development
 * fixtures, and a board without it is worse than no board.
 */
export const assistantCardSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('vessel_arrivals'),
    title: z.string(),
    source: dataSourceSchema,
    vessels: z.array(vesselArrivalSchema),
    total: z.number(),
    href: z.string(),
  }),
  z.object({
    kind: z.literal('flight_schedules'),
    title: z.string(),
    source: dataSourceSchema,
    flights: z.array(flightSchema),
    total: z.number(),
    href: z.string(),
  }),
  z.object({
    kind: z.literal('tariff_calculator'),
    title: z.string(),
    category: z.enum(['cargo', 'vessel_dues', 'storage', 'passenger', 'security', 'aviation']),
    href: z.string(),
  }),
  z.object({
    kind: z.literal('support_ticket'),
    title: z.string(),
    department: z.string(),
    subject: z.string(),
    href: z.string(),
  }),
]);

/**
 * Which refusal applied.
 *
 * `.catch(null)` because the backend's refusal gate is a list of patterns that
 * will grow. A category this build has not been taught means "a refusal, reason
 * unrecognised" — which the generic refusal copy already handles correctly. It
 * is not a reason to reject the response.
 */
export const refusalCategorySchema = z
  .enum(['vessel_or_aircraft_operations', 'personal_record'])
  .nullish()
  .catch(null);

export const chatResponseSchema = z.object({
  answer: z.string(),
  conversation_id: z.string(),
  grounded: z.boolean(),
  refusal: z.boolean(),
  // Optional: the contract's own no-answer sample omits the key. See lib/types.ts.
  refusal_category: refusalCategorySchema,
  /** Non-null only when input safety changed the question — board 14. */
  question_sanitised: z.string().nullish().catch(null),
  /*
   * Both default to `false` rather than being required, and the default is the
   * safe direction in each case.
   *
   * `answer_replaced: false` shows no correction notice, which is right for a
   * backend too old to send the field — the alternative, defaulting to true,
   * would put "two figures were replaced" on every answer from that build.
   *
   * `step_limit_reached: false` falls back to the generic no-answer copy, which
   * is what the client showed before the field existed. Defaulting it to true
   * would tell people to simplify questions we simply do not cover.
   */
  answer_replaced: z.boolean().default(false).catch(false),
  step_limit_reached: z.boolean().default(false).catch(false),
  citations: z.array(citationSchema),
  chart: chartSpecSchema.nullable(),
  /*
   * `.catch(null)` — a card this build does not recognise drops the card, not
   * the answer. The prose stands on its own; the card is an enhancement, and a
   * client that refused a whole response over an unknown `kind` would lose a
   * perfectly good answer to a feature it had not been taught yet.
   *
   * The strictness that matters is *inside* the card: a vessel card without its
   * `source` fails, and the whole card is dropped rather than shown unsourced.
   */
  card: assistantCardSchema.nullish().catch(null),
  tool_calls: z.array(toolCallSchema),
  meta: responseMetaSchema,
});

export const apiErrorSchema = z.object({
  code: z.enum([
    // 429, this client. Distinct from UPSTREAM_RATE_LIMITED — see lib/types.ts.
    'RATE_LIMITED',
    'VALIDATION_ERROR',
    'INDEX_MISSING',
    'RETRIEVAL_EMPTY',
    'UPSTREAM_RATE_LIMITED',
    'UPSTREAM_TIMEOUT',
    'NOT_FOUND',
    'INTERNAL',
  ]),
  message: z.string(),
  request_id: z.string(),
});

export const errorEnvelopeSchema = z.object({ error: apiErrorSchema });

// ── Stream event payloads ────────────────────────────────────────────────────

export const streamPayloadSchemas = {
  meta: z.object({
    conversation_id: z.string(),
    /*
     * Nullish and caught: a backend predating board 14 omits the key, and
     * `meta` is the FIRST event — a client that rejects it never attaches a
     * conversation id and the whole answer is lost over a missing notice.
     */
    question_sanitised: z.string().nullish().catch(null),
  }),
  token: z.object({ text: z.string() }),
  tool_start: z.object({ name: anyToolNameSchema, summary: z.string() }),
  tool_end: z.object({ name: anyToolNameSchema, summary: z.string(), ms: z.number() }),
  citations: z.object({ citations: z.array(citationSchema) }),
  chart: chartSpecSchema,
  card: assistantCardSchema,
  replace: z.object({ text: z.string() }),
  done: z.object({
    latency_ms: z.number(),
    grounded: z.boolean(),
    refusal: z.boolean(),
    /*
     * Sent since the backend started carrying it, so a streamed refusal can pick
     * the same specific copy the non-streaming endpoint allows. `.nullish()`
     * because a plain no-answer has no category, and because a backend deployed
     * before this field existed omits the key entirely — and a `done` that fails
     * its schema would leave the answer stuck mid-stream forever.
     */
    refusal_category: refusalCategorySchema,
    /*
     * Same two flags the JSON endpoint carries, defaulted the same way and for
     * the same reason. `done` is the last event, so a client that rejects it has
     * no later event to recover on — every field here is tolerant by design.
     */
    answer_replaced: z.boolean().default(false).catch(false),
    step_limit_reached: z.boolean().default(false).catch(false),
    kb_version: z.string().nullable(),
  }),
  error: apiErrorSchema,
} as const;

export type KnownStreamEvent = keyof typeof streamPayloadSchemas;

export function isKnownStreamEvent(name: string): name is KnownStreamEvent {
  return name in streamPayloadSchemas;
}

// ── Health ───────────────────────────────────────────────────────────────────

export const modelNamesSchema = z.object({
  chat: z.string(),
  embedding: z.string(),
  transcribe: z.string(),
  tts: z.string(),
});

/**
 * Every unknown value is `null`, never `0` — the contract is explicit, and a
 * client must not read "never built" as "built and empty". `.nullable()` rather
 * than `.optional()` says the key is expected and its value may be null; a
 * missing key is a contract change and should fail here.
 */
export const indexStatusSchema = z.object({
  ready: z.boolean(),
  kb_version: z.string().nullable(),
  kb_rows: z.number().nullable(),
  kb_rows_rejected: z.number().nullable(),
  kb_csv_filename: z.string().nullable(),
  kb_updated_at: z.string().nullable(),
  index_built_at: z.string().nullable(),
  embedding_model: z.string().nullable(),
  web_docs: z.number().nullable(),
  message: z.string().nullable(),
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  env: z.string(),
  version: z.string(),
  uptime_s: z.number(),
  request_id: z.string(),
  models: modelNamesSchema,
  index: indexStatusSchema,
});

// ── Voice ────────────────────────────────────────────────────────────────────

export const sttResponseSchema = z.object({ text: z.string() });
export const ttsPreviewResponseSchema = z.object({ text: z.string() });

// ── Support ──────────────────────────────────────────────────────────────────

export const contactPointSchema = z.object({
  label: z.string(),
  value: z.string(),
  kind: z.enum(['phone', 'email', 'post', 'extension', 'web']).catch('phone'),
});

export const contactLocationSchema = z.object({
  name: z.string(),
  address: z.string(),
  status: z.string(),
  contacts: z.array(contactPointSchema),
});

export const supportDirectorySchema = z.object({
  source: dataSourceSchema,
  locations: z.array(contactLocationSchema),
  emergency: z.string().nullable(),
  departments: z.array(z.string()),
  request_id: z.string(),
});

/** `next_step` is required and non-empty for the same reason as `disclaimer`. */
export const supportTicketResponseSchema = z.object({
  reference: z.string(),
  department: z.string(),
  expected_response: z.string(),
  next_step: z.string().min(1),
  transcript_included: z.boolean(),
  request_id: z.string(),
});

// ── Parsing at the boundary ──────────────────────────────────────────────────

/**
 * Thrown when a response does not match its schema.
 *
 * Separate from `ApiError` because it is not a failure of the *service* — the
 * server answered, with a 200, and the shape was wrong. That is a contract
 * mismatch between two halves being built in parallel, and it needs a different
 * message and a different place to look.
 */
export class SchemaMismatch extends Error {
  readonly issues: string[];

  constructor(what: string, issues: string[]) {
    super(
      `The ${what} response did not match the API contract.\n` +
        issues.map((issue) => `  - ${issue}`).join('\n') +
        `\nThis is a mismatch between docs/api-contract.md and what the backend sent. ` +
        `Check the field names on both sides before changing the schema.`
    );
    this.name = 'SchemaMismatch';
    this.issues = issues;
  }
}

/**
 * Parse a payload, or throw something a teammate can act on.
 *
 * The whole point of the exercise: a silently renamed field fails **here**, at the
 * boundary, naming the field and the expected type — rather than three components
 * later as an `undefined` rendered into a fee table as "NaN", which is both
 * confusing to debug and, on a tariff table, actively dangerous.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, what: string): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
  return neverReturns(new SchemaMismatch(what, issues));
}

function neverReturns(error: Error): never {
  throw error;
}
