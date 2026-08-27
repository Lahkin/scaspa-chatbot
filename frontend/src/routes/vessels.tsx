import { createFileRoute } from '@tanstack/react-router';
import { OpsShell } from '@/components/shells/OpsShell';
import { CruiseSchedule } from '@/components/ops/cruise/CruiseSchedule';
import { VesselMovements } from '@/components/ops/VesselMovements';

/**
 * `/vessels` — **Cruise & Vessel Activity**.
 *
 * ## What this screen used to be, and why it changed
 *
 * It was one thing: a vessel movements table fed by `GET /api/vessels`. In
 * production no feed is connected, so the page a real visitor saw was four
 * empty metric tiles above a panel explaining that there was nothing — a
 * repeated NO FEED state that read as broken software rather than as an honest
 * service. Meanwhile SCASPA publishes a genuine cruise schedule that Pilot now
 * fetches every six hours, and the page said nothing about it.
 *
 * So the screen is two sections, in the order a reader needs them:
 *
 * 1. **the official SCASPA cruise schedule** — real, published, dated, and the
 *    answer to the question most people arrive with;
 * 2. **live vessel movements and positions** — which are not connected, said
 *    once, plainly, with somewhere to go instead.
 *
 * They are two components under two headings with two provenance treatments,
 * because the brief is explicit that they must not be mixed. Interleaving them
 * would lend the schedule's authority to positions nobody is reporting, which
 * is the one thing this page must not do.
 *
 * ## The shell is given no `source`
 *
 * `OpsShell` draws 0032's sample-data hatch behind the whole screen from the
 * source it is handed. There are two sources here and they are not alike: the
 * cruise schedule is real SCASPA information and the movements feed can be
 * fixtures. Hatching the page would mark the Authority's own published schedule
 * as sample data, so the hatch moved inside `VesselMovements`, over the half of
 * the screen it is actually true of.
 */
function VesselsRoute() {
  return (
    <OpsShell
      title="Cruise & Vessel Activity"
      intro="Published cruise arrivals and vessel information across SCASPA port facilities."
    >
      <CruiseSchedule />
      {/*
        A rule rather than a margin: the two sections make different claims, and
        a visible line is the cheapest way of saying that everything below it is
        a separate matter from everything above.
      */}
      <hr className="border-border" />
      <VesselMovements />
    </OpsShell>
  );
}

export const Route = createFileRoute('/vessels')({
  component: VesselsRoute,
  head: () => ({
    meta: [
      { title: 'Cruise & Vessel Activity — Pilot' },
      {
        name: 'description',
        content:
          'Published SCASPA cruise arrivals and vessel information across Port Zante, ' +
          'Deep Water Harbour and the Basseterre Ferry Terminal.',
      },
    ],
  }),
});
