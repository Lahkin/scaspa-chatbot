import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui';
import { OpsPage } from '@/components/ops/OpsPage';
import { clearConversationId } from '@/features/chat/conversation';
import { setDraft } from '@/features/chat/draft';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * Settings — the local half of the design's `profile_settings`.
 *
 * ## What is absent, and why
 *
 * The mockup is a signed-in officer's page: a name, an Agent ID, a jurisdiction,
 * "Verified Officer", "Review Security Logs", "Terminate All Active Sessions".
 * All of it needs authentication, and `frontend/CLAUDE.md` rule 2 says plainly
 * that there is no auth and no session token here — no Authorization header, no
 * cookie. The README lists "no user accounts" as a non-goal.
 *
 * So there is no profile. The route is `/settings` rather than `/profile`
 * because calling it a profile promises the part that is not here.
 *
 * ## Why the contrast toggle became a system preference
 *
 * The design has a "High Contrast Mode" switch. A switch needs somewhere to
 * remember itself, and `CLAUDE.md` rule 5 permits exactly one key in exactly one
 * storage — `conversation_id` in `sessionStorage`. An accessibility preference
 * that resets on every visit is worse than none, so the choice was between
 * weakening an absolute rule and finding a better mechanism.
 *
 * The better mechanism already existed: `prefers-contrast`, honoured in
 * `styles/tokens.css`. The user sets it once in their operating system and every
 * site respects it, including this one, with nothing stored anywhere. That is
 * strictly better than a per-site switch — and the same is true of
 * `prefers-reduced-motion`, which this app has always followed.
 */
function SettingsRoute() {
  const [cleared, setCleared] = useState(false);

  return (
    <OpsPage
      title="Settings"
      intro="What this app keeps on your device, and how to change how it looks."
    >
      <section
        aria-labelledby="appearance-heading"
        className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
      >
        <h2 id="appearance-heading" className="text-h3 font-semibold text-ops-ink">
          Appearance
        </h2>
        <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
          There is no switch here on purpose. This app follows the contrast and reduced-motion
          settings you have already chosen on your device, so you set them once and every app
          respects them — and nothing has to be stored here to remember it. On iOS look under
          Accessibility → Display; on Android under Accessibility; on a desktop under the display or
          accessibility settings.
        </p>
      </section>

      <section
        aria-labelledby="data-heading"
        className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
      >
        <h2 id="data-heading" className="text-h3 font-semibold text-ops-ink">
          Data on this device
        </h2>

        {/* The honest version of the mockup's "Clear Chat History", which sounds
            like it reaches a server and does not. */}
        <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
          This app stores one thing in your browser: an anonymous conversation id, so a reload does
          not lose your place. No messages, no name, no account. Conversations on the server hold
          only question and answer text, are capped, and expire on their own — there is nothing
          there that identifies you, so there is nothing to delete.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              clearConversationId();
              setDraft('');
              setCleared(true);
            }}
          >
            Start a new conversation
          </Button>
          {cleared ? (
            <span role="status" className="text-small text-ops-ink-variant">
              Cleared. Your next question starts a fresh conversation.
            </span>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="accounts-heading"
        className="rounded-lg border border-ops-outline-variant bg-ops-surface-low p-4"
      >
        <h2 id="accounts-heading" className="text-h3 font-semibold text-ops-ink">
          There is no account
        </h2>
        <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
          This assistant has no sign-in, no profile and no sessions to manage, by design. Nothing
          you ask can be linked back to you. If you need something that depends on knowing who you
          are — a shipment, a booking, a payment — that has to go to SCASPA staff, who can see your
          case. Call{' '}
          <a href={SCASPA_TEL_HREF} className="font-medium text-ops-sky underline">
            {SCASPA_TEL_TEXT}
          </a>
          .
        </p>
      </section>
    </OpsPage>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
  head: () => ({
    meta: [
      { title: 'Settings — SCASPA Assistant' },
      {
        name: 'description',
        content:
          'What the SCASPA assistant keeps on your device, and how to change its appearance.',
      },
    ],
  }),
});
