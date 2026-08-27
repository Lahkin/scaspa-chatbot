import { useState } from 'react';
import { Icon, Segmented } from '@/components/ui';
import { AskPilot } from '@/components/ops/AskPilot';
import { PublishedScheduleLink } from '@/components/ops/cruise/CruiseStates';
import { FixtureWatermark } from '@/components/ops/FixtureWatermark';
import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { OpsCell, OpsRow, OpsRowCard, OpsTable, type Density } from '@/components/ops/OpsTable';
import { Pagination } from '@/components/ops/console/Pagination';
import { SourceNotice } from '@/components/ops/SourceNotice';
import { VesselStatusChip } from '@/components/ops/StatusChip';
import { FilteredOutState, TableError, TableSkeleton } from '@/components/ops/TableStates';
import { ActualTime, EstimatedTime } from '@/components/ops/TimeCell';
import { FACILITY_FILTERS, facilityParam } from '@/features/ops/facilities';
import { useVessels } from '@/features/ops/queries';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import type { Facility, VesselStatus } from '@/lib/types';

/**
 * Section B of Cruise & Vessel Activity — **live vessel movements and positions**.
 *
 * ── WHY THIS IS A SEPARATE SECTION AND NOT MORE ROWS ─────────────────────────
 *
 * "Separate: A. Official SCASPA Published Cruise Schedule. B. External Live
 * Vessel / AIS Data. **Do not mix the two.**"
 *
 * Section A is real, published, Authority-owned information on a six-hour
 * snapshot. This is a live movements feed, and in production there is no such
 * feed: SCASPA publishes none and no external AIS source has been tested for
 * St Kitts coverage. The two therefore carry completely different certainties,
 * and a single table would lend A's authority to B's absence.
 *
 * ## The screen this replaces
 *
 * `/vessels` used to be this section alone. With no feed connected — the
 * production default — that meant four empty metric tiles reading "— / not
 * reported" above a panel explaining there was nothing, which looked like
 * software that had failed to load rather than a service that has not been
 * connected. The published cruise schedule now answers the question most
 * readers actually arrived with, and this section says plainly what it does not
 * know.
 *
 * ## It is still fully built, and that is deliberate
 *
 * Every filter, the density toggle and the pagination are wired to the real
 * endpoint. `OPS_DATA_SOURCE=fixture` renders all of it, hatched. A section that
 * had been reduced to a placeholder would have to be rebuilt from nothing on the
 * day a feed appears, and rebuilt code is unreviewed code.
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

export function VesselMovements() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VesselStatus | 'all'>('all');
  const [facility, setFacility] = useState<Facility | 'all'>('all');
  const [density, setDensity] = useState<Density>('comfortable');
  const [offset, setOffset] = useState(0);

  /*
   * The term the SERVER sees, which is not the term in the box. `search`
   * updates per keystroke so the field stays responsive; this settles 300ms
   * after typing stops, because every distinct term is a request and a
   * rate-limit slot shared with the chat path.
   */
  const q = useDebouncedValue(search.trim());
  const facilityFilter = facilityParam(facility);

  /*
   * Both filters go to the SERVER, and `total` comes back matching them.
   * Nothing on this screen is counted from the visible rows — filtering in the
   * client filtered the twenty-five rows of the current PAGE while the readout
   * went on saying "Showing 1–25 of 100".
   */
  const query = useVessels({
    limit: PAGE_SIZE,
    offset,
    ...(q ? { q } : {}),
    ...(status === 'all' ? {} : { status }),
    ...(facilityFilter ? { facility: facilityFilter } : {}),
  });

  const data = query.data;
  const source = data?.source;
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
    // `relative` carries the hatch. It is on THIS section rather than on the
    // page, because the published cruise schedule above is real SCASPA data and
    // hatching it as sample data would be the exact lie the hatch exists to
    // prevent — even on a developer's machine running fixtures.
    <section className="relative space-y-4" aria-labelledby="vessel-movements-heading">
      <FixtureWatermark source={source} />

      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="vessel-movements-heading" className="text-section font-semibold text-ink">
          Live vessel movements and positions
        </h2>
      </div>

      {/* §5.2's banner — above the tiles, full width, never dismissible. */}
      {source ? <SourceNotice source={source} className="relative" /> : null}

      {/*
        ── FOUR EMPTY TILES ARE NOT AN HONEST EMPTY STATE ─────────────────────
        With no feed connected every one of these read "— / not reported": four
        cards of nothing above a panel that then explained there was nothing.
        The tiles are for a screen that HAS figures.
      */}
      {noFeed ? null : (
        <MetricRow columns={4}>
          <MetricTile
            label="Vessels in port"
            value={data?.metrics.vessels_at_berth ?? null}
            loading={query.isPending}
          />
          {/* A calendar day, which is what the label says — not the rolling window. */}
          <MetricTile
            label="Expected today"
            value={data?.metrics.arrivals_today ?? null}
            loading={query.isPending}
          />
          {/*
            **The single most dangerous default in the product.** The feed does
            not report berth occupancy, so this tile is the em dash — never 0,
            which would say the port is empty. It is not `loading`, because it
            is not waiting for anything: no feed reports this figure at all.
          */}
          <MetricTile label="Berth occupancy" value={null} />
          <MetricTile
            label="Alongside of expected"
            value={data?.metrics.vessels_at_berth ?? null}
            loading={query.isPending}
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
      ) : query.error ? (
        // A failed request is not an empty result: `vessels` is `[]` on any
        // failure, so a 429 and a 500 would both fall through to "no movements
        // match these filters" over data that was never fetched.
        <TableError error={query.error} onRetry={() => void query.refetch()} />
      ) : noFeed ? (
        <PositionsNotConnected />
      ) : vessels.length === 0 ? (
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
              {/*
                ETA and ATA are two columns and never one. One is a prediction,
                one is a record, and that distinction is the entire point of
                having two fields — collapsing them is how a guess gets read as a
                fact by somebody deciding whether to drive to a port.
              */}
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
    </section>
  );
}

/**
 * No live movements and no AIS — the production state, said once and properly.
 *
 * The brief asks for one intentional state instead of repeated NO FEED banners,
 * and for three things in it: the published source, a contact route, and a way
 * back into the assistant. All three are here, and the sentence that carries the
 * weight is the second one.
 *
 * It says AIS by name. "No feed is connected" is our word for our plumbing; a
 * reader who has seen a ship-tracking website knows what AIS is and is entitled
 * to know that this product is not reading one.
 */
function PositionsNotConnected() {
  return (
    <div className="relative flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <h3 className="text-section font-semibold text-ink">
        Live vessel positions are not connected
      </h3>
      <p className="max-w-105 text-label leading-5 text-ink-muted">
        Pilot shows published SCASPA schedule information, but live AIS vessel positions are not
        currently available.{' '}
        <strong className="font-semibold text-ink">Pilot will not guess</strong> an arrival, a berth
        or a departure. Marine Operations can confirm a movement on{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-brand-300 underline tabular">
          {SCASPA_TEL_TEXT}
        </a>
        .
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <PublishedScheduleLink />
        <AskPilot question="How do I contact SCASPA Marine Operations?" />
      </div>
    </div>
  );
}
