import { SCASPA_PHONE_LINES } from '@/features/chat/contact';

/**
 * The way out, permanently on screen.
 *
 * ## Why this sits in the sidebar rather than appearing when things go wrong
 *
 * `EscalationBlock` already offers a number at the moment Pilot cannot answer,
 * and that is the right behaviour for that moment. This is a different job: it
 * is there BEFORE anything goes wrong, so that a traveller who is late, or
 * anxious, or simply does not want to type at a machine, can see that a person
 * exists without first failing a conversation to find out.
 *
 * On a product whose most important honest answer is sometimes "I do not have
 * that", the phone number is not a fallback. It is a feature, and it is
 * permanent furniture.
 *
 * ## One number, and it is the first line
 *
 * `SCASPA_PHONE_LINES` holds all three. The card shows the first, because a
 * card offering three numbers makes a reader choose between them and they are
 * the same switchboard. The other two are on `/support`, where someone
 * comparing them has a reason to.
 */
export function HumanHelpCard() {
  const line = SCASPA_PHONE_LINES[0];

  return (
    <div className="shrink-0 rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-label font-semibold text-ink">Need immediate help?</p>

      {/*
        A `tel:` link, not text to copy out. On the phone this is mostly read on,
        it dials. `TapToCall` is the same idea in the chat column and carries the
        analytics; this one is chrome and stays plain.
      */}
      <a
        href={line.href}
        className="mt-2 flex min-h-touch items-center gap-2.5 rounded-button text-left"
      >
        <span className="text-caption text-ink-muted">
          Call SCASPA
          <span className="mt-0.5 block text-section font-semibold text-brand-300">
            {line.text}
          </span>
        </span>
      </a>
    </div>
  );
}
