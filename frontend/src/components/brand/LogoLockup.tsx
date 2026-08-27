import { cn } from '@/lib/cn';
import logoUrl from '@/assets/scaspa-logo.png';

/**
 * The SCASPA lockup: the seal on its white plate, plus the product name.
 *
 * ## The asset is the real SCASPA seal, used with permission
 *
 * `src/assets/scaspa-logo.png` is the Authority's own mark — the circular seal
 * with an aircraft above a ship — and SCASPA has granted permission to use it.
 * One rule survives from the placeholder era and is not negotiable: **the mark
 * is used as supplied.** No tracing it off scaspa.com, no redrawing it, no
 * recolouring it. Permission covers the identity as it is, not a variation of
 * it invented here.
 *
 * ## Two sizes, and the handoff names both of them
 *
 * | Context                                   | Plate | Seal |
 * | ----------------------------------------- | ----- | ---- |
 * | Sidebar lockup                            | 40px  | 32px |
 * | Widget header · 404 header · mobile header| 32px  | 24px |
 *
 * There is no third. A size prop that took a number would let a caller invent a
 * pairing the handoff does not draw, so the two are an enum.
 *
 * ## The plate is not decoration
 *
 * "The seal is dark blue line art on transparency. It always sits on a white
 * circular plate. Never recoloured, outlined, cropped or knocked out to white."
 * The product is dark on every surface, so without the plate the mark does not
 * dim — it disappears.
 *
 * This component previously declined to draw the badge at all below 32px, on
 * the grounds that the seal turns to mud at small sizes. The handoff's smallest
 * pairing IS 24-inside-32 and it is required — "never use it without the plate
 * at any size" — so the fallback is gone. Nothing in the product renders the
 * mark smaller than that.
 *
 * ## Why the asset is 256px and must stay small
 *
 * It is drawn at 32px at the largest, so 256 is roughly 8x the highest-density
 * case. That is not fussiness: the original supplied file was 6000 x 6000 and
 * 2.1 MB, which shipped to every visitor and outweighed the entire application
 * bundle five times over, on a product that self-hosts its font to save one DNS
 * round trip. `scripts/bundle-budget.mjs` fails the build on any raster over
 * 512px or 100 kB. **Resize the source; do not just compress it.**
 *
 * ## Rules this component enforces so callers cannot break them
 *
 * - **Never distorted.** The `<img>` is a fixed square with `object-contain`;
 *   there is no prop that can change its aspect ratio.
 * - **Never recoloured.** No `fill`, no CSS filter, no `currentColor`.
 * - **Never unplated.** The plate is not conditional and there is no prop to
 *   remove it.
 */

export type LogoSize = 'lockup' | 'compact';

interface LogoLockupProps {
  /** `lockup` is the sidebar's 40/32. `compact` is the widget, 404 and mobile header's 32/24. */
  size?: LogoSize;
  /**
   * Hide the product name and let the mark carry the meaning alone.
   *
   * When the name is shown, the mark is `aria-hidden` — announcing "SCASPA
   * Assistant logo, SCASPA Assistant" is one thing said twice. When it is
   * hidden, the mark takes the accessible name instead.
   */
  nameHidden?: boolean;
}

/** Plate diameter, and the seal inside it. Handoff §1.1, and the only two pairings. */
const PLATE_PX: Record<LogoSize, number> = { lockup: 40, compact: 32 };
const SEAL_PX: Record<LogoSize, number> = { lockup: 32, compact: 24 };

/**
 * The seal on its plate, with no wordmark.
 *
 * Exported because three places need the mark without the name — the collapsed
 * rail, the mobile header and the gallery — and each of them reaching for
 * `nameHidden` would leave an `sr-only` copy of the product name in a row that
 * already has one.
 */
export function Seal({ size = 'lockup', label }: { size?: LogoSize; label?: string }) {
  const platePx = PLATE_PX[size];
  const sealPx = SEAL_PX[size];

  return (
    <span
      /*
       * Literally white, not `bg-neutral-0`: that alias follows the theme and
       * the plate must not. `flex: none` so it never compresses in a row where
       * the wordmark is `flex: 1`.
       */
      className="flex shrink-0 items-center justify-center rounded-full bg-white"
      style={{ width: platePx, height: platePx }}
      /*
       * `aria-hidden` on an ancestor removes the whole subtree regardless of
       * what the child says — so the plate is hidden only when the image inside
       * it is decorative too.
       */
      {...(label ? {} : { 'aria-hidden': true })}
    >
      <img
        src={logoUrl}
        // Width and height from the same number: the aspect ratio cannot be
        // distorted by a caller or by a flex parent.
        width={sealPx}
        height={sealPx}
        className="object-contain"
        style={{ width: sealPx, height: sealPx }}
        // The empty string is how you tell a screen reader to skip an image;
        // omitting `alt` entirely makes it read the filename instead.
        alt={label ?? ''}
        {...(label ? {} : { 'aria-hidden': true })}
      />
    </span>
  );
}

export function LogoLockup({ size = 'lockup', nameHidden = false }: LogoLockupProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Seal size={size} {...(nameHidden ? { label: 'SCASPA' } : {})} />

      {/*
        `whitespace-nowrap`, not `truncate`. The handoff sets the wordmark
        `nowrap` and gives it `flex: 1`; an ellipsis in the product's own name
        is a layout bug reported as a design.
      */}
      <span
        className={cn(
          'min-w-0 flex-1 text-wordmark font-semibold whitespace-nowrap text-ink',
          nameHidden && 'sr-only'
        )}
      >
        {/*
          "SCASPA", not the product name.

          This is the INSTITUTIONAL lockup: the Authority's seal, and the
          Authority beside it. It used to read "SCASPA Assistant" because at the
          time the product WAS the SCASPA Assistant and the two names were the
          same thing. They are not any more — the product is Pilot, and
          `PilotBrand` is where its name lives (decisions.md 0035).

          Putting "Pilot" here instead would be the hybrid mark the brand
          architecture forbids: the Authority's seal with the guide's name
          under it.
        */}
        SCASPA
      </span>
    </span>
  );
}
