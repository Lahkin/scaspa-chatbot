import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Icon, Segmented } from '@/components/ui';
import { AirlineAvatar } from '@/components/ops/AirlineAvatar';
import { OperationalAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
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
import { FlightStatusChip } from '@/components/ops/StatusChip';
import { FlightTime, GateCell } from '@/components/ops/TimeCell';
import { useFlights } from '@/features/ops/queries';
import { FACILITY_FILTERS, facilityParam } from '@/features/ops/facilities';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import type { Facility, FlightDirection } from '@/lib/types';

/**
 * Flights — §5.5, on the primitives of §5.1.
 *
 * Columns: **Flight · From/To · Due · Gate · Airline · Status**. §5.5 names the
 * first four and adds "plus Gate and Airline where width allows" — they are in
 * the table above 640px and fold into the row card below it, which is what
 * "where width allows" describes.
 *
 * The direction toggle is in the toolbar rather than the page header, because it
 * changes what the TABLE holds and not what the screen is about. Arrivals and
 * departures stay one query parameter rather than two tabs fetching
 * independently: "no arrivals reported" and "no departures reported" are
 * different facts, and a shared tab body would show one for the other.
 *
 * ## Three rules this screen exists to keep
 *
 * - **A revised time shows both figures** — the scheduled one struck through,
 *   the revision in caution. "A passenger who only sees the revised time cannot
 *   tell whether it moved."
 * - **A null gate reads "not reported", never "TBD"**, which sounds like the
 *   Authority has decided and is withholding.
 * - **`landed` and `arrived` differ by glyph and label, never by hue**, so the
 *   two survive greyscale.
 *
 * ## The three tiles, and the field each one reads
 *
 * §5.3: "**Flights — three tiles**: Arrivals today · Departures today ·
 * Delayed. Same rules; any null takes the em-dash treatment."
 *
 * `FlightMetrics` now carries exactly those three, added in M2. It previously
 * carried only `total_flights`, `on_time_percent`, `gates_active` and
 * `gates_total` — **none of which is one of them** — and this screen rendered
 * `total_flights` under "Arrivals today", relabelling the same figure
 * "Departures today" when the toggle flipped. `total_flights` counts the whole
 * feed in both directions, so on the sample feed it read 4 arrivals where there
 * were 3.
 *
 * Each tile reads its own field now. They render the em dash until a feed fills
 * them, which is §5.3's treatment for a null rather than a placeholder — a
 * wrong number under the handoff's label is worse than the label with no
 * number. The two figures that were standing in belong to the Console
 * (§6.7–6.13), where the handoff puts gate and punctuality statistics.
 */

const COLUMNS = ['Flight', 'From/To', 'Due', 'Gate', 'Airline', 'Status'] as const;
const PAGE_SIZE = 25;

function FlightsRoute() {
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
    <OpsShell
      title="Flight movements"
      intro="Arrivals and departures at R. L. Bradshaw International."
      // As on `/vessels` — the table is not a provenance card, so the hatch
      // comes from the shell.
      source={source}
    >
      {/* §5.2's banner — one per screen, rendered here now that the shell
          carries no data of its own. See the note in `routes/vessels.tsx`. */}
      {source ? <SourceNotice source={source} /> : null}

      {/*
        §5.3: three tiles, and any null takes the em-dash treatment.
        UNBLOCKED in M2 — `arrivals_today`, `departures_today` and `delayed` are
        on `FlightMetrics` now, and each tile reads its own field rather than
        the nearest figure. They render the em dash until a feed fills them,
        which is §5.3's own treatment for a null and not a placeholder.
      */}
      <MetricRow columns={3}>
        <MetricTile label="Arrivals today" value={data?.metrics.arrivals_today ?? null} />
        <MetricTile label="Departures today" value={data?.metrics.departures_today ?? null} />
        <MetricTile label="Delayed" value={data?.metrics.delayed ?? null} />
      </MetricRow>

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
      ) : source?.kind === 'unavailable' && flights.length === 0 ? (
        // A statement about the SERVICE, not about the query. Airport Operations
        // rather than Marine: this is an arrivals board, not a harbour.
        <NoFeedState noun="flight" department="Airport Operations" />
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
    </OpsShell>
  );
}

export const Route = createFileRoute('/flights')({
  component: FlightsRoute,
  head: () => ({
    meta: [
      { title: 'Flight movements — SCASPA Assistant' },
      {
        name: 'description',
        content: 'Flight arrivals and departures at R. L. Bradshaw International Airport.',
      },
    ],
  }),
});
