/**
 * One spelling of a path, on every platform.
 *
 * Several checks in this directory read the repository off disk rather than
 * trusting a belief about it: which modules import the mock, which files name a
 * money amount, which component owns the advisory. All of them glob the tree and
 * then compare what comes back against a forward-slash literal — a
 * `startsWith('src/mocks/')` exclusion, an `assets/index-*.js` regex, a lookup
 * keyed by `src/routes/index.tsx`.
 *
 * `globSync` returns paths in the platform's own separator, so on Windows those
 * come back as `src\mocks\fixtures.ts` and every one of those comparisons misses
 * silently. The exclusions stop excluding, so the mock reports itself as a leak;
 * the lookups return `undefined`, so a test that means "this file must say X"
 * fails with "this file is missing". Eleven checks failed that way, none of them
 * pointing at anything a reader could act on.
 *
 * CI is `ubuntu-latest`, so the suite is green there and the failures land only
 * on a contributor working on Windows — the reader least able to tell a real
 * finding from a path bug. Normalising in one place is what keeps the call sites
 * free to write a path the one way they already read.
 */

import { globSync } from 'node:fs';

/**
 * `process.cwd()` rather than `import.meta.url`: several of these checks run
 * under the jsdom environment, where `import.meta.url` is not a `file:` URL and
 * `fileURLToPath` throws. Vitest runs from the project root.
 */
export const PROJECT_ROOT = process.cwd();

/**
 * Glob relative to the project root, with `/` separators whatever the platform.
 *
 * Returned paths stay valid arguments to `resolve(PROJECT_ROOT, file)`: Node
 * accepts forward slashes on Windows too.
 */
export function globFiles(pattern: string): string[] {
  return globSync(pattern, { cwd: PROJECT_ROOT }).map((file) => file.replaceAll('\\', '/'));
}
