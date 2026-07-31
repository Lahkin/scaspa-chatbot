import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';

/**
 * Render the way the app does.
 *
 * The shells poll `GET /api/health` through TanStack Query, so they need a
 * `QueryClientProvider` — the same one `main.tsx` supplies. Rendering a shell
 * bare throws, which is correct: a missing provider is a bug, not something a
 * component should paper over.
 *
 * A fresh client per test, with retries off: a retrying query turns a deliberate
 * failure fixture into a slow test that eventually passes for the wrong reason.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}

/**
 * Render something that contains a `<Link>`.
 *
 * A TanStack `<Link>` reads the router from context and throws without one, so
 * any component with internal navigation in it — the sidebar, the console shell
 * — cannot be rendered bare. A memory router with a single catch-all route is
 * the smallest thing that satisfies it without pulling in the real route tree,
 * which would drag every route's module into a unit test.
 *
 * The query client comes along too: these components are usually the ones that
 * also read health.
 */
export function renderInRouter(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  // The generated route types do not know this ad-hoc tree. The cast is confined
  // to the test harness and never reaches application code.
  return { queryClient, ...render(<RouterProvider router={router as never} />) };
}
