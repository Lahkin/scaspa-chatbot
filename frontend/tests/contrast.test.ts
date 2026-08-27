/**
 * Contrast rules, encoded in code rather than written in a document.
 *
 * Tokens are read from `src/styles/tokens.css` itself, not copied here. A test
 * that duplicates the values would pass happily after someone changed the real
 * ones, which is precisely the regression this exists to catch.
 *
 * ── THIS FILE WAS REWRITTEN FOR TWO THEMES ───────────────────────────────────
 *
 * The second wholesale replacement, and for the same reason as the first. The
 * previous version measured a single dark palette: a brand ramp that was indigo,
 * an amber that took a navy ink, a `--color-brand-500` that failed every text
 * threshold. The Pilot identity replaced the palette and added a light theme, so
 * the assertions were replaced with it rather than nudged until they went green.
 * An assertion edited to fit a new value has stopped being a check.
 *
 * What carried over is the method, which is the part worth keeping: parse the
 * real file, compute real ratios, assert the pairings the UI actually puts on
 * screen, and pin the load-bearing numbers so a token can be caught drifting
 * while still technically passing.
 *
 * EVERYTHING RUNS TWICE. `paletteFor('light')` and `paletteFor('dark')` are two
 * complete resolutions of the same token graph, and every suite below is
 * generated per theme. A colour that clears AA on navy and fails on white is a
 * failing test here, not something a reader discovers in a demonstration.
 *
 * Thresholds are WCAG 2.1 AA:
 *   4.5:1  normal text
 *   3.0:1  large text (>= 24px, or >= 18.66px bold) and non-text indicators
 *   7.0:1  AAA normal text, where a pairing claims it
 *
 * ── THE COLOURS THAT ARE NOT TEXT COLOURS ────────────────────────────────────
 *
 * Each is asserted to FAIL as text, on purpose, because each looks usable and
 * is not. The set is not identical in both themes, and that asymmetry is real
 * rather than an oversight:
 *
 *   --color-text-3        placeholder and disabled only, in both themes.
 *   --color-aqua          the Pilot ring and the ALL CITED fill. 2.71:1 on the
 *                         light card. Dark ink goes on it; it is never a word.
 *   --color-beacon        the amber point in the mark. Never text, never status.
 *   --color-brand-500     a FILL. It fails as text on the DARK ground (3.08:1)
 *                         and passes on the light one (11.53:1), because there
 *                         it is a navy. Passing is not permission: the rule is
 *                         enforced by the className scan below, which reads what
 *                         components actually wrote rather than what is legal.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROJECT_ROOT, globFiles } from './source-files';

const TOKENS_PATH = resolve(PROJECT_ROOT, 'src/styles/tokens.css');

const AA_TEXT = 4.5;
const AA_LARGE = 3.0;
const AAA_TEXT = 7.0;

/* Comments are stripped before parsing. The palette documents its own measured
 * ratios in prose, in lines that look enough like declarations to confuse a
 * looser regex. Removing comments first means the parser only ever sees CSS. */
const TOKEN_CSS = readFileSync(TOKENS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

/**
 * A named block, isolated.
 *
 * THIS IS NOT TIDINESS, IT IS CORRECTNESS. `tokens.css` re-declares
 * `--color-border` and `--color-text-3` inside `@media (prefers-contrast: more)`
 * with stronger values. A whole-file scan that assigns as it goes would take the
 * LAST declaration of each name — so every assertion below would silently
 * measure the high-contrast palette, report a comfortable pass, and prove
 * nothing at all about what the overwhelming majority of readers see.
 */
function blockAfter(header: string): string {
  const start = TOKEN_CSS.indexOf(header);
  if (start === -1) throw new Error(`Could not find ${header} in tokens.css.`);
  const end = TOKEN_CSS.indexOf('\n}', start);
  return TOKEN_CSS.slice(start + header.length, end);
}

const THEME_BLOCK = blockAfter('@theme {');
const DARK_BLOCK = blockAfter(":root[data-theme='dark'] {");

function literals(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = match;
    if (name && value) found.set(name, value.toLowerCase());
  }
  return found;
}

/**
 * One theme, fully resolved.
 *
 * The primitives come from `@theme`, overlaid with the dark block when that is
 * the theme being built. The ALIASES are only ever declared once, in `@theme` —
 * `--color-ink: var(--color-text-1)` is a statement about meaning, not about
 * colour, and it holds in both themes. So the alias graph is resolved against
 * whichever set of primitives is underneath it, which is exactly how the
 * stylesheet behaves in a browser.
 *
 * That is the most load-bearing function in this file. It is why re-theming ~34
 * primitives moved ~60 aliases and the whole component tree with them.
 */
function paletteFor(theme: Theme): Map<string, string> {
  const tokens = new Map(literals(THEME_BLOCK));
  if (theme === 'dark') for (const [name, value] of literals(DARK_BLOCK)) tokens.set(name, value);

  // Aliases resolve one hop at a time, so a chain still lands on a hex.
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (const match of THEME_BLOCK.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\)\s*;/g)) {
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

const PALETTES: Record<Theme, Map<string, string>> = {
  light: paletteFor('light'),
  dark: paletteFor('dark'),
};

// ── WCAG maths ───────────────────────────────────────────────────────────────

function toRgb(value: string): [number, number, number] {
  let body = value.replace('#', '');
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [
    Number.parseInt(body.slice(0, 2), 16),
    Number.parseInt(body.slice(2, 4), 16),
    Number.parseInt(body.slice(4, 6), 16),
  ];
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
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The four planes the product is built from, in either theme. */
const SURFACES = [
  '--color-canvas',
  '--color-surface-1',
  '--color-surface-2',
  '--color-surface-3',
] as const;

/** The card ground — where most metadata sits, so it is the tightest of the four. */
const CARD = '--color-surface-2';

interface Palette {
  hex(name: string): string;
  ratio(fg: string, bg: string): number;
}

function palette(theme: Theme): Palette {
  const tokens = PALETTES[theme];
  const hex = (name: string): string => {
    const value = tokens.get(name);
    if (!value) {
      throw new Error(
        `Token ${name} is missing from the ${theme} palette. If it was renamed, ` +
          `update this test — do not delete the assertion.`
      );
    }
    return value;
  };
  return { hex, ratio: (fg, bg) => contrastRatio(hex(fg), hex(bg)) };
}

// ── sanity: the maths, and the parser ────────────────────────────────────────

describe('WCAG maths', () => {
  it('computes the known extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric, because contrast has no direction', () => {
    expect(contrastRatio('#10264f', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#10264f'),
      10
    );
  });
});

describe('the token parser', () => {
  it('reads both palettes, and they are not the same palette', () => {
    expect(PALETTES.light.size).toBeGreaterThan(80);
    expect(PALETTES.dark.size).toBeGreaterThan(80);
    expect(palette('light').hex('--color-canvas')).not.toBe(palette('dark').hex('--color-canvas'));
  });

  it('resolves an alias chain down to a hex, per theme', () => {
    for (const theme of THEMES) {
      const p = palette(theme);
      expect(p.hex('--color-ink')).toBe(p.hex('--color-text-1'));
      expect(p.hex('--color-surface')).toBe(p.hex(CARD));
    }
  });

  it('reads the @theme value of a token the prefers-contrast block overrides', () => {
    // If either of these ever equals the high-contrast value, every assertion
    // below has been measuring the wrong palette and reporting a comfortable
    // pass. This is the check that keeps the block isolation honest.
    expect(palette('light').hex('--color-text-3')).toBe('#7e8b9c');
    expect(palette('dark').hex('--color-text-3')).toBe('#6e7e93');
  });

  it('the dark block only redefines names the light palette already has', () => {
    const light = literals(THEME_BLOCK);
    for (const name of literals(DARK_BLOCK).keys()) {
      expect(light.has(name), `${name} exists only in the dark block`).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Everything below runs once per theme.
// ═══════════════════════════════════════════════════════════════════════════

describe.each(THEMES)('%s theme', (theme) => {
  const p = palette(theme);
  const onDark = theme === 'dark';

  describe('body and metadata text on every surface', () => {
    it('text-1 clears AAA everywhere — it carries headings, body and figures', () => {
      for (const surface of SURFACES) {
        expect(p.ratio('--color-text-1', surface), `text-1 on ${surface}`).toBeGreaterThanOrEqual(
          AAA_TEXT
        );
      }
    });

    it('text-2 clears AA everywhere — labels, metadata, secondary prose', () => {
      for (const surface of SURFACES) {
        expect(p.ratio('--color-text-2', surface), `text-2 on ${surface}`).toBeGreaterThanOrEqual(
          AA_TEXT
        );
      }
    });
  });

  describe('--color-text-3 is placeholder and disabled ONLY', () => {
    it('never reaches the text bar on any surface', () => {
      for (const surface of SURFACES) {
        expect(p.ratio('--color-text-3', surface), `text-3 on ${surface}`).toBeLessThan(AA_TEXT);
      }
    });

    it('still clears the 3:1 bar on the card, so a placeholder is visible', () => {
      // A placeholder nobody can see is not a kindness. It has to be dimmer than
      // body text and brighter than the field it sits in, which is a narrow
      // band — hence a pinned number rather than a bound.
      expect(p.ratio('--color-text-3', CARD)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(p.ratio('--color-text-3', CARD)).toBeCloseTo(onDark ? 4.02 : 3.47, 1);
    });
  });

  describe('the brand ramp', () => {
    it('brand-300 is readable brand text on every surface', () => {
      for (const surface of SURFACES) {
        expect(p.ratio('--color-brand-300', surface), `brand-300 on ${surface}`).toBeGreaterThan(
          AA_TEXT
        );
      }
    });

    it('brand-200 clears the 3:1 bar, because it is the focus ring', () => {
      // A focus ring is a non-text indicator. It has to be findable against
      // every plane it can be drawn on, including the page itself.
      for (const surface of SURFACES) {
        expect(p.ratio('--color-brand-200', surface), `brand-200 on ${surface}`).toBeGreaterThan(
          AA_LARGE
        );
      }
    });

    it('is not purple any more', () => {
      /*
       * The Pilot spec bans purple as the dominant brand colour outright, and
       * the previous ramp — #383a97 through #7a7cd6 — read as exactly that.
       * Hue is checked rather than the literal values, so a future retune cannot
       * drift back towards indigo while still passing every contrast assertion
       * above. The old ramp did pass them all.
       */
      for (const step of ['--color-brand-400', '--color-brand-500', '--color-brand-600']) {
        const [r, g, b] = toRgb(p.hex(step));
        expect(b, `${step} should be blue-dominant`).toBeGreaterThan(r);
        // Purple is red and blue with green suppressed. A navy and an action
        // blue both keep green at or above red.
        expect(g, `${step} looks purple: ${p.hex(step)}`).toBeGreaterThanOrEqual(r);
      }
    });
  });

  describe('--color-brand-500 is the primary fill', () => {
    it('carries white at AA, which is the pairing every primary button makes', () => {
      expect(p.ratio('--color-ink-inverse', '--color-brand-500')).toBeGreaterThanOrEqual(AA_TEXT);
      expect(p.ratio('--color-ink-inverse', '--color-brand-500')).toBeCloseTo(
        onDark ? 5.41 : 11.53,
        1
      );
    });

    it(
      onDark
        ? 'fails as text on the dark ground, which is the rule made visible'
        : 'happens to be readable on the light ground — which is not permission',
      () => {
        const measured = p.ratio('--color-brand-500', CARD);
        if (onDark) {
          /*
           * It fails the TEXT bar, which is the rule. It does clear 3:1, so it
           * is legal as a non-text indicator — a border, a dot, a chart series.
           * The old ramp's 1.82:1 failed both, and the assertion said so; this
           * one says what is now true rather than what used to be.
           */
          expect(measured).toBeLessThan(AA_TEXT);
          expect(measured).toBeGreaterThanOrEqual(AA_LARGE);
          expect(measured).toBeCloseTo(3.08, 1);
        } else {
          /*
           * On white this token is a navy, so it reads perfectly well. The rule
           * "brand-500 is a fill" cannot be enforced by a contrast failure here,
           * so the className scan enforces it instead — that one reads what
           * components actually wrote rather than what the palette permits.
           */
          expect(measured).toBeGreaterThan(AA_TEXT);
        }
      }
    );
  });

  describe('status colours', () => {
    const AS_TEXT = [
      '--color-positive',
      '--color-caution',
      '--color-critical-text',
      '--color-live',
    ];

    it('every status LABEL clears AA on every surface', () => {
      for (const token of AS_TEXT) {
        for (const surface of SURFACES) {
          expect(p.ratio(token, surface), `${token} on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
        }
      }
    });

    it('each status label is readable on its own tinted chip', () => {
      const pairs: ReadonlyArray<readonly [string, string]> = [
        ['--color-positive', '--color-positive-tint'],
        ['--color-caution', '--color-caution-tint'],
        ['--color-critical-text', '--color-critical-tint'],
        ['--color-live', '--color-live-tint'],
      ];
      for (const [ink, tint] of pairs) {
        expect(p.ratio(ink, tint), `${ink} on ${tint}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    it('--color-neutral-status is a DOT colour, and the label lifts to text-2', () => {
      expect(p.ratio('--color-neutral-status', CARD)).toBeLessThan(AA_TEXT);
      expect(p.ratio('--color-neutral-status', CARD)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('--color-critical is the enum hue, and --color-critical-text is its label', () => {
      // They must stay different tokens. Collapsing them is how a 4.27:1 red
      // ends up carrying a sentence on the dark card.
      expect(p.hex('--color-critical')).not.toBe(p.hex('--color-critical-text'));
      expect(p.ratio('--color-critical-text', CARD)).toBeGreaterThanOrEqual(AA_TEXT);
      if (onDark) expect(p.ratio('--color-critical', CARD)).toBeLessThan(AA_TEXT);
    });
  });

  describe('saturated fills carry the ink that is safe on them', () => {
    /*
     * ── ONE INK ACROSS THE FAMILY, AND NOW WITH NO EXCEPTION ─────────────────
     *
     * `--color-ink-on-bright` is `--color-canvas`, which makes it near-white on
     * the light ground and near-black on the dark one. A saturated fill is dark
     * in the light theme and bright in the dark theme, so the canvas is the
     * right ink in both directions — one token, flipping with the palette,
     * doing the same job.
     *
     * The dark palette used to need `--color-brand-700` on the caution fill.
     * The light theme's caution is a dark amber on which brand-700 measures
     * 2.82:1, so that exception was removed rather than doubled.
     */
    const FILLS = [
      '--color-positive',
      '--color-caution',
      '--color-critical',
      '--color-live',
      '--color-absent',
    ];

    it('ink-on-bright clears AA on every one of them', () => {
      for (const fill of FILLS) {
        expect(p.ratio('--color-ink-on-bright', fill), `ink-on-bright on ${fill}`).toBeGreaterThan(
          AA_TEXT
        );
      }
    });

    it('the two inks stay different tokens, and the dark theme shows why', () => {
      expect(p.hex('--color-ink-on-bright')).not.toBe(p.hex('--color-ink-inverse'));

      if (onDark) {
        /*
         * On the dark ground the distinction is load-bearing and visible: the
         * caution fill is a bright amber, and WHITE on it measures 2.29:1. One
         * ink is always wrong, which is why there are two tokens.
         */
        expect(p.ratio('--color-ink-inverse', '--color-caution')).toBeLessThan(AA_TEXT);
      } else {
        /*
         * On the light ground they very nearly converge — ink-on-bright is the
         * canvas, which is #fbfcfe, and ink-inverse is #ffffff. Both work on a
         * dark fill. That is not a reason to collapse them: the token that is
         * correct in one theme has to stay correct in the other, and it is the
         * DARK theme that decides which is which.
         */
        expect(p.ratio('--color-ink-inverse', '--color-caution')).toBeGreaterThan(AA_TEXT);
      }
    });

    it('aqua takes its own ink, because aqua is bright in BOTH themes', () => {
      /*
       * The one fill the canvas cannot ink. Aqua is the Pilot hue and it stays
       * bright in the light theme, where the canvas is near-white — 2.64:1. So
       * `--color-ink-on-aqua` is dark in both themes.
       *
       * This is also the approved mock-up's one accessibility failure, recorded
       * rather than silently reproduced: the badge is drawn there as white on
       * aqua at 2.71:1. The hue is kept; the ink changed. decisions.md 0034.
       */
      expect(p.ratio('--color-ink-on-aqua', '--color-aqua')).toBeGreaterThanOrEqual(AA_TEXT);
      expect(p.ratio('--color-ink-inverse', '--color-aqua')).toBeLessThan(AA_TEXT);
    });
  });

  describe("Pilot's own hues are marks, not words", () => {
    it('--color-aqua is a fill, and the readable aqua is a different token', () => {
      if (!onDark) expect(p.ratio('--color-aqua', CARD)).toBeLessThan(AA_TEXT);
      expect(p.ratio('--color-aqua-text', CARD)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('--color-aqua-strong clears the 3:1 bar it exists for', () => {
      expect(p.ratio('--color-aqua-strong', CARD)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('--color-amber-board is readable on the strip it is named for', () => {
      /*
       * The departure-board figure. `--color-navy` is brand-700 and the strip is
       * navy in BOTH themes, so this amber is bright in both and does not follow
       * the status amber, which has to go dark to survive on white.
       */
      expect(p.ratio('--color-amber-board', '--color-navy')).toBeGreaterThanOrEqual(AA_TEXT);
      if (!onDark) {
        // And it is emphatically NOT a colour for the white row beside it.
        expect(p.ratio('--color-amber-board', CARD)).toBeLessThan(AA_TEXT);
      }
    });

    it('--color-beacon is never text', () => {
      // The amber point in the mark. It pulses while Pilot is thinking, and it
      // never carries a word in either theme.
      if (!onDark) expect(p.ratio('--color-beacon', CARD)).toBeLessThan(AA_TEXT);
    });
  });

  describe('non-text indicators — AA 3:1', () => {
    it('--color-border is a DECORATIVE divider and makes no contrast claim', () => {
      /*
       * Deliberately asserted to FAIL 3:1. A hairline between two cards is not
       * an indicator: nothing is conveyed by it that is not also conveyed by
       * the gap, the surface change and the heading. `--color-border-strong` is
       * the token for a boundary that carries meaning, and it is checked next.
       */
      expect(p.ratio('--color-border', CARD)).toBeLessThan(AA_LARGE);
    });

    it('--color-border-strong does carry meaning, and clears the bar', () => {
      expect(p.ratio('--color-border-strong', CARD)).toBeGreaterThanOrEqual(AA_LARGE);
    });
  });

  describe('every foreground/background pair written in a className', () => {
    /*
     * ── THE PAIRS NOBODY WROTE DOWN ──────────────────────────────────────────
     *
     * Everything above measures pairings someone thought to assert. This reads
     * the components instead: for each element that sets BOTH a background and
     * a text colour from the token set, it resolves both and measures them —
     * now in both themes, which is the only way a pairing that works on navy
     * and dies on white gets caught before a reader finds it.
     *
     * Variant-prefixed classes (`hover:`, `disabled:`, `focus:`) are skipped: a
     * `disabled:text-ink-subtle` does not co-occur with the default background.
     * Opacity modifiers (`bg-x/10`) are skipped too — the result depends on what
     * is behind them, so a flat measurement would be a fiction.
     */
    function tokenColour(cls: string): string | null {
      const name = cls.replace(/^(bg|text)-/, '');
      return PALETTES[theme].get(`--color-${name}`) ?? null;
    }

    /*
     * Pairings on an element that carries an ICON and no words.
     *
     * WCAG asks 3:1 of a non-text indicator, not 4.5:1, so these are correct and
     * the scan cannot tell — it reads class strings and has no idea whether the
     * children are a glyph or a sentence.
     *
     * An explicit list rather than a loosened threshold: each entry names the
     * pairing, and the assertion below still holds every one to the 3:1 bar.
     */
    const ICON_ONLY: ReadonlyArray<readonly [string, string, string]> = [
      ['text-brand-300', 'bg-surface-muted', 'the filter glyph in the no-results panel'],
      ['text-brand-300', 'bg-surface-3', 'the anchor glyph in the demonstration-profile avatar'],
      ['text-brand-300', 'bg-border', 'the receipt glyph in the cargo calculator tile'],
    ];

    function iconOnly(ink: string, bg: string): boolean {
      return ICON_ONLY.some(([i, b]) => i === ink && b === bg);
    }

    it('every icon-only exemption still clears the 3:1 non-text bar', () => {
      for (const [ink, bg, why] of ICON_ONLY) {
        const measured = contrastRatio(tokenColour(ink)!, tokenColour(bg)!);
        expect(measured, `${ink} on ${bg} — ${why}`).toBeGreaterThanOrEqual(AA_LARGE);
      }
    });

    it('resolves to at least 4.5:1', () => {
      const offenders: string[] = [];

      for (const file of globFiles('src/**/*.tsx')) {
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

      expect(offenders, `unreadable pairings in the ${theme} theme`).toEqual([]);
    });
  });

  describe('the operations surfaces resolve into the one system', () => {
    it('every ops alias lands on a palette token rather than a colour of its own', () => {
      const aliases = [
        '--color-ops-surface',
        '--color-ops-surface-low',
        '--color-ops-surface-high',
        '--color-ops-ink',
        '--color-ops-ink-variant',
      ];
      const known = new Set(SURFACES.map((s) => p.hex(s)));
      known.add(p.hex('--color-text-1'));
      known.add(p.hex('--color-text-2'));
      for (const alias of aliases) {
        expect(known.has(p.hex(alias)), `${alias} is off-system`).toBe(true);
      }
    });

    it('ops ink clears AA on the ops surfaces', () => {
      for (const surface of ['--color-ops-surface', '--color-ops-surface-low']) {
        expect(p.ratio('--color-ops-ink', surface)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(p.ratio('--color-ops-ink-variant', surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    it('each ops status fill carries its matched ink', () => {
      const chips: ReadonlyArray<readonly [string, string]> = [
        ['--color-ops-active-ink', '--color-ops-active-fill'],
        ['--color-ops-transit-ink', '--color-ops-transit-fill'],
        ['--color-ops-alert-ink', '--color-ops-alert-fill'],
      ];
      for (const [ink, fill] of chips) {
        expect(p.ratio(ink, fill), `${ink} on ${fill}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Theme-independent structure.
// ═══════════════════════════════════════════════════════════════════════════

describe('no gradient survives on a reading surface', () => {
  /*
   * Checked in the source rather than trusted, because a gradient reintroduced
   * on a READING surface is the readability problem decision 0025 exists to
   * prevent: contrast against a gradient changes down the paragraph, so any
   * figure measured is true of one line of it.
   *
   * Note the scope. The Pilot spec asks for a gradient on the dark
   * call-to-action, which is a button carrying three words, and is not one of
   * these tokens.
   */
  it('the gradient tokens are not declared', () => {
    for (const name of ['--grad-sidebar', '--grad-hero', '--grad-rail', '--hairline-horizon']) {
      expect(TOKEN_CSS).not.toMatch(new RegExp(`${name}\\s*:`));
    }
  });

  it('nothing in the source still applies one', () => {
    const offenders: string[] = [];
    for (const file of globFiles('src/**/*.{ts,tsx,css}')) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const line of source.split('\n')) {
        if (/\bbg-(grad-(sidebar|hero|rail)|hairline-horizon)\b/.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the prefers-contrast override strengthens, never weakens', () => {
  /*
   * The high-contrast block re-declares the decorative tokens, and it has to do
   * so for BOTH themes now. Whatever it does, it must move them AWAY from their
   * surface — an override that quietly lowered contrast would be worse than no
   * override at all, and nothing else in this file measures that block.
   */
  const HIGH_CONTRAST = TOKEN_CSS.slice(TOKEN_CSS.indexOf('@media (prefers-contrast: more)'));

  it('covers both themes', () => {
    expect(HIGH_CONTRAST).toMatch(/--color-border:/);
    expect(HIGH_CONTRAST).toMatch(/:root\[data-theme='dark'\]/);
  });

  it('lifts the placeholder ink towards the readable one in both themes', () => {
    const stronger = [...HIGH_CONTRAST.matchAll(/--color-text-3:\s*(#[0-9a-fA-F]{6})/g)].map((m) =>
      m[1]!.toLowerCase()
    );
    expect(stronger, 'one high-contrast placeholder per theme').toHaveLength(2);

    const [light, dark] = stronger as [string, string];
    expect(
      contrastRatio(light, palette('light').hex(CARD)),
      'the high-contrast light placeholder should be stronger'
    ).toBeGreaterThan(palette('light').ratio('--color-text-3', CARD));
    expect(
      contrastRatio(dark, palette('dark').hex(CARD)),
      'the high-contrast dark placeholder should be stronger'
    ).toBeGreaterThan(palette('dark').ratio('--color-text-3', CARD));
  });
});
