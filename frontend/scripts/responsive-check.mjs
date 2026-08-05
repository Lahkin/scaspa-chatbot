/**
 * Responsive verification in a real browser.
 *
 * jsdom does no layout at all: every element has zero width there, so "nothing
 * overflows at 320px" is not a claim it can check. Asserting it in jsdom would
 * produce a passing test that measures nothing, which is worse than no test.
 *
 * So this drives headless Chromium against the production build and measures.
 * It is a separate script rather than part of `npm test` because CI has no
 * browser installed; run it before shipping a layout change.
 *
 *   npm run build && npm run check:responsive
 *
 * What it checks, per route per width:
 *   1. The document does not scroll horizontally. At 320px this is the whole ask.
 *   2. It names the widest offending element when it does, because "something
 *      overflows" is not actionable.
 *   3. The composer is inside the viewport — the `100dvh` failure presents exactly
 *      here, as an input sitting below the fold behind the browser chrome.
 *   4. Every interactive control clears 44 x 44 CSS pixels.
 */

import { preview } from 'vite';

/**
 * Playwright IS a saved devDependency. It was `--no-save` for most of this
 * project's life to keep `npm ci` from fetching 300MB of browsers — but the npm
 * package downloads none of them; that is behind an explicit `npx playwright
 * install`. Unsaved, it vanished three times in one session and took the
 * accessibility gate with it each time. See `scripts/a11y-check.mjs`.
 */
async function requirePlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(
      '\nThis check needs Playwright, a saved devDependency.\n' +
        '  npm install\n' +
        '  npx playwright install chromium webkit firefox\n'
    );
    process.exit(2);
  }
}

const { chromium } = await requirePlaywright();

const WIDTHS = [320, 390, 768, 1024, 1440];
// The console routes are here because they are the ones most likely to break
// this: a 256px fixed-width rail and a seven-column table are exactly what
// pushes a 320px document sideways. The rail is `hidden lg:block` and the table
// scrolls inside its own container; this is what proves both still hold.
// Every route a user can reach.
//
// The console routes matter most — a 256px fixed rail and a seven-column table
// are what push a 320px document sideways — but the marketing routes are here
// because they were *not*, and that silence hid 20px-tall nav links on three
// public pages for the life of the project. An unchecked route is an unverified
// one.
const ROUTES = [
  '/',
  '/about',
  '/privacy',
  '/chat',
  '/widget',
  '/vessels',
  '/flights',
  '/tariffs',
  '/support',
  '/settings',
  '/ops/vessels',
  '/ops/flights',
  '/about-scaspa',
];
const HEIGHT = 780;

const server = await preview({ preview: { port: 4319, strictPort: true } });
const base = `http://localhost:4319`;

const browser = await chromium.launch();
let failures = 0;

function report(ok, label, detail = '') {
  if (!ok) failures += 1;
  const mark = ok ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
}

for (const route of ROUTES) {
  console.log(`\n${route}`);
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: HEIGHT } });
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    // Fonts change metrics; measuring before they land measures the fallback.
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(() => {
      const doc = document.documentElement;
      const viewport = window.innerWidth;

      /*
       * Sticking out past the viewport is not the same as widening the page.
       *
       * A wide table inside `overflow-x-auto` sticks out on every measurement —
       * that is what a scroll container is for — so reporting the widest
       * protruding element named the table on a page whose real culprit was an
       * invisible 1x1 `sr-only` span that had escaped the very same container.
       * Hours went into the table. So work out what is actually clipped.
       *
       * The rule (CSS 2.1 §11.1.1): an overflow container clips an in-flow
       * descendant, but clips an absolutely positioned one only when it is also
       * that descendant's containing block, or sits below it. A `position:
       * absolute` element whose containing block is an ancestor of the scroller
       * passes straight through the clip — which is why `sr-only` inside an
       * unpositioned scroller widens the document.
       */
      const clipsIt = (element) => {
        const position = getComputedStyle(element).position;
        // Approximation: a fixed element escapes scrollers, and it also does not
        // extend the scrollable area, so it is not our concern either way.
        if (position === 'fixed') return true;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const clips = style.overflowX !== 'visible';
          if (position !== 'absolute') {
            if (clips) return true;
            continue;
          }
          const isContainingBlock =
            style.position !== 'static' ||
            style.transform !== 'none' ||
            style.filter !== 'none' ||
            style.contain.includes('paint') ||
            style.contain.includes('layout');
          // Above the containing block nothing can clip it, so stop here.
          if (isContainingBlock) return clips;
        }
        return false;
      };

      // Every element that sticks out past the viewport, widest first.
      const offenders = [];
      for (const element of document.querySelectorAll('*')) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (rect.right > viewport + 0.5 || rect.left < -0.5) {
          offenders.push({
            tag: element.tagName.toLowerCase(),
            cls: (element.getAttribute('class') ?? '').slice(0, 70),
            right: Math.round(rect.right),
            left: Math.round(rect.left),
            clipped: clipsIt(element),
          });
        }
      }
      offenders.sort((a, b) => b.right - a.right);

      // Report the unclipped ones — the elements that genuinely widen the
      // document. Fall back to the raw list rather than printing nothing, since
      // "it overflows and no element is to blame" is itself worth seeing.
      const unclipped = offenders.filter((o) => !o.clipped);
      const blamed = unclipped.length > 0 ? unclipped : offenders;

      /*
       * The composer check is for the CHAT surfaces only.
       *
       * It exists for one failure: a `100vh` column putting the chat composer
       * behind iOS Safari's toolbar, where the user cannot type. That is a
       * property of a fixed-height app shell.
       *
       * A `<textarea>` on an ordinary scrolling document — the ticket form on
       * /support — is *supposed* to be below the fold; you scroll to it.
       * Asserting otherwise reported a failure on a page that was working
       * correctly, which is how a check teaches people to ignore it.
       */
      const isAppShell = document.querySelector('.h-dvh, .h-widget') !== null;
      const composer = isAppShell ? document.querySelector('textarea') : null;
      const composerBox = composer?.getBoundingClientRect() ?? null;

      // Touch targets. Links that are inline runs of text inside a paragraph are
      // excluded: WCAG 2.5.5 exempts inline text links, and demanding 44px of an
      // inline word would be wrong rather than strict.
      const small = [];
      for (const element of document.querySelectorAll(
        'button, a[href], input, textarea, select, [role="button"]'
      )) {
        const style = getComputedStyle(element);
        if (style.display === 'inline') continue;
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        /*
         * A checkbox or radio inside a <label> is measured on the label.
         *
         * Clicking anywhere in a wrapping label activates the control — that is
         * plain HTML, not a trick — so the label *is* the target, and WCAG 2.5.8
         * measures the region that accepts the pointer action. A native radio is
         * ~13px and the browser will not let it be otherwise; the accessible
         * answer is a large label, not a 44px radio, which no design has ever
         * wanted.
         *
         * Narrow on purpose: only `input`, only when a wrapping label exists,
         * and only when that label itself clears the threshold. An unlabelled
         * 13px checkbox is still a failure and still reported.
         */
        if (element.tagName === 'INPUT') {
          const label = element.closest('label');
          if (label) {
            const labelRect = label.getBoundingClientRect();
            if (labelRect.width >= 43.5 && labelRect.height >= 43.5) continue;
          }
        }

        /*
         * A visually hidden control is not a pointer target.
         *
         * The skip link is `sr-only` — clipped to 1x1 — until it receives
         * keyboard focus, at which point it becomes a normal sized control. It
         * is reached by Tab and never by a finger, so measuring its hidden state
         * reports a failure that cannot happen.
         *
         * Matched on the clipping declaration rather than on a class name, so it
         * recognises the visually-hidden recipe however it was written — and
         * both spellings of it, since Tailwind v4 emits `clip-path: inset(50%)`
         * where v3 and the classic recipe emit `clip: rect(0,0,0,0)`. Checking
         * only one is how this exemption silently stops working on an upgrade.
         *
         * An element that is merely *small* is not exempt: the clip and the size
         * must both hold.
         */
        const clipped =
          style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)';
        if (clipped && rect.width <= 2 && rect.height <= 2) continue;
        if (rect.width < 43.5 || rect.height < 43.5) {
          small.push({
            tag: element.tagName.toLowerCase(),
            name: (element.getAttribute('aria-label') ?? element.textContent ?? '')
              .trim()
              .slice(0, 30),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }

      return {
        // Console routes with no rows are a page with nothing wide on it, so
        // every width check passes for the wrong reason. Reported below.
        rows: document.querySelectorAll('tbody tr').length,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        viewport,
        offenders: blamed.slice(0, 4),
        composerBottom: composerBox ? Math.round(composerBox.bottom) : null,
        innerHeight: window.innerHeight,
        small,
      };
    });

    /*
     * A data route with no data measures nothing.
     *
     * The console's overflow bug survived every earlier run of this check
     * because the backend rejected this preview server's origin, so the tables
     * rendered empty and there was nothing wide to overflow with. Four green
     * ticks on a page that was broken. The check must say when it had no data
     * rather than pass quietly, in the same spirit as the jsdom note at the top
     * of this file: a check that measures nothing is worse than no check.
     */
    if (route.startsWith('/ops/')) {
      report(
        result.rows > 0,
        `${width}px  console table has rows`,
        result.rows > 0
          ? ''
          : `0 rows — start the backend with OPS_DATA_SOURCE=fixture and ${base} in ALLOWED_ORIGINS`
      );
    }

    const overflows = result.scrollWidth > result.clientWidth + 0.5;
    report(
      !overflows,
      `${width}px  no horizontal overflow`,
      overflows
        ? `scrollWidth ${result.scrollWidth} > clientWidth ${result.clientWidth}; widest: ${result.offenders
            .map((o) => `${o.tag}.${o.cls.split(' ')[0]}@${o.left}..${o.right}`)
            .join(', ')}`
        : ''
    );

    if (result.composerBottom !== null) {
      const visible = result.composerBottom <= result.innerHeight + 1;
      report(
        visible,
        `${width}px  composer within viewport`,
        visible ? '' : `bottom ${result.composerBottom} > viewport ${result.innerHeight}`
      );
    }

    report(
      result.small.length === 0,
      `${width}px  touch targets >= 44px`,
      result.small.map((s) => `${s.tag}"${s.name}" ${s.w}x${s.h}`).join(', ')
    );

    await page.close();
  }
}

await browser.close();
await server.close();

console.log(failures === 0 ? '\nAll responsive checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
