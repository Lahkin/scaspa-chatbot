import type { ChartSpec } from '@/lib/types';
import { formatNumber } from '@/features/chat/chartLayout';

/**
 * The chart, as data.
 *
 * **A chart is not an image, it is data**, and this is the same data — not a
 * summary of it and not a subset. It is rendered twice: once visually hidden so a
 * screen reader always has it, and once visibly when the reader presses "View as
 * table".
 *
 * Rendering the real numbers rather than a description is the point. A blind
 * judge asking "what does the chart say" should get the figures, and a sighted
 * one who cannot read a shallow slope on a projector should be able to press a
 * button and get them too.
 */
export function ChartDataTable({ spec }: { spec: ChartSpec }) {
  // Union of every x value, in first-seen order, so a series missing a point
  // shows a gap in the right row rather than shifting everything up.
  const xs: (string | number)[] = [];
  const seen = new Set<string>();
  for (const series of spec.series) {
    for (const point of series.points) {
      const key = String(point.x);
      if (!seen.has(key)) {
        seen.add(key);
        xs.push(point.x);
      }
    }
  }

  const lookup = spec.series.map(
    (series) => new Map(series.points.map((point) => [String(point.x), point.y]))
  );

  return (
    <table className="w-full border-collapse text-small tabular">
      <caption className="sr-only">
        {spec.title}. {spec.caption}
      </caption>
      <thead>
        <tr className="bg-navy text-ink-inverse">
          <th scope="col" className="px-3 py-2 text-left font-semibold">
            {spec.x_label}
          </th>
          {spec.series.map((series, index) => (
            <th key={index} scope="col" className="px-3 py-2 text-right font-semibold">
              {spec.series.length > 1 ? series.name : spec.y_label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {xs.map((x, rowIndex) => (
          <tr
            key={String(x)}
            className={
              rowIndex % 2 === 1
                ? 'border-b border-border bg-surface-muted last:border-b-0'
                : 'border-b border-border last:border-b-0'
            }
          >
            <th scope="row" className="px-3 py-2 text-left font-normal">
              {x}
            </th>
            {lookup.map((points, index) => {
              const value = points.get(String(x));
              return (
                <td key={index} className="px-3 py-2 text-right whitespace-nowrap">
                  {/* An absent point is a gap, not a zero — on a tonnage table
                      those are very different claims. */}
                  {value === undefined ? '—' : formatNumber(value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
