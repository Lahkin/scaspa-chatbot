/**
 * "No fee, fare, rate, schedule or opening hour is hardcoded in the client."
 *
 * `src/lib/scaspa-facts.ts` has said for months that this file enforces it:
 *
 * > `tests/scaspa-facts.test.ts` enforces this — it fails on a currency symbol,
 * > a clock time or a bare figure appearing anywhere in this module.
 *
 * **It did not exist.** The rule was documented and unenforced, which is the
 * worst of both worlds: a reader trusts the sentence and stops checking. Found
 * during the M5 pre-flight pass and written here.
 *
 * ## What it actually enforces, which is narrower than the sentence claimed
 *
 * "Fails on a bare figure" cannot be true and should not be. `formedYear: 1993`,
 * `P.O. Box 963` and the three telephone numbers are all bare figures, and all
 * four are explicitly *permitted* by the same docstring — they are what the
 * organisation is, not what it charges. A test that failed on them would be
 * deleted within a week, and rightly.
 *
 * So the real rule, and the one below: **no money, no clock, no rate.** A figure
 * is allowed when it identifies the Authority and forbidden when a reader could
 * act on it — the same line `docs/decisions.md` 0032 draws through the fixtures.
 *
 * ## Why the whole of `src/` and not just the one module
 *
 * The module is where such a constant would *belong*, which makes it the last
 * place someone would put one by accident. The second block widens the scan to
 * every production source file, excluding the two directories whose job is to
 * hold placeholder values (`src/mocks/`, `src/dev/`) and where 0032's
 * repeated-digit convention already governs.
 */

import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const FACTS = 'src/lib/scaspa-facts.ts';

/**
 * Comments quote the rule constantly — the docstring lists "fees, fares,
 * tariffs, charges, rates" verbatim — and a quoted prohibition is not a
 * violation of it. Same reason the board-22 scan in `matrix.test.tsx` strips
 * them before matching.
 */
function codeOf(file: string): string {
  return readFileSync(resolve(PROJECT_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** `XCD 44.44`, `EC$100`, `US$ 12`, `$1,200`, `£9`, `€9`. */
const MONEY = /(XCD|EC\$|US\$|USD|[$£€])\s*\d/;

/** `18:00`, `6:05 pm`, `06.30` when it is plainly a time of day. */
const CLOCK = /\b\d{1,2}:\d{2}\b/;

/**
 * A rate is a number with a denominator: `per container`, `per tonne`, `2.70 to
 * the dollar`. The FX peg is the live example — it is a rate, so it may not be a
 * client constant, which is what pushed the currency toggle post-demo. See
 * `docs/found-during-build.md` entry 20.
 */
const RATE = /\d\s*(per\s+\w+|\/\s*(container|tonne|ton|day|hour|ft|foot|metre|m)\b)/i;

describe('scaspa-facts holds no figure a reader could act on', () => {
  const code = codeOf(FACTS);

  it('states no money amount', () => {
    expect(code).not.toMatch(MONEY);
  });

  it('states no clock time', () => {
    expect(code).not.toMatch(CLOCK);
  });

  it('states no rate', () => {
    expect(code).not.toMatch(RATE);
  });

  it('names no fee, fare, tariff or opening hour, even in a key', () => {
    // A key called `ferryFare` is the same defect as the number beside it, and
    // it is the shape a well-meaning addition takes: the value looks harmless
    // until you read what it is called.
    expect(code).not.toMatch(/\b(fare|tariff|fee|charge|rate|price|cost)s?\b/i);
    expect(code).not.toMatch(/\b(opening|closing)\s+(hour|time)s?\b/i);
  });

  it('still permits the figures that identify the Authority', () => {
    // The counterweight. If this ever fails, the rules above have been
    // tightened past the point the module can do its job, and the fix is here
    // rather than in the source.
    expect(code).toContain('1993');
    expect(code).toContain('P.O. Box 963');
    expect(code).toMatch(/8121/);
  });
});

describe('no production source hardcodes a fee, a rate or a clock time', () => {
  /**
   * `src/mocks/` mirrors the backend fixtures and `src/dev/` is the component
   * gallery and the offline rehearsal — both are *meant* to carry placeholder
   * values, and 0032 layer 3 governs their shape (repeated digits, so nothing
   * can be written down and acted on).
   */
  const EXCLUDED = ['src/mocks/', 'src/dev/'];

  const files = globSync('src/**/*.{ts,tsx}', { cwd: PROJECT_ROOT }).filter(
    (file) => !file.endsWith('routeTree.gen.ts') && !EXCLUDED.some((dir) => file.startsWith(dir))
  );

  it('scans a meaningful number of files', () => {
    // A glob that silently matches nothing is a green test that checks nothing.
    expect(files.length).toBeGreaterThan(40);
  });

  it('states no money amount outside the fixture directories', () => {
    const offenders = files.filter((file) => MONEY.test(codeOf(file)));
    expect(offenders).toEqual([]);
  });

  it('states no clock time outside the fixture directories', () => {
    const offenders = files.filter((file) => CLOCK.test(codeOf(file)));
    expect(offenders).toEqual([]);
  });
});
