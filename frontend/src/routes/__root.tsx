import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { config } from '@/lib/config';

/**
 * Root layout. Every route renders inside this.
 *
 * The skip link is first in the DOM on purpose: a keyboard or screen-reader user
 * should not have to walk the navigation on every page — CLAUDE.md rule 10.
 */
function RootLayout() {
  return (
    <div className="min-h-dvh bg-surface text-ink flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-ink-inverse"
      >
        Skip to main content
      </a>

      <header className="border-b border-border-subtle">
        <nav aria-label="Main" className="mx-auto flex max-w-3xl gap-4 px-4 py-3 text-sm">
          <Link to="/" className="font-semibold text-brand-700">
            SCASPA Assistant
          </Link>
          <span className="flex-1" />
          <Link to="/chat" className="text-ink-muted hover:text-ink">
            Chat
          </Link>
          <Link to="/about" className="text-ink-muted hover:text-ink">
            About
          </Link>
          <Link to="/privacy" className="text-ink-muted hover:text-ink">
            Privacy
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border-subtle px-4 py-4 text-center text-sm text-ink-muted">
        <p>
          Not sure, or in a hurry? Call SCASPA on{' '}
          <a href="tel:+18694658121" className="font-medium text-brand-700 underline">
            869-465-8121
          </a>
        </p>
      </footer>

      {config.isDev ? <DevRouterTools /> : null}
    </div>
  );
}

/** Devtools are loaded lazily so they never reach a production bundle. */
function DevRouterTools() {
  return null;
}

export const Route = createRootRoute({ component: RootLayout });
