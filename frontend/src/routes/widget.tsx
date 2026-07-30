import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPanel } from '@/components/shells/PlaceholderPanel';

/**
 * Embeddable widget route. Loaded inside an iframe by `public/embed.js` on
 * scaspa.com, so it renders without the site chrome that `__root` provides for
 * the standalone app.
 */
function WidgetRoute() {
  return (
    <PlaceholderPanel
      title="Widget"
      note="Embedded view. Rendered inside an iframe on scaspa.com; the loader and origin checks are built in F11."
    />
  );
}

export const Route = createFileRoute('/widget')({
  component: WidgetRoute,
  head: () => ({
    meta: [
      { title: 'SCASPA Assistant' },
      {
        name: 'description',
        content: 'Embedded SCASPA Assistant.',
      },
    ],
  }),
});
