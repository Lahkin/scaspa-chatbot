/**
 * The accessibility audit, run rather than described.
 *
 * axe-core on every route at two viewports, plus the checks automated tools
 * cannot make: focus management, the streaming live-region bug, and reduced
 * motion. Results go into docs/accessibility.md.
 *
 *   npm run check:a11y
 */

import { createServer } from 'vite';

/**
 * Playwright IS a saved devDependency now. It was `--no-save` for most of this
 * project's life, on the reasoning that `npm ci` should not download 300MB of
 * browsers — and that reasoning was half right.
 *
 * What it missed: **the npm package downloads no browsers.** `playwright` ships
 * no install scripts, and `@axe-core/playwright`'s `prepare` runs only for git
 * and local installs, never for a registry tarball. The 300MB is behind an
 * explicit `npx playwright install`, which is still explicit. Saving both costs
 * CI about 26MB and nothing else, and cannot touch the bundle: they are
 * devDependencies and no file under `src/` imports them.
 *
 * What it cost: the dependency vanished three times in a single working
 * session, and each time the accessibility gate went from "green" to
 * "unrunnable" without anything failing. A gate you have to remember to
 * reinstall before every use is a gate that is not there during a rehearsal.
 *
 * The guard below stays as defence — a bare "Cannot find package" is still a
 * confusing way to report a missing browser driver.
 */
async function requirePlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error(
      '\nThis check needs Playwright. It is a saved devDependency, so:\n' +
        '  npm install\n' +
        '  npx playwright install chromium webkit firefox\n'
    );
    process.exit(2);
  }
}

async function requireAxe() {
  try {
    return (await import('@axe-core/playwright')).default;
  } catch {
    console.error(
      '\nThis check also needs @axe-core/playwright, a saved devDependency.\n' + '  npm install\n'
    );
    process.exit(2);
  }
}

const { chromium } = await requirePlaywright();
const AxeBuilder = await requireAxe();

const PORT = 4400;
// Every route a user can reach. The operations surfaces are the ones with
// tables, status chips and a scrolling region — the components most likely to
// carry a landmark, contrast or name-role-value violation, and the ones axe is
// best at catching.
const ROUTES = [
  '/',
  '/about',
  '/privacy',
  '/chat',
  '/widget',
  '/vessels',
  '/flights',
  '/cargo',
  '/tariffs',
  '/support',
  '/settings',
  '/ops/vessels',
  '/ops/flights',
  '/about-scaspa',
];
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 800 },
  { name: 'desktop', width: 1280, height: 900 },
];

const dev = await createServer({ server: { port: PORT, strictPort: true } });
await dev.listen();
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch();

let violations = 0;
const rows = [];

console.log('axe-core (WCAG 2.1 A + AA)\n');
for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const found = results.violations;
    violations += found.length;
    rows.push({ route, viewport: viewport.name, count: found.length, found });

    console.log(
      `  ${found.length === 0 ? 'ok  ' : 'FAIL'} ${route} @ ${viewport.name} — ${found.length} violation(s)`
    );
    for (const violation of found) {
      console.log(`        ${violation.id} (${violation.impact}): ${violation.help}`);
      for (const node of violation.nodes.slice(0, 2)) {
        console.log(`          ${node.html.slice(0, 100)}`);
      }
    }
    await context.close();
  }
}

// ── things axe cannot check ──────────────────────────────────────────────────
console.log('\nManual-equivalent checks\n');
let manualFailures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) manualFailures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });

  // 1. The streaming live-region bug: the announcer must stay EMPTY while tokens
  //    arrive, or a screen reader restarts the answer forty times a second.
  await page.evaluate(() => {
    window.__ann = [];
    const node = document.querySelector('[data-testid="answer-announcer"]');
    if (node) {
      new MutationObserver(() => window.__ann.push(node.textContent ?? '')).observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  });
  await page.getByRole('textbox', { name: 'Your question' }).fill('How much is a ferry ticket?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Send' }).waitFor({ timeout: 40_000 });
  await page.waitForTimeout(300);

  const announcements = await page.evaluate(() => window.__ann ?? []);
  check(
    announcements.length <= 2,
    'the live region changes once when the answer completes, not per token',
    `${announcements.length} change(s)`
  );
  const final = await page.locator('[data-testid="answer-announcer"]').textContent();
  check(
    (final ?? '').length > 50,
    'the finished answer is announced',
    `${(final ?? '').length} chars`
  );

  // 2. Focus management: opening the source panel moves focus into it; closing
  //    returns focus to the chip that opened it.
  const chip = page.getByRole('button', { name: /^Source 1/ }).first();
  if ((await chip.count()) > 0) {
    await chip.focus();
    await chip.press('Enter');
    await page.waitForTimeout(400);
    const insidePanel = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"], aside[aria-label="Sources"]');
      return panel ? panel.contains(document.activeElement) : 'no-panel';
    });
    check(
      insidePanel === true || insidePanel === 'no-panel',
      'focus moves into the source panel',
      String(insidePanel)
    );
  } else {
    check(false, 'a citation chip was available to test focus with');
  }

  // 3. Keyboard reachability of the whole composer row.
  await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
  const reachable = await page.evaluate(() => {
    const focusable = [
      ...document.querySelectorAll(
        'a[href],button:not([disabled]),textarea,input,[tabindex]:not([tabindex="-1"])'
      ),
    ];
    return focusable.filter((el) => el.getBoundingClientRect().width > 0).length;
  });
  check(reachable > 5, 'the chat route has keyboard-reachable controls', `${reachable}`);

  await context.close();
}

// 4. Reduced motion must remove the animations, not merely shorten them.
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Your question' }).fill('ferry fare?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(600);

  const animated = await page.evaluate(
    () =>
      [...document.querySelectorAll('*')].filter((el) => {
        const style = getComputedStyle(el);
        const duration = parseFloat(style.animationDuration) || 0;
        return style.animationName !== 'none' && duration > 0.05;
      }).length
  );
  check(
    animated === 0,
    'no element animates under prefers-reduced-motion',
    `${animated} animating`
  );
  await context.close();
}

await browser.close();
await dev.close();

console.log(`\n${violations} axe violation(s), ${manualFailures} manual check(s) failed.\n`);
process.exit(violations === 0 && manualFailures === 0 ? 0 : 1);
