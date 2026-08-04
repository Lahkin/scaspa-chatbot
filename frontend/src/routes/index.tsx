import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui';
import { TrustPoints } from '@/components/marketing/TrustPoints';
import { SUGGESTED_QUESTIONS } from '@/features/chat/suggestions';
import { setPendingQuestion } from '@/features/chat/pending';
import { SCASPA_PHONE_LINES, SCASPA_POSTAL_ADDRESS } from '@/features/chat/contact';
import { isStale, useHealth } from '@/features/chat/queries';

/**
 * The landing page.
 *
 * Its job is to make a visitor understand and trust the product **in under
 * fifteen seconds** and then start a conversation. Everything here is measured
 * against that.
 *
 * So: no headline about the future of AI, no robot. A visitor standing on a pier
 * does not care what this is built from — they care whether they will make the
 * last ferry. The hero shows the assistant answering a real question, because
 * seeing one answer with a source under it does more for trust than any sentence
 * claiming trustworthiness.
 *
 * ## The hero is navy, and the page under it is not
 *
 * This once said "no stock gradient", and the objection still holds against the
 * thing it was aimed at: a decorative wash behind body copy. `--grad-hero` is
 * not that. It is a full-bleed structural band that ends at a literal horizon
 * line, and everything below it — including the example answer, which is the
 * one thing on this page a visitor actually reads — sits on a flat surface.
 *
 * `/` is in `FULL_BLEED_ROUTES` so `<main>` does not constrain it; this file
 * therefore owns the horizontal padding for every one of its own children.
 */
function Landing() {
  const navigate = useNavigate();

  /**
   * A chip drops straight into a conversation with the question already sent.
   *
   * The highest-converting element on the page, and a demo safety net: a tapped
   * chip cannot be mistyped on stage. The question travels through an in-memory
   * store rather than the URL — a query string would put it in history, in the
   * address bar and in every screenshot.
   */
  const ask = (question: string) => {
    setPendingQuestion(question);
    void navigate({ to: '/chat' });
  };

  return (
    <div>
      {/*
        The hero band. Full-bleed because it is structure — the top of the page
        is navy from edge to edge, and the content column resumes below it.
      */}
      <section className="bg-surface-sunken">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
          <h1 className="text-display font-semibold text-balance text-on-navy-primary">
            Will you make the last ferry?
          </h1>
          <p className="max-w-measure text-lead text-on-navy-secondary">
            Ask about ferries, cruise arrivals, cargo and the airport in St. Kitts. Every answer
            shows where it came from and when it was checked.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {/*
              Solid brand blue, never a gradient. A gradient button on a gradient
              band has no edge at all, and the primary action on a landing page
              is the last thing that should be hard to find. `onNavy` is the
              `primary` fill plus a visible boundary — see Button.tsx.
            */}
            <Button variant="onNavy" size="lg" onClick={() => void navigate({ to: '/chat' })}>
              Ask a question
            </Button>
            <a
              href={SCASPA_PHONE_LINES[0].href}
              className="inline-flex min-h-touch items-center text-small font-medium text-on-navy-primary underline"
            >
              Or call SCASPA on {SCASPA_PHONE_LINES[0].text}
            </a>
          </div>
        </div>
      </section>

      {/*
        The horizon. A literal one: the band ends here and the page begins, and
        the line fades out at both edges rather than ruling across the viewport.
        Decorative, so it is hidden from assistive technology — the heading
        structure already says where the sections divide.
      */}
      <div aria-hidden="true" className="h-px w-full bg-border" />

      {/* Everything below the horizon is flat. The example answer in particular:
          it is the one thing here a visitor reads word for word. */}
      <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-6">
        <ExampleAnswer />

        <section aria-labelledby="try-it" className="space-y-3">
          <div>
            <h2 id="try-it" className="text-h2 font-semibold">
              Try it here
            </h2>
            <p className="mt-1 text-small text-ink-muted">
              Tap a question and the assistant will answer it straight away.
            </p>
          </div>

          <ul className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map(({ label: question }) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => ask(question)}
                  className="flex min-h-touch items-center gap-2 rounded-md bg-navy px-3 py-2 text-left text-small font-medium text-ink-inverse transition-colors duration-fast hover:bg-navy-deep"
                >
                  <span aria-hidden="true" className="text-amber-board">
                    \u203a
                  </span>
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="helps-with" className="space-y-3">
          <h2 id="helps-with" className="text-h2 font-semibold">
            What it can help with
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((item) => (
              <li key={item.title} className="rounded-md bg-surface-muted p-4">
                <p className="text-small font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-small text-ink-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="trust" className="space-y-3">
          <h2 id="trust" className="text-h2 font-semibold">
            Why you can trust it
          </h2>
          <TrustPoints />
        </section>

        <section
          aria-labelledby="talk-to-a-person"
          className="rounded-md border border-navy bg-surface-muted p-4"
        >
          <h2 id="talk-to-a-person" className="text-h3 font-semibold">
            Talk to a person
          </h2>
          <p className="mt-1 max-w-measure text-small text-ink-muted">
            The assistant cannot see live operations, your shipment or your booking, and it does not
            give customs, immigration or legal advice. For any of those, SCASPA staff can help you
            directly.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-small font-semibold text-ink">Telephone</p>
              <ul className="mt-1 space-y-1">
                {SCASPA_PHONE_LINES.map((line) => (
                  <li key={line.href}>
                    <a
                      href={line.href}
                      className="inline-flex min-h-touch items-center text-body font-medium text-blue-700 underline tabular"
                    >
                      {line.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-small font-semibold text-ink">Post</p>
              <address className="mt-1 text-small text-ink-muted not-italic">
                {SCASPA_POSTAL_ADDRESS.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}

const CAPABILITIES = [
  {
    title: 'Ferry and cruise schedules',
    body: 'Sailing times between Basseterre and Charlestown, and when cruise ships are due at Port Zante.',
  },
  {
    title: 'Cargo and import procedures',
    body: 'What paperwork is needed, where to collect a barrel, and when the cargo gate is open.',
  },
  {
    title: 'Published seaport tariffs',
    body: 'Handling charges, storage and berthing, as published by SCASPA.',
  },
  {
    title: 'Airport information',
    body: 'Getting to and from Robert L. Bradshaw International, parking, and how early to arrive.',
  },
] as const;

/**
 * One real answer, statically rendered.
 *
 * Not a live call: the hero must not depend on the backend being up, and a
 * visitor who arrives to a spinner has already formed an opinion. The figures are
 * the fixture's obviously-placeholder ones and the caption says so, so nothing
 * here can be mistaken for a published fare.
 */
function ExampleAnswer() {
  return (
    <figure className="max-w-measure rounded-lg border border-border bg-surface-muted p-4">
      <figcaption className="text-caption text-ink-subtle">
        An example of an answer \u2014 illustrative figures, not a published fare.
      </figcaption>
      <p className="mt-2 text-small font-medium text-ink">
        \u201cWhat time is the last ferry back from Nevis?\u201d
      </p>
      <p className="mt-2 text-small text-ink-muted">
        The last placeholder sailing back from Nevis on a weekday is 18:00
        <span className="mx-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-tint px-1 align-baseline text-caption font-semibold text-brand-200 tabular">
          1
        </span>
        . Please confirm with SCASPA before you travel.
      </p>
      <p className="mt-2 border-t border-border pt-2 text-caption text-ink-subtle">
        <strong>1.</strong> Ferry \u2014 schedule \u00b7 Official SCASPA website \u00b7 Verified on
        2026-04-01
      </p>
    </figure>
  );
}

/**
 * The footer, including the knowledge-base version from `/api/health`.
 *
 * "Information verified as of \u2026" is a fact the reader can weigh, and it is real
 * rather than a build constant \u2014 it comes from the running backend. It degrades
 * to nothing when health is unavailable, because a landing page must never wait
 * on an API call.
 */
function SiteFooter() {
  const health = useHealth();
  const version = health?.index.kb_updated_at ?? health?.index.kb_version ?? null;

  return (
    <footer className="space-y-1 border-t border-border pt-4 text-caption text-ink-subtle">
      <p>
        Built for the St. Christopher Air &amp; Sea Ports Authority. Deep Water Harbour, Port Zante,
        Basseterre Ferry Terminal and Robert L. Bradshaw International Airport.
      </p>
      <p>
        {/* Team names and date are a client deliverable, not something to invent.
            The slot is visible and marked so it is chased rather than forgotten. */}
        <span className="rounded-sm bg-neutral-100 px-1.5 py-0.5 font-medium">
          Team names pending
        </span>{' '}
        \u00b7 2026
      </p>
      {version && (
        <p>
          Information verified as of <time dateTime={version}>{version}</time>
          {isStale(health) ? ' \u2014 please confirm anything time-sensitive.' : '.'}
        </p>
      )}
    </footer>
  );
}

export const Route = createFileRoute('/')({
  component: Landing,
  head: () => ({
    meta: [
      { title: 'SCASPA Assistant \u2014 ports and travel in St. Kitts' },
      {
        name: 'description',
        content:
          'Ask about ferries, cruise arrivals at Port Zante, cargo at the Deep Water Harbour and Robert L. Bradshaw International Airport.',
      },
    ],
  }),
});
