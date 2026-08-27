import { createFileRoute } from '@tanstack/react-router';
import { WidgetShell } from '@/components/shells/WidgetShell';

/**
 * Embeddable widget.
 *
 * Loaded inside an iframe by `public/embed.js` on scaspa.com, so it renders
 * without the site chrome `__root` provides for the standalone app — see the note
 * there on self-chromed routes.
 *
 * Framing policy is a **deploy concern, not a markup one**: it cannot be set from
 * a meta tag. See `docs/embedding.md`.
 */
function WidgetRoute() {
  return <WidgetShell />;
}

export const Route = createFileRoute('/widget')({
  component: WidgetRoute,
  head: () => ({
    meta: [
      { title: 'Pilot | SCASPA Digital Guide' },
      { name: 'description', content: 'Pilot, embedded.' },
      // Embedded in someone else's page; it must never appear in search results
      // as a standalone page.
      { name: 'robots', content: 'noindex' },
    ],
  }),
});
