import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';

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
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
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
