/**
 * The Pilot identity: one mark, two brands, and a favicon that cannot drift.
 *
 * Three things are checked here, and the third is the reason the file exists.
 *
 * 1. The mark renders, and its states are states of ONE mark. The spec is
 *    explicit that there is no warning robot and no second avatar — an error
 *    adds a badge, it does not swap the identity.
 *
 * 2. SCASPA and Pilot stay separate. The Authority owns the information; Pilot
 *    is the thing that speaks. An assistant message is fronted by the Pilot
 *    mark, never by the institutional seal, and nothing merges the two into a
 *    hybrid.
 *
 * 3. `public/pilot-mark.svg` matches the component. That file has to duplicate
 *    the geometry — a favicon is fetched as a standalone document with no
 *    stylesheet behind it, so it cannot read a token or reuse a React component.
 *    Duplicated geometry with nothing watching it is how a product ends up with
 *    a tab icon that is subtly a different logo from the one in its own header,
 *    and nobody notices because nobody looks at a 16px square twice.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PilotAvatar } from '@/components/brand/PilotAvatar';
import { PilotBrand } from '@/components/brand/PilotBrand';
import { PROJECT_ROOT, globFiles } from './source-files';

const COMPONENT = readFileSync(
  resolve(PROJECT_ROOT, 'src/components/brand/PilotAvatar.tsx'),
  'utf8'
);
const FAVICON = readFileSync(resolve(PROJECT_ROOT, 'public/pilot-mark.svg'), 'utf8');

/**
 * The path data an SVG actually draws, normalised so whitespace cannot cause a
 * false alarm.
 *
 * Read out of a parsed document rather than scraped from source text. The first
 * version of this used a `d="..."` regex over the file and matched the `d` in
 * `id="pilot-figure"`, which is the kind of near-miss that makes a guard test
 * worse than none — it failed for a reason that had nothing to do with the
 * thing being guarded.
 */
function pathsIn(root: ParentNode): string[] {
  return [...root.querySelectorAll('path')]
    .map((p) => (p.getAttribute('d') ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort();
}

function faviconDocument(): Document {
  return new DOMParser().parseFromString(FAVICON, 'image/svg+xml');
}

describe('the Pilot mark', () => {
  it('renders as a square, whatever size it is asked for', () => {
    const { container } = render(<PilotAvatar size={28} label="Pilot" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('28');
    expect(svg.getAttribute('height')).toBe('28');
    expect(svg.getAttribute('viewBox')).toBe('0 0 96 96');
  });

  it('is decorative without a label, and announced with one', () => {
    // Beside a visible "PILOT" the mark says nothing new, and announcing it
    // makes a screen reader read the name twice.
    const { container: bare } = render(<PilotAvatar />);
    expect(bare.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');

    render(<PilotAvatar label="Pilot" />);
    expect(screen.getByRole('img', { name: 'Pilot' })).toBeTruthy();
  });

  it('gives every instance its own gradient id', () => {
    // A transcript renders one of these per assistant message. Duplicate defs
    // ids in one document are undefined behaviour, and what actually happens is
    // that the second avatar silently borrows the first one's gradient.
    const { container } = render(
      <>
        <PilotAvatar />
        <PilotAvatar />
      </>
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('is the same mark in every state — a badge is added, never a substitution', () => {
    const idle = render(<PilotAvatar />).container.querySelectorAll('path').length;

    for (const state of ['thinking', 'listening'] as const) {
      const { container } = render(<PilotAvatar state={state} />);
      expect(container.querySelectorAll('path').length, state).toBe(idle);
    }

    // The two badge states add to the mark rather than replacing anything.
    for (const state of ['verified', 'attention'] as const) {
      const { container } = render(<PilotAvatar state={state} />);
      expect(container.querySelectorAll('path').length, state).toBeGreaterThan(idle);
    }
  });

  it('animates the beacon while thinking and the ring while listening, never both', () => {
    const beacon = render(<PilotAvatar state="thinking" />).container;
    expect(beacon.querySelector('.animate-beacon')).toBeTruthy();
    expect(beacon.querySelector('.animate-ring')).toBeNull();

    const ring = render(<PilotAvatar state="listening" />).container;
    expect(ring.querySelector('.animate-ring')).toBeTruthy();
    expect(ring.querySelector('.animate-beacon')).toBeNull();
  });

  it('never rotates the compass', () => {
    /*
     * A spinning compass reads as a loading spinner, which says "waiting" where
     * this has to say "working". The transforms present are the fixed rotations
     * that place the four cardinal points; none of them is animated.
     */
    expect(COMPONENT).not.toMatch(/animate-spin/);
    expect(COMPONENT).not.toMatch(/@keyframes[^}]*rotate/);
  });
});

describe('the favicon is the same mark', () => {
  it('draws exactly the paths the resting mark draws', () => {
    /*
     * The RESTING mark, both ways round.
     *
     * Idle, because a favicon has no states: the verified and attention badges
     * exist in the component and must not appear here. Both directions, because
     * one alone is half a guard — the favicon must not lose a ray, and it must
     * not gain a flourish of its own either.
     */
    const rendered = render(<PilotAvatar />).container.querySelector('svg')!;
    expect(pathsIn(faviconDocument())).toEqual(pathsIn(rendered));
  });

  it('places the ring and the beacon identically', () => {
    for (const attrs of ['r="27.6"', 'cx="48" cy="34.4" r="4.1"', 'stroke-width="3.2"']) {
      const normalised = attrs.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
      expect(FAVICON.replace(/\s+/g, ' ')).toContain(attrs);
      expect(COMPONENT.replace(/\s+/g, ' ')).toContain(
        attrs.includes('stroke') ? normalised : attrs
      );
    }
  });

  it('carries a dark variant, because browser chrome has its own theme', () => {
    // Independent of the app's data-theme. A navy compass on a dark tab strip
    // is an empty tab.
    expect(FAVICON).toMatch(/@media \(prefers-color-scheme: dark\)/);
  });
});

describe('SCASPA and Pilot are two brands', () => {
  it('the lockup names the product and its descriptor', () => {
    render(<PilotBrand />);
    expect(screen.getByText('PILOT')).toBeTruthy();
    expect(screen.getByText('SCASPA Digital Guide')).toBeTruthy();
  });

  it('markOnly keeps the words for a screen reader rather than dropping them', () => {
    // The spec allows the mark alone in a constrained header. "Constrained" is
    // about pixels, and a screen reader has none.
    const { container } = render(<PilotBrand markOnly />);
    expect(screen.getByText('PILOT')).toBeTruthy();
    expect(container.querySelector('.sr-only')).toBeTruthy();
  });

  it('nothing merges the seal into the Pilot mark', () => {
    /*
     * The institutional seal is a supplied raster used verbatim; the Pilot mark
     * is drawn geometry. A component importing both and drawing them as one
     * object is the hybrid the brand architecture forbids.
     */
    const offenders: string[] = [];
    for (const file of globFiles('src/**/*.tsx')) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      /*
       * RENDERS the seal, not merely imports something from the file it lives
       * in. The first version of this matched module names and immediately
       * produced a false positive: `Composer` imports `SCASPA_PHONE_HREF`, a
       * phone-number constant that happens to be exported from `ScaspaMark.tsx`,
       * and was reported for merging two brand marks it does not draw.
       *
       * A guard that fires on a file's neighbours rather than on what it does is
       * worse than no guard: it gets suppressed, and then it is not watching.
       */
      const usesSeal = /<LogoLockup|<ScaspaMark|from '@\/assets\/scaspa-logo/.test(source);
      const drawsMark = /PilotAvatar\s*\/?>|from '@\/components\/brand\/PilotAvatar'/.test(source);
      // The gallery is the one place both legitimately appear, side by side and
      // labelled as two different things.
      if (usesSeal && drawsMark && !file.includes('dev/Gallery')) offenders.push(file);
    }
    expect(offenders, 'the seal and the Pilot mark in one component').toEqual([]);
  });
});
