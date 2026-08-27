import { useState } from 'react';
import { Icon, Segmented } from '@/components/ui';
import { AirlineAvatar } from '@/components/ops/AirlineAvatar';
import { OperationalAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { AskPilot } from '@/components/ops/AskPilot';
import { FixtureWatermark } from '@/components/ops/FixtureWatermark';
import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { SourceNotice } from '@/components/ops/SourceNotice';
import { OpsCell, OpsRow, OpsRowCard, OpsTable, type Density } from '@/components/ops/OpsTable';
import { FilteredOutState, TableError, TableSkeleton } from '@/components/ops/TableStates';
import { Pagination } from '@/components/ops/console/Pagination';
import { FlightStatusChip } from '@/components/ops/StatusChip';
import { FlightTime, GateCell } from '@/components/ops/TimeCell';
import { useFlights } from '@/features/ops/queries';
import { FACILITY_FILTERS, facilityParam } from '@/features/ops/facilities';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import type { Facility, FlightDirection } from '@/lib/types';

/**
 * The live flight movements half of Airport Information.
 *
 * ── WHY THIS IS A SECTION AND NOT THE PAGE ───────────────────────────────────
 *
 * It used to be the whole of `/flights`, and in production SCASPA publishes no
 * flight feed — so what a real visitor saw was three tiles reading
 * "Arrivals today —, Departures today —, Delayed —" above a panel explaining
 * there was nothing. The brief names those three cards specifically and says to
 * remove them.
 *
 * The verified airport information above now answers what most people actually
 * arrive wanting, and this section says plainly what is not connected. Two
 * headings, two provenance treatments, and the published half never borrows the
 * live half's framing or vice versa.
 *
 * ## It stays fully built
 *
 * Every filter, the direction toggle, the density control and the pagination
 * are wired to the real endpoint, and `OPS_DATA_SOURCE=fixture` renders all of
 * it. A section reduced to a placeholder would have to be rebuilt from nothing
 * the day a feed appears, and rebuilt code is unreviewed code.
 *
 * Three rules it exists to keep, unchanged from when it was the page:
 *
 * - **A revised time shows both figures** — the scheduled one struck through,
 *   the revision in caution. A passenger who only sees the revised time cannot
 *   tell whether it moved.
 * - **A null gate reads "not reported", never "TBD"**, which sounds like the
 *   Authority has decided and is withholding.
 * - **`landed` and `arrived` differ by glyph and label, never by hue**, so the
 *   two survive greyscale.
 */

/**
 * §5.5 names the first four columns and adds "plus Gate and Airline where width
 * allows" — they are in the table above 640px and fold into the row card below
 * it, which is what "where width allows" describes.
 */
const COLUMNS = ['Flight', 'From/To', 'Due', 'Gate', 'Airline', 'Status'] as const;
const PAGE_SIZE = 25;

export function FlightMovements() {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<FlightDirection>('arrival');
  const [facility, setFacility] = useState<Facility | 'all'>('all');
  const [density, setDensity] = useState<Density>('comfortable');
  const [offset, setOffset] = useState(0);

  // Settles 300ms after typing stops — see the note in `routes/vessels.tsx`.
  const q = useDebouncedValue(search.trim());

  const facilityFilter = facilityParam(facility);

  const query = useFlights({
    limit: PAGE_SIZE,
    offset,
    direction,
    ...(q ? { q } : {}),
    ...(facilityFilter ? { facility: facilityFilter } : {}),
  });

  const data = query.data;
  const source = data?.source;
  const flights = data?.flights ?? [];
  // See the note in routes/vessels.tsx: a missing SERVICE and an empty QUERY
  // look identical on screen and need opposite remedies.
  const noFeed = source?.kind === 'unavailable' && flights.length === 0;

  const toolbar = (
    <>
      <div className="flex h-11 w-60 max-w-full items-center gap-2.5 rounded-input border border-border bg-surface-muted px-3 focus-within:border-brand-500 sm:h-9">
        <Icon name="search" size={16} className="text-ink-muted" />
        <label htmlFor="flight-search" className="sr-only">
          Search flight number or airline
        </label>
        <input
          id="flight-search"
          type="search"
          value={search}
          placeholder="Flight number or airline"
          onChange={(event) => {
            setSearch(event.target.value);
            // Back to the first page: staying on page 3 of a new result set
            // shows an empty table for a search that matched plenty.
            setOffset(0);
          }}
          className="h-full w-full bg-transparent text-label text-ink outline-none placeholder:text-ink-disabled"
        />
      </div>

      <Segmented
        label="Direction"
        size="sm"
        value={direction}
        onChange={(next) => {
          setDirection(next);
          setOffset(0);
        }}
        options={[
          { value: 'arrival', label: 'Arrivals' },
          { value: 'departure', label: 'Departures' },
        ]}
      />

      <label htmlFor="flight-facility" className="sr-only">
        Filter by facility
      </label>
      <select
        id="flight-facility"
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

      <span className="flex-1" />

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
    // `relative` carries the hatch, and it is on THIS section rather than on
    // the page for the same reason as `VesselMovements`: the published airport
    // information above is verified SCASPA content, and hatching it as sample
    // data would be the exact lie the hatch exists to prevent.
    <section className="relative space-y-4" aria-labelledby="flight-movements-heading">
      <FixtureWatermark source={source} />

      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="flight-movements-heading" className="text-section font-semibold text-ink">
          Live flight movements
        </h2>
      </div>

      {/* §5.2's banner — one per section, above the data it describes. */}
      {source ? <SourceNotice source={source} className="relative" /> : null}

      {/*
        §5.3: three tiles, and any null takes the em-dash treatment.
        UNBLOCKED in M2 — `arrivals_today`, `departures_today` and `delayed` are
        on `FlightMetrics` now, and each tile reads its own field rather than
        the nearest figure. They render the em dash until a feed fills them,
        which is §5.3's own treatment for a null and not a placeholder.
      */}
      {/* Three tiles reading "— / not reported" are not an empty state.
          See routes/vessels.tsx. */}
      {noFeed ? null : (
        <MetricRow columns={3}>
          <MetricTile label="Arrivals today" value={data?.metrics.arrivals_today ?? null} />
          <MetricTile label="Departures today" value={data?.metrics.departures_today ?? null} />
          <MetricTile label="Delayed" value={data?.metrics.delayed ?? null} />
        </MetricRow>
      )}

      {/*
        §5.6, passthrough only. The full caution fill is gated on attribution —
        "always attributed to whoever published it, with a time" — and
        `OperationalAdvisory` carries neither, so this renders the neutral fill
        until `published_by` and `published_at` land. Absent means no panel at
        all; there is no empty container in this position.
      */}
      <OperationalAdvisoryPanel advisory={data?.advisory ?? null} />

      {query.isPending ? (
        <TableSkeleton columns={COLUMNS} density={density} />
      ) : query.error ? (
        <TableError error={query.error} onRetry={() => void query.refetch()} />
      ) : noFeed ? (
        // A statement about the SERVICE, not about the query. Airport Operations
        // rather than Marine: this is an arrivals board, not a harbour.
        <MovementsNotConnected />
      ) : flights.length === 0 ? (
        // A statement about the QUERY. Different remedy, different panel.
        /*
         * Every filter that can empty the table has to appear here, and this is
         * not a nicety: **the toolbar lives inside `OpsTable`**, so when the
         * table is replaced by this panel the controls go with it. A filter the
         * panel does not list is a filter with no way back — the reader is left
         * on an empty screen whose only remedy is a reload.
         *
         * Facility was exactly that until M5. It could empty the table (Port
         * Zante matches no flight — every one of them is at the airport) while
         * "Clear filters" reset only the search box, so clearing appeared to do
         * nothing at all.
         */
        <FilteredOutState
          noun="flights"
          filters={[
            ...(search.trim()
              ? [
                  {
                    label: `“${search.trim()}”`,
                    onRemove: () => {
                      setSearch('');
                      setOffset(0);
                    },
                  },
                ]
              : []),
            ...(facility === 'all'
              ? []
              : [
                  {
                    label:
                      FACILITY_FILTERS.find((option) => option.value === facility)?.label ??
                      facility,
                    onRemove: () => {
                      setFacility('all');
                      setOffset(0);
                    },
                  },
                ]),
          ]}
          onClear={() => {
            setSearch('');
            setFacility('all');
            setOffset(0);
          }}
        />
      ) : (
        <OpsTable
          caption="Flight movements"
          columns={COLUMNS}
          toolbar={toolbar}
          density={density}
          footer={
            <Pagination
              offset={offset}
              limit={PAGE_SIZE}
              total={data?.total ?? 0}
              onOffsetChange={setOffset}
              noun="flights"
            />
          }
          cards={flights.map((flight) => (
            <OpsRowCard
              key={flight.id}
              title={`${flight.flight_no} · ${flight.port}`}
              status={<FlightStatusChip status={flight.status} size="sm" />}
              fields={[
                {
                  label: 'Due',
                  value: (
                    <FlightTime
                      scheduled={flight.scheduled_time}
                      estimated={flight.estimated_time}
                    />
                  ),
                },
                { label: 'Gate', value: <GateCell gate={flight.gate} /> },
              ]}
            />
          ))}
        >
          {flights.map((flight) => (
            <OpsRow key={flight.id} density={density}>
              <OpsCell first numeric>
                {flight.flight_no}
              </OpsCell>
              <OpsCell>{flight.port || '—'}</OpsCell>
              <OpsCell numeric>
                <FlightTime scheduled={flight.scheduled_time} estimated={flight.estimated_time} />
              </OpsCell>
              <OpsCell numeric>
                <GateCell gate={flight.gate} />
              </OpsCell>
              <OpsCell>
                <AirlineAvatar code={flight.airline_code} airline={flight.airline} />
              </OpsCell>
              <OpsCell>
                <FlightStatusChip status={flight.status} size="sm" />
              </OpsCell>
            </OpsRow>
          ))}
        </OpsTable>
      )}
    </section>
  );
}

/**
 * No flight feed — the production state, said once and properly.
 *
 * The brief asks for one intentional state rather than repeated NO FEED
 * banners, and for a contact route, a published alternative and a way back into
 * the assistant. The sentence carrying the weight is the second one: "no feed
 * is connected" describes a deficiency, "Pilot will not guess" describes the
 * rule that makes every answer it *does* give worth believing.
 *
 * Airport Operations, not Marine. §5.7 wrote the vessel copy — "telephone
 * Marine Operations" — and the flights screen inherited it verbatim for a
 * while, so a passenger whose arrivals board was empty was being told to ring
 * the harbour.
 */
function MovementsNotConnected() {
  return (
    <div className="relative flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <h3 className="text-section font-semibold text-ink">
        Live flight movements are not currently connected
      </h3>
      <p className="max-w-105 text-label leading-5 text-ink-muted">
        <strong className="font-semibold text-ink">
          Pilot will not guess arrival, departure or delay information.
        </strong>{' '}
        SCASPA publishes no flight feed to this assistant, and no airline schedule is read from
        anywhere else. Airport Operations can confirm a movement on{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-brand-300 underline tabular">
          {SCASPA_TEL_TEXT}
        </a>
        , and your airline is the authority on its own flight.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <AskPilot question="How early should I arrive at the airport?" />
        <AskPilot question="How do I contact SCASPA?" />
      </div>
    </div>
  );
}
