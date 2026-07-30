import { createFileRoute } from '@tanstack/react-router';
import { SCASPA_PHONE_LINES } from '@/features/chat/contact';

/**
 * Privacy, written to be read.
 *
 * Short, concrete and in the first person. Not a legal document \u2014 nobody reads
 * those, and a privacy page nobody reads protects nobody. Every claim here is one
 * the code actually enforces, and several of them are asserted by tests: no
 * message content in browser storage, no cookies, no analytics, no beacon.
 *
 * If any of this stops being true, this page is wrong and must change in the same
 * commit.
 */
function Privacy() {
  return (
    <article className="max-w-measure space-y-6">
      <div className="space-y-2">
        <h1 className="text-h1 font-semibold">Privacy</h1>
        <p className="text-lead text-ink-muted">
          There is no account, no login and no cookie. We do not know who you are and we do not try
          to find out.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">What stays on your device</h2>
        <p className="text-ink-muted">
          <strong>Nothing you type is stored on your device.</strong> Not your questions, not the
          answers, not a half-written message you decided against.
        </p>
        <p className="text-ink-muted">
          One thing is kept, and only one: a <strong>conversation id</strong> \u2014 a random code
          the server generates so a follow-up question can be matched to the one before it. It is
          held only for the current browser tab and disappears when you close it.
        </p>
        <p className="text-ink-muted">
          It is <strong>not a login and not an account</strong>. It grants no access to anything, it
          is not tied to your name, email or device, and anyone who saw it would learn nothing about
          who you are. <strong>Start again</strong> clears it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">What SCASPA sees</h2>
        <p className="text-ink-muted">
          Your questions are sent to SCASPA\u2019s server to be answered, and are recorded so the
          information available can be improved \u2014 if many people ask something the assistant
          cannot answer, that is worth knowing.
        </p>
        <p className="text-ink-muted">
          They are <strong>not linked to you</strong>. No IP address, no device details, no
          identifier of any kind is stored alongside them.
        </p>
        <p className="text-ink-muted">
          Conversations are held in the server\u2019s memory for <strong>60 minutes</strong> after
          they were last used, and are then gone. They are never written to a disk or a database,
          and none of them survives a restart.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">No tracking, of any kind</h2>
        <ul className="list-outside list-disc space-y-1 pl-5 text-ink-muted">
          <li>No cookies.</li>
          <li>No analytics service, no tracking pixel, no advertising network.</li>
          <li>No fingerprinting and no third-party scripts.</li>
          <li>Nothing about your visit is sent anywhere except to SCASPA.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">Voice</h2>
        <p className="text-ink-muted">
          If you use the microphone, your recording is sent to SCASPA\u2019s server to be turned
          into text and is then discarded. It is never written to a disk, and neither the audio nor
          the text of it is kept in any log. Your browser asks your permission first, and only when
          you tap the microphone.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">Questions about this</h2>
        <p className="text-ink-muted">
          Ask SCASPA directly on{' '}
          <a
            href={SCASPA_PHONE_LINES[0].href}
            className="font-medium text-blue-700 underline tabular"
          >
            {SCASPA_PHONE_LINES[0].text}
          </a>
          .
        </p>
      </section>
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
        content:
          'No account, no login, no cookies, no tracking. What stays on your device and what SCASPA sees.',
      },
    ],
  }),
});
