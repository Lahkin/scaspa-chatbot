const POINTS = [
  {
    title: 'Every answer shows its source',
    body: 'Each fact is linked to the SCASPA page or document it came from, with the date it was checked.',
  },
  {
    title: 'Verified information only',
    body: 'It answers from information SCASPA has confirmed — not from the open internet and not from guesswork.',
  },
  {
    title: 'It says when it does not know',
    body: "If there is no verified answer it tells you so and gives you SCASPA's number, rather than inventing something plausible.",
  },
  {
    title: 'It never asks who you are',
    body: 'No account, no login, no personal or payment details. It cannot look up your shipment or booking, and it will not ask.',
  },
] as const;

/**
 * Why you can trust it.
 *
 * Four claims, each one a description of how the thing actually works rather than
 * an adjective about it. "Verified information only" is checkable; "trusted and
 * reliable" is not, and a visitor who has read one marketing page can tell the
 * difference in a second.
 */
export function TrustPoints() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {POINTS.map((point) => (
        <li key={point.title} className="rounded-md border border-border bg-surface p-4">
          <p className="text-small font-semibold text-ink">{point.title}</p>
          <p className="mt-1 text-small text-ink-muted">{point.body}</p>
        </li>
      ))}
    </ul>
  );
}
