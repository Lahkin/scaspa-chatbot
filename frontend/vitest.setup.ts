import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './src/mocks/server';

/**
 * `onUnhandledRequest: 'error'` is deliberate. A test that quietly reaches the
 * network passes on this machine and fails in CI, where there is no backend. An
 * unmocked request should be a loud failure, not a slow one.
 */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
