import { Icon } from '@/components/ui/Icon';
import { ProvenanceCard } from './ProvenanceCard';
import type { TariffLineItem, TariffQuote } from '@/lib/types';

/**
 * The quote — §5.11.
 *
 * ```
 * meta strip:  CALCULATED · from the schedule
 * lines:       label 500 14/22 --text-1 · quantity_label 500 12/16 --text-3 · amount right
 * subtotal:    both sides 500 14/22 --text-2
 * total:       --surface-3 block; label 600 16/24; amount 600 20/28, prefixed XCD
 * disclaimer:  last child, --caution-fill, 400 13/20 --text-1
 * ```
 *
 * ## The disclaimer is not a footnote here, it is the component
 *
 * Every `rate` in the line items is a published SCASPA figure. The **total is
 * not** — it is arithmetic this product did, and it appears in no source. The
 * assistant is forbidden from producing such a figure at all (`prompts.py` rule
 * 4, "never estimate one"); the calculator is a narrow, deliberate exception,
 * and these properties are what keep the exception narrow:
 *
 * 1. every line shows its quantity and rate, so the arithmetic can be checked;
 * 2. the `CALCULATED` badge is on before the number is read, not after;
 * 3. `quote.disclaimer` is rendered in full, always, as the **last child**, and
 *    is not collapsible, truncatable or behind a tooltip.
 *
 * `tariffQuoteSchema` refuses a quote that arrives without a disclaimer, so
 * there is no code path that renders a bare total. Do not add one.
 *
 * ## Subtotal and total are separate rows even when they are equal
 *
 * "So a future surcharge line has a place to land without a redesign." The API
 * models them as two fields for the same reason, and with one line item the two
 * are equal by definition — which is exactly when the temptation to collapse
 * them arrives.
 *
 * ## And the quote that is short by a whole charge
 *
 * `quote.unpriced` lists codes that applied and have no published rate. They are
 * in no line item and in no figure, so **nothing else in the payload reveals
 * that anything is missing** — a quote with a dropped charge is byte-for-byte as
 * tidy as a complete one. The disclaimer does not cover it: "confirmed on
 * invoice" is about rounding and revision, not about a charge that was never
 * counted.
 *
 * So the line still appears, a critical banner sits **above the total**, and the
 * label becomes "Total so far" — **only when the flag is present**. Never
 * inferred by string-matching or by comparing line counts.
 *
 * ## What this replaced
 *
 * A four-column table (Charge · Rate · Quantity · Amount) in the legacy `ops-*`
 * palette, with no meta strip, `XCD` repeated on every figure, the disclaimer
 * drawn on a **full-strength critical fill**, and the incomplete-quote banner
 * *below* the total it contradicts.
 */
export function QuoteResult({ quote }: { quote: TariffQuote }) {
  const missing = quote.unpriced;
  const short = missing.length > 0;

  /*
   * Zero lines: no total at all — §5.11.
   *
   * "`XCD 0.00` would read as free, and prices default to zero until
   * configured." Two different reasons to distrust a zero, and a reader can tell
   * neither apart, so the figure is simply absent and the card says what to do
   * instead.
   *
   * The meta strip stays. The board draws this variant as a plain card, but the
   * definition of done is unconditional — "no operations payload renders
   * anywhere without a meta strip" — and a quote worked out from sample rates is
   * still worked out from sample rates when it comes to nothing.
   */
  if (quote.line_items.length === 0) {
    return (
      <ProvenanceCard source={quote.source} wide derived label="Estimate">
        <div className="flex flex-col items-start gap-2.5 p-6">
          <h3 className="text-section font-semibold text-ink">
            Nothing to charge for those figures
          </h3>
          <p className="text-label leading-5 text-ink-muted">
            No published charge applies to this combination. Change the figures, or telephone
            Finance and Billing on 869-465-8121.
          </p>
        </div>
      </ProvenanceCard>
    );
  }

  return (
    <ProvenanceCard source={quote.source} wide derived label="Estimate">
      <div className="px-5">
        {quote.line_items.map((line) => (
          <LineRow key={line.code} line={line} />
        ))}

        {/*
         * The charges that applied and could not be priced.
         *
         * Among the priced lines, where they would have appeared — not as a
         * footnote. A missing charge listed below the total is read after the
         * total has been believed, which is the whole failure this prevents.
         */}
        {missing.map((code) => (
          <UnpricedRow key={code} code={code} />
        ))}

        <div className="flex items-baseline justify-between gap-3.5 py-3">
          <span className="text-body font-medium text-ink-muted">Subtotal</span>
          <span className="text-body font-medium text-ink-muted tabular">
            {money(quote.subtotal)}
          </span>
        </div>
      </div>

      {short ? <IncompleteBanner codes={missing} /> : null}

      <div className="flex items-baseline justify-between gap-3.5 border-t border-border bg-surface-muted px-5 py-3.5">
        <span className="flex flex-col gap-0.5">
          {/*
           * ── "ESTIMATED CHARGE", NOT "TOTAL" ────────────────────────────────
           *
           * "Total" is what appears at the foot of an invoice. This figure is
           * arithmetic over a published schedule — nobody has been billed, no
           * account has been debited, and the number can change when the real
           * charge is raised. The Pilot spec asks that nothing here imply a bill
           * or a payment, and the single word "Total" implied both.
           *
           * "so far" survives the rename and is doing its own job: it is the
           * difference between a figure someone can budget against and a figure
           * they know to go and check, and it appears only when a charge could
           * not be priced.
           */}
          <span className="text-section font-semibold text-ink">
            {short ? 'Estimated charge so far' : 'Estimated SCASPA charge'}
          </span>
          {short ? (
            <span className="text-caption font-medium text-critical-text">
              {missing.length === 1 ? '1 charge missing' : `${missing.length} charges missing`}
            </span>
          ) : null}
        </span>
        <span className="text-h3 font-semibold text-ink tabular">
          {quote.currency} {money(quote.total)}
        </span>
      </div>

      {/*
       * Last child, always. `role="note"` rather than `alert`: it is a permanent
       * property of the figure above it, not an event.
       */}
      <p
        role="note"
        className="border-t border-border bg-caution-tint px-5 py-3 text-label leading-5 text-ink"
      >
        {quote.disclaimer}
      </p>
    </ProvenanceCard>
  );
}

/**
 * One priced line.
 *
 * The amount is bare and the total carries `XCD` — §10: "Currency is
 * `XCD 9,288.00` in totals, bare `9,288.00` in line items under an XCD-labelled
 * total." Repeating the code on every line is how a breakdown starts reading
 * like an invoice.
 */
function LineRow({ line }: { line: TariffLineItem }) {
  return (
    <div className="flex items-baseline justify-between gap-3.5 border-b border-border py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{line.label}</span>
        <span className="text-caption font-medium text-ink-muted tabular">
          {line.quantity_label} at {money(line.rate)}
          {/* §5.11: "`kb_id: null` on a line shows 'no source recorded' in the
              quantity line." The rate is published either way; whether it is
              indexed is a different claim and belongs beside the quantity. */}
          {line.kb_id === null ? ' · no source recorded' : ''}
        </span>
      </span>
      <span className="text-body font-medium text-ink tabular">{money(line.amount)}</span>
    </div>
  );
}

/**
 * A charge that applied and has no published rate — §5.11's BLOCKED row.
 *
 * ## The charge's name is not on the wire
 *
 * §5.11 draws the line with the charge's own label ("Berthage") above the
 * sub-line naming the code. `TariffQuote.unpriced` is `list[str]` — **codes and
 * nothing else** — and by definition the code is absent from the tariff table,
 * so there is no row to read a name from either. `build_quote` knows which
 * charge it was looking for; it does not say.
 *
 * So the code stands in as the label until the wire carries a name. It is not
 * invented, and the sub-line still says exactly what is wrong.
 */
function UnpricedRow({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between gap-3.5 border-b border-border py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-ink tabular">{code}</span>
        <span className="text-caption font-medium text-ink-muted">
          code {code} is not in the table
        </span>
      </span>
      {/* 24px, `--critical-fill`, 6px dot, `--critical-text` — the one status
          pill in the product that the handoff draws filled. */}
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill bg-critical-tint px-2.5 text-caption font-medium text-critical-text">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-critical" />
        Not priced
      </span>
    </div>
  );
}

/**
 * The banner, **above the total** — §5.11.
 *
 * `alert`, not `note`: unlike the disclaimer, this is not a standing property of
 * every quote. It is a specific defect in *this* one, and a screen-reader user
 * who has just asked for a figure needs to hear that it is wrong before they act
 * on it.
 */
function IncompleteBanner({ codes }: { codes: readonly string[] }) {
  return (
    <div
      role="alert"
      className="mx-5 mb-3.5 flex items-start gap-2.5 rounded-input border border-critical-notice-edge bg-critical-tint px-3.5 py-3"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-critical-text" />
      <span className="flex flex-col gap-0.5">
        <span className="text-label font-medium text-critical-text">This quote is incomplete</span>
        <span className="text-label leading-5 text-ink-muted">
          {codes.length === 1
            ? `Code ${codes[0]} has no published rate, so the total below is less than the amount payable.`
            : `${codes.length} codes (${codes.join(', ')}) have no published rate, so the total below is less than the amount payable.`}{' '}
          Call Marine Operations before quoting it to a customer.
        </span>
      </span>
    </div>
  );
}

/**
 * `2,670.00` — grouped, two decimals minimum, and **never rounded**.
 *
 * A rate published to three decimal places must print with three. §5.9 forbids
 * rounding in the table by name and the same figure runs through here.
 */
const MONEY = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
});

function money(value: number): string {
  return MONEY.format(value);
}
