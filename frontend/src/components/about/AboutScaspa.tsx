import { LogoLockup } from '@/components/brand/LogoLockup';
import {
  SCASPA_EMAIL,
  SCASPA_FACILITIES,
  SCASPA_FORMATION,
  SCASPA_IDENTITY,
  SCASPA_PHONE_LINES,
  SCASPA_POSTAL_ADDRESS,
  SCASPA_WEBSITE,
} from '@/lib/scaspa-facts';

/**
 * What SCASPA is — one content component, two placements.
 *
 * Rendered inside a `Sheet` from the sidebar, and at `/about-scaspa` for
 * deep-linking and the landing footer. **One component, deliberately**: two
 * copies of an explanation drift, and the version a user reaches depends on
 * which door they came through.
 *
 * The sheet is the primary route from the assistant. Someone who wonders what
 * SCASPA is mid-conversation should not have to navigate away and lose the
 * answer they were reading to find out — a sheet keeps the conversation mounted
 * behind it.
 *
 * ## Everything here is a low-volatility fact
 *
 * No fees, no schedules, no opening hours, no statistics. Those are the
 * assistant's job, where they arrive with a source and a verified date. See the
 * header of `lib/scaspa-facts.ts` for the rule and docs/decisions.md 0022 for
 * why this component is allowed to duplicate anything at all.
 */
export function AboutScaspa({
  /** The route renders its own `<h1>`; the sheet already has a title. */
  headingLevel = 'h2',
}: {
  headingLevel?: 'h1' | 'h2';
}) {
  const Heading = headingLevel;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* The lockup carries the seal and the product name and nothing else —
            handoff §1.1. The strapline it used to take as a prop is a sentence
            about SCASPA, so it belongs in this panel's own prose. */}
        <LogoLockup />
        <p className="text-caption text-ink-muted">Ports and travel, St. Kitts and Nevis</p>
        <Heading className="text-h3 font-semibold text-ink">{SCASPA_IDENTITY.fullName}</Heading>
        <p className="text-body text-ink-muted">
          {SCASPA_IDENTITY.shortName} is {SCASPA_IDENTITY.what}
        </p>
      </div>

      <section aria-labelledby="about-formation" className="space-y-2">
        <h3 id="about-formation" className="text-small font-semibold text-ink">
          Formed in {SCASPA_FORMATION.year}
        </h3>
        <p className="text-small text-ink-muted">{SCASPA_FORMATION.summary}</p>
        <p className="text-caption text-ink-subtle">
          If you are holding older paperwork, {SCASPA_FORMATION.seaportPredecessor} and{' '}
          {SCASPA_FORMATION.airportPredecessor} are the same organisation as SCASPA today.
        </p>
      </section>

      <section aria-labelledby="about-facilities" className="space-y-2">
        <h3 id="about-facilities" className="text-small font-semibold text-ink">
          What SCASPA runs
        </h3>
        <ul className="space-y-2">
          {SCASPA_FACILITIES.map((facility) => (
            <li key={facility.id} className="border-l-2 border-border pl-3">
              <p className="text-small font-medium text-ink">{facility.name}</p>
              <p className="text-caption text-ink-muted">{facility.line}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-contact" className="space-y-2">
        <h3 id="about-contact" className="text-small font-semibold text-ink">
          Contact SCASPA
        </h3>

        <ul className="space-y-1">
          {SCASPA_PHONE_LINES.map((line) => (
            <li key={line.href} className="text-small">
              <span className="text-ink-subtle">{line.label}: </span>
              <a
                href={line.href}
                className="inline-flex min-h-touch items-center font-medium text-blue-700 underline"
              >
                {line.display}
              </a>
            </li>
          ))}
        </ul>

        {/*
          The email row renders only when there is an address. It is pending from
          the client because scaspa.com obfuscates it, and guessing a plausible
          `info@` would invent a route that may bounce — someone who emailed it
          and waited three days is worse off than someone told to phone.

          Omitted entirely rather than shown as "coming soon": an empty slot is
          a promise, and this one has no date on it.
        */}
        {SCASPA_EMAIL ? (
          <p className="text-small">
            <span className="text-ink-subtle">Email: </span>
            <a
              href={`mailto:${SCASPA_EMAIL}`}
              className="inline-flex min-h-touch items-center font-medium text-blue-700 underline"
            >
              {SCASPA_EMAIL}
            </a>
          </p>
        ) : null}

        <address className="text-small text-ink-muted not-italic">
          {SCASPA_POSTAL_ADDRESS.map((part) => (
            <span key={part} className="block">
              {part}
            </span>
          ))}
        </address>

        <p>
          <a
            href={SCASPA_WEBSITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center text-small font-medium text-blue-700 underline"
          >
            scaspa.com
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </section>

      {/* The boundary, said out loud. This panel is chrome; anything that
          changes comes from the assistant with its source attached. */}
      <p className="border-t border-border pt-3 text-caption text-ink-subtle">
        This page covers what SCASPA is. For fees, sailing times, opening hours or anything else
        that changes, ask the assistant — it answers from verified SCASPA information and shows you
        the source and the date it was checked.
      </p>
    </div>
  );
}
