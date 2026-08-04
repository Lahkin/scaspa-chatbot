import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * The marker the backend substitutes in place of instruction-like phrasing.
 *
 * Matched literally against `app/safety.py`'s `NEUTRALISED`. It is a constant
 * on both sides rather than a pattern, because a loose match would turn a
 * user's own square brackets into a redaction chip.
 */
export const NEUTRALISED_MARKER = '[instruction-like text removed]';

/**
 * A user's question after input safety changed it — spec board 14.
 *
 * ## The user's own words changed on screen, so it is explained in place
 *
 * "The user's own words changed on screen — that needs explaining in place, not
 * in a tooltip. The removed span keeps its position in the sentence so the user
 * can see exactly what went."
 *
 * That is why the backend substitutes a marker rather than deleting: the
 * position survives the round trip, and this splits on it to put a chip exactly
 * where the phrasing was.
 *
 * ## The removed text is never rendered back
 *
 * Only the marker crosses the wire, never the matched phrasing. Echoing an
 * injection attempt into the DOM would be a small XSS-shaped hole in a product
 * whose entire safety story is that model output and user input are handled
 * carefully — and it would also show the next person exactly which wording to
 * try.
 */
export function SanitisedQuestion({ text }: { text: string }) {
  const parts = text.split(NEUTRALISED_MARKER);

  return (
    <>
      <span className="whitespace-pre-wrap">
        {parts.map((part, index) => (
          <Fragment key={`${index}-${part.slice(0, 12)}`}>
            {part}
            {index < parts.length - 1 ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-dashed border-caution/50 bg-caution-tint px-2 py-0.5 align-baseline text-caption font-medium text-caution">
                instruction-like text removed
              </span>
            ) : null}
          </Fragment>
        ))}
      </span>
    </>
  );
}

/**
 * The explanation that follows the bubble.
 *
 * Separate from the chip because the chip says *where* and this says *what
 * happened and what did not*. The reassurance matters as much as the warning:
 * a user who sees part of their sentence replaced needs telling that the rest
 * of it was sent as written, or they will assume the whole question was
 * mangled and retype it.
 */
export function SanitisedQuestionNotice() {
  return (
    <div
      role="status"
      className="mt-2 flex max-w-[82%] items-start gap-2.5 rounded-input border border-caution/30 bg-caution-tint px-3 py-2.5"
    >
      <Icon name="shield" size={14} className="mt-0.5 text-caution" />
      <p className="text-label text-ink-muted">
        Part of your message looked like an instruction to the assistant, so it was not passed on.
        Your question was sent as written otherwise.
      </p>
    </div>
  );
}
