import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { Markdown } from './Markdown';
import { STREAM_PARSE_INTERVAL_MS, splitAtSafePoint } from '@/lib/markdown/streaming';

interface StreamingMarkdownProps {
  text: string;
  /** True until the `done` event. Controls throttling and tail handling. */
  streaming: boolean;
  verifiedOn?: string | null | undefined;
  sourceId?: string | null | undefined;
}

/**
 * Markdown that survives being parsed while it is still arriving.
 *
 * Two mechanisms, and they solve different problems:
 *
 * **1. Throttling — a cost problem.** Tokens land every 20–40ms. Parsing on each
 * one runs the full remark/rehype pipeline ~40 times a second over a document
 * that keeps growing, on the main thread. The work is quadratic in answer
 * length. On a laptop it is invisible; on a mid-range Android it is the
 * difference between text appearing and text stuttering. So the parsed text is
 * refreshed on a ~50ms timer instead of on every token.
 *
 * **2. Safe-point splitting — a correctness problem**, and the one that actually
 * shows. Markdown parsed mid-construct is not slightly incomplete, it is a
 * different document: a table missing its delimiter row is a paragraph of pipes
 * that becomes a grid two tokens later; an open code fence swallows the rest of
 * the answer. `splitAtSafePoint` holds the unterminated tail back and renders it
 * as **plain text** until the construct closes.
 *
 * The tail is always on screen. Nothing is hidden or buffered out of sight —
 * that would defeat the point of streaming. It simply appears as the characters
 * that were sent, rather than as a guess at what they will mean.
 *
 * On `done`, throttling and splitting both stop and the whole text is parsed
 * once, so the final render never depends on where the frames happened to fall.
 */
export function StreamingMarkdown({
  text,
  streaming,
  verifiedOn,
  sourceId,
}: StreamingMarkdownProps) {
  const reduced = useReducedMotion();
  // What the parser is currently allowed to see.
  const [released, setReleased] = useState(text);
  const latest = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Written in the effect, not during render: a ref mutated while rendering is
    // read by concurrent React at unpredictable times.
    latest.current = text;

    if (!streaming) {
      // Final pass: everything, unthrottled, unsplit.
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      // The final pass. Scheduled rather than set synchronously: a synchronous
      // setState here cascades an extra render on the last token of every answer,
      // which is the one moment the main thread is busiest.
      const final = setTimeout(() => setReleased(text), 0);
      return () => clearTimeout(final);
    }

    // Already waiting — the pending tick will pick up whatever has arrived by
    // then. Scheduling another would defeat the throttle.
    if (timer.current !== null) return;

    timer.current = setTimeout(() => {
      timer.current = null;
      setReleased(latest.current);
    }, STREAM_PARSE_INTERVAL_MS);
    return undefined;
  }, [text, streaming]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );

  if (!streaming) {
    return (
      <Markdown verifiedOn={verifiedOn} sourceId={sourceId}>
        {released}
      </Markdown>
    );
  }

  const { stable, tail } = splitAtSafePoint(released);

  return (
    <>
      {stable && (
        <Markdown verifiedOn={verifiedOn} sourceId={sourceId}>
          {stable}
        </Markdown>
      )}
      {/*
        The tail, and the cursor after it — §3.5.

        `whitespace-pre-wrap` so a half-written table keeps its line breaks and
        does not collapse into one long line before it resolves.

        The cursor is `8px × 16px`, `--brand-200`, `vertical-align: -3px`, and it
        is the only thing on screen that says tokens are still arriving once the
        first sentence has landed. It was missing entirely: a stream that paused
        mid-answer looked identical to one that had finished.

        **It does not blink under reduced motion** — `animate-pulse` is gated on
        the same hook every other animation in this product uses, and §7 is
        explicit that the announcer carries the state instead.
      */}
      <p className="my-2 whitespace-pre-wrap text-ink-muted">
        {tail}
        <span
          aria-hidden="true"
          className={cn(
            'ml-0.5 inline-block h-4 w-2 bg-brand-200 align-[-3px]',
            !reduced && 'animate-pulse'
          )}
        />
      </p>
    </>
  );
}
