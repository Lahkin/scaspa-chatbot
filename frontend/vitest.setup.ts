import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './src/mocks/server';
import { setScenario, setTimeScale } from './src/mocks/scenarios';

/**
 * `onUnhandledRequest: 'error'` is deliberate. A test that quietly reaches the
 * network passes on this machine and fails in CI, where there is no backend. An
 * unmocked request should be a loud failure, not a slow one.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // Sleeps removed, splitting kept. The split frames and the split [kb-014] marker
  // are what break a streaming client; the delays only make the suite slow.
  setTimeScale(0);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  setScenario('happy');
});
afterAll(() => server.close());
