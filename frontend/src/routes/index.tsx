import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * Landing page.
 *
 * The audience is someone standing on a pier or at a cargo gate with a question
 * and a metered data connection. So: what it is, what it will not do, and a way
 * in — nothing else.
 */
function Landing() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Ask about ports and travel in St. Kitts</h1>
        <p className="text-ink-muted">
          Ferries, cruise arrivals at Port Zante, cargo at the Deep Water Harbour, and Robert L.
          Bradshaw International Airport. Answers come from verified SCASPA information and show
          where each fact came from.
        </p>
      </div>

      <Link
        to="/chat"
        className="inline-block rounded-card bg-brand-600 px-5 py-3 font-medium text-ink-inverse"
      >
        Ask a question
      </Link>

      <section aria-labelledby="limits" className="rounded-card bg-surface-muted p-4 text-sm">
        <h2 id="limits" className="font-medium">
          What it cannot do
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
          <li>It cannot see live operations — whether a ferry is sailing right now.</li>
          <li>It cannot look up your shipment, booking or payment.</li>
          <li>It does not give customs, immigration, tax or legal advice.</li>
        </ul>
        <p className="mt-2 text-ink-muted">For any of those, call SCASPA directly.</p>
      </section>
    </div>
  );
}

export const Route = createFileRoute('/')({ component: Landing });
