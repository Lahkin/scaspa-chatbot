import { cn } from '@/lib/cn';

/**
 * The SCASPA mark.
 *
 * A wordmark, not a logo file. The real asset is a client deliverable and has not
 * been supplied; inventing one — or lifting the image off scaspa.com — would put a
 * fake identity in front of judges and passengers. So this is honest typography
 * that reads as a placeholder to anyone who knows, and as a title to anyone who
 * does not, and swapping it for the real asset is a one-file change.
 */
export function ScaspaMark({
  compact = false,
  /**
   * For a navy ground — the widget's `--grad-rail` header.
   *
   * The navy tile would disappear into it, so reversed inverts the tile to a
   * light chip with navy type rather than recolouring the type on a navy tile
   * that is no longer distinguishable from its surroundings. Same reasoning as
   * `LogoLockup`'s reversed variant, and the same rule: never a mid-tone
   * ground, never a tinted asset.
   */
  reversed = false,
}: {
  compact?: boolean;
  reversed?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-sm text-caption font-bold',
          reversed ? 'bg-neutral-0 text-navy' : 'bg-navy text-ink-inverse'
        )}
      >
        SC
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate leading-tight font-semibold',
            compact ? 'text-small' : 'text-body',
            reversed && 'text-on-navy-primary'
          )}
        >
          SCASPA Assistant
        </span>
        {!compact && (
          <span
            className={cn(
              'hidden text-caption sm:block',
              reversed ? 'text-on-navy-secondary' : 'text-ink-subtle'
            )}
          >
            Ports and travel, St. Kitts
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * SCASPA's switchboard. `tel:` with the full international form so it dials
 * correctly from a foreign handset, which is what a cruise passenger is holding.
 */
export const SCASPA_PHONE_HREF = 'tel:+18694658121';
