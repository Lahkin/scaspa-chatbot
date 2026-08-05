import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ErrorState } from '@/components/chat/ErrorState';
import { ProvenanceBadge } from './ProvenanceBadge';
import type { Density } from './OpsTable';
import { formatCountdown } from '@/features/chat/rateLimits';
import { OFFLINE } from '@/features/chat/errorCopy';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import type { ApiError } from '@/lib/api';

/**
 * The table's four non-populated states — §5.7.
 *
 * ## The two empty states are distinct on purpose
 *
 * > "One is about the source, one is about the query. They lead to different
 * > actions."
 *
 * A table that is empty because no feed is connected cannot be fixed by
 * changing a filter, and a table that is empty because of a filter is not a
 * fault in the service. Collapsing them into one "no results" panel sends half
 * the readers to the wrong remedy.
 */

/**
 * No feed connected. The production default, and a statement about the service.
 *
 * The department is a prop because the screen decides it. §5.7 writes the vessel
 * copy — "Telephone Marine Operations on 869 465 8121" — and the flights screen
 * inherited it verbatim, so a passenger whose arrivals board was empty was being
 * told to ring the harbour. Both departments are on the published list in §1.4;
 * neither is invented, and the number is the one switchboard either way.
 */
export function NoFeedState({
  noun = 'vessel',
  department = 'Marine Operations',
}: {
  noun?: string;
  department?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <ProvenanceBadge kind="source" value="unavailable" />
      <h3 className="text-section font-semibold text-ink">No {noun} feed is connected</h3>
      <p className="max-w-105 text-label leading-5 text-ink-muted">
        This assistant has no source of {noun} movements at the moment. Telephone {department} on{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-brand-200 underline tabular">
          {SCASPA_TEL_TEXT}
        </a>
        .
      </p>
    </div>
  );
}

/**
 * Filtered to nothing — §5.7 and §2.4's zero-results panel.
 *
 * The active filters are named as removable chips, because "a forgotten filter
 * looks exactly like missing data", and one primary action clears them.
 */
export function FilteredOutState({
  filters,
  onClear,
  onRemove,
  noun = 'movements',
}: {
  filters: readonly { label: string; onRemove?: () => void }[];
  onClear: () => void;
  onRemove?: (label: string) => void;
  noun?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-5 rounded-panel border border-border bg-surface px-8 py-9">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-input bg-surface-muted text-brand-300"
      >
        <Icon name="filter" size={20} />
      </span>
      <h3 className="text-section font-semibold text-ink">No {noun} match these filters</h3>
      <p className="max-w-105 text-body text-ink-muted">
        Nothing in the record matches every filter at once. Remove one, or clear them all and start
        again.
      </p>

      {filters.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <li key={filter.label}>
              <button
                type="button"
                onClick={() => (filter.onRemove ?? (() => onRemove?.(filter.label)))()}
                aria-label={`Remove the filter ${filter.label}`}
                className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-border bg-surface-muted pr-1.5 pl-3 text-label font-medium text-ink-muted hover:text-ink"
              >
                {filter.label}
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-11 items-center gap-2 rounded-button bg-brand-500 px-4.5 text-body font-medium text-ink-inverse hover:bg-brand-600 active:bg-brand-700 sm:h-10"
      >
        <Icon name="refresh" size={16} />
        Clear filters
      </button>
    </div>
  );
}

/**
 * The skeleton — §5.7.
 *
 * > "**Column headers stay** so the shape is stable. Rows keep their 44px
 * > height; cells become 9–10px bars, `border-radius: 5px`, `--surface-3`, at
 * > 50–80% widths. No pulse under `prefers-reduced-motion`."
 *
 * The headers staying is the point: a table that dissolves entirely and then
 * reappears has moved every column twice, and the reader re-finds the one they
 * were reading each time.
 */
export function TableSkeleton({
  columns,
  rows = 5,
  density = 'comfortable',
}: {
  columns: readonly string[];
  rows?: number;
  /**
   * §7.5: "Rows keep their **real** height (44px/36px)." The skeleton ignored
   * the toggle, so switching to compact and refetching moved every row twice —
   * once as the skeleton drew tall, once as the real rows came back short. "No
   * layout shift in any loading state."
   */
  density?: Density;
}) {
  // Fixed widths per column index rather than random: a skeleton that reshuffles
  // on every render reads as content arriving when nothing has.
  const widths = ['80%', '55%', '50%', '65%', '60%', '70%'];

  return (
    <section className="overflow-hidden rounded-panel border border-border bg-surface">
      <table className="w-full border-collapse">
        <caption className="sr-only">Loading</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-border px-5 py-2.5 text-left text-micro font-semibold tracking-eyebrow text-ink-muted uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr
              key={row}
              className={cn(
                'border-b border-border last:border-b-0',
                density === 'compact' ? 'h-row-compact' : 'h-row-comfortable'
              )}
            >
              {columns.map((column, index) => (
                <td key={column} className="px-5">
                  <span
                    aria-hidden="true"
                    className="block h-2.5 rounded-tiny bg-surface-muted motion-safe:animate-pulse"
                    style={{ width: widths[index % widths.length] }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sr-only" role="status">
        Loading
      </p>
    </section>
  );
}

/**
 * Rate limited — §5.7.
 *
 * Names the published budget, because "sixty a minute" is actionable where
 * "too many requests" is not, and counts down from `Retry-After` alone.
 *
 * ## The countdown runs, and the button comes back at zero
 *
 * §1.3's retry control: "Disabled state is the countdown … **Re-enables at
 * zero**." A frozen `Refresh in 0:18` is worse than no number at all — it says
 * the wait is over in eighteen seconds and then never says anything again, so
 * the reader reloads the page to find out.
 *
 * `Retry-After` is the only figure here. There is no remaining-quota number
 * anywhere in the product: the backend computes `Decision.remaining` and drops
 * it, and §7.2 forbids building a meter from anything else.
 */
export function RateLimitedState({
  retryAfterS,
  onRetry,
}: {
  /** Seconds, from `Retry-After`. **Null when the header was unreadable** — and
   *  then there is no countdown, because a made-up wait is a made-up number. */
  retryAfterS: number | null;
  onRetry?: (() => void) | undefined;
}) {
  const remaining = useCountdown(retryAfterS ?? 0);
  const waiting = retryAfterS !== null && remaining > 0;

  return (
    <div
      // `alert`: the request the reader just made did not happen, and a table
      // that quietly stays empty reads as "nothing to show".
      role="alert"
      className="flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8"
    >
      <Icon name="clock" size={20} className="text-caution" />
      <h3 className="text-section font-semibold text-ink">Too many requests</h3>
      <p className="text-label leading-5 text-ink-muted">
        Sixty a minute is the limit on operations data.
      </p>
      <button
        type="button"
        disabled={waiting}
        onClick={onRetry}
        className="inline-flex h-11 items-center gap-2 rounded-button border border-border px-4.5 text-body font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-disabled sm:h-10"
      >
        <Icon name={waiting ? 'clock' : 'refresh'} size={16} />
        {waiting ? (
          <span className="tabular">Refresh in {formatCountdown(remaining)}</span>
        ) : (
          'Try again'
        )}
      </button>
    </div>
  );
}

/**
 * A request that failed, in the table's place — §5.7 and §7.1.
 *
 * ## An error is not an empty result
 *
 * Both screens rendered `[]` on failure and fell through to "No movements match
 * these filters": an offer to clear filters the reader may not have set, over
 * data that was never fetched. The rate limit gets §5.7's own card because the
 * handoff draws one and because "sixty a minute" is actionable; every other code
 * gets the shared envelope, so the same event does not get two treatments across
 * screens.
 *
 * One component rather than the same ternary on two routes: the third operations
 * screen should not have to re-derive which failures are special.
 */
export function TableError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.status === 429) {
    return <RateLimitedState retryAfterS={error.retryAfter} onRetry={onRetry} />;
  }
  return (
    <ErrorState
      // Offline is not a server fault, and saying "something went wrong at our
      // end" to somebody on dead hotel wifi sends them to ring about our uptime.
      kind={error.offline ? OFFLINE : error.code}
      requestId={error.requestId}
      onRetry={onRetry}
    />
  );
}

/**
 * Counts `seconds` down to zero.
 *
 * Counts *elapsed ticks* rather than comparing against a deadline: a deadline
 * needs `Date.now()` during render, and re-seeding a decrementing counter from
 * an effect is a setState inside an effect — one cascading render per tick.
 * The same shape as `ErrorState`'s, which counts the chat limit down.
 */
function useCountdown(seconds: number): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return Math.max(0, seconds - elapsed);
}
