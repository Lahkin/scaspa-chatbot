import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * The desktop operations console: 64px navy app bar, 256px left rail, footer.
 *
 * Built once, as the design's handoff index asks. Two departures from the
 * mockup, both deliberate.
 *
 * ## 1. The nav carries only destinations that exist
 *
 * The rail in the export lists Chat History, Saved Reports and Live Map, and the
 * footer lists Terms of Service, Cargo Tracking and Aviation Safety. Six links
 * with nothing behind them:
 *
 * - **Chat History** would need server-side retrieval of past conversations.
 *   There is none, by design — history is per-process, capped, expiring, and
 *   holds nothing that identifies a person to retrieve it *for*.
 * - **Saved Reports** would need persistence this product does not have.
 * - **Live Map** would need an AIS feed. See `MapPanel`.
 * - **Cargo Tracking** is the `personal_record` refusal wearing a nav label.
 *   Someone's container is exactly what this assistant must not appear able to
 *   look up, and a link promising it is worse than a refusal, because it is read
 *   before the refusal is.
 * - **Terms of Service** and **Aviation Safety** are documents that do not exist.
 *
 * A dead nav link costs more than a missing one: it is a promise made in the
 * furniture, and the user pays for it with a click and a dead end. They are
 * omitted rather than stubbed.
 *
 * ## 2. There is no account menu
 *
 * The export has an `account_circle` in the top bar. There is no sign-in
 * (`frontend/CLAUDE.md` rule 2), so there is no account to open.
 *
 * ## Responsive
 *
 * "Desktop console" describes the density, not a minimum width. The rail is
 * `hidden lg:block` and the content column is unconstrained below that, so the
 * whole thing still renders on a phone without pushing the document sideways —
 * `npm run check:responsive` asserts exactly that from 320px up.
 */

interface NavItem {
  to: string;
  label: string;
  /** Shown in the rail under a heading; the top bar renders a flat row. */
  hint?: string;
}

/**
 * The console's tabs — §22, in its order. Every one resolves.
 *
 * Three of them are console routes and two leave for the public screens, which
 * looks inconsistent and is not: §22 says to use the SAME backend services as
 * the public pages and not to duplicate data fetching. `/tariffs` and
 * `/support` are already the whole of what a Tariffs or Contact tab would show,
 * so a console copy of either would be a second implementation of a screen that
 * exists — the exact thing the brief rules out.
 *
 * **Cargo is a tab, and "Cargo Tracking" still is not.** The distinction is the
 * one `tests/console.test.tsx` has always guarded: a link promising to look up
 * somebody's container is the `personal_record` refusal wearing a nav label,
 * read long before the refusal is. `/cargo` says plainly that cargo status is
 * not published and offers no search — so the tab leads to an honest answer
 * rather than to a lookup that cannot exist.
 */
const SECTIONS: NavItem[] = [
  { to: '/ops/vessels', label: 'Cruise & Vessels' },
  { to: '/ops/flights', label: 'Airport' },
  { to: '/ops/cargo', label: 'Cargo' },
  { to: '/tariffs', label: 'Tariffs' },
  { to: '/support', label: 'Contact' },
];

/** §22's strapline. Rendered once per console page, under the bar. */
const CONSOLE_NAME = 'Pilot Operations Console';
const CONSOLE_STRAPLINE =
  'A unified view of published SCASPA operational information and service status.';

/** Rail. Same rule. */
const RAIL: NavItem[] = [
  { to: '/tariffs', label: 'Tariff guide', hint: 'Published rates' },
  { to: '/about', label: 'Port services', hint: 'What SCASPA runs' },
  { to: '/settings', label: 'Settings', hint: 'Local preferences' },
  { to: '/privacy', label: 'Privacy', hint: 'What is and is not stored' },
];

export function ConsoleShell({
  breadcrumb,
  title,
  intro,
  actions,
  children,
  aside,
}: {
  /** Trail above the heading, e.g. ['Console', 'Vessel arrivals']. */
  breadcrumb: string[];
  title: string;
  intro?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  /** The right-hand panels. Stacks under the content below `xl`. */
  aside?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-ops-surface-low">
      <TopBar />

      <div className="flex">
        <Rail />

        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-360 px-4 py-6 lg:px-6">
            <nav aria-label="Breadcrumb" className="mb-2">
              <ol className="flex flex-wrap items-center gap-1.5 text-caption text-ops-ink-variant">
                {breadcrumb.map((crumb, index) => (
                  <li key={crumb} className="flex items-center gap-1.5">
                    {index > 0 ? <span aria-hidden="true">/</span> : null}
                    {index === breadcrumb.length - 1 ? (
                      <span aria-current="page" className="text-ops-ink">
                        {crumb}
                      </span>
                    ) : (
                      <span>{crumb}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-h1 font-semibold text-ops-ink">{title}</h1>
                {/*
                  §22's supporting text, on every console page rather than on a
                  landing page — because there is no landing page. `/ops`
                  redirects to the first tab: a dashboard summarises across
                  sources, and every source here is already summarised on the
                  tab that owns it, so an overview would be a click between the
                  reader and the data.

                  It sits above the section's own intro because it describes the
                  console and the line below describes the screen.
                */}
                <p className="mt-1 text-caption text-ops-ink-variant">{CONSOLE_STRAPLINE}</p>
                {intro ? (
                  <p className="mt-1 max-w-measure text-small text-ops-ink-variant">{intro}</p>
                ) : null}
              </div>
              {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
            </div>

            {/*
              `minmax(0,1fr)` at **every** width, not only at `xl`.

              A single-column grid sizes its implicit column to `auto`, which is
              max-content — so the 800px-min table inside pushed the column, the
              grid and the document wider than a 320px screen, and the wrapper's
              `overflow-x-auto` never engaged because there was nothing narrower
              to overflow. `min-w-0` on the child is not enough; the *column* has
              to be allowed to shrink.

              Caught by check:responsive, and only once the backend was reachable
              from the check's origin — until then the tables were empty and there
              was nothing wide to overflow with.
            */}
            <div className="mt-5 grid gap-5 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-5">{children}</div>
              {aside ? <div className="min-w-0 space-y-5">{aside}</div> : null}
            </div>
          </main>

          <Footer />
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 h-16 bg-ops-navy text-ink-inverse">
      <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
        {/* `min-h-touch` and `min-w-touch`: at 320px this collapses to the anchor
            glyph alone and measured 20×24, which is not a target anyone can hit
            on a moving ferry. Caught by check:responsive. */}
        <Link
          to="/chat"
          className="flex min-h-touch min-w-touch shrink-0 items-center justify-center gap-2 rounded-sm font-semibold"
        >
          <span aria-hidden="true">⚓</span>
          {/* The visible label collapses below `sm`, which left the link with
              the aria-hidden glyph and nothing else — no accessible name at all
              (axe `link-name`, serious). The sr-only copy is always present, so
              the name survives the breakpoint. */}
          {/*
            ── PILOT'S CONSOLE, SHOWING SCASPA'S INFORMATION ──────────────────
            This read "SCASPA operations", on the note that the console is for
            Authority staff while Pilot is the customer-facing guide. §22 names
            it "Pilot Operations Console", and the brief is right: §1 makes
            PILOT the PRODUCT brand and SCASPA the INSTITUTIONAL one, so a Pilot
            surface displaying SCASPA's data is exactly that architecture. The
            old label had it inverted — it treated a product screen as an
            institutional artefact. 0045.
          */}
          <span className="sr-only">{CONSOLE_NAME}</span>
          <span className="hidden sm:inline" aria-hidden="true">
            {CONSOLE_NAME}
          </span>
        </Link>

        {/* Horizontally scrollable rather than wrapped: a nav row that wraps
            changes the header height and shoves the content down. */}
        <nav aria-label="Sections" className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {SECTIONS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex min-h-touch items-center rounded-sm px-3 text-small font-medium whitespace-nowrap text-ink-inverse/85 hover:bg-ops-navy-soft hover:text-ink-inverse"
                  activeProps={{ className: 'bg-ops-navy-soft text-ink-inverse' }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function Rail() {
  return (
    // `hidden lg:block`: below 1024px the rail would either squeeze the table or
    // push the document sideways, and the top bar already carries every section.
    <aside
      aria-label="Console"
      className="hidden w-64 shrink-0 border-r border-ops-outline-variant bg-ops-surface lg:block"
    >
      <div className="sticky top-16 p-4">
        <p className="text-caption font-semibold tracking-wide text-ops-ink-variant uppercase">
          Operations
        </p>

        <Link
          to="/chat"
          className="mt-3 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-md bg-ops-navy px-4 text-small font-semibold text-ink-inverse"
        >
          <span aria-hidden="true">+</span> New enquiry
        </Link>

        <nav aria-label="Console sections" className="mt-4">
          <ul className="space-y-1">
            {RAIL.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    'block rounded-sm px-3 py-2 text-small text-ops-ink',
                    'hover:bg-ops-surface-high'
                  )}
                  activeProps={{ className: 'bg-ops-surface-high font-medium' }}
                >
                  {item.label}
                  {item.hint ? (
                    <span className="block text-caption text-ops-ink-variant">{item.hint}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* The escape hatch, always visible. Everything in this console can end
            with "call SCASPA", so the number should never be a page away. */}
        <div className="mt-6 rounded-md border border-ops-outline-variant bg-ops-surface-low p-3">
          <p className="text-caption text-ops-ink-variant">Need a person?</p>
          <a href={SCASPA_TEL_HREF} className="text-small font-semibold text-ops-sky underline">
            {SCASPA_TEL_TEXT}
          </a>
        </div>
      </div>
    </aside>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ops-outline-variant px-4 py-6 lg:px-6">
      <p className="text-caption text-ops-ink-variant">
        St. Christopher Air &amp; Sea Ports Authority. This assistant answers from published
        information and cannot see live operations or any individual&rsquo;s records.
      </p>
      <ul className="mt-2 flex flex-wrap gap-4 text-caption">
        <li>
          <Link to="/privacy" className="text-ops-sky underline">
            Privacy
          </Link>
        </li>
        <li>
          <Link to="/about" className="text-ops-sky underline">
            About
          </Link>
        </li>
        <li>
          <a href={SCASPA_TEL_HREF} className="text-ops-sky underline">
            Call SCASPA
          </a>
        </li>
      </ul>
    </footer>
  );
}
