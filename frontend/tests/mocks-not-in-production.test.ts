/**
 * The mock must not ship.
 *
 * A fake XCD 44.44 ferry fare reaching a real passenger is the worst outcome this
 * project has, and it is one careless static import away: a single
 * `import { handlers } from '@/mocks/handlers'` anywhere in production code pulls
 * MSW, the fixtures and the fake fares into the bundle, and nothing about the app
 * would look different.
 *
 * "It tree-shakes" is a belief. This greps the built output, which is a fact.
 *
 * Requires `npm run build` first; `npm run verify` builds before it runs tests.
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();

function builtJs(): { file: string; source: string }[] {
  const dir = resolve(PROJECT_ROOT, 'dist/assets');
  if (!existsSync(dir)) return [];
  return globSync('dist/assets/*.js', { cwd: PROJECT_ROOT }).map((file) => ({
    file,
    source: readFileSync(resolve(PROJECT_ROOT, file), 'utf8'),
  }));
}

const bundles = builtJs();

describe.skipIf(bundles.length === 0)('mocks are absent from the production bundle', () => {
  it('no fixture fare, phone fixture or scenario label is in any chunk', () => {
    // Strings unique to the mock. If any appears, the mock was bundled.
    // Each needle must be unique to the mock. "What time is the last ferry back
    // from Nevis?" is NOT: it is the STT fixture *and* a real suggested question
    // from the demo script, so it legitimately ships. It was in this list and
    // produced a false leak — a needle that can appear in production content
    // trains you to ignore this test.
    const needles = [
      'Basseterre to Charlestown',
      'example.invalid',
      'Illustrative sample figures',
      'Stream stalls after 2 tokens',
      'mock-chat-model',
    ];

    const offenders: string[] = [];
    for (const { file, source } of bundles) {
      for (const needle of needles) {
        if (source.includes(needle)) offenders.push(`${file}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('msw itself is not bundled', () => {
    const offenders = bundles
      .filter(({ source }) => /setupWorker|msw\/browser|mockServiceWorker/.test(source))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the dev mock control is not bundled', () => {
    const offenders = bundles
      .filter(({ source }) => source.includes('Choose a mock scenario'))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the needles would actually be found if they were there', () => {
    // Negative control: without this, a typo in a needle reports a clean bundle
    // forever. The real answer text lives in the mock, so assert it is findable in
    // the source it comes from.
    const fixtures = readFileSync(resolve(PROJECT_ROOT, 'src/mocks/fixtures.ts'), 'utf8');
    expect(fixtures).toContain('Basseterre to Charlestown');
    expect(fixtures).toContain('example.invalid');
    expect(fixtures).toContain('mock-chat-model');
  });
});

describe('no production module imports the mocks', () => {
  it('src/ outside src/mocks never imports @/mocks or msw statically', () => {
    const files = globSync('src/**/*.{ts,tsx}', { cwd: PROJECT_ROOT }).filter(
      (file) => !file.startsWith('src/mocks/') && !file.endsWith('routeTree.gen.ts')
    );

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      // A *static* import is the problem. `await import(...)` and `lazy(() =>
      // import(...))` behind `import.meta.env.DEV` are how the dev control and
      // the worker are reached, and Rollup drops those branches.
      const staticImport = /^\s*import\s[^;]*from\s+['"](?:@\/mocks\/|msw)/m.test(source);
      if (staticImport) offenders.push(file);
    }

    // `src/dev/**` and `src/components/dev/**` are the dev-only surfaces. They may
    // import the mock, because every one of them is reached exclusively through a
    // `lazy(() => import(...))` gated on `import.meta.env.DEV` — and the bundle
    // greps above are what actually prove none of it ships. This allowance is
    // scoped to those two directories rather than listed file by file, so a new
    // dev component does not need this test edited, and anything outside them
    // still fails.
    const devOnly = (file: string) =>
      file.startsWith('src/dev/') || file.startsWith('src/components/dev/');
    expect(offenders.filter((file) => !devOnly(file))).toEqual([]);
  });
});

describe('the MSW service worker does not ship', () => {
  it('dist/mockServiceWorker.js is removed by the production build', () => {
    if (!existsSync(resolve(PROJECT_ROOT, 'dist'))) return;
    // It has to live in public/ to be served at root scope in dev, so Vite copies
    // it verbatim. A build plugin removes it afterwards. Nothing registers it
    // outside dev, but a /mockServiceWorker.js on the production origin is dead
    // weight on metered data and advertises that a mocking layer exists.
    expect(existsSync(resolve(PROJECT_ROOT, 'dist/mockServiceWorker.js'))).toBe(false);
  });

  it('but it is still present in public/, or dev has no mock at all', () => {
    // Negative control: the check above would pass trivially if the file were
    // simply deleted from the repo, taking the dev mock with it.
    expect(existsSync(resolve(PROJECT_ROOT, 'public/mockServiceWorker.js'))).toBe(true);
  });
});

describe('Recharts is not in the initial bundle', () => {
  it('lives in its own chunk, not the entry', () => {
    if (bundles.length === 0) return;

    const entry = bundles.filter(({ file }) => /assets\/index-.*\.js$/.test(file));
    expect(entry.length).toBeGreaterThan(0);

    for (const { file, source } of entry) {
      // Recharts is ~400kB and most conversations never render a chart. Charging
      // that to someone on roaming data asking what time the ferry leaves is the
      // thing this assertion exists to prevent.
      for (const marker of ['ResponsiveContainer', 'CartesianGrid', 'recharts', 'victory-vendor']) {
        expect(source.includes(marker), `${file} contains ${marker}`).toBe(false);
      }
    }
  });

  it('is present in a lazily-loaded chunk, so the split is real and not a deletion', () => {
    if (bundles.length === 0) return;
    // Without this, removing the chart feature entirely would pass the test above.
    const chartChunk = bundles.filter(({ file }) => /ChartCanvas-.*\.js$/.test(file));
    expect(chartChunk.length).toBe(1);
    expect(chartChunk[0]!.source).toContain('recharts');
  });
});
