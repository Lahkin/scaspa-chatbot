import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Input } from '@/components/ui';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { DataTable, Td, Th, Tr } from '@/components/ops/console/DataTable';
import { Pagination } from '@/components/ops/console/Pagination';
import { AdvisoryPanel, GatePanel } from '@/components/ops/console/SidePanels';
import { MetricTile } from '@/components/ops/MetricTile';
import { OpsListState } from '@/components/ops/OpsPage';
import { SourceAge, SourceNotice } from '@/components/ops/SourceNotice';
import { FlightStatusChip } from '@/components/ops/StatusChip';
import { useFlights } from '@/features/ops/queries';
import type { FlightDirection } from '@/lib/types';

const PAGE_SIZE = 10;

/** `/ops/flights` — the design's `flight_schedules` desktop screen. */
function OpsFlightsRoute() {
  const [direction, setDirection] = useState<FlightDirection>('arrival');
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [offset, setOffset] = useState(0);

  const query = useFlights({
    direction,
    limit: PAGE_SIZE,
    offset,
    ...(submitted ? { q: submitted } : {}),
  });

  const data = query.data;
  const flights = data?.flights ?? [];

  return (
    <ConsoleShell
      breadcrumb={['Console', 'Flight schedules']}
      title="Flight schedules"
      intro="Arrivals and departures at R.L. Bradshaw International Airport."
      actions={
        <Button
          variant="secondary"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      }
      aside={
        <>
          <AdvisoryPanel advisory={data?.advisory ?? null} />
          <GatePanel />
        </>
      }
    >
      {data?.source ? (
        <>
          <SourceAge source={data.source} />
          <SourceNotice source={data.source} />
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Flights" value={data?.metrics.total_flights ?? null} />
        <MetricTile label="On time" value={data?.metrics.on_time_percent ?? null} suffix="%" />
        <MetricTile
          label="Gates in use"
          value={data?.metrics.gates_active ?? null}
          suffix={data?.metrics.gates_total ? `/ ${data.metrics.gates_total}` : ''}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="radiogroup" aria-label="Direction" className="flex gap-2">
          {(['arrival', 'departure'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              onClick={() => {
                setDirection(value);
                setOffset(0);
              }}
              className={
                direction === value
                  ? 'min-h-touch rounded-sm bg-ops-navy px-4 text-small font-semibold text-ink-inverse'
                  : 'min-h-touch rounded-sm border border-ops-outline px-4 text-small font-medium text-ops-ink'
              }
            >
              {value === 'arrival' ? 'Arrivals' : 'Departures'}
            </button>
          ))}
        </div>

        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(search.trim());
            setOffset(0);
          }}
        >
          <div className="min-w-40 flex-1">
            <Input
              label="Search flight or destination"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Flight number or city"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      <OpsListState
        isLoading={query.isPending}
        error={query.error ?? null}
        isEmpty={flights.length === 0}
        emptyTitle={
          submitted
            ? 'No flights match that search'
            : `No ${direction === 'arrival' ? 'arrivals' : 'departures'} are being reported`
        }
        emptyHint="Call SCASPA on 869-465-8121 / 2 / 3 to check a flight."
        onRetry={() => void query.refetch()}
      />

      {flights.length > 0 ? (
        <>
          <DataTable
            caption="Flight schedules: number, airline, route, time, gate and status"
            head={
              <>
                <Th>Flight</Th>
                <Th>Airline</Th>
                <Th>{direction === 'arrival' ? 'From' : 'To'}</Th>
                <Th>Time</Th>
                <Th>Gate</Th>
                <Th>Status</Th>
              </>
            }
          >
            {flights.map((flight, index) => {
              const revised =
                flight.estimated_time && flight.estimated_time !== flight.scheduled_time;
              return (
                <Tr key={flight.id} index={index}>
                  <Td nowrap>
                    <span className="font-medium tabular">{flight.flight_no}</span>
                  </Td>
                  <Td muted>{flight.airline || '—'}</Td>
                  <Td>
                    {flight.port || '—'}
                    {flight.port_code ? (
                      <span className="text-ops-ink-variant"> ({flight.port_code})</span>
                    ) : null}
                  </Td>
                  <Td nowrap>
                    {revised ? (
                      <>
                        {/* Both times. Showing only the new one loses the fact
                            that it moved, which is what the person waiting
                            actually needs. */}
                        <s className="text-ops-ink-variant tabular">
                          {formatTime(flight.scheduled_time)}
                        </s>{' '}
                        <span className="font-semibold tabular">
                          {formatTime(flight.estimated_time)}
                        </span>
                        <span className="sr-only">
                          {' '}
                          — rescheduled from {formatTime(flight.scheduled_time)}
                        </span>
                      </>
                    ) : (
                      <span className="tabular">{formatTime(flight.scheduled_time)}</span>
                    )}
                  </Td>
                  <Td muted nowrap>
                    {flight.gate ?? '—'}
                  </Td>
                  <Td nowrap>
                    <FlightStatusChip status={flight.status} />
                  </Td>
                </Tr>
              );
            })}
          </DataTable>

          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={data?.total ?? flights.length}
            onOffsetChange={setOffset}
            noun="flights"
          />
        </>
      ) : null}
    </ConsoleShell>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const Route = createFileRoute('/ops/flights')({
  component: OpsFlightsRoute,
  head: () => ({
    meta: [
      { title: 'Flight schedules — SCASPA operations' },
      {
        name: 'description',
        content: 'Arrivals and departures at R.L. Bradshaw International Airport.',
      },
    ],
  }),
});
