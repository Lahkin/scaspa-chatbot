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
 *   7.0:1  AAA normal text, where a pairing claims it
 *
 * ── GRADIENTS ────────────────────────────────────────────────────────────────
 *
 * A gradient has no single background colour, so a single measurement is
 * meaningless — it is true of one line of the paragraph and false of the next.
 * Every foreground used on one is measured against BOTH endpoints and passes
 * only if the worse of the two passes. See `assertOnGradient` below.
 *
 * The stops are parsed back out of the `linear-gradient(...)` declarations in
 * tokens.css rather than restated here, so editing a stop re-measures the
 * pairing instead of quietly invalidating a number written from memory.
 *
 * ── AND THE RULE THAT KEEPS TEXT OFF THEM ────────────────────────────────────
 *
 * No gradient token may be applied to a surface that carries prose the user is
 * expected to read: the conversation column, message bubbles, the source panel.
 * Those stay --neutral-0 / --neutral-50. Gradients are structural chrome — a
 * sidebar, a hero, a rail — and readability wins over decoration everywhere
 * text is actually read. Recorded in docs/decisions.md 0025, and asserted at
 * the foot of this file against the real source of those components rather than
 * left as a comment somebody has to remember.
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
const AAA_TEXT = 7.0;

// ── reading the real token file ──────────────────────────────────────────────

/*
 * Comments are stripped before parsing.
 *
 * The token names are no longer all `--color-*`: the gradient section documents
 * its own measured ratios in prose, in lines that look enough like declarations
 * to confuse a looser regex. Removing comments first means the parser only ever
 * sees CSS, which is the only thing that ships.
 */
const TOKEN_CSS = readFileSync(TOKENS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function loadTokens(): Map<string, string> {
  const css = TOKEN_CSS;
  const tokens = new Map<string, string>();

  // Direct hex declarations: --color-blue-600: #0069b4;  --on-navy-muted: #6fb4e2;
  for (const match of css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens.set(name, value.toLowerCase());
  }

  // Aliases: --color-ink: var(--color-neutral-900);  — resolved one hop at a
  // time so a chain of aliases still lands on a hex.
  for (let pass = 0; pass < 5; pass += 1) {
    let changed = false;
    for (const match of css.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\)\s*;/g)) {
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

/**
 * The colour stops of a gradient token, in declaration order.
 *
 * Read from the real `linear-gradient(...)` so that a stop edited in tokens.css
 * is re-measured here. `transparent` keywords are skipped: they are not a
 * background colour and there is nothing to measure against.
 */
function gradientStops(name: string): string[] {
  const match = TOKEN_CSS.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match?.[1]) {
    throw new Error(
      `Gradient token ${name} is missing from tokens.css. If it was renamed, update ` +
        `this test — do not delete the assertion.`
    );
  }
  const stops = (match[1].match(/#[0-9a-fA-F]{3,8}/g) ?? []).map((s) => s.toLowerCase());
  if (stops.length < 2) {
    throw new Error(`${name} has ${stops.length} colour stop(s); a gradient needs at least two.`);
  }
  return stops;
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

/** A token name resolves through tokens.css; a literal hex is taken as given. */
function colour(value: string): string {
  return value.startsWith('--') ? hex(value) : value.toLowerCase();
}

/**
 * Contrast against a gradient, which is two measurements and not one.
 *
 * Computes the foreground against both endpoint colours and asserts on the
 * WORSE of the two — the middle of a gradient is never the hard part, and a
 * ratio measured against a stop that happens to flatter the text says nothing
 * about the end of the paragraph where it does not.
 *
 * Returns the worst ratio so a caller can additionally pin the number.
 */
function assertOnGradient(fg: string, stopA: string, stopB: string, minRatio: number): number {
  const against = [colour(stopA), colour(stopB)];
  const ratios = against.map((stop) => contrastRatio(colour(fg), stop));
  const worst = Math.min(...ratios);

  expect(
    worst,
    `${fg} on the gradient ${stopA} → ${stopB}: ` +
      against.map((stop, i) => `${stop} = ${ratios[i]?.toFixed(2)}:1`).join(', ')
  ).toBeGreaterThanOrEqual(minRatio);

  return worst;
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

  /*
   * The helper's whole point is which of the two numbers it keeps.
   *
   * Taking the max would pass every pairing in this file — a light foreground
   * always flatters the darker stop — so a version of `assertOnGradient` that
   * had the comparison backwards would look entirely green. These two cases
   * separate the readings by 20:1, so only the correct one survives.
   */
  it('assertOnGradient asserts on the worse endpoint, not the better one', () => {
    // White is 21:1 on black and 1:1 on white. The worse reading is 1:1, so a
    // demand of merely 2:1 must fail despite the other end being perfect.
    expect(() => assertOnGradient('#ffffff', '#000000', '#ffffff', 2)).toThrow();

    // And it returns that worse reading rather than the flattering one.
    expect(assertOnGradient('#ffffff', '#000000', '#767676', 1)).toBeCloseTo(
      contrastRatio('#ffffff', '#767676'),
      10
    );
  });

  it('assertOnGradient resolves token names and literal hex alike', () => {
    expect(assertOnGradient('--on-navy-primary', '#003f6c', '#003f6c', 1)).toBeCloseTo(
      contrastRatio('#ffffff', '#003f6c'),
      10
    );
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

// ── The operations palette, imported from the SCASPA design system ───────────
//
// Two of these colours are traps, in the same way --color-amber-board is: the
// design uses #00AA58 and #2DBCFE as status *text*, and both fail AA against a
// light surface. They ship as fills with a matched ink, and this is what keeps
// them that way.

describe('operations status chips — each fill with its matched ink', () => {
  const pairs = [
    ['--color-ops-active-ink', '--color-ops-active-fill', 'docked / on time'],
    ['--color-ops-transit-ink', '--color-ops-transit-fill', 'en route / expected'],
    ['--color-ops-alert-ink', '--color-ops-alert-fill', 'delayed / error'],
  ] as const;

  for (const [ink, fill, meaning] of pairs) {
    it(`${meaning}: ${ink} on ${fill}`, () => {
      expect(ratio(ink, fill)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it('the chip fills are NOT usable as text on a light surface', () => {
    // Asserting the failure on purpose. If a future palette edit made one of
    // these pass, the pairing above would be over-cautious and someone should
    // say so deliberately — but until then this records exactly why the design's
    // own colour is not the one on the text.
    expect(Number(ratio('--color-ops-active-fill', '--color-ops-surface'))).toBeLessThan(AA_TEXT);
    expect(Number(ratio('--color-ops-transit-fill', '--color-ops-surface'))).toBeLessThan(AA_TEXT);
  });
});

describe('operations text and surfaces — AA 4.5:1', () => {
  const inks = ['--color-ops-ink', '--color-ops-ink-variant', '--color-ops-sky'] as const;
  const surfaces = [
    '--color-ops-surface',
    '--color-ops-surface-low',
    '--color-ops-surface-high',
  ] as const;

  for (const ink of inks) {
    for (const surface of surfaces) {
      it(`${ink} on ${surface}`, () => {
        expect(ratio(ink, surface)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('white reads on the navy app bar and its container tone', () => {
    expect(ratio('--color-ink-inverse', '--color-ops-navy')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-ink-inverse', '--color-ops-navy-soft')).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the ops outline is discernible as a control boundary — 3:1', () => {
    expect(ratio('--color-ops-outline', '--color-ops-surface')).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

// ── Structural gradients ─────────────────────────────────────────────────────
//
// --grad-sidebar and --grad-rail run between the same two navies (#002845 and
// #003F6C), in opposite directions. --grad-hero adds a third, lighter stop.
//
// For a light foreground the LIGHTER ground is always the harder one, so the
// worst case for the first two is #003F6C, and for the hero it is #004C83.

describe('the gradient tokens themselves', () => {
  it('sidebar and rail run between the same two navies', () => {
    expect(gradientStops('--grad-sidebar').slice().sort()).toEqual(
      gradientStops('--grad-rail').slice().sort()
    );
  });

  it('the hero adds a third, lighter stop — which is why it is measured apart', () => {
    const hero = gradientStops('--grad-hero');
    expect(hero).toHaveLength(3);

    const lightest = hero.reduce((a, b) => (relativeLuminance(a) > relativeLuminance(b) ? a : b));
    expect(lightest).toBe(hero[2]);
    // Lighter than either endpoint of the sidebar gradient, so a foreground that
    // clears the bar on the sidebar has NOT thereby cleared it on the hero.
    for (const stop of gradientStops('--grad-sidebar')) {
      expect(relativeLuminance(lightest)).toBeGreaterThan(relativeLuminance(stop));
    }
  });

  it('every stop is a real hex, so nothing is measured against a keyword', () => {
    for (const token of ['--grad-sidebar', '--grad-hero', '--grad-rail'] as const) {
      for (const stop of gradientStops(token)) {
        expect(stop).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('text on the navy gradient — sidebar and rail', () => {
  // Endpoints read from the token, not restated. Both gradients share them.
  const [deep, navy] = gradientStops('--grad-sidebar') as [string, string];

  // Each row: token, the level it claims, and the ratio measured at the worst
  // endpoint. The ratio is PINNED as well as thresholded — the threshold is the
  // requirement, the pin is what notices a token drifting while still passing.
  const pairs = [
    ['--on-navy-primary', AAA_TEXT, 10.9, 'white — headings and primary text'],
    ['--on-navy-secondary', AAA_TEXT, 8.5, 'blue-100 — secondary text'],
    ['--on-navy-muted', AA_TEXT, 4.8, 'blue-300 — muted text and icons'],
    ['--on-navy-accent', AA_TEXT, 5.4, 'amber-board — quantities only'],
  ] as const;

  for (const [token, required, expected, meaning] of pairs) {
    it(`${meaning}`, () => {
      const worst = assertOnGradient(token, deep, navy, required);
      expect(worst).toBeCloseTo(expected, 1);
      // The worse end is the lighter navy, every time.
      expect(contrastRatio(hex(token), navy)).toBeLessThan(contrastRatio(hex(token), deep));
    });
  }

  it('the rail gradient gives identical results — same stops, opposite direction', () => {
    const [a, b] = gradientStops('--grad-rail') as [string, string];
    for (const [token, required] of pairs) {
      expect(assertOnGradient(token, a, b, required)).toBeCloseTo(
        assertOnGradient(token, deep, navy, required),
        10
      );
    }
  });
});

// ── failing by design ────────────────────────────────────────────────────────

describe('brand blue is forbidden on navy', () => {
  // The mistake someone will make in three weeks: the brand colour, on the
  // brand navy, because both are "SCASPA blue". It measures 1.91:1 — barely
  // distinguishable from the background it sits on, and unreadable at any size.
  //
  // #0069B4 is sampled from the supplied logo and is not negotiable, so the
  // colour does not move. What moves is where it is allowed to appear.
  const [deep, navy] = gradientStops('--grad-sidebar') as [string, string];

  it('measures about 1.91:1 at the worst endpoint, far under even the 3:1 floor', () => {
    const worst = Math.min(
      contrastRatio(hex('--color-brand'), deep),
      contrastRatio(hex('--color-brand'), navy)
    );
    expect(worst).toBeCloseTo(1.91, 1);
    expect(worst).toBeLessThan(AA_LARGE);
  });

  it('fails at BOTH endpoints, so no part of the gradient rescues it', () => {
    for (const stop of [deep, navy, ...gradientStops('--grad-hero')]) {
      expect(contrastRatio(hex('--color-brand'), stop)).toBeLessThan(AA_TEXT);
    }
  });

  it('assertOnGradient rejects it — the helper is what catches this, not a reviewer', () => {
    expect(() => assertOnGradient('--color-brand', deep, navy, AA_TEXT)).toThrow();
  });
});

describe('the hero gradient carries less than the sidebar does', () => {
  /*
   * Reported rather than silently accommodated.
   *
   * The brief's table measures every foreground against #003F6C. --grad-hero's
   * real endpoints are #002845 and #004C83, and that third stop is lighter than
   * anything in the table — so applying the brief's own rule to the hero
   * gradient gives two results the table does not contain:
   *
   *   --on-navy-muted   3.94:1  under AA
   *   --on-navy-accent  4.39:1  under AA
   *
   * The gradient is left exactly as specified and the constraint is recorded
   * here instead: on the hero, only primary and secondary are text colours.
   * If the hero's last stop is ever darkened to fix this, these assertions fail
   * and are the place to say so deliberately.
   */
  const stops = gradientStops('--grad-hero');
  const [first] = stops as [string];
  const last = stops[stops.length - 1] as string;

  it('white clears AAA across the whole hero', () => {
    expect(assertOnGradient('--on-navy-primary', first, last, AAA_TEXT)).toBeCloseTo(8.89, 1);
  });

  it('secondary clears AA but NOT AAA — it is body text here, not a heading claim', () => {
    const worst = assertOnGradient('--on-navy-secondary', first, last, AA_TEXT);
    expect(worst).toBeCloseTo(6.9, 1);
    expect(worst).toBeLessThan(AAA_TEXT);
  });

  it('muted is NOT a text colour on the hero — 3.94:1 at the light end', () => {
    const worst = Math.min(...stops.map((s) => contrastRatio(hex('--on-navy-muted'), s)));
    expect(worst).toBeCloseTo(3.94, 1);
    expect(worst).toBeLessThan(AA_TEXT);
    // It still clears the 3:1 floor, so it remains usable for a non-text
    // indicator on this gradient — an icon or a rule, never a word.
    expect(worst).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('accent is NOT a text colour on the hero — 4.39:1 at the light end', () => {
    const worst = Math.min(...stops.map((s) => contrastRatio(hex('--on-navy-accent'), s)));
    expect(worst).toBeCloseTo(4.39, 1);
    expect(worst).toBeLessThan(AA_TEXT);
  });
});

// ── the hairline makes no contrast claim, and must not start making one ──────

describe('--hairline-horizon is structure, not text', () => {
  it('is declared, and is a gradient rather than a colour', () => {
    expect(TOKEN_CSS).toMatch(/--hairline-horizon:\s*linear-gradient\(/);
  });

  it('nothing uses it as a text or border colour', () => {
    // A 1px boundary that fades to transparent at both ends cannot carry a
    // contrast guarantee, so it may only ever be a background.
    const files = globSync('src/**/*.{ts,tsx,css}', { cwd: PROJECT_ROOT });
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const line of source.split('\n')) {
        if (/\b(text|border|ring|outline)-hairline-horizon\b/.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 60)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── 1c: the reading surface stays flat ───────────────────────────────────────

describe('no gradient reaches a surface that carries prose', () => {
  /*
   * The conversation column, the message bubbles and the source panel stay
   * --neutral-0 / --neutral-50.
   *
   * This is a readability rule before it is an aesthetic one. Contrast against
   * a gradient changes down the paragraph, so a ratio measured once is true of
   * one line and false of the next — and these are the surfaces where someone
   * is actually reading sentences rather than glancing at chrome.
   *
   * Written as a source assertion rather than a comment because a comment is
   * not a check. Every file below must exist: a rename that quietly drops one
   * of these from the guard fails here rather than passing on a shrinking set.
   */
  const READING_SURFACES = [
    'src/components/chat/MessageBubble.tsx',
    'src/components/chat/MessageList.tsx',
    'src/components/chat/Markdown.tsx',
    'src/components/chat/StreamingMarkdown.tsx',
    'src/components/chat/SourceEntry.tsx',
    'src/components/chat/SourceList.tsx',
    'src/components/chat/CardBlock.tsx',
    'src/components/shells/SourcePanel.tsx',
  ] as const;

  for (const file of READING_SURFACES) {
    it(`${file} exists and applies no gradient`, () => {
      const path = resolve(PROJECT_ROOT, file);
      const source = readFileSync(path, 'utf8');
      expect(source.length).toBeGreaterThan(0);

      const offenders = source
        .split('\n')
        .filter((line) => /\b(grad-(sidebar|hero|rail)|hairline-horizon)\b/.test(line))
        .map((line) => line.trim().slice(0, 70));

      expect(offenders).toEqual([]);
    });
  }

  it('the gradient tokens are structural chrome only, wherever they are used', () => {
    // Belt and braces for surfaces added later: any file applying a gradient
    // must not also be one of the reading surfaces above. Listed separately so
    // the failure message names the file rather than a boolean.
    const files = globSync('src/**/*.{ts,tsx}', { cwd: PROJECT_ROOT });
    const usingGradient = files.filter((file) =>
      /\bbg-grad-(sidebar|hero|rail)\b/.test(readFileSync(resolve(PROJECT_ROOT, file), 'utf8'))
    );
    expect(
      usingGradient.filter((f) => (READING_SURFACES as readonly string[]).includes(f))
    ).toEqual([]);
  });
});
