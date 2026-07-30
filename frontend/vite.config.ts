import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import checker from 'vite-plugin-checker';
import { fileURLToPath, URL } from 'node:url';

// The router plugin must come BEFORE the react plugin: it generates routeTree.gen.ts
// from src/routes, and react's transform needs to see the generated output.
/**
 * Vite copies everything in `public/` verbatim, so MSW's generated service worker
 * would be deployed alongside the app.
 *
 * It is inert — nothing registers it outside dev, and registration is behind
 * `import.meta.env.DEV` — but it is 9.6KB of dead weight on a deploy aimed at
 * people on metered roaming data, and a `/mockServiceWorker.js` sitting on the
 * production origin advertises that a mocking layer exists. It has to live in
 * `public/` to be served at the root scope in dev, so removing it after the
 * production build is the place to do it.
 */
function stripMockServiceWorker(): Plugin {
  return {
    name: 'scaspa:strip-mock-service-worker',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      const target = resolve(dir, 'mockServiceWorker.js');
      if (existsSync(target)) rmSync(target);
    },
  };
}

export default defineConfig({
  plugins: [
    stripMockServiceWorker(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Type errors appear in the dev overlay rather than only in the terminal,
    // which is the difference between noticing one and shipping it.
    checker({ typescript: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
  build: { sourcemap: true },
});
