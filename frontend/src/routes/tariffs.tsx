import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Input } from '@/components/ui';
import { OpsListState, OpsPage } from '@/components/ops/OpsPage';
import { QuoteResult } from '@/components/ops/QuoteResult';
import { TariffTable } from '@/components/ops/TariffTable';
import { useTariffQuote, useTariffs } from '@/features/ops/queries';
import type { TariffCategory } from '@/lib/types';

/**
 * Port tariffs and the fee calculator — the design's `port_tariffs_expanded_view`.
 *
 * Two halves with a deliberate difference between them: the table above quotes
 * **published** figures, and the calculator below **derives** one. The derived
 * figure never appears without `QuoteResult`'s disclaimer, and the schema
 * refuses a quote that arrives without one.
 */
function TariffsRoute() {
  const [category, setCategory] = useState<TariffCategory | ''>('');
  const [search, setSearch] = useState('');

  const table = useTariffs({
    ...(category ? { category } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const rows = table.data?.tariffs ?? [];

  return (
    <OpsPage
      title="Port tariffs and fees"
      intro="Published schedule of port charges, aviation fees and cargo levies."
      source={table.data?.source}
    >
      <div className="flex flex-wrap gap-2">
        {['', ...(table.data?.categories ?? [])].map((value) => (
          <button
            key={value || 'all'}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value as TariffCategory | '')}
            className={
              category === value
                ? 'min-h-touch rounded-sm bg-ops-navy px-3 text-small font-semibold text-ink-inverse'
                : 'min-h-touch rounded-sm border border-ops-outline px-3 text-small font-medium text-ops-ink capitalize'
            }
          >
            {value || 'All'}
          </button>
        ))}
      </div>

      <Input
        label="Search tariffs"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Service or code"
      />

      <OpsListState
        isLoading={table.isPending}
        error={table.error ?? null}
        isEmpty={rows.length === 0}
        emptyTitle="No published rates are available"
        emptyHint="Call SCASPA on 869-465-8121 / 2 / 3 for a current tariff schedule."
        onRetry={() => void table.refetch()}
      />

      {rows.length > 0 ? <TariffTable rows={rows} /> : null}

      <FeeCalculator />
    </OpsPage>
  );
}

/**
 * The calculator.
 *
 * Inputs are deliberately conservative: no free-text currency (converting a
 * published fee applies a rate nobody published, and the backend rejects
 * anything but XCD), and no field that would let someone enter a rate. The only
 * things a user supplies are quantities; every price comes from the table above.
 */
function FeeCalculator() {
  const [containerSize, setContainerSize] = useState<'20ft' | '40ft'>('20ft');
  const [units, setUnits] = useState(1);
  const [storageDays, setStorageDays] = useState(0);
  const quote = useTariffQuote();

  return (
    <section
      aria-labelledby="calculator-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface-low p-4"
    >
      <h2 id="calculator-heading" className="text-h3 font-semibold text-ops-ink">
        Estimate cargo charges
      </h2>
      <p className="mt-1 text-small text-ops-ink-variant">
        Applies the published rates above to the quantities you enter. The result is an estimate,
        not a bill.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          quote.mutate({
            category: 'cargo',
            container_size: containerSize,
            units,
            storage_days: storageDays,
          });
        }}
      >
        <fieldset>
          <legend className="text-small font-medium text-ops-ink">Container size</legend>
          <div className="mt-1 flex gap-2">
            {(['20ft', '40ft'] as const).map((size) => (
              <label
                key={size}
                className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-sm border border-ops-outline px-3 text-small text-ops-ink"
              >
                <input
                  type="radio"
                  name="container-size"
                  value={size}
                  checked={containerSize === size}
                  onChange={() => setContainerSize(size)}
                />
                {size}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Number of containers"
            type="number"
            min={0}
            max={10000}
            numeric
            value={units}
            onChange={(event) => setUnits(Number(event.target.value) || 0)}
          />
          <Input
            label="Days in storage"
            type="number"
            min={0}
            max={365}
            numeric
            value={storageDays}
            onChange={(event) => setStorageDays(Number(event.target.value) || 0)}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={quote.isPending}>
            Calculate
          </Button>
          <Button type="button" variant="ghost" onClick={() => quote.reset()}>
            Reset
          </Button>
        </div>
      </form>

      {quote.error ? (
        <p role="alert" className="mt-4 text-small text-ops-alert-ink">
          {quote.error.message}
        </p>
      ) : null}

      {quote.data ? (
        <div className="mt-4">
          <QuoteResult quote={quote.data} />
        </div>
      ) : null}
    </section>
  );
}

export const Route = createFileRoute('/tariffs')({
  component: TariffsRoute,
  head: () => ({
    meta: [
      { title: 'Port tariffs — SCASPA Assistant' },
      {
        name: 'description',
        content: 'Published SCASPA port charges, aviation fees and cargo levies.',
      },
    ],
  }),
});
