import { cn } from '@/lib/cn';
import type { IndexStatus } from '@/lib/types';

/**
 * The index status panel — §6.12.
 *
 * ```
 * header: 8px --caution dot + 500 14/22 --text-1 "Search index not ready"
 * rows:   padding 10px 16px; border-bottom; label 500 13/20 --text-2 / value right
 * ```
 *
 * ## Every field reads "unknown", never 0
 *
 * > "Zero documents is a fact about an index that **was built**; this index has
 * > not reported at all."
 *
 * That is global rule 1 in its sharpest form. `IndexStatus` keeps every count
 * nullable for exactly this reason, and `?? 0` on any of them would turn "we do
 * not know" into "we looked and there was nothing" — the same substitution the
 * berth-occupancy tile exists to prevent.
 *
 * ## The version string is the whole feature
 *
 * > "The version string is the only visible trace of the offline scripts. **No
 * > rebuild control, no progress, no job status.**"
 *
 * `08-blocked-and-forbidden.md` lists an admin "rebuild index" button — "or any
 * trigger, progress bar or job-status view for the offline scripts" — among the
 * things that must not be built. There is no button here and there is not going
 * to be one.
 */
export function IndexStatusPanel({ index }: { index: IndexStatus }) {
  return (
    <section
      aria-labelledby="index-status-heading"
      className="overflow-hidden rounded-panel border border-border bg-surface"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', index.ready ? 'bg-positive' : 'bg-caution')}
        />
        <h3 id="index-status-heading" className="text-body font-medium text-ink">
          {index.ready ? 'Search index ready' : 'Search index not ready'}
        </h3>
      </div>

      <dl className="flex flex-col">
        {/* Knowledge-base rows indexed. A row is this system's document. */}
        <Row label="Documents" value={count(index.kb_rows)} />
        {/*
         * BLOCKED — there is no chunk count on the wire.
         *
         * `IndexStatus` carries `kb_rows` and `web_docs`, and **`web_docs` is
         * not chunks**: it counts web documents, which is a different quantity
         * that would read as a chunk count under this label. §6.12's own rule
         * settles what to draw instead — "Every field reads 'unknown', never 0"
         * — and unknown is exactly what this is until the field lands.
         */}
        <Row label="Chunks" value={null} />
        <Row label="Built" value={built(index.index_built_at)} />
        <Row label="Version" value={index.kb_version} last />
      </dl>

      <p className="border-t border-dashed border-border px-4 py-3 text-caption font-medium text-ink-muted">
        The version string is the only visible trace of the offline scripts. No rebuild control, no
        progress, no job status.
      </p>
    </section>
  );
}

/**
 * One row. A null prints "unknown" in the placeholder ink, because it is not a
 * value — it is the absence of one, and §6.12 draws it that way.
 */
function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string | null;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 px-4 py-2.5',
        last ? undefined : 'border-b border-border'
      )}
    >
      <dt className="text-label leading-5 text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'text-label leading-5 font-medium tabular',
          value === null ? 'text-ink-muted' : 'text-ink'
        )}
      >
        {value ?? 'unknown'}
      </dd>
    </div>
  );
}

/** `1,284`, or null — and null is never `0`. */
function count(value: number | null): string | null {
  return value === null ? null : value.toLocaleString('en-GB');
}

/** `28 Jul 2026` — §10's dense-row date. Null stays null. */
const BUILT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function built(value: string | null): string | null {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? value : BUILT.format(when);
}
