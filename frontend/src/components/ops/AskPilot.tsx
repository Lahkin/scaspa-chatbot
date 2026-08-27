import { useNavigate } from '@tanstack/react-router';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { setPendingQuestion } from '@/features/chat/pending';

/**
 * "Ask Pilot about this" — the bridge from a board back into the conversation.
 *
 * ## Why an operations screen needs a way back at all
 *
 * The tables answer *what*: which ship, which pier, which window. They cannot
 * answer *what does that mean for me* — whether the terminal is walkable, what
 * a passenger needs at the gate, who to telephone about a berth. That is the
 * assistant's half of the product, and a reader who has found the row they came
 * for currently has to go back to the sidebar, open the chat and retype the
 * context they were just looking at.
 *
 * So every operational surface carries one of these, pre-loaded with the
 * question the screen is actually about.
 *
 * ## The question travels in memory, never in the URL
 *
 * Same handoff the landing chips use — `features/chat/pending`. A query string
 * would put the question in browser history, in the address bar and in every
 * screenshot, which CLAUDE.md rule 5 rules out for message content. It is set
 * and then navigated to; `/chat` takes it and clears it, so it is never sent
 * twice.
 *
 * ## It states the question rather than hinting at it
 *
 * The label IS the question — "Ask Pilot about today's arrivals" — because the
 * user is about to send it. A button reading "Ask Pilot" that then fires an
 * unseen question is the assistant putting words in somebody's mouth.
 */
export function AskPilot({
  question,
  label,
  className,
}: {
  /** Sent verbatim into the transcript. */
  question: string;
  /**
   * What the button reads. Defaults to the question, which is usually right;
   * override only where the question is too long for a control.
   */
  label?: string;
  className?: string | undefined;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        setPendingQuestion(question);
        void navigate({ to: '/chat' });
      }}
      className={cn(
        'inline-flex min-h-touch items-center gap-2 rounded-button border border-border bg-surface-muted px-3.5 text-label font-medium text-ink',
        'hover:border-aqua-strong hover:text-aqua-text',
        className
      )}
    >
      <Icon name="sparkle" size={16} className="text-aqua-text" />
      {label ?? question}
    </button>
  );
}
