import { cn } from '@/lib/cn';

/**
 * The time cells — spec board 17, "ETA / ATA — all four combinations".
 *
 * ## A prediction must not read as a record
 *
 * This is the distinction the whole board is arranged around, and the API
 * carries `eta` and `ata` as separate fields precisely so a UI cannot lose it:
 *
 *   ~11:15   —       Predicted only. Italic, muted, tilde — it has not happened.
 *   ~06:30   06:40   Both. The record is upright and full strength; the
 *                    prediction recedes.
 *   —        05:55   Arrived unannounced. No ETA was ever filed.
 *   —        —       Neither reported. Two em dashes, no guess.
 *
 * Three signals carry the difference — the tilde, the italic and the weight —
 * because one of them is a colour that greyscale removes and one is a typeface
 * variant that some fonts render weakly.
 *
 * The em dash is a real answer here. It says the record has nothing, which is
 * not the same as the time being unknown to the reader.
 */
export function EstimatedTime({ value }: { value: string | null }) {
  if (!value) return <Absent />;
  return <span className="text-label text-ink-subtle italic tabular">~{formatClock(value)}</span>;
}

export function ActualTime({ value }: { value: string | null }) {
  if (!value) return <Absent />;
  return <span className="text-label font-medium text-ink tabular">{formatClock(value)}</span>;
}

/**
 * A flight's time, which may have been revised — spec board 17.
 *
 * "scheduled, then revised": the original is struck through and muted, the new
 * one is caution. Both are shown, because a passenger who only sees the revised
 * time cannot tell whether it moved.
 */
export function FlightTime({
  scheduled,
  estimated,
}: {
  scheduled: string | null;
  estimated: string | null;
}) {
  // `estimated_time` is only sent when it differs from scheduled, so its
  // presence IS the revision — there is nothing to compare.
  if (!estimated) return <ActualTime value={scheduled} />;

  return (
    <span className="inline-flex items-baseline gap-2.5">
      {scheduled ? (
        <span className="text-label text-ink-subtle line-through tabular">
          {formatClock(scheduled)}
        </span>
      ) : null}
      <span className="text-label font-medium text-caution tabular">{formatClock(estimated)}</span>
      <span className="sr-only">revised from the scheduled time</span>
    </span>
  );
}

/** Not reported. Never a blank cell, which reads as a rendering fault. */
function Absent({ className }: { className?: string }) {
  return (
    <span className={cn('text-label text-ink-subtle tabular', className)}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">not reported</span>
    </span>
  );
}

/**
 * The gate cell — spec board 17.
 *
 * "`Gate 4` when assigned, `not reported` when null — never 'TBD', which sounds
 * like the Authority has decided and is withholding."
 */
export function GateCell({ gate }: { gate: string | null }) {
  if (!gate) return <span className="text-label text-ink-muted">not reported</span>;
  return <span className="text-label font-medium text-ink tabular">{gate}</span>;
}

/**
 * `06:40` — a bare 24-hour clock for a dense row.
 *
 * ── IT WAS WRITING THE BROWSER'S OWN FORMAT ─────────────────────────────────
 *
 * This was `toLocaleTimeString([], …)`, which on a US-configured browser renders
 * **`06:40 AM`** — a 12-hour clock in a column §5.4 draws as `06:40`, beneath a
 * banner that says `as of 06:10 AST` in 24-hour. §10: "Times are 24-hour with
 * the zone." The same defect was found and fixed in `SourceNotice`'s stamp and
 * in `DataSourceCard`'s; these are the cells the board is actually about, and
 * they were missed.
 *
 * The zone is deliberately not repeated per row: the meta strip and the source
 * banner carry it, and §5.4 writes the cell as four characters. Same constant,
 * same reasoning, as `CardBlock`'s row clock.
 */
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `06:40` from an ISO stamp; the raw string if it is not one. */
function formatClock(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  return CLOCK.format(when);
}
