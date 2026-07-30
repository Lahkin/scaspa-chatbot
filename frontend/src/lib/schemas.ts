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
  // Not in the contract yet — see lib/types.ts. Optional so that a backend that
  // starts sending them needs no frontend change, and one that does not still
  // parses.
  volatility: z.enum(['low', 'medium', 'high']).optional(),
  label: z.string().optional(),
  snippet: z.string().optional(),
});

export const toolNameSchema = z.enum([
  'search_scaspa_knowledge',
  'search_site_content',
  'make_chart',
  'calculate',
  'escalate_to_human',
]);

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
  name: toolNameSchema,
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
  kb_version: z.string(),
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  conversation_id: z.string(),
  grounded: z.boolean(),
  refusal: z.boolean(),
  // Optional: the contract's own no-answer sample omits the key. See lib/types.ts.
  refusal_category: z.enum(['vessel_or_aircraft_operations', 'personal_record']).nullish(),
  citations: z.array(citationSchema),
  chart: chartSpecSchema.nullable(),
  tool_calls: z.array(toolCallSchema),
  meta: responseMetaSchema,
});

export const apiErrorSchema = z.object({
  code: z.enum([
    // Emitted by the backend, absent from the contract — see lib/types.ts.
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
  meta: z.object({ conversation_id: z.string() }),
  token: z.object({ text: z.string() }),
  tool_start: z.object({ name: toolNameSchema, summary: z.string() }),
  tool_end: z.object({ name: toolNameSchema, summary: z.string(), ms: z.number() }),
  citations: z.object({ citations: z.array(citationSchema) }),
  chart: chartSpecSchema,
  replace: z.object({ text: z.string() }),
  done: z.object({
    latency_ms: z.number(),
    grounded: z.boolean(),
    refusal: z.boolean(),
    kb_version: z.string(),
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
