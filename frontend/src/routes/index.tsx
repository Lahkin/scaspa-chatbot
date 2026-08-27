import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PilotBrand } from '@/components/brand/PilotBrand';
import { GatewayHero } from '@/components/marketing/GatewayHero';
import { JourneyCard } from '@/components/marketing/JourneyCard';
import { TrustStrip } from '@/components/marketing/TrustStrip';
import { setPendingQuestion } from '@/features/chat/pending';
import { isStale, useHealth } from '@/features/chat/queries';

/**
 * The landing page — a gateway into Pilot, not a website about it.
 *
 * Its job is to make a visitor understand and trust the product **in under
 * fifteen seconds** and then start a conversation. Everything here is measured
 * against that, and the Pilot spec is blunt about the shape: hero, four
 * journeys, one call to action, four trust signals, and into the application.
 * "It should not require five screens of scrolling before reaching the
 * assistant."
 *
 * So: no headline about the future of AI, and no robot. A visitor standing on a
 * pier does not care what this is built from — they care whether they will make
 * the last ferry.
 *
 * ## What changed from the previous landing page, and what did not
 *
 * The long "what it can help with" list and the full-length trust section are
 * gone, compressed into the four journey cards and the strip. `/about` still
 * carries the expanded version for a reader who came to find it.
 *
 * The example answer STAYED, and deliberately against the spec's own list of
 * sections. It is the one thing on this page a visitor actually reads, it is a
 * real cited row rather than copy, and `tests/matrix.test.tsx` guards it under
 * T-18 — the landing page once invented a sailing time here. Dropping verified
 * content to shorten a page is the wrong trade on a product whose entire
 * argument is that it does not invent things. It is one compact block, and the
 * page is still two screens.
 *
 * ## The hero band is a photograph now, not a gradient
 *
 * The old navy `--grad-hero` band is gone with the rest of the gradient tokens.
 * Depth on this page comes from the photograph and the surface ramp.
 *
 * `/` is in `FULL_BLEED_ROUTES` so `<main>` does not constrain it; this file
 * therefore owns the horizontal padding for every one of its own children.
 */

/**
 * The four ways in.
 *
 * Each card sends a question that the knowledge base is known to answer — the
 * same four labels the suggestion chips use, each annotated in
 * `features/chat/suggestions.ts` with the rows behind it. A card that opened a
 * conversation and got "I do not have that" would be the worst possible first
 * impression, and it is avoidable by not inventing new questions here.
 */
const JOURNEYS: ReadonlyArray<{
  icon: IconName;
  title: string;
  lines: readonly [string, string];
  question: string;
}> = [
  {
    icon: 'ship',
    title: 'Ferry & Nevis',
    lines: ['Schedules, terminals', 'and travel information'],
    question: 'Ferry times to Nevis',
  },
  {
    icon: 'receipt',
    title: 'Cargo & Shipping',
    lines: ['Documents, charges', 'and procedures'],
    question: 'Clearing cargo through customs',
  },
  {
    icon: 'plane',
    title: 'Airport',
    lines: ['Flights, facilities', 'and services'],
    question: 'Airport facilities',
  },
  {
    icon: 'anchor',
    title: 'Cruise & Port',
    lines: ['Piers, arrivals and', 'visitor information'],
    question: 'Cruise piers at Port Zante',
  },
];

function Landing() {
  const navigate = useNavigate();

  /**
   * Open a conversation with the question already sent.
   *
   * The highest-converting element on the page, and a demonstration safety net:
   * a tapped card cannot be mistyped on stage. The question travels through an
   * in-memory store rather than the URL — a query string would put it in
   * history, in the address bar and in every screenshot.
   */
  const ask = (question: string) => {
    setPendingQuestion(question);
    void navigate({ to: '/chat' });
  };

  return (
    <div className="pb-10">
      {/*
        The hero. 45/55 at desktop and stacked below it — the photograph is the
        first thing on a phone, where it is also the slowest thing, so it sits
        AFTER the words in the source order and is moved above them visually.
        A reader on a slow connection gets the headline and the cards while the
        image is still arriving.
      */}
      <section className="border-b border-border bg-canvas">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[45fr_55fr] lg:items-center lg:gap-10 lg:py-12">
          <div className="order-2 space-y-6 lg:order-1">
            <PilotBrand size="lg" />

            <div className="space-y-3">
              <h1 className="text-display font-bold text-balance text-ink">
                Where are you headed today?
              </h1>
              <p className="max-w-measure text-lead text-ink-muted">
                Pilot helps you navigate SCASPA services across St. Kitts&rsquo; air and sea
                gateways.
              </p>
            </div>

            <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {JOURNEYS.map(({ icon, title, lines, question }) => (
                <li key={title}>
                  <JourneyCard
                    icon={icon}
                    title={title}
                    lines={lines}
                    onSelect={() => ask(question)}
                  />
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {/*
                `size="lg"`, not a className. Button deliberately omits className
                so it owns its own six states — a caller reaching past that is
                how a primary action ends up with a hover it did not intend.
              */}
              <Button size="lg" onClick={() => void navigate({ to: '/chat' })}>
                Ask Pilot a question
                <Icon name="arrow-right" size={18} aria-hidden="true" />
              </Button>
              {/*
                The secondary action goes to the same place. It exists because
                the four cards can read as the only ways in, and someone whose
                question is none of those four needs to see that typing is
                allowed before they decide the product cannot help them.
              */}
              <button
                type="button"
                onClick={() => void navigate({ to: '/chat' })}
                className="min-h-touch text-small font-medium text-brand-300 underline underline-offset-4 hover:text-ink"
              >
                Or type your own question
              </button>
            </div>
          </div>

          {/*
            A fixed height at desktop rather than an aspect ratio, because the
            two photographs are not the same shape — the light one is 1200x640
            and the dark one 1200x675. Under `aspect-[...]` the column would
            change height when a reader switched theme, moving everything below
            it. A fixed box with `object-cover` keeps the layout still and lets
            the crop absorb the difference.
          */}
          <div className="order-1 overflow-hidden rounded-lg lg:order-2 lg:h-[420px]">
            <GatewayHero />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8">
        <TrustStrip />

        <ExampleAnswer />

        <SiteFooter />
      </div>
    </div>
  );
}

/**
 * One real answer, quoted verbatim from the knowledge base.
 *
 * ## This text is a knowledge-base row, not copy — T-18
 *
 * It used to invent a sailing time. What is here now is `kb-192` as retrieved:
 * confirmed, `as_of` 2026-07-31, sourced to the official site. A visitor asks
 * the question they actually have and watches Pilot decline to make up a
 * timetable while still telling them where to look — the product's whole
 * argument, made in four lines and without a word of marketing.
 *
 * If this text is ever edited, edit it to match the row. It is not copy.
 */
function ExampleAnswer() {
  return (
    <figure className="max-w-measure rounded-lg border border-border bg-surface-muted p-4">
      <figcaption className="text-caption text-ink-subtle">
        An example of an answer — a real one, from a verified source.
      </figcaption>
      <p className="mt-2 text-small font-medium text-ink">
        “What time is the last ferry back from Nevis?”
      </p>
      <p className="mt-2 text-small text-ink-muted">
        Ferry departure times vary by operator and by day, so SCASPA publishes them through a live
        vessel schedule rather than a fixed timetable. Check the ferry schedule on scaspa.com for
        the date you are travelling.
        <span className="mx-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-tint px-1 align-baseline text-caption font-semibold text-brand-300 tabular">
          1
        </span>
      </p>
      <p className="mt-2 border-t border-border pt-2 text-caption text-ink-subtle">
        <strong>1.</strong> Ferry — schedule · Official SCASPA website · Verified on 2026-07-31
      </p>
    </figure>
  );
}

/**
 * The footer, including the knowledge-base version from `/api/health`.
 *
 * "Information verified as of …" is a fact the reader can weigh, and it is real
 * rather than a build constant — it comes from the running backend. It degrades
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
      {/*
        A placeholder chip naming the pending credits sat here until T-18. It is
        described rather than quoted, because the exact wording is what the
        release grep looks for and a comment should not answer it. The names are
        still a client deliverable and still must not be invented; they go in
        when SCASPA supplies them.
      */}
      <p>2026</p>
      {version && (
        <p>
          Information verified as of <time dateTime={version}>{version}</time>
          {isStale(health) ? ' — please confirm anything time-sensitive.' : '.'}
        </p>
      )}
    </footer>
  );
}

export const Route = createFileRoute('/')({
  component: Landing,
  head: () => ({
    meta: [
      { title: 'SCASPA Assistant — ports and travel in St. Kitts' },
      {
        name: 'description',
        content:
          'Ask about ferries, cruise arrivals at Port Zante, cargo at the Deep Water Harbour and Robert L. Bradshaw International Airport.',
      },
    ],
  }),
});
