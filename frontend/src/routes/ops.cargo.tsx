import { createFileRoute } from '@tanstack/react-router';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { TableError } from '@/components/ops/TableStates';
import { Skeleton } from '@/components/ui/Skeleton';
import { GuideTopics, NothingVerified } from '@/components/ops/guide/GuideSection';
import { CargoStatus } from '@/components/ops/cargo/CargoStatus';
import { useGuide } from '@/features/ops/queries';

/**
 * `/ops/cargo` — the console's **Cargo** tab.
 *
 * ## A Cargo tab is not a Cargo Tracking link
 *
 * `tests/console.test.tsx` has always asserted that the console offers no
 * "Cargo Tracking", and the reasoning is worth restating rather than assumed
 * safe now that a Cargo tab exists: a link promising to look up somebody's
 * container is the `personal_record` refusal wearing a nav label, and it is
 * read long before the refusal is.
 *
 * This tab does not promise that. It leads to what SCASPA has actually
 * published about cargo, and to a panel saying in as many words that cargo
 * status is not published online and that Pilot has no accounts with which to
 * look up a private consignment. The test still passes, and now it is guarding
 * a distinction the product actually makes rather than an absence.
 *
 * No operational aside. There is no cargo feed, no cargo gate map and no cargo
 * advisory source, so the panel column would be empty furniture — and an empty
 * aside on one tab of three reads as something failing to load.
 */
function OpsCargoRoute() {
  const guide = useGuide('cargo');
  const source = guide.data?.source;

  return (
    <ConsoleShell
      breadcrumb={['Console', 'Cargo']}
      title="Cargo"
      intro="Published information for the Deep Water Harbour cargo port."
    >
      <section className="space-y-4" aria-labelledby="ops-cargo-guide-heading">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="ops-cargo-guide-heading" className="text-section font-semibold text-ink">
            What SCASPA publishes about cargo
          </h2>
          {source ? <ProvenanceBadge kind="source" value={source.kind} /> : null}
        </div>

        {guide.isPending ? (
          <div className="space-y-2" role="status">
            <span className="sr-only">Loading published cargo information</span>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : guide.error ? (
          <TableError error={guide.error} onRetry={() => void guide.refetch()} />
        ) : (guide.data?.total ?? 0) === 0 ? (
          <NothingVerified subject="cargo" />
        ) : (
          <GuideTopics topics={guide.data?.topics ?? []} />
        )}
      </section>

      <hr className="border-border" />

      <section className="space-y-4" aria-labelledby="ops-cargo-status-heading">
        <h2 id="ops-cargo-status-heading" className="text-section font-semibold text-ink">
          Checking a consignment
        </h2>
        <CargoStatus />
      </section>
    </ConsoleShell>
  );
}

export const Route = createFileRoute('/ops/cargo')({
  component: OpsCargoRoute,
  head: () => ({
    meta: [
      { title: 'Cargo — Pilot Operations Console' },
      {
        name: 'description',
        content: 'Published SCASPA information for the Deep Water Harbour cargo port.',
      },
    ],
  }),
});
