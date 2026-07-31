import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Input } from '@/components/ui';
import { FlightCard } from '@/components/ops/FlightCard';
import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { OpsListState, OpsPage } from '@/components/ops/OpsPage';
import { useFlights } from '@/features/ops/queries';
import type { FlightDirection } from '@/lib/types';

/**
 * Flight schedules — the design's `flight_schedules_expanded_view`.
 *
 * Arrivals and departures are a two-way toggle rather than two tabs that fetch
 * independently, because the filter is a query parameter and the empty state
 * differs per direction: "no arrivals reported" and "no departures reported" are
 * different facts and a shared tab body would show one for the other.
 */
function FlightsRoute() {
  const [direction, setDirection] = useState<FlightDirection>('arrival');
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const query = useFlights({ direction, ...(submitted ? { q: submitted } : {}) });
  const data = query.data;
  const flights = data?.flights ?? [];

  return (
    <OpsPage
      title="Flight schedules"
      intro="Arrivals and departures at R.L. Bradshaw International Airport."
      source={data?.source}
      actions={
        <Button
          variant="secondary"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      }
    >
      <MetricRow>
        <MetricTile label="Flights" value={data?.metrics.total_flights ?? null} />
        <MetricTile label="On time" value={data?.metrics.on_time_percent ?? null} suffix="%" />
        <MetricTile
          label="Gates in use"
          value={data?.metrics.gates_active ?? null}
          suffix={data?.metrics.gates_total ? `/ ${data.metrics.gates_total}` : ''}
        />
      </MetricRow>

      {/* A radiogroup rather than two buttons: it is one choice with two values,
          and arrow keys should move between them. */}
      <div role="radiogroup" aria-label="Direction" className="flex gap-2">
        {(['arrival', 'departure'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={direction === value}
            onClick={() => setDirection(value)}
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
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
        }}
      >
        <div className="flex-1">
          <Input
            label="Search flight or destination"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Flight number or city"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

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
        <ul className="space-y-3">
          {flights.map((flight) => (
            <FlightCard key={flight.id} flight={flight} />
          ))}
        </ul>
      ) : null}

      {data?.advisory ? (
        <section
          aria-labelledby="advisory-heading"
          className="rounded-lg border border-ops-outline-variant bg-ops-surface-low p-4"
        >
          <h2 id="advisory-heading" className="text-small font-semibold text-ops-ink">
            Aviation advisory
          </h2>
          <p className="mt-1 text-small text-ops-ink">
            {data.advisory.headline}
            {data.advisory.temperature_c !== null && data.advisory.temperature_c !== undefined
              ? ` · ${data.advisory.temperature_c}°C`
              : ''}
          </p>
          {data.advisory.detail ? (
            <p className="text-caption text-ops-ink-variant">{data.advisory.detail}</p>
          ) : null}
          {data.advisory.systems_status ? (
            <p className="mt-1 text-caption text-ops-ink-variant">{data.advisory.systems_status}</p>
          ) : null}
        </section>
      ) : null}
    </OpsPage>
  );
}

export const Route = createFileRoute('/flights')({
  component: FlightsRoute,
  head: () => ({
    meta: [
      { title: 'Flight schedules — SCASPA Assistant' },
      {
        name: 'description',
        content: 'Arrivals and departures at R.L. Bradshaw International Airport.',
      },
    ],
  }),
});
