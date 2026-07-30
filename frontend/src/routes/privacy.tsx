import { createFileRoute } from '@tanstack/react-router';

/**
 * Plain-language privacy note. The claims here must stay true to what the
 * frontend actually does — see CLAUDE.md rules 2 and 5.
 */
function Privacy() {
  return (
    <article className="space-y-4">
      <h1 className="text-h1 font-semibold">Privacy</h1>
      <p className="text-ink-muted">
        There is no account, no login and no cookie. We do not know who you are and we do not try to
        find out.
      </p>
      <h2 className="text-h3 font-medium">What stays on your device</h2>
      <p className="text-ink-muted">
        <strong>Nothing you type is stored on your device.</strong> Not your questions, not the
        answers, not a half-typed message you decided against. Nothing is written to your
        browser&rsquo;s storage and nothing survives closing the tab.
      </p>
      <p className="text-ink-muted">
        One thing is kept, and only one: a <strong>conversation id</strong>. It is a random code the
        server generates so that a follow-up question can be matched to the one before it. It is
        stored only for the current browser tab and disappears when you close it.
      </p>
      <p className="text-ink-muted">
        The conversation id is <strong>not a login and not an account</strong>. It grants no access
        to anything, it is not tied to your name, your email or your device, and anyone who saw it
        would learn nothing about who you are. You can clear it at any time with{' '}
        <strong>Start again</strong>, which also clears the conversation on screen.
      </p>

      <h2 className="text-h3 font-medium">What SCASPA sees</h2>
      <p className="text-ink-muted">
        Your questions are sent to SCASPA&rsquo;s server to be answered, and are recorded to help
        improve the information available. They are not linked to you: no IP address, no device
        details, no identifier of any kind is stored with them.
      </p>
    </article>
  );
}

export const Route = createFileRoute('/privacy')({
  component: Privacy,
  head: () => ({
    meta: [
      { title: 'Privacy \u2014 SCASPA Assistant' },
      {
        name: 'description',
        content: 'No account, no login, no cookie. What stays on your device and what SCASPA sees.',
      },
    ],
  }),
});
