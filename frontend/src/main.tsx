import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';

import { shouldRetry } from './features/chat/queries';
import { config } from './lib/config';
import { routeTree } from './routeTree.gen';
import './styles/tokens.css';

/**
 * Query defaults chosen for the audience: someone on metered roaming data.
 * Refetching on window focus would spend their bandwidth to re-fetch something
 * they already have on screen, so it is off.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The users are on metered roaming data. Refetching on tab focus spends
      // their bandwidth to replace something already on screen.
      refetchOnWindowFocus: false,
      // The policy lives in one place — see features/chat/queries.ts. In short:
      // never retry a 429 (retrying a rate limit is how you extend one) and never
      // retry a 422 (the request was wrong and will be wrong again).
      retry: shouldRetry,
      staleTime: 30_000,
    },
    mutations: {
      retry: shouldRetry,
    },
  },
});

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  /**
   * Scroll restoration is **off**, and that is a rule decision rather than a
   * preference.
   *
   * TanStack Router implements it by writing a `tsr-scroll-restoration-v1_*` key
   * to sessionStorage. CLAUDE.md rule 5 is narrow on purpose: *only*
   * `conversation_id` may go to sessionStorage. A scroll offset is not message
   * content, so this is not the leak the rule was written to prevent — but the
   * rule is absolute and this writes to that store, so it goes.
   *
   * The cost is close to zero here. `/chat` and `/widget` never scroll at the
   * document level — the transcript scrolls inside a `dvh` flex column, which
   * this could not restore anyway — and the marketing pages are a screen long.
   *
   * Reversible: if the team decides a scroll offset is out of scope for rule 5,
   * turn it back on in this one line.
   */
  scrollRestoration: false,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing from index.html');
}

/**
 * Start MSW before the first render, so no request can escape to a backend that
 * is not there.
 *
 * `import.meta.env.DEV` is a literal at build time, so Rollup removes this entire
 * branch — and everything it dynamically imports — from the production bundle.
 * The `await import()` is what keeps the mock out of the graph; a static import
 * would pull it in regardless of the condition.
 */
async function startMocks(): Promise<void> {
  if (!import.meta.env.DEV || !config.useMocks) return;
  const { worker } = await import('./mocks/browser');
  await worker.start({
    /**
     * Warn only about calls to the API. An unhandled `/api/*` request is a real
     * gap in the mock and should be loud; Vite's own `/@react-refresh`,
     * `/@vite/client` and module requests are not, and warning about them fills
     * the console with noise that teaches everyone to ignore MSW warnings —
     * including the one that matters.
     */
    onUnhandledRequest(request, print) {
      if (request.url.startsWith(`${config.apiBaseUrl}/api/`)) print.warning();
    },
    quiet: true,
  });
}

void startMocks().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  );
});
