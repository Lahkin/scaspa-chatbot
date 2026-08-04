import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ProvenanceBadge } from './ProvenanceBadge';
import type { DataSource } from '@/lib/types';

/**
 * Says where a table of operational data came from — spec board 17.
 *
 * **This is the most important component in the operations screens, and it is
 * the least interesting to look at.**
 *
 * An arrivals board is believed on sight. Nothing in a row of "MV SAMPLE
 * CARRIER · AT BERTH · Berth 1" tells a reader whether they are looking at a
 * live feed, at development fixtures, or at data six hours stale — and the more
 * convincing the table, the more completely the question stops being asked.
 *
 * ## Only the live banner can be dismissed, and that is the whole rule
 *
 * "Only the live banner carries a dismiss control, and live is the one kind
 * that cannot currently occur. A notice that says the data is not real must
 * outlive the user's patience with it."
 *
 * So `fixture` and `unavailable` have no close button at all — not a hidden
 * one, not a disabled one. The only dismissible case is the one that says
 * everything is fine, which is also the one that never happens today.
 *
 * Deliberately above the data, not below it: a warning under a table is read
 * after the number has already been believed.
 */
export function SourceNotice({ source, className }: { source: DataSource; className?: string }) {
  const [dismissed, setDismissed] = useState(false);

  // A live feed with nothing to say, or one the user has dismissed.
  if (source.kind === 'live' && (dismissed || !source.notice)) return null;
  if (!source.notice) return null;

  const fixture = source.kind === 'fixture';
  const live = source.kind === 'live';

  return (
    <div
      // `status`, not `alert`. It is a standing condition of the screen, not an
      // event — `alert` would interrupt a screen-reader user mid-sentence every
      // time the table re-fetched.
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3.5 rounded-input border px-5 py-3.5',
        fixture && 'border-caution/30 bg-caution-tint',
        live && 'border-live/30 bg-live-tint',
        !fixture && !live && 'border-border bg-surface-muted',
        className
      )}
    >
      <ProvenanceBadge kind="source" value={source.kind} />

      <p className="min-w-0 flex-1 text-body text-ink">{source.notice}</p>

      {source.as_of ? (
        <span className="shrink-0 text-caption font-medium text-ink-muted tabular">
          {stamp(source.kind, source.as_of)}
        </span>
      ) : null}

      {/*
       * The dismiss control exists for exactly one kind. See the note above —
       * this is not a styling choice, it is what stops "sample data" being
       * clicked away five minutes into a shift.
       */}
      {live ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss the data source notice"
          className="flex size-7 shrink-0 items-center justify-center rounded-ghost text-ink-muted hover:bg-surface hover:text-ink"
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * "as of" for data that is current; "last known" for data that is not.
 *
 * 24-hour with the zone and the date — `06:10 AST, 1 Aug 2026`, which is how the
 * board writes it and what §10 fixes. It was `toLocaleString()`, which on a
 * US-configured browser renders `8/1/2026, 6:10:00 AM`: a 12-hour clock with no
 * zone, on a banner read by agents who work in AST whatever their laptop says.
 */
const STAMP = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function stamp(kind: DataSource['kind'], asOf: string): string {
  const when = new Date(asOf);
  const text = Number.isNaN(when.getTime()) ? asOf : STAMP.format(when);
  return kind === 'unavailable' ? `last known ${text}` : `as of ${text}`;
}

/**
 * When the data was produced, next to the heading.
 *
 * Rendered from `as_of` and nothing else — never from the time the request was
 * made. A screen that says "updated just now" because *it* refreshed, while the
 * feed behind it last moved at 06:00, is worse than showing no time at all.
 *
 * The stamp is the banner's, not `toLocaleString()`: this line sits directly
 * above the banner on every operations screen, and the two were writing the same
 * instant in two formats — `8/1/2026, 6:10:00 AM` here and `06:10 AST, 1 Aug
 * 2026` below it.
 */
export function SourceAge({ source }: { source: DataSource }) {
  if (!source.as_of) {
    return <span className="text-caption text-ink-muted">Age of this data is unknown</span>;
  }
  const when = new Date(source.as_of);
  if (Number.isNaN(when.getTime())) return null;

  return (
    <span className="text-caption text-ink-muted">
      {source.label} · as of{' '}
      <time dateTime={source.as_of} className="tabular">
        {STAMP.format(when)}
      </time>
    </span>
  );
}
