/**
 * Cross-browser and embed verification.
 *
 * Chromium, WebKit and Firefox, at mobile and desktop widths. Plus the embed
 * snippet pasted into a plain HTML page, which is the only way to know it works
 * the way SCASPA will actually use it.
 *
 *   npm run check:browsers
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

const { chromium, firefox, webkit, devices } = await requirePlaywright();

const PORT = 4410;

/**
 * The host page stands in for scaspa.com, so the allowed embed origin must be
 * *its* origin.
 *
 * Without this the widget's close message is posted to
 * `https://www.scaspa.com` and the localhost host page never receives it —
 * which is the origin check working correctly, not a bug. It is also exactly
 * what will happen in production if `VITE_EMBED_ALLOWED_ORIGIN` does not match
 * the site the snippet is pasted into, so it is worth knowing this is the
 * symptom: the panel opens, the assistant works, and the close button does
 * nothing.
 */
process.env.VITE_EMBED_ALLOWED_ORIGIN = `http://localhost:${PORT}`;

const dev = await createServer({ server: { port: PORT, strictPort: true } });
await dev.listen();
const base = `http://localhost:${PORT}`;

/**
 * A plain HTML page with nothing but the snippet — the Weebly case.
 *
 * Served by intercepting the request rather than written to disk: a file in
 * `public/` would ship in the build, and a file in `dist/` is not served by the
 * dev server this runs against. Fulfilling the route keeps the page on the dev
 * origin, which is what the embed's origin checks are validated against.
 */
const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Host page</title></head>
  <body><h1>A plain page</h1><p>Nothing here but the snippet.</p>
  <script src="/embed.js" defer></script></body></html>`;

async function serveHostPage(page) {
  await page.route('**/embed-host-test.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: HOST_PAGE })
  );
}

let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const ENGINES = [
  { name: 'Chromium', launcher: chromium },
  { name: 'WebKit (Safari engine)', launcher: webkit },
  { name: 'Firefox', launcher: firefox },
];

for (const engine of ENGINES) {
  console.log(`\n${engine.name}`);
  const browser = await engine.launcher.launch();

  for (const viewport of [
    { name: 'mobile 390', width: 390, height: 800 },
    { name: 'desktop 1280', width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const landingOk = await page.getByRole('heading', { level: 1 }).count();

    await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: 'Your question' }).fill('ferry fare?');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'Send' }).waitFor({ timeout: 40_000 });
    const answer = await page.locator('[data-role="assistant"]').last().innerText();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );

    report(landingOk > 0, `${viewport.name}: landing renders`);
    report(answer.length > 100, `${viewport.name}: an answer streams`, `${answer.length} chars`);
    report(!overflow, `${viewport.name}: no horizontal overflow`);
    report(errors.length === 0, `${viewport.name}: no page errors`, errors[0] ?? '');

    await context.close();
  }

  // The embed snippet, in a plain page.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await serveHostPage(page);

    await page.goto(`${base}/embed-host-test.html`, { waitUntil: 'networkidle' });
    const launcher = page.getByRole('button', { name: 'Open the SCASPA Assistant' });
    report((await launcher.count()) === 1, 'embed: exactly one launcher appears');

    await launcher.click();
    const frame = page.locator('iframe[title="SCASPA Assistant"]');
    await frame.waitFor({ timeout: 15_000 });
    report(true, 'embed: the panel opens');
    // Without this, getUserMedia inside the frame is refused silently.
    report(
      (await frame.getAttribute('allow'))?.includes('microphone') ?? false,
      'embed: the iframe allows the microphone',
      (await frame.getAttribute('allow')) ?? ''
    );

    const widget = page.frameLocator('iframe[title="SCASPA Assistant"]');
    await widget.getByRole('textbox', { name: 'Your question' }).waitFor({ timeout: 20_000 });
    report(true, 'embed: the widget loads inside the frame');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    report(
      (await page.locator('iframe[title="SCASPA Assistant"]').count()) === 0,
      'embed: Escape closes it'
    );
    report(
      await launcher.evaluate((el) => el === document.activeElement),
      'embed: focus returns to the launcher'
    );
    report(errors.length === 0, 'embed: no page errors', errors[0] ?? '');

    await context.close();
  }

  await browser.close();
}

// A real iOS device profile, as far as an emulator goes.
{
  console.log('\niPhone 13 profile (emulated — NOT a physical device)');
  const browser = await webkit.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });
  const composerVisible = await page.getByRole('textbox', { name: 'Your question' }).isVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  // The dvh check: the composer must be inside the visual viewport.
  const composerInView = await page.evaluate(() => {
    const box = document.querySelector('textarea')?.getBoundingClientRect();
    return box ? box.bottom <= window.innerHeight + 1 : false;
  });

  report(composerVisible, 'composer is visible');
  report(composerInView, 'composer is inside the viewport (the 100dvh check)');
  report(!overflow, 'no horizontal overflow');
  report(errors.length === 0, 'no page errors', errors[0] ?? '');

  await context.close();
  await browser.close();
}

await dev.close();
console.log(
  failures === 0 ? '\nAll cross-browser checks passed.\n' : `\n${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
