import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { ToolActivity } from '@/features/chat/types';

/**
 * What the agent is doing, while it does it.
 *
 * This is the difference between a wait that reads as thinking and a wait that
 * reads as broken. Between the question and the first token the agent is
 * retrieving, and without this the interface shows a spinner for two seconds —
 * which is indistinguishable from a hang, and invites the tap that sends the
 * question twice.
 *
 * **Every string here comes from the backend's `summary` field.** The contract
 * says it is written to be rendered directly, and nothing in this component
 * invents, rewrites or prettifies it. A status line the backend did not send is
 * a claim about what the system did, and this is a product whose entire premise
 * is not making claims it cannot support. If a tool arrives with no summary the
 * line is skipped rather than filled in with a guess.
 */

interface AgentStatusProps {
  activity: ToolActivity[];
  /** True once the first token has arrived. Completed steps collapse then. */
  answerStarted: boolean;
}

export function AgentStatus({ activity, answerStarted }: AgentStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();

  if (activity.length === 0) return null;

  const running = activity.filter((step) => !step.done);
  const finished = activity.filter((step) => step.done);

  // While the answer is still forming, every step is shown: that is the moment
  // the visibility is worth anything. Once text is arriving, the reader's
  // attention belongs on the answer, so completed work folds into one line.
  const collapsed = answerStarted && running.length === 0;

  if (collapsed) {
    return (
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-sm text-caption text-ink-muted hover:text-ink"
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          {/* Counted from what actually happened, not asserted. */}
          Looked at {finished.length} {finished.length === 1 ? 'source' : 'sources'}
        </button>

        {expanded && (
          <ul className="mt-1 space-y-1 border-l border-border pl-3">
            {finished.map((step) => (
              <li key={step.id} className="text-caption text-ink-subtle">
                {step.summary}
                {step.ms !== null && <span className="text-ink-subtle"> · {step.ms}ms</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <ul className="mb-2 space-y-1" aria-live="polite" aria-busy={running.length > 0}>
      {activity.map((step) => (
        <li key={step.id} className="flex items-center gap-2 text-caption text-ink-muted">
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-2 shrink-0 rounded-full',
              step.done ? 'bg-success' : 'bg-blue-600',
              // The pulse is the only thing distinguishing "still working" from
              // "stopped here". Gated on the OS preference — under reduced
              // motion the dot is simply solid, which still reads as active
              // because the tick only appears when a step finishes.
              !step.done && !reduced && 'animate-pulse'
            )}
          />
          <span>{step.summary}</span>
          {step.done && step.ms !== null && <span className="text-ink-subtle">· {step.ms}ms</span>}
        </li>
      ))}
    </ul>
  );
}
