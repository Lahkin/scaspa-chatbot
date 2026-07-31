import { VesselStatusChip } from './StatusChip';
import type { VesselArrival } from '@/lib/types';

/**
 * One vessel movement.
 *
 * ## The ETA / ATA distinction is the point of this component
 *
 * An ETA is a prediction and an ATA is a record of something that happened. The
 * payload keeps them as two fields for exactly that reason, and this renders
 * them with different labels — "Arrived" against a time that is a fact,
 * "Estimated" against one that is a guess.
 *
 * Collapsing them into one "Time" column, as an operations table naturally
 * wants to, is how a prediction gets read as a fact by someone deciding whether
 * to drive to the port. The design's own table does exactly that; this does not.
 */
export function VesselCard({ vessel }: { vessel: VesselArrival }) {
  const arrived = vessel.ata !== null && vessel.ata !== undefined;
  const stamp = vessel.ata ?? vessel.eta;

  return (
    <li className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-ops-ink">{vessel.name}</p>
          <p className="mt-0.5 text-caption text-ops-ink-variant">
            {[vessel.imo, vessel.vessel_type].filter(Boolean).join(' • ') || 'Details not reported'}
          </p>
        </div>
        <VesselStatusChip status={vessel.status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-small">
        <div>
          <dt className="text-caption text-ops-ink-variant">
            {arrived ? 'Arrived' : 'Estimated arrival'}
          </dt>
          <dd className="text-ops-ink tabular">
            {stamp ? (
              <time dateTime={stamp}>{formatStamp(stamp)}</time>
            ) : (
              <span className="text-ops-ink-variant">Not reported</span>
            )}
            {/* Said in words as well as by the label, because the label is above
                the value and a screen reader announcing a table cell may not
                carry it. A guess must never read as a record. */}
            {stamp ? (
              <span className="sr-only">
                {arrived ? ' — actual time of arrival' : ' — estimated, not confirmed'}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ops-ink-variant">Berth</dt>
          <dd className="text-ops-ink">{vessel.berth || '—'}</dd>
        </div>
      </dl>

      {vessel.agent ? (
        <p className="mt-2 text-caption text-ops-ink-variant">Agent: {vessel.agent}</p>
      ) : null}
    </li>
  );
}

function formatStamp(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
