import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import checker from 'vite-plugin-checker';
import { fileURLToPath, URL } from 'node:url';

// The router plugin must come BEFORE the react plugin: it generates routeTree.gen.ts
// from src/routes, and react's transform needs to see the generated output.
export default defineConfig({
  plugins: [
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
