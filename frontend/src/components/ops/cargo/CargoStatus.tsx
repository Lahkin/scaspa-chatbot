import { Link } from '@tanstack/react-router';
import { Icon } from '@/components/ui/Icon';
import { AskPilot } from '@/components/ops/AskPilot';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * Cargo status — the half of this page that has no data behind it.
 *
 * ── WHY THERE IS NO SEARCH BOX ───────────────────────────────────────────────
 *
 * The brief asks for one: "Search: Search by vessel or agent", over a result
 * card of Vessel · Agent · Status · Last updated. It is not built, and that is a
 * recorded deviation rather than an omission — docs/decisions.md 0043.
 *
 * SCASPA publishes no cargo status anywhere. `scaspa.com/cargo.html` was
 * inspected again for this page: five `<table>` elements, all of them Weebly
 * `wsite-multicol-table` LAYOUT blocks with no `<th>` and no data; no form
 * inputs; no iframe; 1,156 characters of body text; and the only XHR calls are
 * the site platform's own `CustomerAccounts` and `Membership` RPCs. There is no
 * structured endpoint to prefer and nothing to parse server-side.
 *
 * A search field over nothing is not a neutral placeholder. It is a promise:
 * somebody types a vessel name, gets "no results", and reasonably concludes
 * their cargo is not at the port — which is a different and much worse answer
 * than "this is not published". The control goes in when there is something
 * behind it.
 *
 * ## The page says what SCASPA's own page says, and where it stops
 *
 * The Authority's cargo FAQ answers "How do I Check my Cargo Status" with:
 * search "the search field located at the top right of the Cargo Info table."
 * **There is no Cargo Info table on that page.** Its second question — "Is the
 * information updated regularly" — has no answer at all; the field is empty.
 *
 * So an agent following SCASPA's own instructions reaches a dead end, and the
 * most useful thing this product can do is say so plainly and hand them a
 * telephone number, rather than reproduce the same dead end more prettily.
 */
export function CargoStatus() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-input bg-surface-muted text-brand-300"
      >
        <Icon name="ship" size={20} />
      </span>

      <h3 className="text-section font-semibold text-ink">Cargo status is not published online</h3>

      <p className="max-w-105 text-label leading-5 text-ink-muted">
        <strong className="font-semibold text-ink">
          Pilot will not guess where a shipment is.
        </strong>{' '}
        SCASPA’s cargo page describes a searchable Cargo Info table, but the site does not currently
        publish one — so there is nothing for Pilot to read, and nothing for you to search. To check
        a consignment, telephone the Deep Water Harbour on{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-brand-300 underline tabular">
          {SCASPA_TEL_TEXT}
        </a>{' '}
        with the vessel name or your agent’s name.
      </p>

      {/*
        ── NO ACCOUNT DATA, EVER ───────────────────────────────────────────────
        The brief: "Do not expose private shipment/account data beyond what
        SCASPA officially publishes." Worth stating even though there is no feed
        to expose it from, because the day a cargo source is connected this is
        the sentence that decides what it may serve. A consignment is somebody's
        commercial business, and this product has no accounts, no sign-in and no
        way to know who is asking — so it can only ever show what the Authority
        publishes to everybody.
      */}
      <p className="max-w-105 text-caption leading-5 text-ink-subtle">
        Pilot has no accounts and never knows who is asking, so it could not show you a private
        consignment even if a feed existed. Anything it shows about cargo is information SCASPA
        publishes to everyone.
      </p>

      {/* §20's contextual actions. The two that Pilot can genuinely answer go to
          the assistant; the charges one goes to the published tariff schedule,
          which is a real table with real rates. */}
      <div className="mt-1 flex flex-wrap gap-2">
        <AskPilot
          question="What documents do I need to clear cargo through customs?"
          label="Documents I need"
        />
        <Link
          to="/tariffs"
          className="inline-flex min-h-touch items-center gap-2 rounded-button border border-border bg-surface-muted px-3.5 text-label font-medium text-ink hover:border-aqua-strong"
        >
          <Icon name="receipt" size={16} />
          Estimate charges
        </Link>
        <AskPilot question="Where do I go to collect cargo at the port?" label="Where do I go?" />
        <Link
          to="/support"
          className="inline-flex min-h-touch items-center gap-2 rounded-button border border-border bg-surface-muted px-3.5 text-label font-medium text-ink hover:border-aqua-strong"
        >
          <Icon name="headset" size={16} />
          Contact SCASPA
        </Link>
      </div>
    </div>
  );
}
