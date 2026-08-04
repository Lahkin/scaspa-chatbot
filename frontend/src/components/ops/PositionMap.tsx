import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ProvenanceCard } from './ProvenanceCard';
import type { DataSource, VesselPosition } from '@/lib/types';

/**
 * Vessel positions — §6.7, and **empty is the normal state**.
 *
 * ```
 * plot: height 200px; background --surface-1
 *       background-image: linear-gradient(#171A2B 1px, transparent 1px),
 *                         linear-gradient(90deg, #171A2B 1px, transparent 1px);
 *       background-size: 32px 32px;
 *       border-bottom: 1px solid --border
 * ```
 *
 * "Meta strip above it carries the `NO FEED` badge. **This is the expected
 * state, not an error.**" So the card is a `ProvenanceCard` like every other
 * operations block, and the emptiness is stated rather than apologised for.
 *
 * ## The grid is a pattern, not a gradient fill
 *
 * The product's rule is "no gradients inside the frame" and the two
 * `linear-gradient`s here are how §6.7 draws 1px grid lines — the same class of
 * exception as the recorded-questions fade, which ships as a mask. Nothing here
 * shades: every pixel is either `--surface-2` or the plot ground.
 *
 * ## What is drawn when positions exist, and why it is not a chart
 *
 * §6.7 draws only the empty state, which is the one that occurs: there is no AIS
 * receiver. The populated case keeps the treatment recorded when this panel was
 * first built — a list of coordinates, each with its `reported_by` in words:
 *
 * > "A map frame is the most confident thing on a screen. A reader who sees a
 * > chart with vessels on it believes the *chart* as much as the vessels: they
 * > read proximity, heading and distance-to-shore off the picture, none of which
 * > this data supports."
 *
 * The plot has no axes, no scale and no projection, so plotting a latitude on it
 * would assert a geometry the data does not carry. The **markers** are §6.7's,
 * because a marker that draws an estimate like a transponder fix invites reading
 * it as one.
 */
export function PositionMap({
  positions,
  source,
}: {
  positions: readonly VesselPosition[];
  /** Required, like every operations payload — implementation requirement #1. */
  source: DataSource;
}) {
  return (
    <ProvenanceCard source={source} label="Position reporting">
      {positions.length === 0 ? (
        <Plot>
          <Icon name="map" size={24} className="text-ink-muted" aria-hidden="true" />
          <span className="text-body font-medium text-ink">No positions are being reported</span>
          <span className="max-w-75 text-center text-label leading-5 text-ink-muted">
            No AIS receiver is connected to this assistant. Positions appear here only when one is.
          </span>
        </Plot>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {positions.map((position) => (
            <li key={position.id} className="flex items-start gap-2.5 px-4 py-3">
              <PositionMarker reportedBy={position.reported_by} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-label font-medium text-ink">{position.name}</span>
                <span className="text-caption font-medium text-ink-muted tabular">
                  {coordinate(position.latitude, 'NS')} {coordinate(position.longitude, 'EW')}
                </span>
                {/*
                 * §6.7: "**Null heading draws no arrow at all. Null speed is
                 * never 0 knots** — that would say the vessel is stopped. Both
                 * render 'not reported'."
                 */}
                <span className="text-caption font-medium text-ink-muted">
                  {REPORTED_BY[position.reported_by]} · Heading{' '}
                  <span className="tabular">
                    {position.heading_degrees === null
                      ? 'not reported'
                      : `${Math.round(position.heading_degrees)}°`}
                  </span>{' '}
                  · Speed{' '}
                  <span className="tabular">
                    {position.speed_knots === null
                      ? 'not reported'
                      : `${position.speed_knots.toFixed(1)} kn`}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProvenanceCard>
  );
}

/** The 200px plot, its 32px grid, and the hairline that closes it. */
function Plot({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-50 flex-col items-center justify-center gap-2.5 border-b border-border bg-surface-sunken"
      style={{
        backgroundImage:
          'linear-gradient(var(--color-surface-2) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-2) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    >
      {children}
    </div>
  );
}

/**
 * One marker — §6.7's three, and they differ by **shape** before hue.
 *
 * | `ais`       | 16px circle, `--info` fill, `2px solid --canvas`, `0 0 0 2px --info` |
 * | `operator`  | 16px **square**, `border-radius: 4px`, `--brand-400` fill           |
 * | `estimated` | 16px circle, **`1.5px dashed --caution`, no fill**                  |
 *
 * A transponder fix and a harbour master's best guess are different claims, and
 * a legend separating them by colour alone collapses in greyscale. `aria-hidden`
 * because the row beside it says which one in words.
 */
export function PositionMarker({ reportedBy }: { reportedBy: VesselPosition['reported_by'] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 size-4 shrink-0',
        reportedBy === 'ais' &&
          'rounded-full border-2 border-canvas bg-live shadow-[0_0_0_2px_var(--color-live)]',
        // The wire calls it `manual`; §6.7 calls it operator entry.
        reportedBy === 'manual' && 'rounded-[4px] bg-brand-400',
        reportedBy === 'estimated' && 'rounded-full border-[1.5px] border-dashed border-caution'
      )}
    />
  );
}

/** Spelled out. "AIS" means nothing to most readers. */
const REPORTED_BY: Record<VesselPosition['reported_by'], string> = {
  ais: 'AIS fix',
  manual: 'Operator entry',
  estimated: 'Estimated — not a report',
};

/**
 * Degrees with a hemisphere letter, to three decimals.
 *
 * A minus sign carrying "south" is a convention from a database, not from a
 * chart, and three decimals is about 100 m — as much precision as any of these
 * claims can carry.
 */
function coordinate(value: number, axis: 'NS' | 'EW'): string {
  const [positive, negative] = axis === 'NS' ? ['N', 'S'] : ['E', 'W'];
  return `${Math.abs(value).toFixed(3)}°${value >= 0 ? positive : negative}`;
}
