import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { OpsPage } from '@/components/ops/OpsPage';
import { QuoteResult } from '@/components/ops/QuoteResult';
import { CargoCalculator, MaritimeCalculator } from '@/components/ops/TariffCalculators';
import { TariffTable } from '@/components/ops/TariffTable';
import { TableError, TableSkeleton } from '@/components/ops/TableStates';
import { useTariffQuote, useTariffs } from '@/features/ops/queries';
import type { TariffQuoteRequest } from '@/lib/types';

/**
 * Tariffs — §5.9 to §5.11, in the two steps the board is arranged around.
 *
 * **Step 1 quotes; step 2 derives.** The table above prints published figures
 * exactly as published; the calculators below produce a figure that appears in
 * no source, and it never appears without `QuoteResult`'s disclaimer — the
 * schema refuses a quote that arrives without one.
 *
 * ## Both filters go to the server
 *
 * `GET /api/tariffs` takes `q` and `category` and returns `total` counted after
 * both, plus `categories` computed from the **whole** table so that selecting
 * one never removes the way back. Nothing here filters the rows it was handed.
 *
 * ## The quote is one at a time, and the last one stays on screen
 *
 * Two calculators, one result: the maritime form and the cargo form price
 * different things and the answer to either replaces the answer to the other,
 * because two totals on screen at once is exactly the muscle-memory failure
 * §5.10 separates the forms to prevent.
 */
const PAGE_SIZE = 100;

function TariffsRoute() {
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const table = useTariffs({
    limit: PAGE_SIZE,
    offset,
    ...(category ? { category } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const quote = useTariffQuote();

  const data = table.data;
  const source = data?.source;

  const ask = (request: TariffQuoteRequest) => quote.mutate(request);

  return (
    /*
     * No `source` on the shell, and that is not an omission.
     *
     * `OpsPage` renders §5.2's screen banner for the tables that have no meta
     * strip of their own — vessels and flights. **Every payload on this screen
     * carries its own strip**: the schedule is a provenance card and so is the
     * quote. Passing it here put the same "sample data" sentence on screen
     * twice, one line above the card that was already saying it.
     */
    <OpsPage
      title="Port tariffs and fees"
      intro="Published schedule of port charges, aviation fees and cargo levies."
    >
      {/* ── Step 1 — the published table ──────────────────────────────────── */}
      {table.isPending ? (
        <TableSkeleton columns={['Code', 'Charge', 'Rate', 'Source']} />
      ) : table.error ? (
        // A failed request is not an empty schedule. §5.7's rate-limit card and
        // §7.1's shared envelope, through the one component that tells them
        // apart — the same path the vessels and flights tables take.
        <TableError error={table.error} onRetry={() => void table.refetch()} />
      ) : source ? (
        <TariffTable
          source={source}
          rows={data?.tariffs ?? []}
          total={data?.total ?? 0}
          categories={data?.categories ?? []}
          category={category}
          onCategoryChange={(next) => {
            setCategory(next);
            // Back to the first page: page 3 of a new result set is somebody
            // else's page.
            setOffset(0);
          }}
          search={search}
          onSearchChange={(next) => {
            setSearch(next);
            setOffset(0);
          }}
          offset={offset}
          limit={PAGE_SIZE}
          onOffsetChange={setOffset}
        />
      ) : null}

      {/* ── Step 2 — two calculators, deliberately unlike each other ──────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MaritimeCalculator onSubmit={ask} pending={quote.isPending} />
        <CargoCalculator onSubmit={ask} pending={quote.isPending} />
      </div>

      {quote.error ? (
        <p role="alert" className="text-label leading-5 text-critical-text">
          {quote.error.message}
        </p>
      ) : null}

      {quote.data ? <QuoteResult quote={quote.data} /> : null}
    </OpsPage>
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
