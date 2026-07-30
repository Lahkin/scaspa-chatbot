import { cn } from '@/lib/cn';
import { SUGGESTED_QUESTIONS } from '@/features/chat/suggestions';

/**
 * The starter chips.
 *
 * Two jobs. The first is that most people do not know what to ask a port
 * authority, and a blank box with a cursor in it is a worse prompt than four
 * concrete questions. The second is the demo: on stage, a tapped chip cannot be
 * fat-fingered, autocorrected into a different question, or typed into an
 * unresponsive keyboard while a room watches.
 *
 * The four below are the demo script, one per facility — cruise, ferry, cargo
 * collection, container tariff — so whichever a judge picks lands on a different
 * part of the knowledge base.
 *
 * A chip **populates the composer rather than sending**. The user still presses
 * send, which keeps one habit for every question and leaves room to edit "a
 * 40-foot container" into "a 20-foot container" without retyping the sentence.
 */

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  /**
   * `empty` is the opening state: the departure-board treatment, given room.
   * `idle` is between answers, below the composer: quieter, so it offers a next
   * step without competing with the answer just given.
   */
  variant?: 'empty' | 'idle';
  disabled?: boolean;
}

export function SuggestedQuestions({
  onSelect,
  variant = 'empty',
  disabled = false,
}: SuggestedQuestionsProps) {
  const empty = variant === 'empty';

  return (
    <section aria-labelledby="suggested-heading" className={empty ? 'space-y-3' : 'space-y-2'}>
      <h2
        id="suggested-heading"
        className={empty ? 'text-small font-semibold text-ink' : 'text-caption text-ink-subtle'}
      >
        {empty ? 'Try one of these' : 'Ask something else'}
      </h2>

      <ul className={cn('flex flex-wrap gap-2', !empty && 'gap-1.5')}>
        {SUGGESTED_QUESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onSelect(question)}
              disabled={disabled}
              className={cn(
                'min-h-touch rounded-md text-left transition-colors duration-fast ease-out-soft',
                'disabled:cursor-not-allowed disabled:opacity-60',
                empty
                  ? // Departure board: navy ground, amber chevron. The amber is a
                    // fill-and-dark-ground colour and this is the ground it is for.
                    'flex items-center gap-2 bg-navy px-3 py-2 text-small font-medium text-ink-inverse hover:bg-navy-deep'
                  : 'border border-border-strong bg-surface px-3 py-1.5 text-caption text-ink-muted hover:border-blue-600 hover:text-blue-700'
              )}
            >
              {empty && (
                <span aria-hidden="true" className="text-amber-board">
                  ›
                </span>
              )}
              {question}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
