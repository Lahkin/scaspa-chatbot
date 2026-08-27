import { createFileRoute } from '@tanstack/react-router';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { OperationalAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { GateMap } from '@/components/ops/GateMap';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { TableError } from '@/components/ops/TableStates';
import { Skeleton } from '@/components/ui/Skeleton';
import { GuideTopics, NothingVerified } from '@/components/ops/guide/GuideSection';
import { FlightMovements } from '@/components/ops/flights/FlightMovements';
import { useFlights, useGateMap, useGuide } from '@/features/ops/queries';

/**
 * `/ops/flights` — the console's **Airport** tab.
 *
 * The same rewrite as `/ops/vessels`, for the same reason: this carried its own
 * search, pagination, `DataTable` and metric tiles over the same `useFlights`
 * query the public screen renders. §22 — "use the SAME backend services as the
 * public pages, do not duplicate data fetching logic."
 *
 * `useFlights` is still called here, but only for the advisory the aside panel
 * needs; the movements table owns its own copy of that query and React Query
 * serves both from one request when the parameters match.
 *
 * The console keeps the gate map and the console-toned advisory panel, which
 * are the operator's instrumentation and are not on the public screen.
 */
function OpsFlightsRoute() {
  const guide = useGuide('airport');
  const gates = useGateMap();
  /*
   * The advisory only. `FlightMovements` runs the paged query it needs and this
   * one asks for a single row, so the aside is not waiting on a table it does
   * not draw.
   */
  const advisory = useFlights({ limit: 1 });

  const source = guide.data?.source;

  return (
    <ConsoleShell
      breadcrumb={['Console', 'Airport']}
      title="Airport"
      intro="Published information and movements for R. L. Bradshaw International Airport."
      aside={
        <>
          <OperationalAdvisoryPanel advisory={advisory.data?.advisory ?? null} tone="console" />
          {/*
            §6.8. `active` and `total` are the SERVER's figures — never
            recomputed from the visible rows, which would drop to zero under a
            filter — so they are required props and the panel does not render
            until the response carries them.
          */}
          {gates.data ? (
            <GateMap gates={gates.data.gates} active={gates.data.active} total={gates.data.total} />
          ) : null}
        </>
      }
    >
      <section className="space-y-4" aria-labelledby="ops-airport-guide-heading">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="ops-airport-guide-heading" className="text-section font-semibold text-ink">
            What SCASPA publishes about the airport
          </h2>
          {source ? <ProvenanceBadge kind="source" value={source.kind} /> : null}
        </div>

        {guide.isPending ? (
          <div className="space-y-2" role="status">
            <span className="sr-only">Loading published airport information</span>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : guide.error ? (
          <TableError error={guide.error} onRetry={() => void guide.refetch()} />
        ) : (guide.data?.total ?? 0) === 0 ? (
          <NothingVerified subject="the airport" />
        ) : (
          <GuideTopics topics={guide.data?.topics ?? []} />
        )}
      </section>

      <hr className="border-border" />

      <FlightMovements />
    </ConsoleShell>
  );
}

export const Route = createFileRoute('/ops/flights')({
  component: OpsFlightsRoute,
  head: () => ({
    meta: [
      { title: 'Airport — Pilot Operations Console' },
      {
        name: 'description',
        content:
          'Published information and flight movements for R. L. Bradshaw International Airport.',
      },
    ],
  }),
});
