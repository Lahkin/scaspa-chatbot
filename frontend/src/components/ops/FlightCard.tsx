import { FlightStatusChip } from './StatusChip';
import type { Flight } from '@/lib/types';

/**
 * One flight movement.
 *
 * When a flight is delayed the payload carries both times, and both are shown:
 * the scheduled one struck through, the revised one beside it. Showing only the
 * new time loses the fact that it moved, which is the thing a person waiting at
 * the terminal actually needs to see — and `<s>` alone does not say why, so the
 * change is also stated in words for a screen reader.
 */
export function FlightCard({ flight }: { flight: Flight }) {
  const revised = flight.estimated_time && flight.estimated_time !== flight.scheduled_time;

  return (
    <li className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-ops-navy text-caption font-semibold text-ink-inverse"
          >
            {flight.airline_code || '··'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ops-ink tabular">
              {flight.flight_no}
            </p>
            <p className="mt-0.5 truncate text-caption text-ops-ink-variant">
              {flight.airline || 'Airline not reported'}
            </p>
          </div>
        </div>
        <FlightStatusChip status={flight.status} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-small">
        <div className="col-span-1">
          <dt className="text-caption text-ops-ink-variant">
            {flight.direction === 'arrival' ? 'From' : 'To'}
          </dt>
          <dd className="truncate text-ops-ink">
            {flight.port || '—'}
            {flight.port_code ? (
              <span className="text-ops-ink-variant"> ({flight.port_code})</span>
            ) : null}
          </dd>
        </div>

        <div className="col-span-1">
          <dt className="text-caption text-ops-ink-variant">Time</dt>
          <dd className="text-ops-ink tabular">
            {revised ? (
              <>
                <s className="text-ops-ink-variant">{formatTime(flight.scheduled_time)}</s>{' '}
                <span className="font-semibold">{formatTime(flight.estimated_time)}</span>
                <span className="sr-only">
                  {' '}
                  — rescheduled from {formatTime(flight.scheduled_time)}
                </span>
              </>
            ) : (
              formatTime(flight.scheduled_time)
            )}
          </dd>
        </div>

        <div className="col-span-1">
          <dt className="text-caption text-ops-ink-variant">Gate</dt>
          <dd className="text-ops-ink">{flight.gate ?? '—'}</dd>
        </div>
      </dl>
    </li>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
