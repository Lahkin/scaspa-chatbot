import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vitest runs without the router and checker plugins: neither is needed to run a
 * test, and the router plugin would regenerate the route tree on every run.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    /*
     * Twenty seconds per test, not the 5s default.
     *
     * The default was a silent ceiling on every longer wait in the suite:
     * `tests/gallery.test.tsx` asks `findByRole` to wait 15s for a lazy chunk,
     * and `tests/airport-information.test.tsx` waits 8s to outlast a retry
     * policy — neither could ever reach its own number, because vitest killed
     * the test at 5s first. The symptom was a test that "timed out" well before
     * the timeout it had been given, which reads as a hung test rather than as
     * a budget conflict.
     *
     * As with `asyncUtilTimeout` in vitest.setup.ts, this costs nothing on a
     * passing run: a test ends when its assertions finish, and the ceiling is
     * only ever reached by something that was going to fail.
     */
    testTimeout: 20_000,
  },
});
