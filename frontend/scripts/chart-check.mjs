/**
 * Charts, measured in a real browser.
 *
 * jsdom does no layout, so `ResponsiveContainer` measures **zero** there and would
 * report every chart as invisible whether or not it is. That is precisely the
 * failure this script exists to catch, so it cannot be caught in jsdom.
 *
 * **320px first**, per the handbook: the reason a chart is invisible is almost
 * always `ResponsiveContainer` failing to resolve a height, and the narrowest
 * viewport is where a broken layout shows first.
 *
 *   npm run dev is not needed — this runs against the production build.
 *   npm run build && npm run check:charts
 */

import { createServer } from 'vite';

/**
 * Playwright is deliberately NOT a saved dependency: CI has no browsers and
 * `npm ci` should not download 300MB of them. It is installed on demand, and a
 * bare "Cannot find package" is a confusing way to say so.
 */
async function requirePlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(
      '\nThis check needs Playwright, which is not a saved dependency.\n' +
        '  npm i -D --no-save playwright@1.56.1\n' +
        '  npx playwright install chromium webkit firefox\n'
    );
    process.exit(2);
  }
}

const { chromium } = await requirePlaywright();

const PORT = 4380;
const WIDTHS = [320, 390, 768, 1280];

const browser = await chromium.launch();

let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Driven through the real chat surface with the chart mock rather than through
 * the gallery, which also proves the lazy chunk is fetched over the wire at the
 * moment a chart is needed and not before.
 */
const dev = await createServer({ server: { port: PORT, strictPort: true } });
await dev.listen();
const devBase = `http://localhost:${PORT}`;

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto(`${devBase}/chat`, { waitUntil: 'networkidle' });

  // Before any chart is asked for, Recharts must not have been fetched.
  const loadedEarly = requests.some((url) => /ChartCanvas|recharts/i.test(url));

  // The control is fixed to the bottom-right corner; at 320px it can overlap the
  // composer, so it is clicked without waiting for it to be unobstructed.
  await page.getByRole('button', { name: /^Mock:/ }).click({ force: true });
  await page.getByRole('radio', { name: /Answer with a chart/ }).check();
  await page.getByRole('button', { name: 'Hide mock controls' }).click({ force: true });

  await page.getByRole('textbox', { name: 'Your question' }).fill('Cruise arrivals by month?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Send' }).waitFor({ timeout: 40_000 });

  // The chart element, then the SVG Recharts actually drew.
  await page.locator('[role="img"]').first().waitFor({ timeout: 20_000 });
  await page.locator('[data-testid="chart-canvas"] svg').first().waitFor({ timeout: 20_000 });

  const result = await page.evaluate(() => {
    const wrapper = document.querySelector('[data-testid="chart-canvas"]');
    const svg = wrapper?.querySelector('svg');
    const figure = wrapper?.closest('figure');
    const caption = figure?.querySelector('figcaption');
    const box = svg?.getBoundingClientRect();

    return {
      wrapperHeight: wrapper?.getBoundingClientRect().height ?? 0,
      svgWidth: box?.width ?? 0,
      svgHeight: box?.height ?? 0,
      // Did it actually draw anything, or is it an empty <svg>?
      paths:
        svg?.querySelectorAll('path, rect.recharts-rectangle, .recharts-line, .recharts-bar')
          .length ?? 0,
      ticks: svg?.querySelectorAll('.recharts-cartesian-axis-tick').length ?? 0,
      captionText: caption?.textContent ?? '',
      captionClipped: caption ? caption.scrollHeight > caption.clientHeight + 1 : true,
      hiddenTableRows: figure?.querySelectorAll('.sr-only table tbody tr').length ?? 0,
      ariaLabel: document.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '',
      docOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  console.log(`\n${width}px`);
  report(!loadedEarly, 'Recharts was not fetched before a chart was needed');
  // The whole ResponsiveContainer trap: a zero-height parent gives a zero-size svg.
  report(
    result.wrapperHeight > 100,
    'the wrapper has a determinate height',
    `${Math.round(result.wrapperHeight)}px`
  );
  report(
    result.svgWidth > 100 && result.svgHeight > 100,
    'the chart has real dimensions',
    `${Math.round(result.svgWidth)}x${Math.round(result.svgHeight)}`
  );
  report(result.paths > 0, 'the chart drew something', `${result.paths} shapes`);
  report(result.ticks > 0, 'axes rendered ticks', `${result.ticks}`);
  report(result.captionText.length > 20, 'the caption is present');
  report(!result.captionClipped, 'the caption is not clipped');
  report(
    result.hiddenTableRows === 12,
    'the hidden data table has every row',
    `${result.hiddenTableRows}`
  );
  report(result.ariaLabel.includes('chart'), 'aria-label describes the chart');
  report(!result.docOverflows, 'no horizontal overflow');

  await page.close();
}

await browser.close();
await dev.close();

console.log(failures === 0 ? '\nChart checks passed.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
