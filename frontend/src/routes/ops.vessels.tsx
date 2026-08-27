import { createFileRoute } from '@tanstack/react-router';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { MarineAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { PositionMap } from '@/components/ops/PositionMap';
import { HealthPanel } from '@/components/ops/HealthPanel';
import { IndexStatusPanel } from '@/components/ops/IndexStatusPanel';
import { CruiseSchedule } from '@/components/ops/cruise/CruiseSchedule';
import { VesselMovements } from '@/components/ops/VesselMovements';
import { useHealth } from '@/features/chat/queries';
import { useMarineAdvisories, useVesselPositions } from '@/features/ops/queries';
import { config as appConfig } from '@/lib/config';

/**
 * `/ops/vessels` — the console's **Cruise & Vessels** tab.
 *
 * ── IT USED TO BE A SECOND IMPLEMENTATION OF `/vessels` ──────────────────────
 *
 * This route carried its own search field, its own pagination, its own
 * `DataTable`, its own metric tiles and its own empty states — roughly 150
 * lines rendering the same `useVessels` query the public screen renders. Two
 * copies of one screen is two places for the ETA/ATA distinction to be lost,
 * two places for a filter to start lying about `total`, and two places to fix
 * anything found in either.
 *
 * §22 is explicit: "Use the SAME backend services as the public pages. Do not
 * duplicate data fetching logic." So the tab is now the public sections
 * themselves — `CruiseSchedule` and `VesselMovements`, the exact components
 * `/vessels` renders — with the console's operational panels beside them.
 *
 * ## What the console is FOR, once the tables are shared
 *
 * The panels in the aside, and nothing else. Position reports, marine
 * advisories, service health and index freshness are operational instrumentation
 * that a traveller has no use for and an operator does. That is the whole of the
 * difference now, which is a more honest answer than a second table that looked
 * different for no reason.
 */
function OpsVesselsRoute() {
  /*
   * Separate queries, deliberately. A screen that draws no map should not wait
   * on one, and a real AIS integration may be slow without slowing the tables.
   */
  const positions = useVesselPositions();
  const marine = useMarineAdvisories();
  const health = useHealth();

  return (
    <ConsoleShell
      breadcrumb={['Console', 'Cruise & Vessels']}
      title="Cruise & Vessels"
      intro="Published cruise calls and vessel movements across SCASPA port facilities."
      aside={
        <>
          {/*
            §6.7 and §6.9. The position map is absent rather than empty when the
            request has not resolved — a panel that renders its "not connected"
            state from an unresolved query says something it does not yet know.
          */}
          {positions.data ? (
            <PositionMap positions={positions.data.positions} source={positions.data.source} />
          ) : null}
          <MarineAdvisoryPanel
            advisories={marine.data?.advisories ?? []}
            total={marine.data?.total ?? 0}
          />
          {/* §6.11 and §6.12 — these two have no other home in the product. */}
          <HealthPanel health={health} voiceEnabled={appConfig.features.voice} />
          {health ? <IndexStatusPanel index={health.index} /> : null}
        </>
      }
    >
      {/*
        The same two sections as `/vessels`, in the same order and carrying
        their own provenance. The published schedule leads; live movements and
        AIS sit below saying what is not connected.
      */}
      <CruiseSchedule />
      <hr className="border-border" />
      <VesselMovements />
    </ConsoleShell>
  );
}

export const Route = createFileRoute('/ops/vessels')({
  component: OpsVesselsRoute,
  head: () => ({
    meta: [
      { title: 'Cruise & Vessels — Pilot Operations Console' },
      {
        name: 'description',
        content: 'Published cruise calls and vessel movements across SCASPA port facilities.',
      },
    ],
  }),
});
