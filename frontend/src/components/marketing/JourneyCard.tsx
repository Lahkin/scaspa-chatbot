import { cn } from '@/lib/cn';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * One of the four ways into Pilot.
 *
 * ## The whole card is the target
 *
 * A `<button>` wrapping the icon, the title and the two lines beneath it, not a
 * link on the title with decoration around it. Someone reading "Schedules,
 * terminals and travel information" and tapping the words they just read should
 * arrive somewhere; a card where only the heading works is a card that feels
 * broken on a phone and is impossible to hit while walking through a terminal.
 *
 * ## It asks, rather than navigating
 *
 * The card does not go to a filtered page — it opens a conversation with the
 * question already sent, through the same in-memory `pendingQuestion` store the
 * suggestion chips use. The question deliberately does NOT travel in the URL: a
 * query string would put it in history, in the address bar and in every
 * screenshot taken during a demonstration.
 *
 * That also makes these the safest control on the page to demonstrate with — a
 * tapped card cannot be mistyped on stage.
 *
 * ## Hover lifts a few pixels, and only a few
 *
 * The spec asks for "a hover lift of only a few pixels". A card that jumps reads
 * as a game; a card that does nothing reads as an image. `-translate-y-0.5` is
 * 2px, and the reduced-motion rule in tokens.css collapses the transition for
 * anyone who asked for that.
 */

export interface JourneyCardProps {
  icon: IconName;
  title: string;
  /** Two short lines. The mock-up breaks them, so they arrive as an array. */
  lines: readonly [string, string];
  onSelect: () => void;
  className?: string;
}

export function JourneyCard({ icon, title, lines, onSelect, className }: JourneyCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      /*
       * An explicit name, because the computed one is garbled.
       *
       * The visible card is a title, a line break and two lines of description.
       * Accessible-name computation concatenates those with no separator, so
       * what a screen reader actually announced was "Ferry & NevisSchedules,
       * terminalsand travel information" — every join in the card producing a
       * run-together word. Measured in a browser; it is invisible in jsdom and
       * invisible on screen.
       *
       * Labelling the button states the name once, in the order a listener
       * needs it, and leaves the visible text free to break wherever the layout
       * wants it to.
       */
      aria-label={`${title} — ${lines[0]} ${lines[1]}`}
      className={cn(
        'group flex min-h-touch w-full flex-col items-center gap-2 rounded-lg border border-border',
        'bg-surface px-4 py-5 text-center',
        'transition-all duration-base ease-out-soft',
        'hover:-translate-y-0.5 hover:border-aqua-strong hover:bg-surface-muted',
        className
      )}
    >
      {/*
        Line art, not a filled glyph — the spec is explicit, and a filled icon at
        this size reads as a badge rather than as a category.
      */}
      <Icon name={icon} size={24} className="text-brand-400" />

      <span className="text-section font-semibold text-ink">{title}</span>

      <span className="text-small text-ink-muted">
        {lines[0]}
        <br />
        {lines[1]}
      </span>
    </button>
  );
}
