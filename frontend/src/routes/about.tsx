import { createFileRoute } from '@tanstack/react-router';

function About() {
  return (
    <article className="space-y-4">
      <h1 className="text-h1 font-semibold">About this assistant</h1>
      <p className="text-ink-muted">
        This assistant answers questions about SCASPA&rsquo;s facilities: the Deep Water Harbour
        (cargo), Port Zante (cruise), the Basseterre Ferry Terminal, and Robert L. Bradshaw
        International Airport.
      </p>
      <p className="text-ink-muted">
        Every factual claim shows the source it came from and the date that information was
        verified. If it cannot find a verified answer it says so and gives you SCASPA&rsquo;s phone
        number rather than guessing.
      </p>
      <p className="text-ink-muted">
        The information is a snapshot, not a live feed. It cannot tell you whether a ferry is
        sailing right now or whether a flight is delayed today.
      </p>
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
          'What the SCASPA Assistant answers, where its information comes from, and what it cannot tell you.',
      },
    ],
  }),
});
