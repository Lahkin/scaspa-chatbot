import { Icon } from '@/components/ui/Icon';

/**
 * The airline mark — §4.5 and §5.5, which specify it identically.
 *
 * ```
 * 26px × 26px; border-radius: 8px
 * with a code:    --border fill, 600 11/16 --text-2, the two-letter code
 * without a code: 1px dashed --border, 12px plane glyph --text-3
 * ```
 *
 * ## Never invented initials
 *
 * Deriving "CH" from the word *Charter* would put two letters that look like an
 * IATA code beside a flight number, in a product where a code means something.
 * A glyph says "no code" and cannot be mistaken for one.
 *
 * Shared between the inline card and the flights table rather than written
 * twice: the two are the same 26px mark, and a rule this specific drifts the
 * moment it has two homes.
 */
export function AirlineAvatar({ code, airline }: { code: string; airline: string }) {
  if (!code) {
    return (
      <span
        aria-hidden="true"
        className="flex size-6.5 shrink-0 items-center justify-center rounded-ghost border border-dashed border-border text-ink-muted"
      >
        <Icon name="plane" size={12} />
      </span>
    );
  }

  return (
    <span
      // The code is already in the flight number beside it, so this is decoration.
      aria-hidden="true"
      title={airline}
      className="flex size-6.5 shrink-0 items-center justify-center rounded-ghost bg-border text-micro font-semibold text-ink-muted"
    >
      {code}
    </span>
  );
}
