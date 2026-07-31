import type { TariffRow } from '@/lib/types';

/**
 * The published rate table.
 *
 * Every figure here **is** published — these are quoted, not derived, which is
 * what separates this component from `FeeCalculator` next to it. The `as_of`
 * column is not decoration: a tariff verified eighteen months ago is a different
 * claim from one verified last week, and the reader is the only one who can
 * weigh that.
 */
export function TariffTable({ rows }: { rows: TariffRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-4 text-small text-ops-ink-variant">
        No published rates match that search.
      </p>
    );
  }

  return (
    // Wide content scrolls inside its own container; the page never scrolls
    // sideways. A tariff table on a 320px phone is the case that breaks this.
    //
    // `role="region"` + a name + `tabIndex` for the same reason as the console's
    // DataTable: a scroll container that cannot be focused cannot be scrolled by
    // keyboard, so the columns past the fold are unreachable. Missed here first
    // time and caught by `npm run check:a11y` as `scrollable-region-focusable`.
    <div
      role="region"
      aria-label="Published tariffs (scrolls sideways)"
      tabIndex={0}
      // `relative` so the `sr-only` caption is clipped with the table rather
      // than escaping it. See the note in console/DataTable.tsx.
      className="relative overflow-x-auto rounded-lg border border-ops-outline-variant"
    >
      <table className="w-full min-w-140 border-collapse text-small">
        <caption className="sr-only">
          Published SCASPA tariffs, with the code, what the rate applies to, the amount, and the
          date each was verified.
        </caption>
        <thead>
          <tr className="bg-ops-navy text-ink-inverse">
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Code
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Service
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Basis
            </th>
            {/* The rate is the quantity column, so it carries the amber — on
                `ops-navy` it measures 8.81:1. Same departure-board treatment as
                the chat's ScheduleTable, in this surface's own navy rather than
                the chat one, so the two palettes stay separate. */}
            <th scope="col" className="px-3 py-2 text-right font-semibold text-amber-board">
              Rate
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Verified
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.code}
              className={index % 2 === 1 ? 'bg-ops-surface-low' : 'bg-ops-surface'}
            >
              <td className="px-3 py-2 font-medium text-ops-ink">{row.code}</td>
              <td className="px-3 py-2 text-ops-ink">{row.service}</td>
              <td className="px-3 py-2 text-ops-ink-variant">{row.basis}</td>
              {/* Right-aligned and tabular so a column of fees can be scanned.
                  `td` already carries tabular-nums from the base layer.

                  The navy runs the whole way down the rate column, not just
                  across the header: half a departure board is a table with a
                  coloured header. It also covers the zebra stripe underneath,
                  which is the intended result — the stripe is there to help the
                  eye track a row, and this column is already picked out. */}
              <td className="bg-ops-navy px-3 py-2 text-right whitespace-nowrap text-amber-board">
                {row.currency} {row.amount.toFixed(2)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-ops-ink-variant">
                {row.as_of ? <time dateTime={row.as_of}>{row.as_of}</time> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
