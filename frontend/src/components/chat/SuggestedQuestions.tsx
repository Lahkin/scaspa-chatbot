import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import {
  NARROWED_QUESTIONS,
  SUGGESTED_QUESTIONS,
  type Suggestion,
} from '@/features/chat/suggestions';

/**
 * The suggestion chips — handoff §1.2 (Family C) and §3.4.
 *
 * Two jobs. The first is that most people do not know what to ask a port
 * authority, and a blank box with a cursor in it is a worse prompt than eight
 * concrete topics. The second is the demo: on stage, a tapped chip cannot be
 * fat-fingered, autocorrected into a different question, or typed into an
 * unresponsive keyboard while a room watches.
 *
 * A chip **populates the composer rather than sending**. The user still presses
 * send, which keeps one habit for every question and leaves room to edit
 * "a 40ft container" into "a 20ft container" without retyping the sentence.
 *
 * ## The chip is not a filter chip and must not look like one
 *
 * 34px tall, `--surface-2`, a 1px border and a 14px `--brand-300` glyph — a
 * related but distinct control from the 28px filter chip and the 26px outline
 * status pill, both of which appear in the same answers. The heights are what
 * keep the three apart in a row that contains all three.
 *
 * ## Three states, and the third is an absence
 *
 * | State            | Treatment                                              |
 * | ---------------- | ------------------------------------------------------ |
 * | Initial          | the eight topics, `1px solid --border`                 |
 * | After a refusal  | narrowed to what we hold, `1px solid --brand-500`      |
 * | Hidden           | **not rendered** — while streaming, and after a 429    |
 *
 * Hidden means removed from the DOM, not disabled. A greyed-out suggestion
 * during a rate limit invites a click that cannot succeed, and a disabled
 * control still costs a screen-reader user a stop in the tab order to discover
 * that it does nothing.
 */

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  /**
   * `initial` is the opening set. `narrowed` follows a refusal and offers only
   * what the published record covers.
   */
  variant?: 'initial' | 'narrowed';
  /**
   * True while streaming or under a rate limit. The section renders **nothing**
   * — see the table above. It is a prop rather than the caller's `&&` so the
   * rule lives with the component that has to obey it.
   */
  hidden?: boolean;
  /**
   * `compact` is the embedded widget: 32px rather than 34px, and only the first
   * two topics.
   *
   * The count shrinks as well as the height because the widget is 380px wide
   * and eight chips wrap to four rows, which is most of a 480px panel spent on
   * suggestions rather than on the answer. §2.3 shrinks the chips; the board
   * draws two of them.
   */
  size?: 'default' | 'compact';
}

export function SuggestedQuestions({
  onSelect,
  variant = 'initial',
  hidden = false,
  size = 'default',
}: SuggestedQuestionsProps) {
  if (hidden) return null;

  const narrowed = variant === 'narrowed';
  const compact = size === 'compact';
  const all: readonly Suggestion[] = narrowed ? NARROWED_QUESTIONS : SUGGESTED_QUESTIONS;
  const suggestions = compact ? all.slice(0, 2) : all;

  return (
    <section aria-labelledby="suggested-heading">
      {/*
        The heading is for assistive technology only. On the board the chips
        follow the composer with no label above them — the shapes say what they
        are — but a list of eight buttons with no grouping announced is a worse
        experience than a heading nobody sees.
      */}
      <h2 id="suggested-heading" className="sr-only">
        {narrowed ? 'Questions this assistant can answer' : 'Suggested questions'}
      </h2>

      {/* Two wrapping rows, `gap: 8px` within and between. */}
      <ul className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.label}>
            <button
              type="button"
              onClick={() => onSelect(suggestion.label)}
              className={cn(
                'flex items-center gap-2 rounded-pill border bg-surface-2 px-3.5',
                compact ? 'h-8' : 'h-[34px]',
                'text-label font-medium text-ink',
                'transition-colors duration-fast ease-out-soft hover:bg-surface-3',
                narrowed ? 'border-brand-500' : 'border-border'
              )}
            >
              <Icon
                name={suggestion.icon}
                size={14}
                className={narrowed ? 'text-brand-200' : 'text-brand-300'}
              />
              {suggestion.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
