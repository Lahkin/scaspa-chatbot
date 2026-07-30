import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * Browser-side MSW worker, used by `npm run dev` only.
 *
 * This module is imported through a **dynamic** `import()` guarded by
 * `import.meta.env.DEV` in `main.tsx`, so Rollup drops the whole branch — worker,
 * handlers, fixtures and all — from the production bundle. Verified by
 * `tests/mocks-not-in-production.test.ts`, which greps the built assets: an
 * assertion beats an assumption when the failure mode is shipping a fake ferry
 * fare to real passengers.
 */
export const worker = setupWorker(...handlers);
