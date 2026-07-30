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
