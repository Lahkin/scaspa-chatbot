import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

/** Past this, the wait stops feeling instant and starts feeling broken. */
const SHOW_ELAPSED_AFTER_MS = 3000;

/**
 * The wait before the first token.
 *
 * Between sending and the first token the agent is retrieving, and with nothing on
 * screen that is indistinguishable from a hang — which invites the second tap that
 * sends the question twice.
 *
 * **The counter appears only after three seconds.** Before that the wait is short
 * enough that a number would draw attention to something nobody had noticed. After
 * it, a visible count converts an anxious wait into a legible one: "it has been
 * seven seconds and it is still going" is a fact, where a motionless spinner is a
 * question. On venue wifi this is the difference between waiting and reloading.
 *
 * Once tool events arrive, `AgentStatus` says something more specific and this
 * gives way to it.
 */
export function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Ticks every 200ms rather than every second, so the number changes on the
    // beat rather than up to a second late.
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(timer);
  }, [startedAt]);

  const seconds = Math.floor(elapsedMs / 1000);
  const showElapsed = elapsedMs >= SHOW_ELAPSED_AFTER_MS;

  return (
    <div
      className="flex items-center gap-2 text-caption text-ink-muted"
      role="status"
      aria-live="polite"
      data-testid="thinking"
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-2 shrink-0 rounded-full bg-blue-600',
          // Under reduced motion the dot is solid: still clearly "active",
          // without motion the user asked not to see.
          !reduced && 'animate-pulse'
        )}
      />
      <span>Looking through SCASPA information</span>
      {showElapsed && (
        <span className="tabular text-ink-subtle" data-testid="elapsed">
          {seconds}s
        </span>
      )}
    </div>
  );
}
