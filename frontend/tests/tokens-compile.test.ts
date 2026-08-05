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
  /*
   * The five radii the four-value scale was missing — handoff §5.7 lists nine.
   * `rounded-segment` in particular is load-bearing: a 9px segment inside a 12px
   * track with 3px of padding is the only pairing whose inner and outer curves
   * stay concentric, and the button radius put a visible kink in it.
   */
  'rounded-segment',
  'rounded-ghost',
  'rounded-small',
  'rounded-tiny',
  'rounded-swatch',
  // --tracking-*
  'tracking-eyebrow',
  'tracking-badge',
  'tracking-tight',
  // structural heights, declared as @utility for the same reason as w-sidebar
  'h-header',
  'h-nav-row',
  'h-row-comfortable',
  'h-row-compact',
  // --shadow-*
  'shadow-card',
  'shadow-sheet',
  'shadow-popover',
  // --text-*
  'text-caption',
  'text-wordmark',
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
  /*
   * The pill and notice edges — the fourth instance of the silent-failure bug.
   *
   * A status pill is "1px solid <hue at 45%>" and a notice panel is the same
   * hue at 30–35%. No such token existed, so `border-caution-edge` emitted
   * nothing and the pill drew its border in `currentColor`: the right colour by
   * accident on a caution pill and the wrong one on every other one.
   */
  'border-positive-edge',
  'border-caution-edge',
  'border-critical-edge',
  'border-live-edge',
  /*
   * `--color-caution-notice-edge` and `--color-critical-notice-edge` are
   * declared and deliberately NOT listed here. Tailwind emits a utility only
   * where the class appears in source, so a token with no call site yet has no
   * rule to assert — listing it would fail this test for a token that is
   * correct. Add them when the notice panels use them.
   */
  /*
   * The sidebar widths, and the third instance of this exact bug.
   *
   * `w-sidebar` was in three components for the life of the project and emitted
   * nothing: `w-*` reads the SPACING scale, not `--size-*`. Nothing looked
   * wrong, because 260px of navigation content is about 260px wide — the docked
   * rail, the drawer panel and the gallery previews were all being sized by
   * their contents while appearing to name a token. It surfaced only when a
   * second width was added and the rail would not animate between them.
   */
  'w-sidebar',
  'w-sidebar-collapsed',
  'transition-width',
  /* The sidebar's data-source card, 216px inside the 240px rail — board 06. */
  'w-sidebar-card',
  /*
   * The recorded-questions fade.
   *
   * A mask rather than a background, and the one place the dark system's
   * "no gradients inside the frame" rule does not apply — nothing here is
   * coloured, the fade is in the alpha channel.
   */
  'fade-out-bottom',
  /*
   * The sample-data hatch — decision record 0032, layer 4.
   *
   * Listed here for the reason this whole file exists: it is a token-derived
   * `@utility`, and a `@utility` that compiles to nothing fails silently. Four
   * have done so over this project's life. This one failing silently would mean
   * realistic fixture data rendering with no visual mark at all, which is the
   * exact state layer 4 was added to prevent — and the screen would look
   * completely normal.
   */
  'sample-hatch',
  /*
   * The on-navy tokens.
   *
   * These live outside every namespace Tailwind generates from, so they are
   * explicit `@utility` declarations too — and the first draft of them, written
   * inside `@theme`, produced no CSS at all. See decision 0025.
   *
   * The three gradient utilities and the hairline that used to sit here are
   * GONE, not renamed: the dark system separates planes with a lighter surface
   * and a 1px border, and `tests/contrast.test.ts` asserts that neither the
   * tokens nor the classes came back.
   */
  'text-on-navy-primary',
  'text-on-navy-secondary',
  'text-on-navy-muted',
  'text-on-navy-accent',
  'border-on-navy-muted',
  'border-on-navy-secondary',
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
