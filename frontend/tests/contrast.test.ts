/**
 * Contrast rules, encoded in code rather than written in a document.
 *
 * Tokens are read from `src/styles/tokens.css` itself, not copied here. A test
 * that duplicates the values would pass happily after someone changed the real
 * ones, which is precisely the regression this exists to catch.
 *
 * ── THIS FILE WAS REWRITTEN FOR THE DARK PALETTE ─────────────────────────────
 *
 * The previous version measured a light theme: ink on white, an amber that was
 * a fill because it read 2.03:1 on white, a brand blue that vanished on navy.
 * None of those pairings exists any more. The design import replaced the token
 * file wholesale, so the assertions were replaced wholesale with it rather than
 * being adjusted until they passed — an assertion edited to fit a new value has
 * stopped being a check.
 *
 * What carried over is the method, which is the part that was worth keeping:
 * parse the real file, compute real ratios, assert the pairings the UI actually
 * puts on screen, and pin the numbers as well as the thresholds so a token can
 * be caught drifting while still technically passing.
 *
 * Thresholds are WCAG 2.1 AA:
 *   4.5:1  normal text
 *   3.0:1  large text (>= 24px, or >= 18.66px bold) and non-text indicators
 *          (component boundaries, focus rings, icons carrying meaning)
 *   7.0:1  AAA normal text, where a pairing claims it
 *
 * ── THE THREE COLOURS THAT ARE NOT TEXT COLOURS ──────────────────────────────
 *
 * Each is asserted to FAIL, on purpose, because each looks usable and is not:
 *
 *   --color-critical      4.42:1 on surface-2 — the enum hue. Dot, border, fill.
 *                         The label is --color-critical-text (5.71:1).
 *   --color-text-3        3.74:1 — placeholder and disabled only.
 *   --color-brand-500     1.82:1 on surface-2 — it is a FILL. White goes on it.
 *
 * A future palette edit that made one of them pass would mean the rule had
 * become over-cautious, and someone should say so deliberately by changing the
 * assertion. Until then these are the guard.
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

/* Comments are stripped before parsing. The token names are not all
 * `--color-*`, and the palette documents its own measured ratios in prose, in
 * lines that look enough like declarations to confuse a looser regex. Removing
 * comments first means the parser only ever sees CSS, which is all that ships. */
const TOKEN_CSS = readFileSync(TOKENS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The `@theme` block, isolated.
 *
 * THIS IS NOT TIDINESS, IT IS CORRECTNESS. `tokens.css` re-declares
 * `--color-border` and `--color-text-3` inside `@media (prefers-contrast: more)`
 * with stronger values. A whole-file scan that assigns as it goes would take the
 * LAST declaration of each name — so every assertion below would silently
 * measure the high-contrast palette, report a comfortable pass, and prove
 * nothing at all about what the overwhelming majority of users actually see.
 *
 * The base palette is what needs to clear AA on its own. The high-contrast
 * overrides are checked separately, at the foot of this file, for the only
 * property they need: that they strengthen rather than weaken.
 */
function themeBlock(): string {
  const match = TOKEN_CSS.match(/@theme\s*\{([\s\S]*?)\n\}/);
  if (!match?.[1]) {
    throw new Error('Could not find the @theme block in tokens.css.');
  }
  return match[1];
}

function loadTokens(): Map<string, string> {
  const css = themeBlock();
  const tokens = new Map<string, string>();

  // Direct hex declarations: --color-brand-500: #383a97;
  for (const match of css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) tokens.set(name, value.toLowerCase());
  }

  // Aliases: --color-ink: var(--color-text-1); — resolved one hop at a time so
  // a chain of aliases still lands on a hex.
  for (let pass = 0; pass < 6; pass += 1) {
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

// The four planes the product is built from. Every text colour has to survive on
// all of them, because a card sits on a column that sits on the page and any of
// the three can be behind a given word.
const SURFACES = [
  '--color-canvas',
  '--color-surface-1',
  '--color-surface-2',
  '--color-surface-3',
] as const;

// ── sanity: the maths itself ─────────────────────────────────────────────────

describe('WCAG maths', () => {
  it('computes the known extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#383a97', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#383a97'),
      10
    );
  });

  it('expands three-digit hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
  });
});

// ── the parser reads the base palette, not the high-contrast one ─────────────

describe('the token parser', () => {
  /*
   * The bug this prevents is invisible: every assertion would still pass, on
   * the wrong numbers. So it is checked directly rather than trusted.
   */
  it('reads the @theme value of a token the prefers-contrast block overrides', () => {
    expect(hex('--color-text-3')).toBe('#6e7490');
    expect(hex('--color-border')).toBe('#262a42');
  });

  it('and those tokens really are overridden later in the file, or this guard is idle', () => {
    const highContrast = TOKEN_CSS.match(/prefers-contrast: more\s*\)\s*\{([\s\S]*?)\n {2}\}/);
    expect(highContrast?.[1]).toMatch(/--color-text-3:/);
    expect(highContrast?.[1]).toMatch(/--color-border:/);
  });

  it('resolves an alias chain down to a hex', () => {
    // --color-ink -> --color-text-1 -> #f2f3f8
    expect(hex('--color-ink')).toBe(hex('--color-text-1'));
    // --color-danger -> --color-critical-text
    expect(hex('--color-danger')).toBe(hex('--color-critical-text'));
  });
});

// ── text on the four dark surfaces ───────────────────────────────────────────

describe('text on dark surfaces — AA 4.5:1', () => {
  for (const surface of SURFACES) {
    for (const ink of ['--color-text-1', '--color-text-2'] as const) {
      it(`${ink} on ${surface}`, () => {
        expect(ratio(ink, surface)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('text-1 clears AAA everywhere — it is the reading colour', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-text-1', surface)).toBeGreaterThanOrEqual(AAA_TEXT);
    }
  });

  it('text-2 clears AAA on the card ground, where the metadata actually sits', () => {
    expect(ratio('--color-text-2', '--color-surface-2')).toBeCloseTo(7.32, 1);
    expect(ratio('--color-text-2', '--color-surface-2')).toBeGreaterThanOrEqual(AAA_TEXT);
  });

  it('the semantic ink aliases resolve onto those two and inherit the result', () => {
    expect(hex('--color-ink')).toBe(hex('--color-text-1'));
    expect(hex('--color-ink-muted')).toBe(hex('--color-text-2'));
  });
});

describe('the placeholder ink is reachable by exactly one name', () => {
  /*
   * ── THE GAP THAT LET FAILING PROSE ONTO EIGHT ROUTES ─────────────────────
   *
   * `--color-ink-subtle` was the light theme's quietest READABLE ink — 6.4:1
   * on white, carrying captions, timestamps and taglines in about ninety
   * places. It was mapped onto `--color-text-3` during the dark import because
   * the names sounded alike, and text-3 is 3.44–3.74:1 and documented
   * "placeholder and disabled only".
   *
   * The token-pair scan could not see it: those elements set a colour and
   * inherit their background from an ancestor, and the scan reads one line at
   * a time. `npm run check:a11y` caught it, because axe resolves the real
   * computed background — which is the reason that check exists and the reason
   * it is not enough to have the unit tests alone.
   *
   * The fix was at the token, not at ninety call sites: both metadata aliases
   * resolve to text-2, and the placeholder tier has its own name. This guards
   * the arrangement.
   */
  it('the metadata aliases are readable, and both mean the same ink', () => {
    expect(hex('--color-ink-subtle')).toBe(hex('--color-text-2'));
    expect(hex('--color-ink-muted')).toBe(hex('--color-text-2'));
    for (const surface of SURFACES) {
      expect(ratio('--color-ink-subtle', surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('the disabled ink is the failing one, and is named for what it is', () => {
    expect(hex('--color-ink-disabled')).toBe(hex('--color-text-3'));
    expect(ratio('--color-ink-disabled', '--color-surface-2')).toBeLessThan(AA_TEXT);
  });

  /**
   * The one place the placeholder ink is a resting state rather than a disabled
   * one, named rather than pattern-matched.
   *
   * §1.3 draws the ghost icon button's default glyph in `--text-3` and lifts it
   * to `--text-1` on hover, focus and press. It is a GLYPH, so the 3:1 non-text
   * bar applies and 3.74:1 clears it — and the control it marks is the
   * message-action row, which is deliberately quiet until reached for.
   *
   * A file-and-token entry rather than a loosened regex: adding a line here is
   * a deliberate act with a reason attached.
   */
  const RESTING_GLYPH_INK: readonly string[] = [
    'src/components/ui/IconButton.tsx',
    // The same control, and the same rule: §3.13's speak button is a ghost icon
    // button whose idle and voice-off states carry the glyph in `--text-3` and
    // lift to `--text-1` the moment it is reached for.
    'src/components/chat/SpeakButton.tsx',
  ];

  it('nothing uses the disabled ink outside a disabled or placeholder state', () => {
    // WCAG 1.4.3 exempts inactive controls. Nothing a user is expected to READ
    // may use this, and the variant prefix is what marks the difference.
    const offenders: string[] = [];
    for (const file of globSync('src/**/*.{ts,tsx}', { cwd: PROJECT_ROOT })) {
      if (RESTING_GLYPH_INK.includes(file)) continue;
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        for (const match of line.matchAll(/(^|[\s"'`{])([\w:-]*text-ink-disabled)/g)) {
          const cls = match[2]!;
          if (!/^(disabled|placeholder):/.test(cls)) {
            offenders.push(`${file}:${index + 1} ${cls}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the exempted glyph ink still clears the 3:1 non-text bar', () => {
    // Without this the exemption above is an unbounded hole rather than a
    // measured one.
    expect(ratio('--color-ink-disabled', '--color-surface-2')).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('and the placeholder pseudo-element uses it rather than a readable ink', () => {
    expect(TOKEN_CSS).toMatch(/::placeholder\s*\{[^}]*--color-ink-disabled/);
  });
});

describe('--color-text-3 is placeholder and disabled ONLY', () => {
  /*
   * 3.74:1 on the card ground. It is the most reachable mistake in the palette —
   * it is in the ramp, it is named like the other two, and it looks fine in a
   * screenshot next to them. It clears the non-text floor and nothing above it.
   */
  it('fails AA as text on every surface it can appear over', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-text-3', surface)).toBeLessThan(AA_TEXT);
    }
  });

  it('clears the 3:1 floor, so it is legitimate as a boundary or a disabled glyph', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-text-3', surface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('measures 3.74:1 on surface-2 — pinned, because the margin is thin', () => {
    expect(ratio('--color-text-3', '--color-surface-2')).toBeCloseTo(3.74, 1);
  });

  it('--color-ink-disabled is that same colour and carries the same restriction', () => {
    /*
     * This used to assert `--color-ink-subtle`, and that was the bug: the
     * subtle alias carries readable metadata in about ninety places, so
     * pointing it at a 3.74:1 ink put failing prose on eight routes. The
     * restriction belongs to the alias NAMED for the restriction.
     */
    expect(hex('--color-ink-disabled')).toBe(hex('--color-text-3'));
    expect(hex('--color-ink-subtle')).not.toBe(hex('--color-text-3'));
  });
});

// ── the brand ramp ───────────────────────────────────────────────────────────

describe('the brand ramp', () => {
  it('white reads on every brand fill — AAA on all three', () => {
    for (const fill of ['--color-brand-500', '--color-brand-600', '--color-brand-700'] as const) {
      expect(contrastRatio('#ffffff', hex(fill))).toBeGreaterThanOrEqual(AAA_TEXT);
    }
  });

  it('brand-200 is the link and accent colour, and clears AAA on the card ground', () => {
    expect(ratio('--color-brand-200', '--color-surface-2')).toBeCloseTo(7.6, 1);
    expect(ratio('--color-brand-200', '--color-surface-2')).toBeGreaterThanOrEqual(AAA_TEXT);
  });

  it('brand-200 clears AA on every surface, so a link survives wherever it lands', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-brand-200', surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('brand-300 is an icon colour and clears AA on the darker surfaces only', () => {
    // 5.31 on canvas, 4.66 on surface-2, 4.29 on surface-3 — under AA on the
    // input ground. It is used for a glyph, which needs 3:1, not for a word.
    expect(ratio('--color-brand-300', '--color-canvas')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-brand-300', '--color-surface-3')).toBeLessThan(AA_TEXT);
    expect(ratio('--color-brand-300', '--color-surface-3')).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('--color-brand-500 is a FILL, never text on a dark surface', () => {
  /*
   * 1.82:1 on surface-2. This is the dark theme's version of the light theme's
   * "brand blue on navy" trap, and it is the same shape: the accent colour, on
   * the accent-adjacent ground, both of them "the brand colour", and completely
   * illegible together.
   */
  it('fails even the 3:1 floor on every surface', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-brand-500', surface)).toBeLessThan(AA_LARGE);
    }
  });

  it('measures 1.82:1 on surface-2 and 2.07:1 on canvas', () => {
    expect(ratio('--color-brand-500', '--color-surface-2')).toBeCloseTo(1.82, 1);
    expect(ratio('--color-brand-500', '--color-canvas')).toBeCloseTo(2.07, 1);
  });

  it('nothing in the source uses a dark brand step as text on a SURFACE', () => {
    /*
     * The rule is about the pairing, not the string.
     *
     * brand-700 is the correct ink on a caution fill (6.20:1) — the "sample
     * data" provenance badge is exactly that, and white would be 2.29:1 there.
     * So a dark brand step as text is legitimate when the same element supplies
     * a light fill, and is the 1.82:1 mistake when it does not.
     */
    const DARK_BRAND_TEXT = /\btext-brand-(500|600|700)\b/;
    const LIGHT_FILL = /\bbg-(caution|absent|positive|live|brand-100|brand-200)\b/;

    const offenders: string[] = [];
    for (const file of globSync('src/**/*.{ts,tsx}', { cwd: PROJECT_ROOT })) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const line of source.split('\n')) {
        if (DARK_BRAND_TEXT.test(line) && !LIGHT_FILL.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the pairing rule catches the mistake and permits the correct ink', () => {
    // Without this, widening the pattern is indistinguishable from disabling it.
    const DARK_BRAND_TEXT = /\btext-brand-(500|600|700)\b/;
    const LIGHT_FILL = /\bbg-(caution|absent|positive|live|brand-100|brand-200)\b/;

    const badge = "'bg-caution text-brand-700'";
    expect(DARK_BRAND_TEXT.test(badge) && !LIGHT_FILL.test(badge)).toBe(false);

    const mistake = "'bg-surface text-brand-700'";
    expect(DARK_BRAND_TEXT.test(mistake) && !LIGHT_FILL.test(mistake)).toBe(true);
  });

  it('and the ink it permits really is safe on that fill', () => {
    // The permission above is only sound because of this number.
    expect(ratio('--color-brand-700', '--color-caution')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-brand-700', '--color-caution')).toBeCloseTo(6.2, 1);
  });
});

// ── status ───────────────────────────────────────────────────────────────────

describe('status colours as text — AA 4.5:1 on every surface', () => {
  const readable = [
    ['--color-positive', 'berthed, on time, settled'],
    ['--color-caution', 'delayed, estimated, stale, sample data'],
    ['--color-live', 'a live data source'],
    ['--color-critical-text', 'the cancelled/critical LABEL'],
  ] as const;

  for (const [token, meaning] of readable) {
    for (const surface of SURFACES) {
      it(`${meaning}: ${token} on ${surface}`, () => {
        expect(ratio(token, surface)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('the measured values on the card ground are what the palette claims', () => {
    expect(ratio('--color-positive', '--color-surface-2')).toBeCloseTo(5.72, 1);
    expect(ratio('--color-caution', '--color-surface-2')).toBeCloseTo(7.53, 1);
    expect(ratio('--color-live', '--color-surface-2')).toBeCloseTo(5.64, 1);
    expect(ratio('--color-critical-text', '--color-surface-2')).toBeCloseTo(5.71, 1);
  });
});

describe('--color-critical is the enum hue and NOT its label', () => {
  /*
   * 4.42:1 on surface-2 — under AA, and it does not look under AA. This is the
   * derivation the palette documents: the enum colour draws the dot, the border
   * and the fill (all of which need 3:1), and the word next to them is raised to
   * --color-critical-text.
   */
  it('fails AA as text on the card and composer grounds', () => {
    expect(ratio('--color-critical', '--color-surface-2')).toBeLessThan(AA_TEXT);
    expect(ratio('--color-critical', '--color-surface-3')).toBeLessThan(AA_TEXT);
  });

  it('measures 4.42:1 on surface-2 — the near miss is the whole point', () => {
    expect(ratio('--color-critical', '--color-surface-2')).toBeCloseTo(4.42, 1);
  });

  it('clears 3:1 everywhere, which is all a dot, a border or a fill needs', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-critical', surface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the label tint is the readable one and clears AA everywhere', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-critical-text', surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('--color-danger, which components actually name, is the readable tint', () => {
    // The alias points at the label colour, not the enum hue. If it were ever
    // repointed at --color-critical, every `text-danger` in the app would drop
    // under AA at once and nothing else would notice.
    expect(hex('--color-danger')).toBe(hex('--color-critical-text'));
  });
});

describe('--color-neutral-status is a dot colour, not a text colour', () => {
  it('is the same value as text-3, and fails AA for the same reason', () => {
    expect(hex('--color-neutral-status')).toBe(hex('--color-text-3'));
    expect(ratio('--color-neutral-status', '--color-surface-2')).toBeLessThan(AA_TEXT);
  });

  it('so an "unknown" label lifts to text-2, which clears AA', () => {
    expect(ratio('--color-text-2', '--color-surface-2')).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

// ── the 12% chip fills, as solid composites ──────────────────────────────────

describe('status text on its own tinted chip', () => {
  /*
   * The spec paints a chip as `rgba(hue, 0.12)` over whatever is behind it. A
   * ratio cannot be computed against a translucent colour, so the tints are
   * declared as the solid composite over surface-2 — which is the only way the
   * pairing is measurable at all rather than merely plausible.
   */
  const pairs = [
    ['--color-positive', '--color-positive-tint', 'alongside / on time'],
    ['--color-caution', '--color-caution-tint', 'expected / delayed / sample data'],
    ['--color-critical-text', '--color-critical-tint', 'cancelled / not priced'],
    ['--color-live', '--color-live-tint', 'live feed'],
  ] as const;

  for (const [ink, fill, meaning] of pairs) {
    it(`${meaning}: ${ink} on ${fill}`, () => {
      expect(ratio(ink, fill)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it('text-1 also reads on every tint, for the prose inside a notice panel', () => {
    for (const tint of [
      '--color-positive-tint',
      '--color-caution-tint',
      '--color-critical-tint',
      '--color-live-tint',
    ] as const) {
      expect(ratio('--color-text-1', tint)).toBeGreaterThanOrEqual(AAA_TEXT);
    }
  });

  it('the enum hue is still not a label, even on its own tint', () => {
    expect(ratio('--color-critical', '--color-critical-tint')).toBeLessThan(AA_TEXT);
  });
});

// ── the filled provenance badges ─────────────────────────────────────────────

describe('provenance badges — a saturated fill with the ink that is safe on it', () => {
  /*
   * The loudest treatment in the system, because provenance outranks status: a
   * wrong status is a mistake and a wrong source is a lie. Filled, icon-led,
   * 11px uppercase — so the ink has to hold up at a small size on a bright fill.
   */
  const pairs = [
    ['--color-ink-on-bright', '--color-live', 'LIVE FEED'],
    ['--color-ink-on-bright', '--color-positive', 'ALL CITED'],
    ['--color-brand-700', '--color-caution', 'SAMPLE DATA'],
    ['--color-ink-on-bright', '--color-critical', 'NO SOURCE'],
    ['--color-ink-on-bright', '--color-absent', 'NO FEED'],
    ['--color-text-2', '--color-border', 'NOT CONNECTED'],
  ] as const;

  for (const [ink, fill, label] of pairs) {
    it(`${label}: ${ink} on ${fill}`, () => {
      expect(ratio(ink, fill)).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it('one ink across the whole family — that is what makes it read as one', () => {
    // Four of the six badges above share --color-ink-on-bright. The exceptions
    // are the caution fill, which is light enough to need brand-700, and "not
    // connected", an outline-weight badge on the divider colour.
    const saturated = [
      '--color-live',
      '--color-positive',
      '--color-critical',
      '--color-absent',
    ] as const;
    for (const fill of saturated) {
      expect(ratio('--color-ink-on-bright', fill)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('the "no feed" fill was lifted off text-3, and why', () => {
    /*
     * The spec draws this badge as the family ink on #6E7490 and it measures
     * 4.26:1 — under AA at 11px. Lifting the fill keeps the family's single ink;
     * flipping this one badge to white would have cleared it by 0.1 of a point
     * and cost that. Pinned so the fill cannot drift back.
     */
    expect(hex('--color-absent')).not.toBe(hex('--color-text-3'));
    expect(ratio('--color-ink-on-bright', '--color-text-3')).toBeLessThan(AA_TEXT);
    expect(ratio('--color-ink-on-bright', '--color-absent')).toBeCloseTo(5.32, 1);
  });

  it('and it still reads as the muted one beside the saturated hues', () => {
    // Luminance below every status colour, so it recedes in a row of badges
    // rather than competing with them. That was the point of the grey.
    for (const hue of ['--color-live', '--color-positive', '--color-caution'] as const) {
      expect(relativeLuminance(hex('--color-absent'))).toBeLessThan(relativeLuminance(hex(hue)));
    }
  });

  it('and white would NOT be safe on the caution fill, which is why 700 is the ink there', () => {
    // 2.29:1. The reasonable-looking mistake: white ink on every badge.
    expect(contrastRatio('#ffffff', hex('--color-caution'))).toBeLessThan(AA_TEXT);
  });
});

describe('the two inks are different tokens, and must stay that way', () => {
  /*
   * ── THE REGRESSION THIS EXISTS TO PREVENT, BECAUSE IT ALREADY HAPPENED ────
   *
   * `--color-ink-inverse` was pointed at the near-black canvas during the dark
   * import, on the reasonable-sounding theory that "inverse" flips with the
   * theme. It does not. The token means "ink on a DARK fill" and about thirty
   * components use it that way — so in one edit every brand-filled button went
   * to 2.07:1 and every navy table header to 1.38:1, and nothing failed,
   * because the token-pair assertions above only measure pairs somebody
   * remembered to write down.
   *
   * The bright status fills genuinely do need a dark ink. That is a second
   * token. Conflating them breaks one set or the other, always.
   */
  it('ink-inverse is white — it goes on the dark brand fills', () => {
    expect(hex('--color-ink-inverse')).toBe('#ffffff');
    for (const fill of ['--color-brand-500', '--color-brand-600', '--color-brand-700'] as const) {
      expect(ratio('--color-ink-inverse', fill)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('ink-on-bright is the canvas — it goes on the saturated status fills', () => {
    expect(hex('--color-ink-on-bright')).toBe(hex('--color-canvas'));
    for (const fill of [
      '--color-live',
      '--color-positive',
      '--color-critical',
      '--color-absent',
      '--color-caution',
    ] as const) {
      expect(ratio('--color-ink-on-bright', fill)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('and each fails on the other kind of fill, which is why there are two', () => {
    // White on the bright fills: 2.29 – 3.90.
    for (const fill of ['--color-caution', '--color-live', '--color-positive'] as const) {
      expect(ratio('--color-ink-inverse', fill)).toBeLessThan(AA_TEXT);
    }
    // Canvas on the brand fills: 2.07 – 1.38 the other way.
    expect(ratio('--color-ink-on-bright', '--color-brand-500')).toBeLessThan(AA_TEXT);
    expect(ratio('--color-ink-on-bright', '--color-brand-700')).toBeLessThan(AA_TEXT);
  });

  it('danger splits into a text tint and a fill, for exactly the same reason', () => {
    // `text-danger` on a surface, `bg-danger-fill` under a dark ink. White on
    // either red step fails (2.60 / 3.60), so a red button here is dark-inked.
    expect(ratio('--color-danger', '--color-surface-2')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-ink-on-bright', '--color-danger-fill')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio('--color-ink-inverse', '--color-danger-fill')).toBeLessThan(AA_TEXT);
  });
});

describe('every foreground/background pair written in a className', () => {
  /*
   * ── THE PAIRS NOBODY WROTE DOWN ──────────────────────────────────────────
   *
   * Everything above measures pairings someone thought to assert. This reads
   * the components instead: for each element that sets BOTH a background and a
   * text colour from the token set, it resolves both and measures them.
   *
   * That is the check that would have caught the ink-inverse regression, the
   * `bg-blue-50 text-ink` pair left at 1.12:1 by an over-literal ramp
   * inversion, and the tooltip that ended up white-on-white — none of which any
   * hand-written assertion covered, and none of which is visible in jsdom,
   * which applies no stylesheet.
   *
   * Variant-prefixed classes (`hover:`, `disabled:`, `focus:`) are skipped: a
   * `disabled:text-ink-subtle` does not co-occur with the default background,
   * and pairing them reports failures that never render. Opacity modifiers
   * (`bg-x/10`) are skipped too — the result depends on what is behind them, so
   * a flat measurement would be a fiction.
   */
  function tokenColour(cls: string): string | null {
    const name = cls.replace(/^(bg|text)-/, '');
    return tokens.get(`--color-${name}`) ?? null;
  }

  /*
   * Pairings on an element that carries an ICON and no words.
   *
   * WCAG asks 3:1 of a non-text indicator, not 4.5:1, so these are correct and
   * the scan cannot tell — it reads class strings and has no idea whether the
   * children are a glyph or a sentence.
   *
   * An explicit list rather than a loosened threshold: each entry names the
   * pairing, and the assertion below still holds every one of them to the 3:1
   * bar. Adding a line here is a deliberate act with a reason attached; moving
   * the threshold would silently exempt every pair in the codebase.
   */
  const ICON_ONLY: ReadonlyArray<readonly [string, string, string]> = [
    [
      'text-brand-300',
      'bg-surface-muted',
      // Board 01's zero-results glyph, drawn at #7A7CD6 on #1E2137 in the spec.
      'the filter glyph in the no-results panel',
    ],
    [
      'text-brand-300',
      'bg-surface-3',
      /*
       * The same pairing under the ramp name rather than the alias, and the
       * handoff draws it twice: the anchor glyph in the sidebar's 28px
       * demonstration-profile avatar (§2.1) and the same glyph in the operator
       * profile card (§6.10). Both are a glyph inside a circle with a border,
       * and the circle's own edge carries the shape.
       */
      'the anchor glyph in the demonstration-profile avatar',
    ],
    [
      'text-brand-300',
      'bg-border',
      /*
       * §5.10's cargo calculator: "Icon tile — 28px, `--border`, receipt glyph
       * `--brand-300`", against the maritime card's brand-tinted ship tile. The
       * two tiles are how a user tells the two forms apart at a glance, and the
       * tile carries a glyph and no words.
       */
      'the receipt glyph in the cargo calculator tile',
    ],
  ];

  function iconOnly(ink: string, bg: string): boolean {
    return ICON_ONLY.some(([i, b]) => i === ink && b === bg);
  }

  it('every icon-only exemption still clears the 3:1 non-text bar', () => {
    for (const [ink, bg, why] of ICON_ONLY) {
      const measured = contrastRatio(tokenColour(ink)!, tokenColour(bg)!);
      expect(measured, `${ink} on ${bg} — ${why}`).toBeGreaterThanOrEqual(AA_LARGE);
      // And is genuinely below the text bar, or it does not need exempting and
      // the entry is stale.
      expect(measured, `${ink} on ${bg} no longer needs an exemption`).toBeLessThan(AA_TEXT);
    }
  });

  it('resolves to at least 4.5:1', () => {
    const offenders: string[] = [];

    for (const file of globSync('src/**/*.tsx', { cwd: PROJECT_ROOT })) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        const classes = (line.match(/[\w:/[\]#.-]+/g) ?? []).filter(
          (token) => !token.includes(':') && !token.includes('/')
        );
        const backgrounds = classes.filter((c) => c.startsWith('bg-') && tokenColour(c));
        const inks = classes.filter((c) => c.startsWith('text-') && tokenColour(c));

        for (const bg of backgrounds) {
          for (const ink of inks) {
            if (iconOnly(ink, bg)) continue;
            const measured = contrastRatio(tokenColour(ink)!, tokenColour(bg)!);
            if (measured < AA_TEXT) {
              offenders.push(`${file}:${index + 1} ${ink} on ${bg} = ${measured.toFixed(2)}:1`);
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('including the fill a hover or active state swaps in', () => {
    /*
     * ── THE SECOND HALF OF THE SAME BUG ──────────────────────────────────────
     *
     * The scan above skips variant-prefixed classes, which is right for
     * `disabled:text-*` — that ink arrives with its own fill. It is WRONG for
     * `hover:bg-*`, which swaps the ground out from under the base text colour
     * and leaves it there.
     *
     * That is how `hover:bg-blue-700` survived: the alias used to be a dark
     * blue and now resolves to a near-white link colour, so four controls
     * painted themselves near-white on hover under unchanged white text. No
     * screenshot catches a hover state and no test renders one.
     *
     * So each `hover:`/`active:` background is measured against the element's
     * BASE text colour, which is the one still in force when it applies.
     */
    const offenders: string[] = [];

    for (const file of globSync('src/**/*.tsx', { cwd: PROJECT_ROOT })) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        const all = line.match(/[\w:/[\]#.-]+/g) ?? [];
        // The ink in force during hover: the base one, unless the same element
        // also restyles the text for that state.
        const baseInk = all.find((c) => c.startsWith('text-') && tokenColour(c));
        if (!baseInk) continue;

        for (const cls of all) {
          const state = /^(hover|active):bg-(.+)$/.exec(cls);
          if (!state) continue;
          // An element that changes its ink in the same state is measured by
          // that pair instead, and it is already covered above.
          if (all.some((c) => c.startsWith(`${state[1]}:text-`))) continue;

          const fill = tokenColour(`bg-${state[2]}`);
          if (!fill) continue;
          const measured = contrastRatio(tokenColour(baseInk)!, fill);
          if (measured < AA_TEXT) {
            offenders.push(`${file}:${index + 1} ${baseInk} on ${cls} = ${measured.toFixed(2)}:1`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the scan can actually see a failure, or it proves nothing', () => {
    // brand-500 is the fill whose 1.82:1 as text is asserted above. If the
    // resolver ever stopped resolving, every pair would silently score 1:1 and
    // be reported as... still failing. So check a KNOWN-GOOD pair resolves too.
    expect(tokenColour('bg-surface-2')).toBe(hex('--color-surface-2'));
    expect(tokenColour('text-ink')).toBe(hex('--color-text-1'));
    expect(
      contrastRatio(tokenColour('text-ink')!, tokenColour('bg-surface-2')!)
    ).toBeGreaterThanOrEqual(AA_TEXT);
    // And something that is not a colour token resolves to nothing, so sizes
    // like `text-caption` are not mistaken for foregrounds.
    expect(tokenColour('text-caption')).toBeNull();
  });
});

// ── non-text indicators ──────────────────────────────────────────────────────

describe('non-text indicators — AA 3:1', () => {
  it('the focus ring is visible on every surface it can appear over', () => {
    // A focus ring nobody can see is the same as no focus ring — CLAUDE.md 10.
    for (const surface of [...SURFACES, '--color-border'] as const) {
      expect(ratio('--color-focus', surface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the focus ring clears AA as well, everywhere — it is brand-200', () => {
    expect(hex('--color-focus')).toBe(hex('--color-brand-200'));
    for (const surface of SURFACES) {
      expect(ratio('--color-focus', surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('the strong border is discernible as a control boundary', () => {
    for (const surface of SURFACES) {
      expect(ratio('--color-border-strong', surface)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('--color-border is a DECORATIVE divider and makes no contrast claim', () => {
    /*
     * 1.22:1 on surface-2. Asserted as a failure so that nobody reaches for it
     * to outline a control — exactly the distinction the light theme drew
     * between --color-border and --color-border-strong, preserved.
     */
    expect(ratio('--color-border', '--color-surface-2')).toBeLessThan(AA_LARGE);
    expect(ratio('--color-border', '--color-surface-2')).toBeCloseTo(1.22, 1);
    expect(hex('--color-border-strong')).not.toBe(hex('--color-border'));
  });
});

// ── text on a saturated brand fill ───────────────────────────────────────────

describe('the on-navy family, on both brand fills', () => {
  /*
   * These names are measured against a ground, and they are meaningless without
   * it. brand-500 is the ordinary fill and brand-700 the pressed and header
   * fill; they are far enough apart that a ratio on one says nothing about the
   * other, so both are pinned.
   */
  const ON_NAVY: ReadonlyArray<readonly [string, string, number, number]> = [
    ['primary', '#ffffff', 9.46, 14.17],
    ['secondary', hex('--color-brand-100'), 7.6, 11.39],
    ['muted', hex('--color-brand-200'), 4.18, 6.26],
    ['accent', hex('--color-caution'), 4.14, 6.2],
  ];

  for (const [name, value, on500, on700] of ON_NAVY) {
    it(`on-navy-${name} measures ${on500} on brand-500 and ${on700} on brand-700`, () => {
      expect(contrastRatio(value, hex('--color-brand-500'))).toBeCloseTo(on500, 1);
      expect(contrastRatio(value, hex('--color-brand-700'))).toBeCloseTo(on700, 1);
    });
  }

  it('primary and secondary are the only two that carry words on brand-500', () => {
    for (const value of ['#ffffff', hex('--color-brand-100')]) {
      expect(contrastRatio(value, hex('--color-brand-500'))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('muted and accent do NOT clear AA on brand-500 — both land just under', () => {
    /*
     * 4.18 and 4.14. Close enough to read as fine in a screenshot and to fail an
     * audit, which is exactly the kind of value that needs a test rather than a
     * note. They remain usable there for an icon or a rule at 3:1.
     */
    for (const value of [hex('--color-brand-200'), hex('--color-caution')]) {
      expect(contrastRatio(value, hex('--color-brand-500'))).toBeLessThan(AA_TEXT);
      expect(contrastRatio(value, hex('--color-brand-500'))).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('all four clear AA on the darker brand-700, which is where the accent belongs', () => {
    for (const [, value] of ON_NAVY) {
      expect(contrastRatio(value, hex('--color-brand-700'))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('the utilities are declared, or the class names compile to nothing', () => {
    // These token names sit outside every namespace Tailwind generates from, so
    // an @utility block is the only thing that makes them real. This is the
    // failure mode the token file's own header keeps describing.
    for (const name of ['primary', 'secondary', 'muted', 'accent']) {
      expect(TOKEN_CSS).toMatch(new RegExp(`@utility text-on-navy-${name}\\s*\\{`));
    }
  });
});

// ── the operations palette, now the same palette ─────────────────────────────

describe('the operations surfaces resolve into the one dark system', () => {
  /*
   * The ops screens used to carry a SECOND design system — a light "Stitch"
   * palette with its own navy, its own inks and its own status pairs, sitting
   * beside the chat blue. The component spec has one palette for the product, so
   * these are aliases now and the two surfaces stop being two designs.
   */
  it('every ops surface and ink is an alias of a token in the main ramp', () => {
    expect(hex('--color-ops-surface')).toBe(hex('--color-surface-2'));
    expect(hex('--color-ops-surface-low')).toBe(hex('--color-surface-1'));
    expect(hex('--color-ops-surface-high')).toBe(hex('--color-surface-3'));
    expect(hex('--color-ops-ink')).toBe(hex('--color-text-1'));
    expect(hex('--color-ops-ink-variant')).toBe(hex('--color-text-2'));
  });

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

  it('white reads on the ops header fill and its container tone', () => {
    expect(contrastRatio('#ffffff', hex('--color-ops-navy'))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio('#ffffff', hex('--color-ops-navy-soft'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the ops outline is discernible as a control boundary — 3:1', () => {
    expect(ratio('--color-ops-outline', '--color-ops-surface')).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the ops outline-variant is decorative and must not outline a control', () => {
    expect(hex('--color-ops-outline-variant')).toBe(hex('--color-border'));
    expect(ratio('--color-ops-outline-variant', '--color-ops-surface')).toBeLessThan(AA_LARGE);
  });
});

describe('operations status chips — each fill with its matched ink', () => {
  /*
   * The matched-pair shape survived the palette change, because the idea was
   * right: a saturated chip fill needs an ink that is safe ON it. What changed
   * is which ink — on a dark theme that is the near-black canvas, not white.
   */
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

  it('the alert fill is the enum hue, so it is a fill here and not a label', () => {
    expect(hex('--color-ops-alert-fill')).toBe(hex('--color-critical'));
    expect(ratio('--color-ops-alert-fill', '--color-ops-surface')).toBeLessThan(AA_TEXT);
  });
});

// ── the light theme's structures are gone, and must not creep back ───────────

describe('no gradient survives inside the frame', () => {
  /*
   * "Depth comes from surface lightness only. No drop shadows anywhere inside
   * the frame." The three navy gradients and the hairline glow were the light
   * theme's chrome; the dark system separates planes with a 1px border and a
   * lighter surface, and there is nothing left for a gradient to do.
   *
   * Checked in the source rather than trusted, because a gradient reintroduced
   * on a reading surface is precisely the readability problem the old file's
   * decision 0025 existed to prevent — contrast against a gradient changes down
   * the paragraph, so any figure measured is true of one line of it.
   */
  it('the gradient tokens are not declared', () => {
    for (const name of ['--grad-sidebar', '--grad-hero', '--grad-rail', '--hairline-horizon']) {
      expect(TOKEN_CSS).not.toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it('nothing in the source still applies one', () => {
    const offenders: string[] = [];
    for (const file of globSync('src/**/*.{ts,tsx,css}', { cwd: PROJECT_ROOT })) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const line of source.split('\n')) {
        if (/\bbg-(grad-(sidebar|hero|rail)|hairline-horizon)\b/.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the card shadow is none, so depth is surface lightness and not elevation', () => {
    expect(themeBlock()).toMatch(/--shadow-card:\s*none\s*;/);
  });
});

describe('the reading surfaces stay flat', () => {
  /*
   * Every file below must exist: a rename that quietly drops one from the guard
   * fails here rather than passing on a shrinking set.
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
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source.length).toBeGreaterThan(0);

      const offenders = source
        .split('\n')
        .filter((line) => /\b(bg-grad-|bg-hairline-)\b/.test(line))
        .map((line) => line.trim().slice(0, 70));

      expect(offenders).toEqual([]);
    });
  }

  it('a shadow on one of these files means a FLOATING element, not a raised card', () => {
    /*
     * This guard started as "no shadow on a reading surface" and was wrong.
     * MessageList carries `shadow-popover` on the scroll-to-bottom pill, which
     * floats over the transcript rather than sitting in it — exactly the case
     * the token file keeps a shadow for. The reading-surface rule is about
     * gradients, which change contrast down a paragraph; a floating control has
     * no paragraph.
     *
     * So the real rule is the narrower one: none of these files raises an
     * INLINE card. `shadow-card` is `none` in the palette, and reaching for a
     * floating layer's shadow to fake elevation on a card is the mistake.
     */
    const offenders: string[] = [];
    for (const file of READING_SURFACES) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const line of source.split('\n')) {
        if (!/\bshadow-(popover|sheet)\b/.test(line)) continue;
        // A floating element positions itself out of flow. If it does not, the
        // shadow is being used as elevation on something inline.
        if (!/\b(fixed|absolute|sticky)\b/.test(source)) {
          offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── the high-contrast overrides only ever strengthen ─────────────────────────

describe('prefers-contrast: more moves every token the safe way', () => {
  /*
   * The base palette has to clear AA on its own, and it does — everything above
   * measures it. This block is the separate question: that a user who asked
   * their OS for more contrast gets more, and never less.
   *
   * Parsed from the media block rather than the theme, so these are the real
   * override values and not the ones the rest of this file measures.
   */
  function override(name: string): string {
    const block = TOKEN_CSS.match(/prefers-contrast: more\s*\)\s*\{([\s\S]*?)\n {2}\}/)?.[1];
    const match = block?.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
    if (!match?.[1]) throw new Error(`${name} is not overridden in the prefers-contrast block.`);
    return match[1].toLowerCase();
  }

  it('the divider becomes a stronger boundary against the card ground', () => {
    const base = contrastRatio(hex('--color-border'), hex('--color-surface-2'));
    const strengthened = contrastRatio(override('--color-border'), hex('--color-surface-2'));
    expect(strengthened).toBeGreaterThan(base);
  });

  it('the placeholder ink rises, and clears AA once it has', () => {
    const strengthened = contrastRatio(override('--color-text-3'), hex('--color-surface-2'));
    expect(strengthened).toBeGreaterThan(ratio('--color-text-3', '--color-surface-2'));
    // The whole point: what was placeholder-only at 3.74 becomes readable.
    expect(strengthened).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
