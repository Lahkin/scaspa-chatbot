import { Suspense, lazy } from 'react';
import { RouteErrorBoundary } from '@/components/shells/RouteErrorBoundary';
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
const SELF_CHROMED_ROUTES = [
  '/chat',
  '/widget',
  '/dev/rehearsal',
  // The operations surfaces. Every one renders through `OpsPage` or
  // `ConsoleShell`, both of which supply their own header, `<main>` and footer —
  // so nesting them here produced exactly the two-`<main>` defect described
  // above, and additionally squeezed a console designed for 1440px into the
  // marketing column's `max-w-3xl`.
  //
  // Found by `npm run check:responsive`, not by review: in jsdom the duplicate
  // landmarks are present but harmless-looking, and the width constraint is
  // invisible without layout.
  '/vessels',
  '/flights',
  '/tariffs',
  '/support',
  '/settings',
  // Renders through `OpsPage`, which supplies its own header and `<main>`.
  '/profile',
];

/** Prefixes whose whole subtree is self-chromed, so `/ops/*` needs no upkeep. */
const SELF_CHROMED_PREFIXES = ['/ops'];

/**
 * Routes that lay out their own width inside the chrome.
 *
 * These still get the nav, the footer and the skip link — they are documents,
 * not app shells — but `<main>` does not constrain them, because a full-bleed
 * hero cannot be drawn inside a `max-w-3xl` column.
 *
 * The alternative was the usual `width: 100vw; margin-inline: calc(50% - 50vw)`
 * escape. Rejected: `100vw` includes the classic scrollbar, so on any desktop
 * browser that reserves gutter space the page gains a horizontal scrollbar —
 * and headless Chromium uses overlay scrollbars, so `check:responsive` would
 * have reported it green. A false green on an overflow check is the exact
 * failure that hid the console's sr-only bug (decision 0024), and it is not
 * worth re-creating to save one wrapper.
 *
 * A route in here owns its own horizontal padding for every child.
 */
const FULL_BLEED_ROUTES = ['/'];

function isSelfChromed(pathname: string): boolean {
  if (SELF_CHROMED_ROUTES.includes(pathname)) return true;
  return SELF_CHROMED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

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

  if (isSelfChromed(pathname)) {
    return (
      <>
        <HeadContent />
        {/* Keyed on the path so navigating away from a crashed route clears the
            boundary — otherwise the error screen would follow the user to a page
            that works. */}
        <RouteErrorBoundary key={pathname} routeName={pathname}>
          <Outlet />
        </RouteErrorBoundary>
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

      {/* Every link clears the 44px minimum.
       *
       * They measured 20px tall until `npm run check:responsive` was pointed at
       * these routes for the first time — the check only ever covered `/chat`
       * and `/widget`, so three public pages carried undersized nav targets for
       * the life of the project without anything saying so. The routes are in
       * its list now.
       */}
      <header className="border-b border-border">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-3xl items-center gap-2 px-4 text-small"
        >
          <Link
            to="/"
            className="inline-flex min-h-touch items-center rounded-sm font-semibold text-blue-700"
          >
            SCASPA Assistant
          </Link>
          <span className="flex-1" />
          <Link
            to="/chat"
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm px-2 text-ink-muted hover:text-ink"
          >
            Chat
          </Link>
          <Link
            to="/about"
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm px-2 text-ink-muted hover:text-ink"
          >
            About
          </Link>
          <Link
            to="/privacy"
            className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm px-2 text-ink-muted hover:text-ink"
          >
            Privacy
          </Link>
        </nav>
      </header>

      <main
        id="main"
        className={
          FULL_BLEED_ROUTES.includes(pathname)
            ? 'w-full flex-1'
            : 'mx-auto w-full max-w-3xl flex-1 px-4 py-6'
        }
      >
        <RouteErrorBoundary key={pathname} routeName={pathname}>
          <Outlet />
        </RouteErrorBoundary>
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
