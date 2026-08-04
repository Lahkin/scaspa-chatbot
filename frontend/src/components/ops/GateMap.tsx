import { cn } from '@/lib/cn';
import { GateStatusChip } from './StatusChip';
import type { GateAssignment } from '@/lib/types';

/**
 * The gate map — §6.8.
 *
 * ```
 * header: 600 16/24 --text-1 "Gate assignments" + 500 13/18 --text-2 "2 active of 8"
 * tiles:  2-column grid; padding 12px; border-radius 12px; --surface-3
 *         border tinted to the gate status at 35% (1px dashed --border unassigned)
 *         gate number 500 13/18 --text-1 tabular + a status pill
 * ```
 *
 * ## The active count comes from the server
 *
 * "It is never recomputed from the visible rows, which would drop to zero under
 * a filter." `active` and `total` are props for that reason — the same figures
 * the flights screen shows, so two components cannot decide separately what
 * "active" means and drift apart.
 *
 * ## No pagination
 *
 * "Gates return the complete set and accept no `limit`/`offset`." §2.7's ops
 * list header is the control for this shape of data, and
 * `08-blocked-and-forbidden.md` forbids paging it outright.
 *
 * ## A grid of stands, not an apron diagram
 *
 * Kept from when this panel was first built, and still true: a plan view would
 * assert a geometry — which stand is next to which — that the feed does not
 * contain. The design's "real-time aircraft positioning and passenger flow"
 * has nothing behind it and is not drawn.
 */
export function GateMap({
  gates,
  active,
  total,
}: {
  gates: readonly GateAssignment[];
  /** The server's figure. Never `gates.filter(...).length`. */
  active: number;
  total: number;
}) {
  return (
    <section
      aria-labelledby="gate-map-heading"
      className="overflow-hidden rounded-panel border border-border bg-surface"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-4 py-3.5">
        <h3 id="gate-map-heading" className="text-section font-semibold text-ink">
          Gate assignments
        </h3>
        <span className="text-label text-ink-muted tabular">
          {active} active of {total}
        </span>
      </div>

      {gates.length === 0 ? (
        <p className="px-4 py-6 text-label leading-5 text-ink-muted">
          No apron feed is connected to this assistant. Published gate assignments, where the feed
          gives them, are in the flight table&rsquo;s Gate column.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 p-4">
          {gates.map((gate) => (
            <li
              key={gate.gate}
              className={cn(
                'flex flex-col gap-1.5 rounded-input bg-surface-muted p-3',
                // The tile's edge carries the status at 35%, and the one status
                // with no hue carries the dashed edge instead — §6.8, and the
                // same absent-versus-value distinction Family B draws.
                EDGES[gate.status]
              )}
            >
              <span className="text-label font-medium text-ink tabular">{gate.gate}</span>
              <span className="self-start">
                <GateStatusChip status={gate.status} size="sm" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The tile edge, at 35% of the status hue.
 *
 * Solid composites rather than alpha, for the reason `tokens.css` gives: a
 * contrast ratio cannot be computed against a translucent colour, so an alpha
 * border is a figure nobody has measured. These are the 45% edges the status
 * pills already use — the nearest measured step, and the one this project
 * already asserts.
 */
const EDGES: Record<GateAssignment['status'], string> = {
  occupied: 'border border-positive-edge',
  boarding: 'border border-live-edge',
  closed: 'border border-border',
  free: 'border border-dashed border-border',
};
