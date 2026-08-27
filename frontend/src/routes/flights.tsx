import { createFileRoute } from '@tanstack/react-router';
import { OpsShell } from '@/components/shells/OpsShell';
import { AskPilot } from '@/components/ops/AskPilot';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { TableError } from '@/components/ops/TableStates';
import { Skeleton } from '@/components/ui/Skeleton';
import { GuideTopics, NothingVerified } from '@/components/ops/guide/GuideSection';
import { FlightMovements } from '@/components/ops/flights/FlightMovements';
import { useGuide } from '@/features/ops/queries';

/**
 * `/flights` — **Airport Information**.
 *
 * ## What this screen used to be
 *
 * "Flight movements": a table fed by `GET /api/flights`, with three metric
 * tiles above it. SCASPA publishes no flight feed, so in production every
 * visitor saw *Arrivals today —, Departures today —, Delayed —* over a panel
 * explaining there was nothing. The brief names those three cards by name and
 * says to remove them, and to show "useful SCASPA-grounded content" instead.
 *
 * ## Where that content comes from, and where it does not
 *
 * **Not from this file.** Not one sentence of SCASPA fact is typed anywhere in
 * this route or in the components below it. The airport section renders
 * confirmed rows from the researchers' verified export — the same rows the
 * assistant cites, with the same ids, sources and verification dates — served
 * by `GET /api/guide`.
 *
 * That is CLAUDE.md rule 5 rather than a stylistic preference. A developer
 * typing "the airport has a duty-free shop and two lounges" into a component
 * produces text indistinguishable on screen from something the Authority stands
 * behind, which nobody verified, which no researcher can correct by editing the
 * spreadsheet, and which drifts silently from the moment it is written.
 *
 * There are 18 confirmed airport answers today, across fourteen of the
 * researchers' own subcategories — facilities, parking, check-in, security,
 * immigration among them. They were already in the product; they were only
 * reachable by knowing what to ask.
 *
 * ## Two sections, and the shell gets no `source`
 *
 * Same arrangement as `/vessels`, for the same reason. `OpsShell` draws 0032's
 * sample-data hatch behind the whole screen from the source it is handed, and
 * there are two sources here: verified published information, and a movements
 * feed that can be fixtures. Hatching the page would mark the researchers'
 * verified content as invented, so the hatch lives inside `FlightMovements`.
 */
function FlightsRoute() {
  const guide = useGuide('airport');
  const source = guide.data?.source;

  return (
    <OpsShell
      title="Airport Information"
      intro="Published information for R. L. Bradshaw International Airport."
    >
      <section className="space-y-4" aria-labelledby="airport-guide-heading">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="airport-guide-heading" className="text-section font-semibold text-ink">
            What SCASPA publishes about the airport
          </h2>
          {source ? <ProvenanceBadge kind="source" value={source.kind} /> : null}
        </div>

        {/*
          ── NO PAGE-LEVEL DATE, AND THAT IS THE CONSIDERED CHOICE ────────────

          `source.as_of` is the OLDEST verification in the set, because that is
          the only claim true of everything on screen. Rendered as a single
          stamp it would be actively misleading in the other direction: the
          oldest airport row was verified in May 2024 and most were verified in
          July 2026, so one page-level date would either advertise the best case
          or condemn month-old content as two years stale.

          The per-answer date is the one a reader acts on, and every answer
          carries it. This says that, and says nothing it cannot support.
        */}
        <p className="text-caption text-ink-muted">
          Every answer here was verified against a SCASPA source and shows the date it was checked.
          Nothing on this page is generated.
        </p>

        {guide.isPending ? (
          <div className="space-y-2" role="status">
            <span className="sr-only">Loading published airport information</span>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : guide.error ? (
          // A failed request is not an empty knowledge base. Rendering it as one
          // would say SCASPA has verified nothing about its own airport.
          <TableError error={guide.error} onRetry={() => void guide.refetch()} />
        ) : (guide.data?.total ?? 0) === 0 ? (
          <NothingVerified subject="the airport" />
        ) : (
          <GuideTopics topics={guide.data?.topics ?? []} />
        )}

        {/* §25's bridge: the page answers what SCASPA published, the assistant
            answers the follow-up it did not anticipate. */}
        <div className="flex flex-wrap gap-2">
          <AskPilot question="How early should I arrive at the airport?" />
          <AskPilot question="How do I get from the airport to Basseterre?" />
        </div>
      </section>

      {/*
        A rule rather than a margin. Everything below it is a different kind of
        claim from everything above — verified published information against a
        live feed that is not connected — and a visible line is the cheapest way
        to say so.
      */}
      <hr className="border-border" />

      <FlightMovements />
    </OpsShell>
  );
}

export const Route = createFileRoute('/flights')({
  component: FlightsRoute,
  head: () => ({
    meta: [
      { title: 'Airport Information — Pilot' },
      {
        name: 'description',
        content:
          'Published SCASPA information for R. L. Bradshaw International Airport — ' +
          'facilities, parking, check-in, security and immigration.',
      },
    ],
  }),
});
