import { createFileRoute } from '@tanstack/react-router';

/**
 * Plain-language privacy note. The claims here must stay true to what the
 * frontend actually does — see CLAUDE.md rules 2 and 5.
 */
function Privacy() {
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-semibold">Privacy</h1>
      <p className="text-ink-muted">
        There is no account, no login and no cookie. We do not know who you are and we do not try to
        find out.
      </p>
      <h2 className="text-lg font-medium">What stays on your device</h2>
      <p className="text-ink-muted">
        Nothing you type is saved on your device. A conversation is identified by a random id kept
        only for the current browser tab, and it disappears when you close it.
      </p>
      <h2 className="text-lg font-medium">What SCASPA sees</h2>
      <p className="text-ink-muted">
        Your questions are sent to SCASPA&rsquo;s server to be answered, and are recorded to help
        improve the information available. They are not linked to you: no IP address, no device
        details, no identifier of any kind is stored with them.
      </p>
    </article>
  );
}

export const Route = createFileRoute('/privacy')({ component: Privacy });
