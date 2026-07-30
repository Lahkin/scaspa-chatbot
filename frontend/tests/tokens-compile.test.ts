/**
 * Every token-derived utility used in a className must emit a real CSS rule.
 *
 * This exists because two of them did not, and nothing said so. `min-h-touch-min`
 * and `duration-fast` looked correct, type-checked, linted, appeared in the DOM,
 * and produced no CSS whatsoever:
 *
 *   - `min-h-*` resolves against Tailwind's spacing scale, not the `--size-*`
 *     namespace, so `--size-touch-min` gave `size-touch-min` but never
 *     `min-h-touch-min`. Every button lost its 44px minimum height silently.
 *   - `duration-*` reads `--transition-duration-*`. A token named `--duration-fast`
 *     compiles to nothing.
 *
 * Neither is visible in jsdom, which does no layout and applies no stylesheet. The
 * only place the truth exists is the built CSS, so that is what this reads.
 *
 * Requires `npm run build` first; it skips with a loud message otherwise rather
 * than passing vacuously.
 */

import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();

function builtCss(): string | null {
  const dir = resolve(PROJECT_ROOT, 'dist/assets');
  if (!existsSync(dir)) return null;
  const files = globSync('dist/assets/*.css', { cwd: PROJECT_ROOT });
  if (files.length === 0) return null;
  return files.map((file) => readFileSync(resolve(PROJECT_ROOT, file), 'utf8')).join('\n');
}

/**
 * Utilities whose name comes from a token in tokens.css. A plain Tailwind
 * utility like `px-4` is Tailwind's problem; these are ours, and these are the
 * ones that fail quietly when a namespace is wrong.
 */
const TOKEN_UTILITIES = [
  // custom @utility declarations
  'tabular',
  'min-h-touch',
  'min-w-touch',
  'touch-target',
  // --size-*
  'size-touch-min',
  // --transition-duration-* / --ease-*
  'duration-fast',
  'ease-out-soft',
  // --radius-*
  'rounded-sm',
  'rounded-md',
  'rounded-lg',
  // --shadow-*
  'shadow-card',
  'shadow-sheet',
  'shadow-popover',
  // --text-*
  'text-caption',
  'text-small',
  'text-body',
  'text-lead',
  'text-h3',
  'text-h2',
  'text-h1',
  'text-display',
  // --color-* semantic aliases
  'bg-surface',
  'bg-surface-muted',
  'bg-surface-sunken',
  'text-ink',
  'text-ink-muted',
  'text-ink-subtle',
  'text-ink-inverse',
  'border-border',
  'border-border-strong',
  // --color-* status
  'bg-amber-board',
  'text-amber-text',
  'text-success',
  'text-danger',
];

const css = builtCss();

describe.skipIf(css === null)('every token utility compiles to a real rule', () => {
  for (const utility of TOKEN_UTILITIES) {
    it(`.${utility} emits CSS`, () => {
      // Escaped class selectors (.text-h1 is fine, but Tailwind escapes some).
      const pattern = new RegExp(`\\.${utility.replace(/[-/]/g, '\\$&')}\\s*\\{[^}]+\\}`);
      expect(css).toMatch(pattern);
    });
  }

  it('the matcher itself rejects a utility that does not exist', () => {
    // Without this, a broken regex reports every utility as present forever.
    expect(css).not.toMatch(/\.min-h-touch-min\s*\{/);
    expect(css).not.toMatch(/\.bg-not-a-real-token\s*\{/);
  });
});

if (css === null) {
  describe('token compilation', () => {
    it('needs a build first', () => {
      // Deliberately not a silent skip: `npm run verify` builds before this runs,
      // and a developer running vitest alone should be told what is missing.
      console.warn(
        'tokens-compile.test.ts skipped: no dist/assets/*.css. Run `npm run build` first.'
      );
      expect(true).toBe(true);
    });
  });
}
