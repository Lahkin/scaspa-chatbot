import { createFileRoute } from '@tanstack/react-router';
import { OpsShell } from '@/components/shells/OpsShell';
import { AskPilot } from '@/components/ops/AskPilot';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { TableError } from '@/components/ops/TableStates';
import { Skeleton } from '@/components/ui/Skeleton';
import { GuideTopics, NothingVerified } from '@/components/ops/guide/GuideSection';
import { CargoStatus } from '@/components/ops/cargo/CargoStatus';
import { useGuide } from '@/features/ops/queries';

/**
 * `/cargo` — **Cargo & Shipping**.
 *
 * ## The page the brief asked for, and the one the source allows
 *
 * §20 asks for a status lookup: search by vessel or agent, returning a card of
 * Vessel · Agent · Status · Last updated. It also says to inspect
 * `scaspa.com/cargo.html` first and to prefer a structured endpoint.
 *
 * That inspection was done twice — once for `docs/decisions.md` 0039 and again
 * when this page was built. The second look found the same thing as the first:
 * five `<table>` elements, every one a Weebly `wsite-multicol-table` layout
 * block with no `<th>` and no rows of data; no form inputs; no iframe; 1,156
 * characters of body text; and the only XHR calls on the page are the site
 * platform's own `CustomerAccounts` and `Membership` RPCs.
 *
 * **SCASPA's own FAQ makes it sharper than "no data".** It answers "How do I
 * Check my Cargo Status" with: search "the search field located at the top
 * right of the Cargo Info table" — and there is no Cargo Info table on that
 * page. Its next question, "Is the information updated regularly", has no
 * answer at all; the field is empty.
 *
 * So an agent following the Authority's own instructions reaches a dead end,
 * and the most useful thing this product can do is say so and hand them a
 * telephone number. Reproducing the dead end more prettily — a search box that
 * always returns nothing — would be worse than the original, because "no
 * results" reads as "your cargo is not here". Recorded as a deviation in 0043.
 *
 * ## So the page leads with what SCASPA HAS published
 *
 * Ten confirmed cargo answers sit in the researchers' export — customs
 * clearance, berth specifications, ramps, tariffs, what the Deep Water Harbour
 * is, how much cargo it handles. Same mechanism as Airport Information:
 * `GET /api/guide?category=cargo`, no model in the path, every answer carrying
 * its source, its verification date and the `kb-` id the assistant cites.
 *
 * Nothing on this page is written by this file.
 */
function CargoRoute() {
  const guide = useGuide('cargo');
  const source = guide.data?.source;

  return (
    <OpsShell
      title="Cargo & Shipping"
      intro="Published information for the Deep Water Harbour cargo port."
    >
      <section className="space-y-4" aria-labelledby="cargo-guide-heading">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="cargo-guide-heading" className="text-section font-semibold text-ink">
            What SCASPA publishes about cargo
          </h2>
          {source ? <ProvenanceBadge kind="source" value={source.kind} /> : null}
        </div>

        {/* No aggregate date — see the note in routes/flights.tsx. Rows are
            verified at different times and every answer carries its own. */}
        <p className="text-caption text-ink-muted">
          Every answer here was verified against a SCASPA source and shows the date it was checked.
          Nothing on this page is generated.
        </p>

        {guide.isPending ? (
          <div className="space-y-2" role="status">
            <span className="sr-only">Loading published cargo information</span>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : guide.error ? (
          // A failed request is not an empty knowledge base.
          <TableError error={guide.error} onRetry={() => void guide.refetch()} />
        ) : (guide.data?.total ?? 0) === 0 ? (
          <NothingVerified subject="cargo" />
        ) : (
          <GuideTopics topics={guide.data?.topics ?? []} />
        )}

        <div className="flex flex-wrap gap-2">
          <AskPilot question="How do I clear cargo through customs?" />
          <AskPilot question="What are the port charges for cargo?" />
        </div>
      </section>

      {/* Everything below is a different kind of claim from everything above. */}
      <hr className="border-border" />

      <section className="space-y-4" aria-labelledby="cargo-status-heading">
        <h2 id="cargo-status-heading" className="text-section font-semibold text-ink">
          Checking a consignment
        </h2>
        <CargoStatus />
      </section>
    </OpsShell>
  );
}

export const Route = createFileRoute('/cargo')({
  component: CargoRoute,
  head: () => ({
    meta: [
      { title: 'Cargo & Shipping — Pilot' },
      {
        name: 'description',
        content:
          'Published SCASPA information for the Deep Water Harbour cargo port — customs ' +
          'clearance, berth specifications and port charges.',
      },
    ],
  }),
});
