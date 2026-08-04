import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Icon, Segmented } from '@/components/ui';
import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { OpsPage } from '@/components/ops/OpsPage';
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
import type { VesselStatus } from '@/lib/types';

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
  const query = useVessels({
    limit: PAGE_SIZE,
    offset,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(status === 'all' ? {} : { status }),
  });

  const data = query.data;
  const source = data?.source;
  const vessels = data?.vessels ?? [];

  /** Back to the first page: page 3 of a new result set is somebody else's page. */
  const clearSearch = () => {
    setSearch('');
    setOffset(0);
  };
  const clearStatus = () => {
    setStatus('all');
    setOffset(0);
  };

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
    <OpsPage
      title="Vessel movements"
      intro="Arrivals and berth occupancy across SCASPA port facilities."
      source={source}
    >
      {/*
        §5.2's banner — above the tiles, full width, never dismissible for the
        two kinds that can actually occur — is rendered by `OpsPage`, which puts
        it on every operations screen rather than leaving each page to remember.
        This screen rendered a SECOND one directly beneath it: the same sentence,
        the same badge and the same timestamp, twice.
      */}

      <MetricRow columns={4}>
        <MetricTile label="Vessels in port" value={data?.metrics.vessels_at_berth ?? null} />
        {/*
          The label is the handoff's. The field is `arrivals_next_24h`, which is
          a rolling 24-hour window rather than a calendar day — BLOCKED on
          `arrivals_today` on `VesselMetrics`; it is the nearest figure the wire
          carries, and the mismatch is recorded rather than hidden.
        */}
        <MetricTile label="Expected today" value={data?.metrics.arrivals_next_24h ?? null} />
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
      ) : source?.kind === 'unavailable' && vessels.length === 0 ? (
        // A statement about the SERVICE, not about the query.
        <NoFeedState noun="vessel" />
      ) : vessels.length === 0 ? (
        // A statement about the QUERY. Different remedy, different panel.
        <FilteredOutState
          filters={filters}
          onClear={() => {
            setSearch('');
            setStatus('all');
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
    </OpsPage>
  );
}

export const Route = createFileRoute('/vessels')({
  component: VesselsRoute,
  head: () => ({
    meta: [
      { title: 'Vessel movements — SCASPA Assistant' },
      {
        name: 'description',
        content: 'Vessel arrivals and berth occupancy across SCASPA port facilities.',
      },
    ],
  }),
});
