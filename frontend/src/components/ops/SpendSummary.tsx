import { cn } from '@/lib/cn';

/**
 * Spend summary — spec board 10.
 *
 * ## Three categories, one tint ramp
 *
 * Chat, embedding, voice — and the swatches are brand-400/300/200 rather than
 * the status hues. Spend is not a status: a green segment would read as
 * "healthy" and an amber one as "watch this", and neither is a claim anyone can
 * make about a bill.
 *
 * ## Rows are not links
 *
 * "Rows are not clickable — no per-endpoint breakdown exists." The board's
 * out-of-scope panel says it again. A row that looks clickable and is not is a
 * worse outcome than a row that plainly is not.
 *
 * ## An unpriced category shows an em dash and says why
 *
 * Board 20: *"A 0.00 in a spend tile may mean 'unpriced', not 'free' — prices
 * default to zero until configured, so an unconfigured category shows an em
 * dash and says why."* Null and zero are different facts, and this is the one
 * place where confusing them understates a bill.
 */
export interface SpendCategory {
  label: string;
  /** Null when no price is configured — NOT zero. */
  amount: number | null;
}

const SWATCHES = ['bg-brand-400', 'bg-brand-300', 'bg-brand-200'] as const;

export function SpendSummary({
  categories,
  currency,
  total,
}: {
  categories: SpendCategory[];
  currency: string;
  /** Null when any category is unpriced — a total that omits one is not a total. */
  total: number | null;
}) {
  const priced = categories.filter(
    (c): c is SpendCategory & { amount: number } => c.amount !== null
  );
  const sum = priced.reduce((acc, c) => acc + c.amount, 0);

  return (
    <section className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-section font-semibold text-ink">Spend this month</h3>
        <span className="text-h3 font-semibold text-ink tabular">
          {total === null ? '—' : `${currency} ${total.toFixed(2)}`}
        </span>
      </div>

      {/* The proportion bar. Only priced categories have a share to draw. */}
      {sum > 0 ? (
        <div aria-hidden="true" className="flex h-4 gap-0.5 overflow-hidden rounded-lg">
          {priced.map((category, index) => (
            <div
              key={category.label}
              className={SWATCHES[index % SWATCHES.length]}
              style={{ width: `${(category.amount / sum) * 100}%` }}
            />
          ))}
        </div>
      ) : null}

      {/* A list, not a set of buttons. There is nothing behind a row. */}
      <ul className="flex flex-col gap-3">
        {categories.map((category, index) => (
          <li key={category.label} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                'size-2.5 shrink-0 rounded-[3px]',
                category.amount === null ? 'bg-border' : SWATCHES[index % SWATCHES.length]
              )}
            />
            <span className="flex-1 text-label font-medium text-ink">{category.label}</span>
            {category.amount === null ? (
              <span className="flex flex-col items-end">
                <span className="text-label font-medium text-ink-subtle">—</span>
                <span className="text-caption font-medium text-caution">no price configured</span>
              </span>
            ) : (
              <span className="text-label font-medium text-ink-muted tabular">
                {category.amount.toFixed(2)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="border-t border-border pt-3.5 text-caption font-medium text-ink-subtle">
        An estimate from metered usage. It is not a bill and will not match the invoice exactly.
      </p>
    </section>
  );
}
