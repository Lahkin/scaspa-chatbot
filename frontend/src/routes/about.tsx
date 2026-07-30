import { createFileRoute } from '@tanstack/react-router';

/**
 * How it works, in plain English.
 *
 * No jargon: not "RAG", not "embeddings", not "large language model". A visitor
 * who wanted a glossary would not be reading this page, and every technical term
 * is a chance for them to decide the product is not for them.
 */
function About() {
  return (
    <article className="max-w-measure space-y-6">
      <div className="space-y-2">
        <h1 className="text-h1 font-semibold">About this assistant</h1>
        <p className="text-ink-muted">
          It answers questions about SCASPA\u2019s facilities: the Deep Water Harbour for cargo,
          Port Zante for cruise ships, the Basseterre Ferry Terminal, and Robert L. Bradshaw
          International Airport.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">How it answers</h2>
        <p className="text-ink-muted">
          SCASPA staff and our researchers built a set of confirmed facts \u2014 sailing times,
          published charges, opening hours, procedures \u2014 and recorded where each one came from
          and the date it was checked.
        </p>
        <p className="text-ink-muted">
          When you ask something, the assistant looks through that set for the entries that match,
          and writes an answer using only what it found. Every claim it makes is linked back to the
          entry it came from, which is what the small numbered marks in an answer are.
        </p>
        <p className="text-ink-muted">
          If it cannot find a confirmed answer, it says so and gives you SCASPA\u2019s phone number.
          It is not allowed to fill the gap with something that sounds right.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">What it cannot do</h2>
        <ul className="list-outside list-disc space-y-1 pl-5 text-ink-muted">
          <li>
            It cannot see live operations \u2014 whether a ferry is sailing right now, or whether a
            flight is delayed today.
          </li>
          <li>It cannot look up your shipment, booking, container or payment.</li>
          <li>It does not give customs, immigration, tax or legal advice.</li>
          <li>
            It works from a snapshot, not a live feed. Every answer shows the date its information
            was checked, so you can judge whether to confirm it.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-h3 font-semibold">Why the dates matter</h2>
        <p className="text-ink-muted">
          A schedule that was right in April may not be right today. That is why the date is on
          every source rather than hidden away, and why anything time-sensitive says plainly that
          you should confirm it with SCASPA before you travel. A wrong ferry time is a missed ferry.
        </p>
      </section>
    </article>
  );
}

export const Route = createFileRoute('/about')({
  component: About,
  head: () => ({
    meta: [
      { title: 'About \u2014 SCASPA Assistant' },
      {
        name: 'description',
        content:
          'How the SCASPA Assistant answers, where its information comes from, and what it cannot tell you.',
      },
    ],
  }),
});
