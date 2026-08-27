import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Icon, Segmented } from '@/components/ui';
import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { OpsShell } from '@/components/shells/OpsShell';
import { SourceNotice } from '@/components/ops/SourceNotice';
import { OpsCell, OpsRow, OpsRowCard, OpsTable, type Density } from '@/components/ops/OpsTable';
import {
  FilteredOutState,
  NoFeedState,
  TableError,
  TableSkeleton,
} from '@/components/ops/TableStates';
import { Pagination } from '@/components/ops/console/Pagination';
import { VesselStatusChip } from '@/components/ops/StatusChip';
import { ActualTime, EstimatedTime } from '@/components/ops/TimeCell';
import { useVessels } from '@/features/ops/queries';
import { FACILITY_FILTERS, facilityParam } from '@/features/ops/facilities';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import type { Facility, VesselStatus } from '@/lib/types';

/**
 * Vessels — §5.4, and the primitives of §5.1.
 *
 * Columns: **Vessel · Type · Berth · ETA · ATA · Status**.
 * Toolbar: a 240px search, a status filter, a spacer, the density toggle.
 *
 * ## Why ETA and ATA are two columns and never one
 *
 * > "One is a prediction, one is a record. **That distinction is the entire
 * > point of having two fields.**"
 *
 * An operations table naturally wants a single "Time" column. Collapsing them is
 * how a prediction gets read as a fact by somebody deciding whether to drive to
 * a port. All four combinations are drawn — `~11:15 / —`, `~06:30 / 06:40`,
 * `— / 05:55`, `— / —` — and none of them guesses.
 *
 * ## This screen used to be a list of cards at every width
 *
 * §5.1 requires real `<table>` semantics and §5.8 puts the card treatment below
 * 640px only. The old screen had three tiles that were not the handoff's four,
 * no status filter, no density toggle, no pagination and no column headings at
 * all — so nothing above the rows said what the values were.
 */

const COLUMNS = ['Vessel', 'Type', 'Berth', 'ETA', 'ATA', 'Status'] as const;
/** §5.4: `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr`, in the order above. */
const WIDTHS = [1.5, 0.9, 0.8, 1, 1, 1] as const;
const PAGE_SIZE = 25;

/** §5.4: five values, and "All statuses" is the closed default. */
const STATUS_FILTERS: readonly { value: VesselStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'scheduled', label: 'Expected' },
  { value: 'en_route', label: 'En route' },
  { value: 'at_berth', label: 'Alongside' },
  { value: 'departed', label: 'Departed' },
  { value: 'unknown', label: 'Not reported' },
];

function VesselsRoute() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VesselStatus | 'all'>('all');
  const [facility, setFacility] = useState<Facility | 'all'>('all');
  const [density, setDensity] = useState<Density>('comfortable');
  const [offset, setOffset] = useState(0);

  /*
   * Both filters go to the SERVER, and `total` comes back matching them.
   *
   * The status filter used to be applied in the client, on the note that "the
   * endpoint takes no status parameter". It does — `GET /api/vessels?status=` —
   * and `total` is computed after filtering. Filtering in the client filtered
   * the twenty-five rows of the current PAGE while the readout went on saying
   * "Showing 1–25 of 100", so a status with two matches on page 3 looked like a
   * status with no matches at all.
   *
   * Nothing here is counted from the visible rows; `total` stays the server's
   * figure — implementation requirement #5.
   */
  /*
   * The term the SERVER sees, which is not the term in the box.
   *
   * `search` updates per keystroke so the field stays responsive; `q` settles
   * 300ms after typing stops. Every distinct `q` is a query key, a request and a
   * rate-limit slot — and that budget is shared with the chat path, so a field
   * that fired per letter would spend the questions the user has not asked yet.
   */
  const q = useDebouncedValue(search.trim());

  const facilityFilter = facilityParam(facility);

  const query = useVessels({
    limit: PAGE_SIZE,
    offset,
    ...(q ? { q } : {}),
    ...(status === 'all' ? {} : { status }),
    ...(facilityFilter ? { facility: facilityFilter } : {}),
  });

  const data = query.data;
  const source = data?.source;

  /*
   * No feed at all, as opposed to a filter that matched nothing.
   *
   * Both produce an empty table and they need opposite remedies: one is a
   * statement about the SERVICE and the other about the QUERY. Naming it once
   * here keeps the metric row and the panel below agreeing about which is on
   * screen.
   */
  const vessels = data?.vessels ?? [];
  const noFeed = source?.kind === 'unavailable' && vessels.length === 0;

  /** Back to the first page: page 3 of a new result set is somebody else's page. */
  const clearSearch = () => {
    setSearch('');
    setOffset(0);
  };
  const clearStatus = () => {
    setStatus('all');
    setOffset(0);
  };

  /*
   * Every filter that can empty the table must be listed here. The toolbar
   * lives inside `OpsTable`, so when `FilteredOutState` replaces the table the
   * controls go with it — a filter this array omits is a filter with no way
   * back, leaving the reader on an empty screen whose only remedy is a reload.
   */
  const filters = [
    ...(search.trim() ? [{ label: `“${search.trim()}”`, onRemove: clearSearch }] : []),
    ...(status === 'all'
      ? []
      : [
          {
            label: STATUS_FILTERS.find((f) => f.value === status)?.label ?? status,
            onRemove: clearStatus,
          },
        ]),
    ...(facility === 'all'
      ? []
      : [
          {
            label: FACILITY_FILTERS.find((f) => f.value === facility)?.label ?? facility,
            onRemove: () => {
              setFacility('all');
              setOffset(0);
            },
          },
        ]),
  ];

  const toolbar = (
    <>
      {/* 240px, and the placeholder names the field — §1.4 type 3. */}
      <div className="flex h-11 w-60 max-w-full items-center gap-2.5 rounded-input border border-border bg-surface-muted px-3 focus-within:border-brand-500 sm:h-9">
        <Icon name="search" size={16} className="text-ink-muted" />
        <label htmlFor="vessel-search" className="sr-only">
          Search vessel name or IMO
        </label>
        <input
          id="vessel-search"
          type="search"
          value={search}
          placeholder="Vessel name or IMO"
          onChange={(event) => {
            setSearch(event.target.value);
            // Back to the first page: staying on page 3 of a new result set
            // shows an empty table for a search that matched plenty.
            setOffset(0);
          }}
          className="h-full w-full bg-transparent text-label text-ink outline-none placeholder:text-ink-disabled"
        />
      </div>

      <label htmlFor="vessel-facility" className="sr-only">
        Filter by facility
      </label>
      <select
        id="vessel-facility"
        value={facility}
        onChange={(event) => {
          setFacility(event.target.value as Facility | 'all');
          setOffset(0);
        }}
        className="h-11 rounded-input border border-border bg-surface-muted px-3 text-label text-ink sm:h-9"
      >
        {FACILITY_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="vessel-status" className="sr-only">
        Filter by status
      </label>
      <select
        id="vessel-status"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value as VesselStatus | 'all');
          setOffset(0);
        }}
        className="h-11 rounded-input border border-border bg-surface-muted px-3 text-label text-ink sm:h-9"
      >
        {STATUS_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <span className="flex-1" />

      {/* Right-aligned, 26px segments — §5.1. */}
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
    <OpsShell
      title="Vessel movements"
      intro="Arrivals and berth occupancy across SCASPA port facilities."
      // 0032 layer 4: the hatch behind the table. The rows here are an
      // `OpsTable` rather than a provenance card, so the shell carries it.
      source={source}
    >
      {/*
        §5.2's banner — above the tiles, full width, never dismissible for the
        two kinds that can actually occur.

        It is rendered here rather than by the shell. `OpsPage` drew it for every
        screen, which was right while every screen was a table with no meta strip
        of its own; `OpsShell` carries no data and cannot. Exactly one banner per
        screen is still the rule, and `/tariffs` deliberately has none because
        every payload on it is a provenance card already.
      */}
      {source ? <SourceNotice source={source} /> : null}

      {/*
        ── FOUR EMPTY TILES ARE NOT AN HONEST EMPTY STATE ─────────────────────
        With no feed connected — the production default — every one of these
        read "— / not reported". Four cards of nothing, above a panel that then
        explained there was nothing. It looked like software that had failed to
        load rather than a service that has not been connected, and it pushed
        the one sentence worth reading below the fold.

        The tiles are for a screen that HAS figures. When there are none, the
        statement below is the whole content of the screen.
      */}
      {noFeed ? null : (
        <MetricRow columns={4}>
          <MetricTile label="Vessels in port" value={data?.metrics.vessels_at_berth ?? null} />
          {/*
          `arrivals_today` — a calendar day, which is what the label says.
          UNBLOCKED in M2: this read `arrivals_next_24h`, a rolling window, as
          the nearest figure the wire carried. The two agree at midday and
          diverge every evening, and the tile claims the calendar day.
          Null until a feed fills it, which is the em-dash treatment.
        */}
          <MetricTile label="Expected today" value={data?.metrics.arrivals_today ?? null} />
          {/*
          **The single most dangerous default in the product.** The feed does not
          report berth occupancy, so this tile is the em dash — never 0, which
          would say the port is empty.
        */}
          <MetricTile label="Berth occupancy" value={null} />
          <MetricTile
            label="Alongside of expected"
            value={data?.metrics.vessels_at_berth ?? null}
            /*
             * Both operands are server figures; nothing here is counted from the
             * visible rows. Null when either is missing — half a ratio is a
             * stronger claim than none.
             */
            ratio={
              data?.metrics.vessels_at_berth != null && data.metrics.arrivals_next_24h != null
                ? `/ ${data.metrics.vessels_at_berth + data.metrics.arrivals_next_24h}`
                : null
            }
          />
        </MetricRow>
      )}

      {query.isPending ? (
        <TableSkeleton columns={COLUMNS} density={density} />
      ) : /*
       * A failed request is not an empty result, and it used to render as one:
       * `vessels` is `[]` on any failure, so a 429 and a 500 both fell through
       * to "No movements match these filters" — a panel offering to clear
       * filters the reader may never have set, over data that was never
       * fetched.
       */
      query.error ? (
        <TableError error={query.error} onRetry={() => void query.refetch()} />
      ) : noFeed ? (
        // A statement about the SERVICE, not about the query.
        <NoFeedState
          noun="vessel"
          alternatives={[
            { label: 'Published tariffs', to: '/tariffs' },
            { label: 'Contact SCASPA', to: '/support' },
            { label: 'Ask Pilot', to: '/chat' },
          ]}
        />
      ) : vessels.length === 0 ? (
        // A statement about the QUERY. Different remedy, different panel.
        <FilteredOutState
          filters={filters}
          onClear={() => {
            setSearch('');
            setStatus('all');
            setFacility('all');
            setOffset(0);
          }}
        />
      ) : (
        <OpsTable
          caption="Vessel movements"
          columns={COLUMNS}
          widths={WIDTHS}
          toolbar={toolbar}
          density={density}
          footer={
            <Pagination
              offset={offset}
              limit={PAGE_SIZE}
              total={data?.total ?? 0}
              onOffsetChange={setOffset}
              noun="vessel movements"
            />
          }
          cards={vessels.map((vessel) => (
            <OpsRowCard
              key={vessel.id}
              title={vessel.name}
              status={<VesselStatusChip status={vessel.status} size="sm" />}
              fields={[
                { label: 'Berth', value: vessel.berth || '—' },
                { label: 'Type', value: vessel.vessel_type || '—' },
                { label: 'ETA', value: <EstimatedTime value={vessel.eta} /> },
                { label: 'ATA', value: <ActualTime value={vessel.ata} /> },
              ]}
            />
          ))}
        >
          {vessels.map((vessel) => (
            <OpsRow key={vessel.id} density={density}>
              <OpsCell first>{vessel.name}</OpsCell>
              <OpsCell>{vessel.vessel_type || '—'}</OpsCell>
              <OpsCell>{vessel.berth || '—'}</OpsCell>
              <OpsCell numeric>
                <EstimatedTime value={vessel.eta} />
              </OpsCell>
              <OpsCell numeric>
                <ActualTime value={vessel.ata} />
              </OpsCell>
              <OpsCell>
                <VesselStatusChip status={vessel.status} size="sm" />
              </OpsCell>
            </OpsRow>
          ))}
        </OpsTable>
      )}
    </OpsShell>
  );
}

export const Route = createFileRoute('/vessels')({
  component: VesselsRoute,
  head: () => ({
    meta: [
      { title: 'Vessel movements — Pilot' },
      {
        name: 'description',
        content: 'Vessel arrivals and berth occupancy across SCASPA port facilities.',
      },
    ],
  }),
});
