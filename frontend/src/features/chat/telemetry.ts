/**
 * Timings, to the dev console and nowhere else.
 *
 * ### The privacy position, in code
 *
 * **Nothing leaves the browser.** No analytics service, no beacon, no pixel, no
 * cookie, no fingerprint, no id of any kind. This module has no network access
 * and never will — the ESLint rule that confines `fetch` to `lib/api.ts` and
 * `lib/stream.ts` makes that mechanical rather than a promise.
 *
 * That is what lets `privacy.tsx` say truthfully that the frontend collects
 * nothing. If SCASPA later wants usage insight, the sanctioned source is the
 * backend's anonymised question log — which records the question and the latency
 * and explicitly never records who asked.
 *
 * It is also gated on `import.meta.env.DEV`, so none of it is in the production
 * bundle at all.
 */

export interface TurnTiming {
  /** Milliseconds from send to the first token. The number a user actually feels. */
  timeToFirstTokenMs: number | null;
  /** Send to `done`. */
  totalMs: number;
  /** Which tools ran, by name and duration. */
  tools: { name: string; ms: number | null }[];
  /** Whether the answer came over SSE or the non-streaming fallback. */
  transport: 'stream' | 'fetch';
  /** Characters in the finished answer, as a rough sense of size. Not the text. */
  answerChars: number;
}

/**
 * A stopwatch for one turn.
 *
 * `performance.now()` rather than `Date.now()`: it is monotonic, so a clock
 * adjustment mid-answer cannot produce a negative latency.
 */
export function startTurn() {
  const started = performance.now();
  let firstToken: number | null = null;

  return {
    markFirstToken() {
      if (firstToken === null) firstToken = performance.now();
    },
    finish(
      transport: 'stream' | 'fetch',
      tools: { name: string; ms: number | null }[],
      answerChars: number
    ): TurnTiming {
      const now = performance.now();
      return {
        timeToFirstTokenMs: firstToken === null ? null : Math.round(firstToken - started),
        totalMs: Math.round(now - started),
        tools,
        transport,
        answerChars,
      };
    },
  };
}

/** Print one turn. Dev only — the call site is behind `import.meta.env.DEV` too. */
export function logTurn(timing: TurnTiming): void {
  if (!import.meta.env.DEV) return;

  const ttft = timing.timeToFirstTokenMs === null ? 'n/a' : `${timing.timeToFirstTokenMs}ms`;
  console.info(
    `[chat] transport=${timing.transport} ttft=${ttft} total=${timing.totalMs}ms ` +
      `answer=${timing.answerChars} chars` +
      (timing.tools.length > 0
        ? ` tools=[${timing.tools.map((t) => `${t.name}:${t.ms ?? '?'}ms`).join(', ')}]`
        : ' tools=[]')
  );
}
