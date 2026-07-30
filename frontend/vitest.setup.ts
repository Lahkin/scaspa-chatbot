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

/**
 * jsdom does not implement ResizeObserver, and `ScheduleTable` uses one to notice
 * when its scroll container starts or stops overflowing (which changes on rotate
 * and when the webfont lands).
 *
 * A no-op stub rather than a real implementation: jsdom does no layout, so a
 * faithful one would have nothing to report. The overflow behaviour it exists to
 * drive is measured for real in `scripts/responsive-check.mjs`, in a browser.
 */
/**
 * jsdom implements neither `Element.scrollTo` nor `Element.scrollIntoView`.
 * `MessageList` uses the former to follow the newest message.
 *
 * A no-op: without layout there is nowhere to scroll to. What the tests actually
 * assert is *whether* it was called — following versus not following — which the
 * stub records faithfully.
 */
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
