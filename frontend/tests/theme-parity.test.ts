/**
 * The two themes declare the same tokens. Checked, not trusted.
 *
 * `src/styles/tokens.css` holds the light palette in `@theme` and the dark one
 * in a `:root[data-theme='dark']` block. Two lists of the same names is exactly
 * the arrangement that rots: someone adds a colour, styles the screen they are
 * looking at, and ships a token that only exists in one theme. Nothing goes
 * wrong until a reader on the other theme opens that screen, and what they see
 * is not an error — it is an inherited colour that happens to be legible often
 * enough that nobody catches it in review.
 *
 * The first version of the token file avoided this with `light-dark()`, one
 * declaration carrying both values, which made the failure structurally
 * impossible. That was traded away for browser reach and a legible inspector,
 * not because it failed. This file is what replaced the guarantee: the
 * duplication is allowed to exist and is then checked.
 *
 * See docs/decisions.md 0034.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROJECT_ROOT } from './source-files';

const TOKENS = readFileSync(resolve(PROJECT_ROOT, 'src/styles/tokens.css'), 'utf8');

/**
 * Comments are stripped first.
 *
 * Every one of these blocks is heavily commented, and several of those comments
 * quote token names and hex values while explaining why a value is what it is.
 * Scanning the raw text finds those quotations and reports tokens that do not
 * exist.
 */
const SOURCE = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '');

/** A colour declared with a literal value — i.e. a primitive, not an alias. */
const LITERAL_COLOUR = /(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;

function block(startsWith: string): string {
  const start = SOURCE.indexOf(startsWith);
  expect(start, `${startsWith} not found in tokens.css`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('\n}', start);
  return SOURCE.slice(start, end);
}

function literalColours(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(LITERAL_COLOUR)) found.set(match[1]!, match[2]!.toLowerCase());
  return found;
}

const light = literalColours(block('@theme {'));
const dark = literalColours(block(":root[data-theme='dark'] {"));

/**
 * The one colour that is deliberately the same in both themes.
 *
 * `--color-ink-inverse` means "ink on a dark fill", not "the opposite of the
 * current ink". A dark theme's bright status fills take a DARK ink, and that is
 * `--color-ink-on-bright`, which is a separate token precisely so this one does
 * not have to flip. The token file argues this at length; the exemption is
 * listed here so that adding a second one is a deliberate edit to a named list
 * rather than a quiet `!== 'foo'`.
 */
const THEME_INDEPENDENT = new Set([
  '--color-ink-inverse',
  // The figure on the departure-board strip. The strip is navy in both themes,
  // so the amber on it is the same amber in both — see the note in tokens.css.
  '--color-amber-board',
]);

describe('the light and dark palettes declare the same tokens', () => {
  it('has both blocks, and neither is empty', () => {
    expect(light.size).toBeGreaterThan(30);
    expect(dark.size).toBeGreaterThan(30);
  });

  it('every light primitive has a dark counterpart', () => {
    const missing = [...light.keys()].filter(
      (name) => !dark.has(name) && !THEME_INDEPENDENT.has(name)
    );
    expect(missing, 'declared for light but never for dark').toEqual([]);
  });

  it('every dark primitive has a light counterpart', () => {
    const orphaned = [...dark.keys()].filter((name) => !light.has(name));
    expect(orphaned, 'declared for dark but never for light').toEqual([]);
  });

  it('no token is given the same value in both themes by accident', () => {
    /*
     * A shared value is almost always a half-finished edit — the light value
     * pasted into the dark block and not yet changed. It is not always wrong,
     * which is why THEME_INDEPENDENT exists; it just has to be said out loud.
     */
    const identical = [...light.entries()]
      .filter(([name, value]) => dark.get(name) === value && !THEME_INDEPENDENT.has(name))
      .map(([name, value]) => `${name}: ${value}`);
    expect(identical, 'identical in both themes — deliberate, or a paste?').toEqual([]);
  });

  it('the dark block sets color-scheme, so the scrollbars follow', () => {
    // Without this the palette is dark and the scrollbar, the date picker and
    // the UA focus ring are all still light. It is one declaration and it is
    // the difference between a themed app and a mostly-themed app.
    expect(block(":root[data-theme='dark'] {")).toMatch(/color-scheme:\s*dark/);
  });
});
