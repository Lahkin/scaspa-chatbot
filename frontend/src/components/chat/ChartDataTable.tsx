import { Icon } from '@/components/ui/Icon';
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
    <table className="w-full border-collapse">
      {/*
        The header row — §4.3: `padding 12px 16px; border-bottom`, a 16px table
        glyph in `--brand-300` and "Same figures as a table" at 500 13/18.
        It is a `<caption>` so it is the table's own accessible name rather than
        a heading floating above it.
      */}
      <caption className="border-y border-border px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-label font-medium text-ink">
          <Icon name="table" size={16} className="text-brand-300" />
          Same figures as a table
        </span>
        {/*
          The title only. The chart's own `<figcaption>` sits at the foot of the
          same card and carries the caption text — §4.2 makes it the card's last
          child, §4.3 gives the table "the same caption obligation", and inside
          one card one caption discharges both. Repeating it here reads the same
          sentence to a screen reader twice.
        */}
        <span className="sr-only">{spec.title}</span>
      </caption>
      <thead>
        {/* `600 11/16 uppercase 0.06em --text-3` — the eyebrow every column
            head in the product uses. It was a navy fill with white type, which
            is the one treatment §5.1 gives a TABLE header, not a card's. */}
        <tr className="text-micro font-semibold tracking-eyebrow text-ink-muted uppercase">
          <th scope="col" className="px-4 py-2.5 text-left">
            {spec.x_label}
          </th>
          {spec.series.map((series, index) => (
            <th key={index} scope="col" className="px-4 py-2.5 text-right">
              {spec.series.length > 1 ? series.name : spec.y_label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {xs.map((x) => (
          <tr key={String(x)} className="border-b border-border last:border-b-0">
            {/* label 400 13/20 --text-1 · value 500 13/20 --text-1 tabular */}
            <th
              scope="row"
              className="px-4 py-2.5 text-left text-label leading-5 font-normal text-ink"
            >
              {x}
            </th>
            {lookup.map((points, index) => {
              const value = points.get(String(x));
              return (
                <td
                  key={index}
                  className="px-4 py-2.5 text-right text-label leading-5 font-medium whitespace-nowrap text-ink tabular"
                >
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
