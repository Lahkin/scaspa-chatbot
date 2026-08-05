/**
 * The network a cruise passenger in a terminal building actually has.
 *
 * Chromium's `Network.emulateNetworkConditions` at Slow 3G — 400kbps down,
 * 400ms RTT — against the production build. It measures the two things that make
 * a slow connection unbearable rather than merely slow:
 *
 *   1. **Time to something.** A blank page for eight seconds is indistinguishable
 *      from a broken one.
 *   2. **Layout shift.** On a fast connection everything arrives together and CLS
 *      is invisible. On Slow 3G the font, the CSS and the JS land seconds apart,
 *      and content jumping under a thumb is how someone taps the wrong thing.
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

const PORT = 4370;
const server = await preview({ preview: { port: PORT, strictPort: true } });
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch();

// DevTools' "Slow 3G" preset.
const SLOW_3G = {
  offline: false,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
  latency: 400,
};

let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

for (const route of ['/', '/chat']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', SLOW_3G);

  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  const started = Date.now();
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  // First real content, not just a mounted root.
  await page.waitForSelector('h1, [data-role], textarea', { timeout: 90_000 });
  const firstContent = Date.now() - started;

  await page.waitForLoadState('networkidle', { timeout: 90_000 });
  const settled = Date.now() - started;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => ({
    cls: window.__cls,
    // Nothing may overflow sideways even mid-load.
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  console.log(`\n${route} on Slow 3G`);
  console.log(`  first content ${firstContent}ms, settled ${settled}ms`);
  // Under ~10s to something readable is the bar for "usable, if slow".
  report(firstContent < 10_000, 'shows content within 10s', `${firstContent}ms`);
  // Google's "good" CLS threshold.
  report(metrics.cls < 0.1, 'cumulative layout shift under 0.1', metrics.cls.toFixed(4));
  report(!metrics.overflows, 'no horizontal overflow');

  await page.close();
}

await browser.close();
await server.close();
console.log(failures === 0 ? '\nSlow 3G checks passed.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
