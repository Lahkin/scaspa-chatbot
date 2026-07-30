import { SCASPA_PHONE_LINES, SCASPA_POSTAL_ADDRESS } from '@/features/chat/contact';

/**
 * "I don't have that."
 *
 * A distinct, calm treatment — **not an error colour and not an apology stack**.
 * The assistant declining to guess is the single most trustworthy thing it does,
 * and dressing it in red teaches a reader that honesty is a malfunction.
 *
 * ### The copy is the backend's
 *
 * `NO_ANSWER_MESSAGE` is approved by the team leader and coach. It is rendered
 * exactly as sent and **never rewritten client-side** — this component supplies
 * the frame, not the words. The one thing added is the contact route as tappable
 * links, because the backend can only send a phone number as text and a phone
 * number you cannot tap is a phone number you have to write down.
 *
 * The backend's text already contains those numbers in its escalation block, so
 * the plain-text tail is trimmed to avoid printing them twice.
 */

/** The escalation block the backend appends. Split on it rather than reflowing the copy. */
const ESCALATION_MARKER = /\n\s*You can reach SCASPA directly:/;

export function NoAnswerCard({ message }: { message: string }) {
  // Keep the approved sentence, drop the duplicated plain-text contact block.
  const [explanation] = message.split(ESCALATION_MARKER);

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4" data-state="no-answer">
      <p className="text-caption font-semibold tracking-wide text-ink-muted uppercase">
        No verified answer
      </p>

      {/* The backend's words, unaltered. */}
      <p className="mt-2 whitespace-pre-wrap text-body text-ink">{explanation?.trim()}</p>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-small font-semibold text-ink">Ask SCASPA directly</p>
        <ul className="mt-1 flex flex-wrap gap-x-4">
          {SCASPA_PHONE_LINES.map((line) => (
            <li key={line.href}>
              <a
                href={line.href}
                className="inline-flex min-h-touch items-center text-small font-medium text-blue-700 underline tabular"
              >
                {line.text}
              </a>
            </li>
          ))}
        </ul>
        <address className="mt-1 text-caption text-ink-subtle not-italic">
          {SCASPA_POSTAL_ADDRESS.join(', ')}
        </address>
      </div>
    </div>
  );
}
