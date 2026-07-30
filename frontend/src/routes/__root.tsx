import { Suspense, lazy } from 'react';
import { createRootRoute, HeadContent, Link, Outlet, useRouterState } from '@tanstack/react-router';

/**
 * Root layout and the accessibility baseline for every page.
 *
 * Five things live here because they must be true everywhere, and a thing that
 * has to be remembered per page eventually is not:
 *
 * 1. **Skip link**, first in the DOM. A keyboard or screen-reader user should not
 *    walk the navigation on every page — CLAUDE.md rule 10. It is visually hidden
 *    until focused, then it is unmissable.
 * 2. **Landmarks**: one `<header>` with a labelled `<nav>`, one `<main id="main">`,
 *    one `<footer>`. Screen-reader users navigate by landmark; a page built from
 *    `<div>`s has no navigation at all.
 * 3. **`<HeadContent />`** renders the per-route `<title>` and description. React 19
 *    hoists `<title>`/`<meta>` into the document head, so this works in a plain SPA
 *    with no SSR.
 * 4. **`lang="en"`** is set in index.html on `<html>`, which is the only place it
 *    can be set for a client-rendered app.
 * 5. **The phone number is in the footer of every page.** When the assistant cannot
 *    help, the fallback must already be on screen rather than something to go and
 *    find.
 *
 * ### Two routes opt out of the chrome
 *
 * `/chat` and `/widget` are application shells, not documents: each is a `dvh`
 * (or fixed 600px) flex column that owns its own header, its own `<main>` and its
 * own scrolling. Wrapping them in the marketing chrome would give the page two
 * `<main>` landmarks and two elements with `id="main"` — so the skip link would
 * jump to whichever the browser found first — and would add a document-level
 * scroll that puts the composer off screen, which is the exact failure the `dvh`
 * layout exists to avoid.
 *
 * So the root renders a bare `<Outlet />` for those two and the full chrome for
 * everything else. `<HeadContent />` stays in both branches: every route still
 * needs its title.
 */
const SELF_CHROMED_ROUTES = ['/chat', '/widget'];

/**
 * Dev-only mock controls.
 *
 * `import.meta.env.DEV` is a build-time literal, so in a production build this
 * whole expression folds to `null` and Rollup never follows the dynamic import —
 * keeping `@/mocks/*`, its fixtures and MSW itself out of the shipped bundle.
 * A static import would pull all of it in regardless of the condition.
 */
const MockControls = import.meta.env.DEV
  ? lazy(() =>
      import('@/components/dev/MockControls').then((module) => ({
        default: module.MockControls,
      }))
    )
  : null;

function DevMockControls() {
  if (!MockControls) return null;
  return (
    <Suspense fallback={null}>
      <MockControls />
    </Suspense>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (SELF_CHROMED_ROUTES.includes(pathname)) {
    return (
      <>
        <HeadContent />
        <Outlet />
        <DevMockControls />
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      <HeadContent />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-ink-inverse"
      >
        Skip to main content
      </a>

      <header className="border-b border-border">
        <nav aria-label="Main" className="mx-auto flex max-w-3xl gap-4 px-4 py-3 text-small">
          <Link to="/" className="font-semibold text-blue-700">
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

      <footer className="border-t border-border px-4 py-4 text-center text-small text-ink-muted">
        <p>
          Not sure, or in a hurry? Call SCASPA on{' '}
          <a href="tel:+18694658121" className="font-medium text-blue-700 underline">
            869-465-8121
          </a>
        </p>
      </footer>

      <DevMockControls />
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  // Defaults. Every route below overrides both; the deepest match wins, so a route
  // that forgets still gets something accurate rather than an empty tab.
  head: () => ({
    meta: [
      { title: 'SCASPA Assistant' },
      {
        name: 'description',
        content:
          'Ask about ferries, cruise arrivals, cargo and Robert L. Bradshaw International ' +
          'Airport in St. Kitts. Answers come from verified SCASPA information and cite ' +
          'their source.',
      },
    ],
  }),
});
