/**
 * "No fee, fare, rate, schedule or opening hour is hardcoded in the client."
 *
 * `src/lib/scaspa-facts.ts` names this file as the one that enforces it. **The
 * file did not exist** — but the enforcement did, in `tests/sidebar.test.tsx`,
 * where it had lived since before M1. Only the filename in the docstring was
 * wrong, and this file is now that filename: the block below is that test,
 * moved unchanged, so the module's own claim about itself is finally true.
 *
 * Reported initially as "documented and unenforced", which was wrong and is
 * corrected here rather than quietly. The distinction matters to anyone reading
 * back: nothing was ever unguarded, and the guard was never weak — its statistic
 * allowlist is stricter than anything written to replace it would have been.
 *
 * ## What is genuinely new: the repo-wide scan
 *
 * The module is where such a constant would *belong*, which makes it the last
 * place someone would put one by accident. The second block widens the scan to
 * every production source file, excluding the two directories whose job is to
 * hold placeholder values (`src/mocks/`, `src/dev/`) and where 0032's
 * repeated-digit convention already governs.
 *
 * One assertion is also added to the moved block — no rate. The XCD/USD peg is
 * why: it is a rate, so it cannot be a client constant, which is what made the
 * currency toggle a contract change rather than a display tweak.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROJECT_ROOT, globFiles } from './source-files';

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

describe('scaspa-facts.ts holds only low-volatility facts', () => {
  // Moved here unchanged from `tests/sidebar.test.tsx`, where it had lived
  // since before M1. Its line filter is stricter than `codeOf` — it drops
  // continuation lines of a block comment too — so it is kept rather than
  // replaced with the shared helper.
  const source = readFileSync(resolve(PROJECT_ROOT, FACTS), 'utf8');
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');

  it('contains no currency amount', () => {
    // XCD 44.44, EC$100, $12, US$5 — any of them would be a fee that drifts.
    expect(code).not.toMatch(/(XCD|EC\$|US\$|USD|\$)\s?\d/i);
  });

  it('contains no clock time', () => {
    // A sailing time or an opening hour. 1993 is a year, not a time.
    expect(code).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(code).not.toMatch(/\b\d{1,2}\s?(a\.?m\.?|p\.?m\.?)\b/i);
  });

  it('does not talk about opening hours, fees or schedules', () => {
    for (const word of [
      'opening hour',
      'open at',
      'closes at',
      'fee',
      'fare',
      'tariff',
      'charge',
      'schedule',
      'timetable',
    ]) {
      expect(code.toLowerCase(), `"${word}" must come from the assistant`).not.toContain(word);
    }
  });

  it('contains no statistic', () => {
    // The only bare numbers permitted are the formation year and the phone
    // digits. Anything else — passenger counts, tonnage, berth totals — is a
    // figure that goes stale with nothing to say that it has.
    const numbers = code.match(/\b\d[\d,.]*\b/g) ?? [];
    const allowed = /^(1993|869|465|8121|8122|8123|963|18694658121|18694658122|18694658123|2|3)$/;
    const unexpected = numbers.filter((n) => !allowed.test(n.replace(/[,.]/g, '')));
    expect(unexpected).toEqual([]);
  });

  it('never links the payment portal', () => {
    // The header comment names it in order to say it is never linked, so the
    // scan runs over code. A test that failed on its own documentation would
    // teach people to delete the documentation.
    expect(code).not.toContain('pay.scaspa.com');
  });

  it('states no rate — the FX peg is why this line exists', () => {
    // The one assertion added rather than moved. A rate is a number with a
    // denominator, and the XCD/USD peg is the live example: it is a rate, so it
    // cannot be a client constant, which is what put the currency toggle
    // post-demo. See `docs/found-during-build.md` entry 20.
    expect(code).not.toMatch(RATE);
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

  const files = globFiles('src/**/*.{ts,tsx}').filter(
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
