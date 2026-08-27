import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { AskPilot } from '@/components/ops/AskPilot';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { cn } from '@/lib/cn';
import type { GuideEntry, GuideTopic } from '@/lib/types';

/**
 * Published SCASPA answers, rendered as a page.
 *
 * ── EVERY WORD OF CONTENT HERE COMES OFF THE WIRE ────────────────────────────
 *
 * Not one sentence of SCASPA fact is written in this file, and that is the
 * point rather than an accident of how it was built. The alternative — a
 * developer typing "the airport has a duty-free shop and two lounges" into a
 * component — produces text indistinguishable on screen from something the
 * Authority stands behind, which nobody verified, which no researcher can
 * correct by editing the spreadsheet, and which drifts silently from the moment
 * it is written. CLAUDE.md rule 5.
 *
 * The strings this file *does* own are the topic headings, and those name a
 * grouping rather than assert a fact. See `LABELS`.
 *
 * ## Every answer carries its own date, and the page carries none
 *
 * The endpoint sends a page-level `as_of` — the OLDEST verification in the set,
 * the only date true of everything on screen — and this deliberately does not
 * render it. On the real airport data the oldest row was verified in May 2024
 * and most were verified in July 2026, so a single stamp would either advertise
 * the freshest row or condemn month-old content as two years stale.
 *
 * The per-answer date is the one a reader acts on, and every answer has it.
 *
 * Volatility rides along for the same reason. "Rarely changes" and "check
 * before use" lead to different actions, and only one of them is a question
 * this product can settle.
 */

/**
 * Display names for the researchers' own subcategory slugs.
 *
 * This is the one place in the file with strings that are not from the wire,
 * and they are deliberately all *headings*: `checkin` → "Checking in" renames a
 * grouping and asserts nothing about SCASPA. Anything not listed falls through
 * to a title-cased version of the slug, so a new subcategory appears with a
 * readable heading rather than disappearing.
 *
 * ── THEY MUST BE TRUE FOR EVERY CATEGORY, NOT JUST THE FIRST ONE ────────────
 *
 * These were written against the airport, which was the only category using
 * them. Three of them then asserted the wrong subject the moment `/cargo`
 * reused the component, because the same slugs appear under both:
 *
 * | Slug | Was | Rendered over |
 * | --- | --- | --- |
 * | `identity` | "About the airport" | "What is the Deep Water Harbour?" |
 * | `infrastructure` | "Runway and infrastructure" | "What are the specifications of the cargo berth?" |
 * | `statistics` | "Passenger numbers" | "How much cargo does the port handle?" |
 *
 * A heading is read as a claim about what is under it, so "Passenger numbers"
 * above a tonnage figure is a small lie printed in capitals. Every label here
 * is now neutral enough to be true of any facility — which is the constraint a
 * shared component was always under, and was only invisible while one screen
 * used it.
 */
const LABELS: Record<string, string> = {
  aviation: 'Aviation and charters',
  checkin: 'Checking in',
  codes: 'Codes',
  customs: 'Customs',
  facilities: 'Facilities',
  identity: 'What it is',
  immigration: 'Immigration and customs',
  infrastructure: 'Infrastructure',
  location: 'Getting there',
  operations: 'Operations',
  parking: 'Parking and access',
  projects: 'Works and projects',
  schedule: 'Opening times',
  security: 'Security',
  statistics: 'Published figures',
  tariffs: 'Charges',
  tracking: 'Tracking a shipment',
  trivia: 'Other',
  general: 'General',
};

function heading(slug: string): string {
  return LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/[-_]/g, ' ');
}

export function GuideTopics({ topics }: { topics: readonly GuideTopic[] }) {
  return (
    <div className="space-y-6">
      {topics.map((topic) => (
        <section key={topic.name} className="space-y-2">
          <h3 className="text-label font-semibold tracking-eyebrow text-ink-muted uppercase">
            {heading(topic.name)}
          </h3>
          <ul className="space-y-2">
            {topic.entries.map((entry) => (
              <li key={entry.id}>
                <GuideAnswer entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * One question and its answer.
 *
 * Collapsed by default: nineteen open answers is a wall of text nobody reads,
 * and the questions themselves are the useful index — a traveller scans them to
 * find the one they came for. The provenance sits *inside* the expanded panel
 * rather than in the collapsed row, because a date beside a question nobody has
 * read yet is noise, and the same date beside the answer is the thing that lets
 * them decide whether to trust it.
 */
function GuideAnswer({ entry }: { entry: GuideEntry }) {
  const [open, setOpen] = useState(false);
  const panelId = `guide-${entry.id}`;

  return (
    <div className="overflow-hidden rounded-input border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted"
      >
        <Icon
          name="chevron-down"
          size={16}
          className={cn('shrink-0 text-ink-muted transition-transform', open && 'rotate-180')}
        />
        <span className="min-w-0 flex-1 text-body font-medium text-ink">{entry.question}</span>
      </button>

      {open ? (
        <div id={panelId} className="border-t border-border px-4 py-3.5">
          {/* Rendered as plain text, never as markup: this is somebody else's
              content and `dangerouslySetInnerHTML` is banned outright —
              frontend CLAUDE.md rule 4. */}
          <p className="text-body leading-6 whitespace-pre-line text-ink">{entry.answer}</p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <ProvenanceBadge kind="volatility" value={entry.volatility} />
            <ProvenanceBadge kind="checked" date={formatVerified(entry.as_of)} />
            <a
              href={entry.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-caption font-medium text-brand-300 underline"
            >
              SCASPA source
              <span className="sr-only"> for “{entry.question}”, opens in a new tab</span>
            </a>
            {/*
              The row id, shown quietly. It is the SAME anchor the assistant
              cites, so a reader who sees `kb-053` here and `kb-053` in a
              conversation is looking at one row rather than at two sources that
              happen to agree — which is the whole reason this page reads from
              the knowledge base instead of from a copy of it.
            */}
            <span className="text-caption text-ink-subtle tabular">{entry.id}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const VERIFIED = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * `2026-07-31` → `31 Jul 2026`.
 *
 * Formatted in UTC because the value is a plain calendar date that
 * `new Date()` parses as UTC midnight — rendering it in the reader's zone would
 * show every verification a day early anywhere west of Greenwich. The same trap
 * as `lib/portDate.ts`, for the same reason.
 */
function formatVerified(iso: string): string | null {
  const when = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(when.getTime()) ? null : VERIFIED.format(when);
}

/**
 * What the section says when the knowledge base has nothing confirmed.
 *
 * Reachable in production: a category the researchers have not covered, or an
 * export where every row for it is still `probable`. It is not an error, and it
 * does not offer a retry — it reports that nothing has been *verified*, which is
 * a different and more useful statement than "nothing was found".
 */
export function NothingVerified({ subject }: { subject: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <h3 className="text-section font-semibold text-ink">
        Pilot has no verified information about {subject} yet
      </h3>
      <p className="max-w-105 text-label leading-5 text-ink-muted">
        <strong className="font-semibold text-ink">Nothing is shown rather than guessed.</strong>{' '}
        Answers appear here once a researcher has verified them against a SCASPA source — Pilot will
        not fill the gap in the meantime.
      </p>
      <div className="mt-1">
        <AskPilot question="How do I contact SCASPA?" />
      </div>
    </div>
  );
}
