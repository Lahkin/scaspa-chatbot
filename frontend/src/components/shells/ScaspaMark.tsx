/**
 * The SCASPA mark.
 *
 * A wordmark, not a logo file. The real asset is a client deliverable and has not
 * been supplied; inventing one — or lifting the image off scaspa.com — would put a
 * fake identity in front of judges and passengers. So this is honest typography
 * that reads as a placeholder to anyone who knows, and as a title to anyone who
 * does not, and swapping it for the real asset is a one-file change.
 */
export function ScaspaMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-navy text-caption font-bold text-ink-inverse"
      >
        SC
      </span>
      <span className="min-w-0">
        <span
          className={
            compact
              ? 'block truncate text-small leading-tight font-semibold'
              : 'block truncate text-body leading-tight font-semibold'
          }
        >
          SCASPA Assistant
        </span>
        {!compact && (
          <span className="hidden text-caption text-ink-subtle sm:block">
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
