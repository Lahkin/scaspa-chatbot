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

import { chromium } from 'playwright';
import { preview } from 'vite';

const WIDTHS = [320, 390, 768, 1024, 1440];
const ROUTES = ['/chat', '/widget'];
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
          });
        }
      }
      offenders.sort((a, b) => b.right - a.right);

      const composer = document.querySelector('textarea');
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
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        viewport,
        offenders: offenders.slice(0, 4),
        composerBottom: composerBox ? Math.round(composerBox.bottom) : null,
        innerHeight: window.innerHeight,
        small,
      };
    });

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
