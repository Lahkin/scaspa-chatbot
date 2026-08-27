import { useState } from 'react';
import { Icon, Segmented } from '@/components/ui';
import { AskPilot } from '@/components/ops/AskPilot';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { SourceAge } from '@/components/ops/SourceNotice';
import { FilteredOutState, TableError, TableSkeleton } from '@/components/ops/TableStates';
import type { Density } from '@/components/ops/OpsTable';
import { useCruiseSchedule } from '@/features/ops/queries';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { addDays, portToday } from '@/lib/portDate';
import { CruiseSummary } from './CruiseSummary';
import { CruiseTable } from './CruiseTable';
import { NothingPublished, ScheduleUnavailable } from './CruiseStates';

/**
 * Section A of Cruise & Vessel Activity — **the published SCASPA schedule**.
 *
 * This is the only operational surface in the product with a real source behind
 * it: Watchtower fetches the Authority's own endpoint every six hours and the
 * rows below are what it published. Section B, the live vessel and AIS panel, is
 * a separate component under a separate heading, and the brief is explicit about
 * why — "do not mix the two". A schedule and a position report answer different
 * questions with different certainties, and a screen that interleaves them
 * lends the schedule's authority to positions nobody is reporting.
 *
 * ## Two empty tables, meaning opposite things
 *
 * `published` with no calls means **SCASPA has published none for these dates**,
 * which is an ordinary answer: there are quiet weeks. `unavailable` means Pilot
 * has not managed to retrieve the schedule at all, which is a statement about
 * this service. They render as different panels because they lead to different
 * actions, and collapsing them would let an outage read as a quiet week.
 *
 * A third case — a filter that matched nothing — is the existing
 * `FilteredOutState`, because a forgotten search term looks exactly like missing
 * data.
 */

const COLUMNS = ['Date', 'Time', 'Vessel', 'Cruise line', 'Pier', 'PAX', 'Capacity'] as const;

/**
 * `MAX_LIMIT` on the endpoint. There is no `offset` and no paging: the API
 * truncates and reports `total`, so the page states the truncation rather than
 * offering a page 2 that does not exist.
 */
const LIMIT = 100;

type Range = 'today' | 'tomorrow' | 'week' | 'upcoming';

const RANGES: readonly { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  /*
   * The fourth control, which the brief does not list.
   *
   * Without it the search box can only find a ship inside the selected window,
   * so "when is SAMPLE VOYAGER next in?" is unanswerable unless the reader
   * already knows roughly when — which is the question. Recorded in
   * docs/decisions.md 0040.
   */
  { value: 'upcoming', label: 'All upcoming' },
];

/** The window each control asks for. `until: null` means "no end date". */
function rangeWindow(range: Range, today: string): { since: string; until: string | null } {
  switch (range) {
    case 'today':
      return { since: today, until: today };
    case 'tomorrow':
      return { since: addDays(today, 1), until: addDays(today, 1) };
    case 'week':
      // Seven calendar days including today, which is what "this week" means to
      // somebody planning one — not the seven days from Monday.
      return { since: today, until: addDays(today, 6) };
    case 'upcoming':
      return { since: today, until: null };
  }
}

export function CruiseSchedule() {
  const [range, setRange] = useState<Range>('week');
  const [search, setSearch] = useState('');
  const [density, setDensity] = useState<Density>('comfortable');

  /*
   * Today is computed once per render from the PORT's clock, not the reader's
   * and not UTC. See `lib/portDate.ts` — an evening reader in St Kitts is four
   * hours from a UTC date that has already rolled over, and would be shown
   * tomorrow's ships under a heading reading "Today".
   */
  const today = portToday();
  const { since, until } = rangeWindow(range, today);

  // Settles 300ms after typing stops. Every distinct term is a query key, a
  // request and a rate-limit slot, and that budget is shared with the chat path.
  const vessel = useDebouncedValue(search.trim());

  const query = useCruiseSchedule({
    since,
    ...(until ? { until } : {}),
    ...(vessel ? { vessel } : {}),
    limit: LIMIT,
  });

  /*
   * The summary tiles read their own query — the full week, unfiltered — rather
   * than counting the rows on screen. Those are two different questions: the
   * table shows whatever range and search the reader has selected, and "cruise
   * calls today" must not change because somebody typed a vessel name.
   *
   * When the reader is already on the unfiltered week these two calls have
   * identical keys, so React Query serves both from one request.
   */
  const summary = useCruiseSchedule({
    since: today,
    until: addDays(today, 6),
    limit: LIMIT,
  });

  const data = query.data;
  const source = data?.source;
  const calls = data?.calls ?? [];
  const truncated = data ? data.total > data.calls.length : false;

  const toolbar = (
    <>
      <Segmented label="Date range" size="sm" value={range} onChange={setRange} options={RANGES} />

      <div className="flex h-11 w-60 max-w-full items-center gap-2.5 rounded-input border border-border bg-surface-muted px-3 focus-within:border-brand-500 sm:h-9">
        <Icon name="search" size={16} className="text-ink-muted" />
        <label htmlFor="cruise-search" className="sr-only">
          Search the published schedule by vessel name
        </label>
        <input
          id="cruise-search"
          type="search"
          value={search}
          placeholder="Vessel name"
          onChange={(event) => setSearch(event.target.value)}
          className="h-full w-full bg-transparent text-label text-ink outline-none placeholder:text-ink-disabled"
        />
      </div>

      <span className="flex-1" />

      {/*
        Refresh is a button, never a timer. The source behind it moves every six
        hours; a page that polled would spend a rate-limit slot a minute to
        re-learn the same snapshot. See the note in `features/ops/queries.ts`.
      */}
      <button
        type="button"
        onClick={() => void query.refetch()}
        disabled={query.isFetching}
        className="inline-flex h-11 items-center gap-2 rounded-button border border-border px-3.5 text-label font-medium text-ink hover:bg-surface-muted disabled:text-ink-disabled sm:h-9"
      >
        <Icon name="refresh" size={16} />
        {query.isFetching ? 'Checking…' : 'Refresh'}
      </button>

      <Segmented
        label="Density"
        size="sm"
        value={density}
        onChange={setDensity}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
      />
    </>
  );

  return (
    <section className="space-y-4" aria-labelledby="cruise-schedule-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="cruise-schedule-heading" className="text-section font-semibold text-ink">
          Official SCASPA cruise schedule
        </h2>
        {/*
          The badge and the stamp are one claim in two halves: PUBLISHED says
          the Authority stands behind these rows, CHECKED says when Pilot last
          looked. Either alone is the misleading version.
        */}
        {source ? <ProvenanceBadge kind="source" value={source.kind} /> : null}
        {source ? <SourceAge source={source} /> : null}
      </div>

      {/*
        Tiles only when there is a retrieved schedule to derive them from. With
        nothing fetched they would be three em dashes above a panel explaining
        that nothing was fetched — "do not populate empty dashboards with dashes
        just to preserve layout".
      */}
      {source?.kind === 'unavailable' ? null : (
        <CruiseSummary week={summary.data} today={today} loading={summary.isPending} />
      )}

      {query.isPending ? (
        <TableSkeleton columns={COLUMNS} density={density} />
      ) : query.error ? (
        // A failed request is not an empty schedule. Rendering it as one would
        // tell a passenger no ships are coming because a request timed out.
        <TableError error={query.error} onRetry={() => void query.refetch()} />
      ) : source?.kind === 'unavailable' ? (
        <ScheduleUnavailable />
      ) : calls.length === 0 && vessel ? (
        <FilteredOutState
          noun="cruise calls"
          filters={[{ label: `“${vessel}”`, onRemove: () => setSearch('') }]}
          onClear={() => {
            setSearch('');
            setRange('week');
          }}
        />
      ) : calls.length === 0 ? (
        <NothingPublished range={range} onWiden={() => setRange('upcoming')} />
      ) : (
        <CruiseTable
          calls={calls}
          density={density}
          toolbar={toolbar}
          footer={
            truncated ? (
              /*
               * Said out loud rather than silently cut. `total` is the server's
               * count before the limit, so a reader who is not shown all of it
               * is told how much is missing and what to do about it — a table
               * that quietly stops at 100 reads as a schedule that stops at 100.
               */
              <p className="px-5 py-3 text-caption text-ink-muted">
                Showing the first <span className="tabular">{calls.length}</span> of{' '}
                <span className="tabular">{data?.total}</span> published calls. Narrow the range or
                search for a vessel to see the rest.
              </p>
            ) : null
          }
        />
      )}

      {/* §25's bridge: the board says which ship, the assistant says what it means. */}
      <div className="flex flex-wrap gap-2">
        <AskPilot question="What cruise ships are in port today?" />
        <AskPilot question="What is there to do near Port Zante?" />
      </div>
    </section>
  );
}
