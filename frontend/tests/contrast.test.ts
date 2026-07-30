/**
 * Contrast rules, encoded in code rather than written in a document.
 *
 * Tokens are read from `src/styles/tokens.css` itself, not copied here. A test
 * that duplicates the values would pass happily after someone changed the real
 * ones, which is precisely the regression this exists to catch.
 *
 * When the designers hand over their token file, this is the ninety-second check
 * that says whether it is usable — instead of finding out on the accessibility
 * slide.
 *
 * Thresholds are WCAG 2.1 AA:
 *   4.5:1  normal text
 *   3.0:1  large text (>= 24px, or >= 18.66px bold) and non-text indicators
 *          (component boundaries, focus rings, icons carrying meaning)
 */

import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Resolved from the project root rather than import.meta.url: under the jsdom
// environment import.meta.url is not a file: URL, so fileURLToPath throws.
const PROJECT_ROOT = process.cwd();
const TOKENS_PATH = resolve(PROJECT_ROOT, 'src/styles/tokens.css');

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;

// ── reading the real token file ──────────────────────────────────────────────

function loadTokens(): Map<string, string> {
  const css = readFileSync(TOKENS_PATH, 'utf8');
  const tokens = new Map<string, string>();

  // Direct hex declarations: --color-blue-600: #0069b4;
  for (const match of css.matchAll(/(--color-[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens.set(name, value.toLowerCase());
  }

  // Aliases: --color-ink: var(--color-neutral-900);  — resolved one hop at a
  // time so a chain of aliases still lands on a hex.
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const match of css.matchAll(/(--color-[\w-]+):\s*var\((--color-[\w-]+)\)\s*;/g)) {
      const [, name, target] = match;
      if (!name || !target || tokens.has(name)) continue;
      const resolved = tokens.get(target);
      if (resolved) {
        tokens.set(name, resolved);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return tokens;
}

const tokens = loadTokens();

function hex(name: string): string {
  const value = tokens.get(name);
  if (!value) {
    throw new Error(
      `Token ${name} is missing from tokens.css. If it was renamed, update this test — ` +
        `do not delete the assertion.`
    );
  }
  return value;
}

// ── WCAG maths ───────────────────────────────────────────────────────────────

function toRgb(value: string): [number, number, number] {
  let body = value.replace('#', '');
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(value: string): number {
  const channels = toRgb(value).map((raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function ratio(fg: string, bg: string): number {
  return contrastRatio(hex(fg), hex(bg));
}

// ── sanity: the maths itself ─────────────────────────────────────────────────

describe('WCAG maths', () => {
  it('computes the known extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0069b4', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#0069b4'),
      10
    );
  });

  it('expands three-digit hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
  });
});

// ── the pairs this UI actually uses ──────────────────────────────────────────
//
// Only real pairings. A test over every possible combination proves nothing and
// fails on colours nobody puts together.

describe('text on light surfaces — AA 4.5:1', () => {
  const surfaces = ['--color-neutral-0', '--color-neutral-50', '--color-neutral-100'] as const;
  const inks = ['--color-ink', '--color-ink-muted', '--color-ink-subtle'] as const;

  for (const surface of surfaces) {
    for (const ink of inks) {
      it(`${ink} on ${surface}`, () => {
        expect(ratio(ink, surface)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('link and primary-action text (blue-600) on white', () => {
    expect(ratio('--color-blue-600', '--color-neutral-0')).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the readable amber on white', () => {
    expect(ratio('--color-amber-text', '--color-neutral-0')).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('success text on white and on its own tinted surface', () => {
    expect(ratio('--color-success', '--color-neutral-0')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-success', '--color-success-surface')).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('danger text on white and on its own tinted surface', () => {
    expect(ratio('--color-danger', '--color-neutral-0')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-danger', '--color-danger-surface')).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the readable amber on the amber tinted surface', () => {
    expect(ratio('--color-amber-text', '--color-amber-surface')).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('white text on filled surfaces — AA 4.5:1', () => {
  const filled = [
    '--color-blue-600',
    '--color-blue-700',
    '--color-blue-800',
    '--color-blue-900',
    '--color-navy',
    '--color-navy-deep',
    '--color-brand',
    '--color-success',
    '--color-danger',
  ] as const;

  for (const background of filled) {
    it(`ink-inverse on ${background}`, () => {
      expect(ratio('--color-ink-inverse', background)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});

describe('non-text indicators — AA 3:1', () => {
  it('the focus ring is visible on every surface it can appear over', () => {
    // A focus ring nobody can see is the same as no focus ring — CLAUDE.md rule 10.
    for (const surface of [
      '--color-neutral-0',
      '--color-neutral-50',
      '--color-neutral-100',
      '--color-neutral-200',
    ] as const) {
      expect(ratio('--color-focus', surface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the strong border is discernible against the surfaces it separates', () => {
    expect(ratio('--color-border-strong', '--color-neutral-0')).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the departure-board amber works as a FILL on dark navy', () => {
    // This is the one place the bright amber belongs: a filled indicator on a
    // dark ground, exactly like a real departure board.
    expect(ratio('--color-amber-board', '--color-navy-deep')).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

// ── the specific trap ────────────────────────────────────────────────────────

describe('--amber-board is a fill, never a text colour', () => {
  const lightSurfaces = ['--color-neutral-0', '--color-neutral-50', '--color-neutral-100'] as const;

  it('measures about 2.03:1 on white, which is why the rule exists', () => {
    const measured = ratio('--color-amber-board', '--color-neutral-0');
    // Pinned to the value in the plan. If a token change moves this, the number
    // in tokens.css and in the design notes has to move with it.
    expect(measured).toBeCloseTo(2.03, 1);
  });

  for (const surface of lightSurfaces) {
    it(`fails text contrast on ${surface}, and must never be used as text there`, () => {
      const measured = ratio('--color-amber-board', surface);
      expect(measured).toBeLessThan(AA_TEXT);
    });
  }

  it('--amber-text is the readable alternative and clears AA on all three', () => {
    for (const surface of lightSurfaces) {
      expect(ratio('--color-amber-text', surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

// ── guard against the source-level mistake ───────────────────────────────────

describe('amber-board is only ever used on a dark ground', () => {
  // This started as "text-amber-board appears in no source file", which was right
  // while nothing used it. The departure-board treatment then made amber-on-navy
  // the intended emphasis — and it measures 6.1:1 there, so a blanket ban would
  // have been banning the correct usage.
  //
  // The real rule is about the *pairing*, not the string: amber text is fine on
  // navy and never acceptable on a light surface. The contrast assertions above
  // pin both numbers; this pins that the source only ever pairs it with navy.
  // `tests/chat-rendering.test.tsx` goes further and checks the rendered DOM,
  // where the ancestor background can actually be resolved.
  it('every file using amber as text also establishes a navy ground', () => {
    const files = globSync('src/**/*.{ts,tsx,css}', { cwd: PROJECT_ROOT });

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      if (!/\btext-amber-board\b/.test(source)) continue;
      if (!/\bbg-navy(-deep)?\b/.test(source)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('nothing pairs amber text with a light surface in the same class list', () => {
    const files = globSync('src/**/*.{ts,tsx,css}', { cwd: PROJECT_ROOT });
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      // Same element carrying both amber text and a light background is
      // unambiguously the failing pairing, whatever the ancestors do.
      for (const line of source.split('\n')) {
        if (
          /\btext-amber-board\b/.test(line) &&
          /\bbg-(surface|neutral-(0|50|100|200)|white)\b/.test(line)
        ) {
          offenders.push(`${file}: ${line.trim().slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
