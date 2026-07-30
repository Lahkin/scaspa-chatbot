/**
 * The decisions a chart has to make before it can be drawn on a phone.
 *
 * Pure functions, separate from any Recharts import, so they can be tested
 * without a DOM and without loading a 400kB dependency — and so the rules can be
 * read in one place rather than inferred from props scattered through JSX.
 */

import type { ChartSpec, ChartType } from '@/lib/types';

/**
 * Month names, shortened.
 *
 * At 390px a twelve-point line chart with "September" on the axis rotates its
 * labels to 45° and becomes unreadable — the classic failure. Three letters fit
 * horizontally, which is worth far more than the extra six characters.
 */
const MONTHS: Record<string, string> = {
  january: 'Jan',
  february: 'Feb',
  march: 'Mar',
  april: 'Apr',
  may: 'May',
  june: 'Jun',
  july: 'Jul',
  august: 'Aug',
  september: 'Sep',
  october: 'Oct',
  november: 'Nov',
  december: 'Dec',
};

/**
 * Shorten an axis label for a narrow screen.
 *
 * Months are the common case and have a universally understood abbreviation.
 * Anything else is truncated with an ellipsis rather than guessed at — inventing
 * an abbreviation for "Basseterre" would be worse than a clipped word.
 */
export function shortenLabel(value: string | number, maxLength = 6): string {
  const text = String(value);
  const month = MONTHS[text.trim().toLowerCase()];
  if (month) return month;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * How many ticks to skip so labels do not collide.
 *
 * Recharts' `interval` is "skip this many between each shown". Returning 0 shows
 * every tick. The budget is derived from the available width rather than from a
 * fixed breakpoint, because the widget is 380px wide inside an iframe on a
 * desktop and has exactly the same problem as a phone.
 */
export function tickInterval(pointCount: number, widthPx: number): number {
  // ~44px per label before three-letter months start touching.
  const affordable = Math.max(2, Math.floor(widthPx / 44));
  if (pointCount <= affordable) return 0;
  // Show roughly `affordable` of them, evenly spaced.
  return Math.ceil(pointCount / affordable) - 1;
}

/**
 * Above this many categories, a vertical bar chart on a phone is a row of
 * slivers with unreadable labels. Turned on its side, the labels get a full line
 * each and the bars get the long axis.
 */
export const HORIZONTAL_BAR_THRESHOLD = 6;

export function shouldLayoutHorizontally(
  type: ChartType,
  categoryCount: number,
  widthPx: number
): boolean {
  // Only bars: a horizontal line chart is a different chart, not a rotation.
  if (type !== 'bar') return false;
  if (widthPx >= 640) return false;
  return categoryCount > HORIZONTAL_BAR_THRESHOLD;
}

/** Longest series, which is what the axis has to accommodate. */
export function pointCount(spec: ChartSpec): number {
  return spec.series.reduce((max, series) => Math.max(max, series.points.length), 0);
}

/**
 * Recharts wants one row per x value with a column per series.
 *
 * Series are keyed by index rather than by name: two series may legitimately
 * share a name, and a duplicate key would silently drop one of them.
 */
export interface ChartRow {
  x: string | number;
  [seriesKey: string]: string | number | null;
}

export function seriesKey(index: number): string {
  return `s${index}`;
}

export function toRows(spec: ChartSpec): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  const order: string[] = [];

  for (const [index, series] of spec.series.entries()) {
    for (const point of series.points) {
      const key = String(point.x);
      let row = rows.get(key);
      if (!row) {
        row = { x: point.x };
        rows.set(key, row);
        order.push(key);
      }
      row[seriesKey(index)] = point.y;
    }
  }

  // A series missing a point must render as a gap, not as zero — zero is a
  // measurement and a gap is an absence, and on a tonnage chart they are very
  // different claims.
  for (const row of rows.values()) {
    for (let index = 0; index < spec.series.length; index += 1) {
      if (!(seriesKey(index) in row)) row[seriesKey(index)] = null;
    }
  }

  return order.map((key) => rows.get(key) as ChartRow);
}

/**
 * A sentence describing the shape of the data, for `aria-label`.
 *
 * A chart is not decoration and it is not an image of a thing — it *is* the data.
 * A screen-reader user given only "chart" has been told nothing, and the exact
 * numbers are in the data table below; what the label owes them is the summary a
 * sighted reader gets for free from the shape: what it measures, over what range,
 * and which way it goes.
 *
 * Everything here is computed from the numbers. Nothing is inferred, and no
 * adjective is used that the data does not support.
 */
export function describeChart(spec: ChartSpec): string {
  const parts: string[] = [`${spec.type} chart. ${spec.title}.`];

  for (const series of spec.series) {
    const values = series.points.map((point) => point.y);
    if (values.length === 0) continue;

    const first = values[0] as number;
    const last = values[values.length - 1] as number;
    const min = Math.min(...values);
    const max = Math.max(...values);

    const from = String(series.points[0]?.x ?? '');
    const to = String(series.points[series.points.length - 1]?.x ?? '');

    // "rises" / "falls" only when the endpoints actually differ. A flat series
    // gets said so rather than being described as a trend of size zero.
    const direction = last > first ? 'rises' : last < first ? 'falls' : 'is unchanged';

    const label = spec.series.length > 1 ? `${series.name}: ` : '';
    parts.push(
      `${label}${values.length} points from ${from} to ${to}, ` +
        `${direction} from ${formatNumber(first)} to ${formatNumber(last)} ${spec.y_label}, ` +
        `ranging ${formatNumber(min)} to ${formatNumber(max)}.`
    );
  }

  return parts.join(' ');
}

/** Grouped thousands in the reader's own locale, which is what the axis shows too. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value);
}
