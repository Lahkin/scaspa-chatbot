import { Link } from '@tanstack/react-router';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { DESTINATIONS, type CardDestination } from './cardDestinations';

/**
 * The call to action at the foot of an answer card — spec board 02.
 *
 * ## Four destinations exist and no others
 *
 * The board is titled that way and lists them exhaustively. This is a closed
 * union rather than an `href: string` prop, so a fifth destination is a type
 * error rather than a link somebody added to a page that does not exist.
 *
 * ## One per card
 *
 * "One call to action per answer card." Two competing links at the foot of an
 * answer make the reader choose before they have finished reading it. The one
 * exception is the no-answer card, which offers all four — and it is an
 * exception for a reason the board states: it is a statement about coverage, so
 * it offers the whole of what is covered.
 *
 * ## States
 *
 * Default brand-200; hover underlines and nudges the chevron 3px; focus takes
 * the ring; pressed drops to brand-300 with no motion. The nudge is the only
 * animation, and it is suppressed under reduced motion by the base layer's
 * blanket transition rule.
 */
export function CardFooterLink({
  to,
  /** Overrides the standard wording. Use sparingly — the four labels are the four labels. */
  label,
}: {
  to: CardDestination;
  label?: string;
}) {
  const destination = DESTINATIONS[to];

  return (
    <Link
      to={destination.to}
      className={cn(
        'group flex h-13 items-center justify-between gap-4 border-t border-border px-4',
        'text-body font-medium text-brand-200',
        'transition-colors duration-fast ease-out-soft',
        /*
         * §2.5 gives hover and pressed a FILL as well as an ink, and the fill
         * was missing: the row is the full width of the card, so ink alone
         * leaves a 400px target whose hit area is invisible until the cursor
         * happens to cross the words.
         *
         * The bottom-corner radius matches the card's own 16px frame minus its
         * 1px edge — without it the fill paints square corners over a rounded
         * card and the card looks broken on hover.
         */
        'hover:rounded-b-[10px] hover:bg-surface-3 hover:text-brand-100',
        'hover:underline hover:underline-offset-[3px]',
        'active:rounded-b-[10px] active:bg-border active:text-brand-300'
      )}
    >
      {label ?? destination.label}
      <Icon
        name="chevron-right"
        size={16}
        // Nudged on hover and it STAYS nudged while pressed — §2.5. Letting it
        // spring back under the finger reads as the control cancelling.
        className="transition-transform duration-fast ease-out-soft group-hover:translate-x-[3px] group-active:translate-x-[3px]"
      />
    </Link>
  );
}
