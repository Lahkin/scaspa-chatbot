import { cn } from '@/lib/cn';
import type { DataSource } from '@/lib/types';

/**
 * Says where a table of operational data came from.
 *
 * **This is the most important component in the operations screens, and it is
 * the least interesting to look at.**
 *
 * An arrivals board is believed on sight. Nothing in a row of "MV SAMPLE
 * CARRIER · AT BERTH · Berth 1" tells a reader whether they are looking at a
 * live feed, at development fixtures, or at data six hours stale — and the more
 * convincing the table, the more completely the question stops being asked. The
 * backend refuses to build a `fixture` or `unavailable` source without a
 * `notice`; this renders it.
 *
 * Deliberately not dismissible and deliberately above the data, not below it.
 * A warning under a table is read after the number has already been believed.
 */
export function SourceNotice({ source, className }: { source: DataSource; className?: string }) {
  // A live feed has nothing to apologise for; its age is shown by `SourceAge`
  // beside the heading instead of as a banner.
  if (source.kind === 'live' || !source.notice) return null;

  const isFixture = source.kind === 'fixture';

  return (
    <div
      // `status`, not `alert`. It is a standing condition of the screen, not an
      // event — `alert` would interrupt a screen-reader user mid-sentence every
      // time the table re-fetched.
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border p-3',
        isFixture
          ? 'border-ops-alert-ink/30 bg-ops-alert-fill text-ops-alert-ink'
          : 'border-ops-outline-variant bg-ops-surface-low text-ops-ink-variant',
        className
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 font-semibold">
        {isFixture ? '!' : 'i'}
      </span>
      <p className="text-small">{source.notice}</p>
    </div>
  );
}

/**
 * When the data was produced, next to the heading.
 *
 * Rendered from `as_of` and nothing else — never from the time the request was
 * made. A screen that says "updated just now" because *it* refreshed, while the
 * feed behind it last moved at 06:00, is worse than showing no time at all.
 */
export function SourceAge({ source }: { source: DataSource }) {
  if (!source.as_of) {
    return <span className="text-caption text-ops-ink-variant">Age of this data is unknown</span>;
  }
  const when = new Date(source.as_of);
  if (Number.isNaN(when.getTime())) return null;

  return (
    <span className="text-caption text-ops-ink-variant">
      {source.label} · as of <time dateTime={source.as_of}>{when.toLocaleString()}</time>
    </span>
  );
}
