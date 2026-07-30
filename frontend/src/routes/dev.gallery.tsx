import { createFileRoute, notFound } from '@tanstack/react-router';
import { PlaceholderPanel } from '@/components/shells/PlaceholderPanel';
import { config } from '@/lib/config';

/**
 * Component gallery: every component in every state, on one page.
 *
 * Dev builds only. In production the route 404s, so it cannot be reached from a
 * deployed URL even by guessing the path.
 *
 * CLAUDE.md: add an entry here for any new component state. A state that is only
 * reachable by driving the app is a state nobody checks.
 */
function Gallery() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Component gallery</h1>
        <p className="text-sm text-ink-muted">
          Dev only. Every component state lives here so it can be reviewed without driving the app
          into it.
        </p>
      </header>

      <GallerySection title="Shells">
        <PlaceholderPanel title="Placeholder" note="Scaffold placeholder, default state." />
      </GallerySection>

      <GallerySection title="Tokens">
        <div className="flex flex-wrap gap-2">
          {(
            [
              'bg-brand-500',
              'bg-brand-700',
              'bg-surface-muted',
              'bg-surface-sunken',
              'bg-verified',
              'bg-unverified',
              'bg-danger',
            ] as const
          ).map((token) => (
            <div key={token} className="text-center">
              <div className={`size-14 rounded-card border border-border-subtle ${token}`} />
              <code className="text-[0.65rem] text-ink-muted">{token}</code>
            </div>
          ))}
        </div>
      </GallerySection>
    </div>
  );
}

function GallerySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-border-subtle pb-1 text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

export const Route = createFileRoute('/dev/gallery')({
  beforeLoad: () => {
    if (!config.isDev) throw notFound();
  },
  component: Gallery,
});
