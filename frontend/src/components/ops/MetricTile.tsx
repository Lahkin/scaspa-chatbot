import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * One metric tile — §5.3.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px; gap: 8px
 * label 500 12px/16px --text-2 · value 600 30px/38px --text-1 tabular
 * ```
 *
 * ## `null` renders as an em dash, and this is the one that matters most
 *
 * > "**Rendering 0 in the occupancy tile would say the port is empty. That is
 * > the single most dangerous default in the product.** Route every numeric cell
 * > through one `renderValue` helper that maps null to the em dash; never
 * > `?? 0`."
 *
 * A feed that does not report berth occupancy has not reported zero. The tile
 * shows `—` plus "not reported" beneath it, so the absence is stated rather than
 * left to be inferred from a dash.
 *
 * ## What changed from the previous tile
 *
 * The label was uppercase and letter-spaced — the 11px eyebrow treatment, which
 * §5.3 does not use here — the value was 24px rather than 30, the radius was
 * 12px rather than 16, and the whole tile was drawn in the legacy `ops-*`
 * aliases from the operations screens' second palette. The handoff has one
 * palette for the whole product.
 */
export function MetricTile({
  label,
  value,
  /** e.g. `%`. Suppressed when the value is unknown. */
  suffix,
  /**
   * The recessive half of a ratio — `/ 11` in "Alongside of expected".
   *
   * `500 20px/28px --text-3`: the numerator is the figure and the denominator is
   * context, so they are deliberately not the same size. Suppressed with the
   * value, because half a ratio is worse than none.
   */
  ratio,
}: {
  label: string;
  value: number | null;
  suffix?: string | undefined;
  ratio?: ReactNode;
}) {
  const known = value !== null && value !== undefined && Number.isFinite(value);

  return (
    <div
      // No `min-w`, no `shrink-0`: the tile takes the width its container gives
      // it. Those two turned the row into a horizontal scroller on a phone, and
      // a scroll container that is not focusable is unreachable by keyboard
      // (axe `scrollable-region-focusable`).
      className="flex flex-col gap-2 rounded-panel border border-border bg-surface px-5 py-4.5"
    >
      <p className="text-caption font-medium text-ink-muted">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span
          className={
            known
              ? 'text-h1 font-semibold text-ink tabular'
              : 'text-h1 font-semibold text-ink-muted'
          }
        >
          {known ? formatValue(value) : '—'}
        </span>
        {known && suffix ? (
          <span className="text-h3 font-medium text-ink-muted tabular">{suffix}</span>
        ) : null}
        {known && ratio ? (
          <span className="text-h3 font-medium text-ink-muted tabular">{ratio}</span>
        ) : null}
      </p>
      {/*
        The absence, said in words. A bare em dash is read as "no value here";
        "not reported" is read as "the feed did not say", and only the second is
        true. Rendered only when there is nothing, so a populated tile is two
        lines rather than three.
      */}
      {known ? null : <p className="text-caption font-medium text-ink-muted">not reported</p>}
    </div>
  );
}

function formatValue(value: number): string {
  // A percentage arrives as 94.8 and must not become "95". A count arrives as
  // 12450 and reads better grouped.
  return Number.isInteger(value) ? value.toLocaleString('en-GB') : value.toFixed(1);
}

/**
 * The row of tiles.
 *
 * It wraps rather than scrolling sideways, for two reasons: a scroll container
 * has to be keyboard focusable or its contents are unreachable, and four short
 * stats fit on two lines at 320px. Removing the scroll removes the problem
 * rather than making the problem accessible.
 *
 * `columns` is the handoff's count for the screen — **four on Vessels, three on
 * Flights** (§5.3). It was fixed at four, so the three-tile screen drew its row
 * with a quarter of it empty and the tiles narrower than the board draws them.
 * Two static class strings rather than an interpolated one: Tailwind scans
 * source text, and `lg:grid-cols-${n}` is a class that never gets generated.
 */
export function MetricRow({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 min-[420px]:grid-cols-2',
        columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
      )}
    >
      {children}
    </div>
  );
}
