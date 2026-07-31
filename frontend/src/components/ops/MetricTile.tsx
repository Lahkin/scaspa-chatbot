import { cn } from '@/lib/cn';

/**
 * One stat tile — "Vessels at berth 14 / 20 slots".
 *
 * **`null` renders as "—", never as 0.** Every metric on these responses is
 * nullable because a feed that does not report berth occupancy has not reported
 * zero: "0 vessels at berth" describes an empty port, which is a completely
 * different and completely wrong statement. Same rule the index status has
 * carried since the beginning.
 */
export function MetricTile({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: number | null;
  /** e.g. "/ 20 slots" or "%". Suppressed when the value is unknown. */
  suffix?: string | undefined;
  hint?: string | undefined;
}) {
  const known = value !== null && value !== undefined && Number.isFinite(value);

  return (
    <div
      className={cn(
        'min-w-40 shrink-0 rounded-lg border border-ops-outline-variant',
        'bg-ops-surface-low p-4'
      )}
    >
      <p className="text-caption font-medium tracking-wide text-ops-ink-variant uppercase">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-h2 font-semibold text-ops-ink tabular">
          {known ? formatValue(value) : '—'}
        </span>
        {known && suffix ? (
          <span className="text-small text-ops-ink-variant tabular">{suffix}</span>
        ) : null}
      </p>
      <p className="mt-0.5 text-caption text-ops-ink-variant">
        {known ? (hint ?? ' ') : 'Not reported by this source'}
      </p>
    </div>
  );
}

function formatValue(value: number): string {
  // A percentage arrives as 94.8 and must not become "95". A count arrives as
  // 12450 and reads better grouped.
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}
