import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
