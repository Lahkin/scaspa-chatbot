import { Card } from '@/components/ui';
import { SCASPA_EMAIL, SCASPA_PHONE_LINES, SCASPA_POSTAL_ADDRESS } from '@/features/chat/contact';
import type { RefusalCategory } from '@/lib/types';

/**
 * The handoff.
 *
 * Rendered instead of a normal bubble when `refusal: true`. **It must not look
 * like an error**, because it is not one: the contract is explicit that a refusal
 * is a successful 200, and the assistant declining to guess about someone's
 * container is the system working exactly as designed.
 *
 * So: no red, no warning triangle, no apology. Navy and calm, the way a
 * well-designed "here is who can actually help you" panel looks. The visual
 * message is *handed over*, not *failed*.
 *
 * This is the moment worth showing in a demo, and most teams never build it —
 * they treat a refusal as an error path and style it accordingly, which teaches
 * a judge that the system breaks when pushed. Making it deliberate says the
 * opposite: the boundary was designed, not discovered.
 */

const EXPLANATIONS: Record<string, string> = {
  personal_record:
    'I cannot look up anything tied to a specific person or shipment — a container, ' +
    'a booking, a payment or a customs case. SCASPA staff can see those records; I ' +
    'have no access to them at all.',
  vessel_or_aircraft_operations:
    'I cannot advise on vessel, aircraft or vehicle operations. Those decisions are ' +
    'made by the people on duty with live information, and a stale answer from me ' +
    'could be worse than no answer.',
};

const DEFAULT_EXPLANATION =
  'That is outside what I can help with. Questions about customs, immigration, tax ' +
  'or legal matters, about a specific shipment, booking or payment, or about vessel ' +
  'and aircraft operations need to go to SCASPA staff directly.';

export function EscalationCard({
  category,
  /** The backend's own refusal text. Shown when there is no category-specific line. */
  answer,
}: {
  category?: RefusalCategory | undefined;
  answer?: string | undefined;
}) {
  const explanation =
    (category ? EXPLANATIONS[category] : undefined) ??
    // Falling back to the backend's text rather than only to our own: it is the
    // approved copy, and the phone number is already inside it.
    answer?.split('\n\n')[0] ??
    DEFAULT_EXPLANATION;

  return (
    <Card tone="outlined" className="border-navy">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-caption font-semibold tracking-wide text-navy uppercase">
            Talk to SCASPA directly
          </p>
          <p className="text-body text-ink">{explanation}</p>
        </div>

        <div className="space-y-3 rounded-md bg-surface-muted p-3">
          <div>
            <p className="text-small font-semibold text-ink">Telephone</p>
            <ul className="mt-1 space-y-1">
              {SCASPA_PHONE_LINES.map((line) => (
                <li key={line.href}>
                  {/* Each line is its own tel: link. "8121 / 2 / 3" as one link
                      dials nothing; as three, the next one is a single tap. */}
                  <a
                    href={line.href}
                    className="inline-flex min-h-touch items-center text-body font-medium text-blue-700 underline underline-offset-2 tabular"
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

          <div>
            <p className="text-small font-semibold text-ink">Email</p>
            {SCASPA_EMAIL ? (
              <a
                href={`mailto:${SCASPA_EMAIL}`}
                className="inline-flex min-h-touch items-center text-body text-blue-700 underline"
              >
                {SCASPA_EMAIL}
              </a>
            ) : (
              // Visible and marked, not omitted. An omitted field is invisible to
              // whoever has to chase it; this one is a standing question on screen.
              <p className="mt-1 text-small text-ink-subtle">
                <span className="rounded-sm bg-neutral-100 px-1.5 py-0.5 font-medium">
                  Pending from SCASPA
                </span>{' '}
                — the website obfuscates the address, so it has not been guessed.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
