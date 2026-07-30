/**
 * The failure switch. **Dev and test only** — never imported by production code.
 *
 * Every one of these is a state the real backend can genuinely produce, taken from
 * `docs/api-contract.md`. They exist because the happy path is the one path that
 * gets built by accident: a 429 with a `Retry-After`, a mid-stream `error` event
 * and a stream that simply stops are all things a cruise passenger on hotel wifi
 * will hit, and none of them will ever appear on a demo laptop unless something
 * makes them appear.
 *
 * Held in memory only. Nothing here goes to sessionStorage — CLAUDE.md rule 5
 * allows only `conversation_id` there, and a mock setting is not that.
 */

export type ScenarioId =
  | 'happy'
  | 'table'
  | 'hallucinated_marker'
  | 'volatility'
  | 'chart'
  | 'voice_stt_fails'
  | 'voice_tts_fails'
  | 'no_answer'
  | 'index_missing'
  | 'retrieval_empty'
  | 'degraded_health'
  | 'stale_index'
  | 'slow'
  | 'rate_limited'
  | 'internal_error'
  | 'upstream_timeout'
  | 'stream_error'
  | 'refusal'
  | 'ungrounded'
  | 'empty_citations'
  | 'stream_stall';

export interface ScenarioDescription {
  id: ScenarioId;
  label: string;
  /** What the client is supposed to do about it, per the contract. */
  expected: string;
}

export const SCENARIOS: ScenarioDescription[] = [
  {
    id: 'happy',
    label: 'Normal cited answer',
    expected: 'Streams meta, tool events, tokens, citations, done.',
  },
  {
    id: 'table',
    label: 'Answer with a fee table',
    expected: 'Five columns. Scrolls at 390px; figures right-aligned and tabular.',
  },
  {
    id: 'hallucinated_marker',
    label: 'Answer citing an unvouched row',
    expected: '[kb-047] must vanish from the text — no chip, and never the raw marker.',
  },
  {
    id: 'volatility',
    label: 'Citations with volatility (proposed)',
    expected: 'High row shows the travel-confirmation line and a tel: link; low row is quiet.',
  },
  {
    id: 'chart',
    label: 'Answer with a chart',
    expected: 'Recharts loads lazily; caption and source chip always present.',
  },
  {
    id: 'voice_stt_fails',
    label: 'Voice: transcription fails',
    expected: 'Mic error contained to the control; typing is completely unaffected.',
  },
  {
    id: 'voice_tts_fails',
    label: 'Voice: speech fails',
    expected: 'Speaker says so; the answer above is unchanged.',
  },
  {
    id: 'no_answer',
    label: 'No verified answer',
    expected: 'Calm treatment, not an error. Backend copy verbatim plus tappable contacts.',
  },
  {
    id: 'slow',
    label: 'Slow response (8s)',
    expected: 'Thinking indicator, then the elapsed counter after 3s. Composer disabled.',
  },
  {
    id: 'index_missing',
    label: '503 INDEX_MISSING',
    expected: 'Service degraded. Contact route shown immediately, no retry.',
  },
  {
    id: 'retrieval_empty',
    label: '503 RETRIEVAL_EMPTY',
    expected: 'Routed to the no-answer treatment, NOT an error panel.',
  },
  {
    id: 'degraded_health',
    label: 'Health: degraded',
    expected: 'Dismissible banner at the top of the shell.',
  },
  {
    id: 'stale_index',
    label: 'Health: stale index',
    expected: 'Quiet note giving the last-verified date. Not a warning.',
  },
  {
    id: 'rate_limited',
    label: '429 with Retry-After',
    expected: 'Show the message, offer a retry button. Never auto-retry in a loop.',
  },
  {
    id: 'internal_error',
    label: '500 INTERNAL',
    expected: 'Show the envelope message as-is; it already ends with the phone number.',
  },
  {
    id: 'upstream_timeout',
    label: '504 UPSTREAM_TIMEOUT',
    expected: 'The server already retried. Put a retry behind a button.',
  },
  {
    id: 'stream_error',
    label: 'Mid-stream error event',
    expected: 'HTTP is already 200. Handle the error event, keep tokens shown so far.',
  },
  {
    id: 'refusal',
    label: 'refusal: true',
    expected: 'HTTP 200. NOT an error. Render the answer plainly; the phone number is in it.',
  },
  {
    id: 'ungrounded',
    label: 'grounded: false',
    expected: 'Internal signal only. Never shown to a user as a correctness warning.',
  },
  {
    id: 'empty_citations',
    label: 'Answer with no citations',
    expected: 'Markers streamed but unverified. Reconcile: drop every chip.',
  },
  {
    id: 'stream_stall',
    label: 'Stream stalls after 2 tokens',
    expected: 'No done, no error, no close. The client timeout is the only way out.',
  },
];

let current: ScenarioId = 'happy';
const listeners = new Set<() => void>();

export function getScenario(): ScenarioId {
  return current;
}

export function setScenario(next: ScenarioId): void {
  current = next;
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore` in the dev control. */
export function subscribeToScenario(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Wall-clock scaling for the streaming mock.
 *
 * `1` is realistic — tokens 20–40ms apart, tools taking ~150ms — which is the
 * point: a client that only works against an instant mock has never had its
 * ordering assumptions tested.
 *
 * Tests set `0`. That removes the *sleeps* but **not** the chunk splitting: frames
 * still arrive split across chunk boundaries and the `[kb-014]` marker is still
 * split across two token events, because those are what actually break parsers.
 */
let timeScale = 1;

export function getTimeScale(): number {
  return timeScale;
}

export function setTimeScale(scale: number): void {
  timeScale = scale;
}

export function sleep(ms: number): Promise<void> {
  const scaled = ms * timeScale;
  if (scaled <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, scaled));
}
