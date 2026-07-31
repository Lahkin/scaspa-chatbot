import { cn } from '@/lib/cn';
import logoUrl from '@/assets/scaspa-logo.svg';

/**
 * The SCASPA lockup: mark plus product name.
 *
 * ## The asset is a placeholder, and that is deliberate
 *
 * `src/assets/scaspa-logo.svg` is a neutral geometric stand-in, not the SCASPA
 * seal. Three client items are outstanding — vector files, a reversed white
 * variant, and **written permission to use the identity** — and all three are
 * listed in that file. Tracing the mark off scaspa.com would put an unlicensed
 * identity in front of judges and passengers, which is a worse outcome than an
 * honest placeholder.
 *
 * Everything below is built against the real mark's constraints, so the swap is
 * one file and no code change.
 *
 * ## Why a wordmark fallback below 32px
 *
 * The real mark is a circular seal with an aircraft above a ship — internal
 * detail inside a circle. That construction turns to mud at small sizes: at
 * 24px the aircraft and the ship become two grey smudges and the reader learns
 * nothing except that there is a logo. So below `md` the lockup renders type
 * only. A wordmark that can be read beats a badge that cannot.
 *
 * ## Rules this component enforces so callers cannot break them
 *
 * - **Never distorted.** The `<img>` is a fixed square with `object-contain`;
 *   there is no prop that can change its aspect ratio.
 * - **Never recoloured.** No `fill`, no CSS filter, no `currentColor`. The
 *   reversed variant is a *different file*, not a tinted one — see below.
 * - **Never on a mid-tone ground.** The badge is navy-on-transparent, so it
 *   needs a light surface. `variant="reversed"` exists for dark grounds and
 *   currently declines to render the badge at all rather than showing the navy
 *   one on navy.
 */

export type LogoSize = 'sm' | 'md' | 'lg';
export type LogoVariant = 'default' | 'reversed';

interface LogoLockupProps {
  /**
   * `sm` (24px) renders the wordmark only — see the note above. `md` (32px) is
   * the sidebar header. `lg` (48px) is the About panel and the gallery.
   */
  size?: LogoSize;
  /** `reversed` is for a dark ground. The asset is pending; see below. */
  variant?: LogoVariant;
  /**
   * Hide the product name and let the mark carry the meaning alone.
   *
   * When the name is shown, the mark is `aria-hidden` — announcing "SCASPA
   * Assistant logo, SCASPA Assistant" is one thing said twice. When it is
   * hidden, the mark takes the accessible name instead.
   */
  nameHidden?: boolean;
  /** Second line under the name. Dropped at `sm`, where there is no room. */
  tagline?: string | undefined;
}

const BADGE_PX: Record<LogoSize, number> = { sm: 24, md: 32, lg: 48 };

/** Below this the seal is illegible, so the badge is not drawn at all. */
const BADGE_MIN_PX = 32;

const NAME_CLASS: Record<LogoSize, string> = {
  sm: 'text-small font-semibold leading-tight',
  md: 'text-body font-semibold leading-tight',
  lg: 'text-h3 font-semibold leading-tight',
};

export function LogoLockup({
  size = 'md',
  variant = 'default',
  nameHidden = false,
  tagline,
}: LogoLockupProps) {
  const px = BADGE_PX[size];

  /*
   * Two reasons the badge may not render, and they are different.
   *
   * 1. Too small — the seal would be mud, so type carries it instead.
   * 2. `reversed`, whose asset has not been supplied. Recolouring the navy mark
   *    to white with a CSS filter is precisely the "never recolour" rule, and
   *    putting the navy badge on a navy ground is the "never on a mid-tone
   *    ground" one. Declining to draw it is the only remaining honest option,
   *    and the wordmark alone reads perfectly well.
   *
   * When the reversed asset arrives: import it, pick between the two here, and
   * delete this comment. Nothing else changes.
   */
  const showBadge = px >= BADGE_MIN_PX && variant === 'default';

  const inverse = variant === 'reversed';

  return (
    <span className="flex min-w-0 items-center gap-2">
      {showBadge ? (
        <img
          src={logoUrl}
          // Square, `object-contain`, and width and height both set from the
          // same number: the aspect ratio cannot be distorted by a caller or by
          // a flex parent.
          width={px}
          height={px}
          className="shrink-0 object-contain"
          style={{ width: px, height: px }}
          /*
           * Announced once, never twice.
           *
           * When the product name is visible beside it, the mark is decorative
           * and gets `alt=""` — the empty string is how you tell a screen reader
           * to skip an image; omitting `alt` entirely makes it read the filename
           * instead. When the name is hidden, the mark carries the meaning and
           * takes the accessible name.
           */
          alt={nameHidden ? 'SCASPA Assistant' : ''}
          aria-hidden={nameHidden ? undefined : true}
        />
      ) : null}

      <span className={cn('min-w-0', nameHidden && 'sr-only')}>
        <span className={cn('block truncate', NAME_CLASS[size], inverse && 'text-ink-inverse')}>
          SCASPA Assistant
        </span>
        {tagline && size !== 'sm' ? (
          <span
            // On navy, `blue-100` measures 8.27:1 — the muted ink used on a
            // light surface would be unreadable there.
            className={cn(
              'block truncate text-caption',
              inverse ? 'text-blue-100' : 'text-ink-subtle'
            )}
          >
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
