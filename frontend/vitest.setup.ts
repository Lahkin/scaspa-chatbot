import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { server } from './src/mocks/server';
import { setScenario, setTimeScale } from './src/mocks/scenarios';
import { resetVoiceStatus } from './src/features/voice/availability';

/**
 * `findBy*` waits five seconds, not the one-second default.
 *
 * ── WHY THIS IS A CONFIG CHANGE AND NOT A TEST FIX ──────────────────────────
 *
 * The suite grew a large number of tests that render a whole route: mount the
 * router, resolve a lazy chunk, let MSW answer, settle React Query. Each is
 * comfortably under a second alone. Run 857 of them together on a loaded
 * machine and a handful drift past it — and it was a *different* handful each
 * run, which is the signature of a shared budget rather than of any one test
 * being wrong.
 *
 * Raising individual assertions as they flaked would have meant chasing them
 * one at a time forever, and would have left the number looking like a property
 * of each test rather than of the runner.
 *
 * **This does not make a real failure slow.** A `findBy*` resolves the moment
 * its element appears, so the timeout is only ever spent on a query that was
 * going to fail anyway. What it costs is five seconds instead of one on a
 * genuine break; what it buys is a suite that does not cry wolf.
 *
 * It does NOT relax `waitFor` calls with an explicit timeout — those keep
 * whatever they were given, including the deliberately generous one in
 * `tests/airport-information.test.tsx` that exists to outlast a retry policy.
 */
configure({ asyncUtilTimeout: 5000 });

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
  // Module-level, like the speech store beside it. Without this a test that
  // publishes "voice unavailable" silently hides the microphone in every test
  // that runs after it.
  resetVoiceStatus();
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
