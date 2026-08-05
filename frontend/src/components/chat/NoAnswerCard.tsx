import { Icon } from '@/components/ui/Icon';
import { CardFooterLink } from './CardFooterLink';
import { ALL_DESTINATIONS } from './cardDestinations';
import { EscalationBlock } from './EscalationBlock';

/**
 * "We don't hold that information" — spec board 05, and card 3 of board 15.
 *
 * ## A no-answer is the most trustworthy thing the assistant does
 *
 * It is a successful `200` with `refusal: true`, not an error, and it must not
 * be styled as one. The whole product exists to say this rather than guess, so
 * the card is calm: a search glyph, a plain heading, and the coverage
 * statement. No red, no alert role, no apology.
 *
 * ## The only card that carries all four destinations
 *
 * Board 02 allows one call to action per answer card, and the board's own note
 * explains why this is the exception: *"It is a statement about coverage, so it
 * offers the whole of what is covered."* Being told what is not held is only
 * useful next to what is.
 */

/** The escalation block the backend appends in plain text. Split, don't reflow. */
const ESCALATION_MARKER = /\n\s*You can reach SCASPA directly:/;

export function NoAnswerCard({ message }: { message: string }) {
  // Keep the approved sentence; the contact block is rendered as a component
  // below rather than twice, once as prose and once as controls.
  const [explanation] = message.split(ESCALATION_MARKER);

  return (
    <section
      aria-labelledby="no-answer-heading"
      data-state="no-answer"
      className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-3">
        <h3
          id="no-answer-heading"
          className="flex items-center gap-2.5 text-section font-semibold text-ink"
        >
          <Icon name="search" size={16} className="text-brand-300" />
          We don&rsquo;t hold that information
        </h3>
        {/* The backend's words, unaltered. */}
        <p className="whitespace-pre-wrap text-body text-ink-muted">{explanation?.trim()}</p>
      </div>

      {/* What we do hold. Four rows, each its own destination. */}
      <div className="flex flex-col">
        {ALL_DESTINATIONS.map((destination) => (
          <CardFooterLink key={destination} to={destination} />
        ))}
      </div>

      <EscalationBlock />
    </section>
  );
}
