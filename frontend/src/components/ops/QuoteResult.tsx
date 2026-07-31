import type { TariffQuote } from '@/lib/types';

/**
 * The priced breakdown and its total.
 *
 * ## The disclaimer is not a footnote here, it is the component
 *
 * Every `rate` in the line items is a published SCASPA figure. The **total is
 * not** — it is arithmetic this product did, and it appears in no source. The
 * assistant is forbidden from producing such a figure at all (`prompts.py` rule
 * 4, "never estimate one"); the calculator is a narrow, deliberate exception,
 * and these three properties are what keep the exception narrow:
 *
 * 1. every line shows its rate, its quantity and its code, so the arithmetic can
 *    be checked by hand;
 * 2. the total is visibly labelled as an estimate rather than styled like an
 *    invoice line;
 * 3. `quote.disclaimer` is rendered in full, always, and is not collapsible.
 *
 * `tariffQuoteSchema` refuses a quote that arrives without a disclaimer, so
 * there is no code path that renders a bare total. Do not add one.
 */
export function QuoteResult({ quote }: { quote: TariffQuote }) {
  return (
    <section
      aria-labelledby="quote-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h3 id="quote-heading" className="text-body font-semibold text-ops-ink">
        Estimated charges
      </h3>

      {quote.line_items.length === 0 ? (
        <p className="mt-3 text-small text-ops-ink-variant">
          Nothing was priced from those details. Add a quantity or a length and try again.
        </p>
      ) : (
        // `relative`: see the note in console/DataTable.tsx — without it the
        // `sr-only` caption escapes this scroller and widens the document.
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-120 border-collapse text-small">
            <caption className="sr-only">
              Each line shows the published rate, how many units it was applied to, and the
              resulting amount. The rates are published; the total is calculated.
            </caption>
            <thead>
              <tr className="border-b border-ops-outline-variant text-ops-ink-variant">
                <th scope="col" className="py-2 text-left font-medium">
                  Charge
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Rate
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Quantity
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {quote.line_items.map((line) => (
                <tr key={line.code} className="border-b border-ops-outline-variant/60">
                  <td className="py-2 text-ops-ink">
                    {line.label}
                    <span className="block text-caption text-ops-ink-variant">
                      {line.code} · {line.basis}
                    </span>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-ops-ink">
                    {quote.currency} {line.rate.toFixed(2)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-ops-ink-variant">
                    {line.quantity_label || line.quantity}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap font-medium text-ops-ink">
                    {quote.currency} {line.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} className="py-2 text-right font-semibold text-ops-ink">
                  Estimated total
                </th>
                <td className="py-2 text-right font-semibold whitespace-nowrap text-ops-ink tabular">
                  {quote.currency} {quote.total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/*
       * Always rendered, never truncated, never behind a "show more".
       *
       * `role="note"` rather than `alert`: it is a permanent property of the
       * figure above it, not an event. It sits immediately under the total
       * because a warning placed further away is read after the number has
       * already been believed.
       */}
      <p
        role="note"
        className="mt-4 rounded-md border border-ops-alert-ink/30 bg-ops-alert-fill p-3 text-small text-ops-alert-ink"
      >
        {quote.disclaimer}
      </p>
    </section>
  );
}
