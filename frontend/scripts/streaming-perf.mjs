/**
 * Streaming performance and flicker, measured in a browser under CPU throttling.
 *
 * Task 4 asks that streaming stay smooth "on a mid-range Android phone, not just
 * on your laptop". **There is no physical phone here**, so this is an emulation:
 * Chromium's CDP `Emulation.setCPUThrottlingRate` at 6x, which is the commonly
 * used stand-in for a mid-tier Android against a modern desktop CPU. It is a
 * proxy, not a device, and the number it produces should be read that way.
 *
 * What it measures, at 390px with the fee-table scenario:
 *
 *   1. **Long tasks** — main-thread blocks over 50ms during the stream. These are
 *      what a user feels: a tap that does not respond, a scroll that stutters.
 *   2. **Flicker** — the DOM is sampled throughout the stream, and every table
 *      observed must already have its full column count. A table that appears
 *      with two columns and grows to five is the exact defect the safe-point
 *      split exists to prevent.
 *
 * The parse *throttle* is not measured here — from outside the page there is no
 * clean way to count remark passes. It is measured directly, with fake timers, in
 * `tests/chat-rendering.test.tsx`.
 */

import { chromium } from 'playwright';
import { createServer } from 'vite';

const PORT = 4321;
const CPU_THROTTLE = 6;
const QUESTION = 'How much is a 40-foot container?';

// The dev server, not `vite preview`: the mock only exists in dev, and this
// measures the streaming path, which needs something to stream. The React build
// is unminified here, so the numbers are pessimistic rather than flattering.
const dev = await createServer({ server: { port: PORT, strictPort: true } });
await dev.listen();
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch();

let failures = 0;
function report(ok, label, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function run({ throttle }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const client = await page.context().newCDPSession(page);
  await page.goto(`${base}/chat`, { waitUntil: 'networkidle' });

  // Instrument before anything streams.
  await page.evaluate(() => {
    window.__longTasks = [];
    window.__tableSamples = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__longTasks.push(Math.round(entry.duration));
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask unsupported */
    }
    // Sample the table shape continuously while the answer streams.
    window.__sampler = setInterval(() => {
      const table = document.querySelector('table');
      if (!table) return;
      const cols = table.querySelectorAll('thead th').length;
      const rows = table.querySelectorAll('tbody tr').length;
      window.__tableSamples.push({ cols, rows });
    }, 16);
  });

  // Switch the mock to the fee-table answer.
  await page.getByRole('button', { name: /^Mock:/ }).click();
  await page.getByRole('radio', { name: /Answer with a fee table/ }).check();
  await page.getByRole('button', { name: 'Hide mock controls' }).click();

  if (throttle) await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

  const started = Date.now();
  await page.getByRole('textbox', { name: 'Your question' }).fill(QUESTION);
  await page.getByRole('button', { name: 'Send' }).click();

  // Wait for the stream to genuinely finish.
  //
  // NOT on `aria-busy`: the agent-status list unmounts when it collapses, which
  // happens at the *first* token — waiting on it measures the first 5% of the
  // stream and reports it as the whole thing. The composer swapping Stop back to
  // Send is driven by `busy`, which is the actual end of the stream.
  await page.waitForSelector('table tbody tr:nth-child(5)', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Send' }).waitFor({ timeout: 30_000 });
  const elapsed = Date.now() - started;

  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const result = await page.evaluate(() => {
    clearInterval(window.__sampler);
    const table = document.querySelector('table');
    return {
      longTasks: window.__longTasks,
      samples: window.__tableSamples,
      finalCols: table?.querySelectorAll('thead th').length ?? 0,
      finalRows: table?.querySelectorAll('tbody tr').length ?? 0,
      scrollable: (() => {
        const region = document.querySelector('[role="region"]');
        if (!region) return null;
        return {
          tabindex: region.getAttribute('tabindex'),
          label: region.getAttribute('aria-label'),
          overflows: region.scrollWidth > region.clientWidth,
        };
      })(),
      // Right-aligned, tabular figures in the charge column.
      alignment: [...(table?.querySelectorAll('tbody tr') ?? [])].map((row) => {
        const cells = row.querySelectorAll('td');
        const last = cells[cells.length - 1];
        return last ? getComputedStyle(last).textAlign : null;
      }),
      fontVariant: table ? getComputedStyle(table).fontVariantNumeric : null,
    };
  });

  await page.close();
  return { ...result, elapsed };
}

console.log(`\nStreaming a fee table at 390px, CPU throttled ${CPU_THROTTLE}x\n`);
const throttled = await run({ throttle: true });

const blocking = throttled.longTasks.reduce((total, ms) => total + Math.max(0, ms - 50), 0);
console.log(
  `  long tasks: ${throttled.longTasks.length}` +
    (throttled.longTasks.length ? ` (${throttled.longTasks.join(', ')} ms)` : '') +
    `, total blocking ${blocking}ms over ${throttled.elapsed}ms`
);

// A long task over ~200ms is a visible stutter; a handful of short ones is not.
report(
  throttled.longTasks.every((ms) => ms < 200),
  'no single main-thread block over 200ms',
  throttled.longTasks.filter((ms) => ms >= 200).join(', ')
);
report(blocking < 600, `total blocking time under 600ms`, `${blocking}ms`);

// ── flicker ─────────────────────────────────────────────────────────────────
const shapes = [...new Set(throttled.samples.map((s) => `${s.cols}x${s.rows}`))];
console.log(`  table shapes observed during streaming: ${shapes.join(' → ') || 'none'}`);
report(
  throttled.samples.every((s) => s.cols === throttled.finalCols),
  'every table ever painted had its full column count',
  shapes.join(' → ')
);
report(
  throttled.finalCols === 5 && throttled.finalRows === 5,
  'final table is 5 columns x 5 rows',
  `${throttled.finalCols}x${throttled.finalRows}`
);

// ── the scroll affordance at 390px ──────────────────────────────────────────
report(
  throttled.scrollable !== null && throttled.scrollable.overflows,
  'the fee table overflows at 390px and is a scroll region',
  JSON.stringify(throttled.scrollable)
);
report(
  throttled.scrollable?.tabindex === '0',
  'the scroll region is keyboard reachable',
  `tabindex=${throttled.scrollable?.tabindex}`
);

// ── figures ─────────────────────────────────────────────────────────────────
report(
  throttled.fontVariant?.includes('tabular-nums') ?? false,
  'the table renders tabular figures',
  `font-variant-numeric: ${throttled.fontVariant}`
);

await browser.close();
await dev.close();

console.log(failures === 0 ? '\nAll streaming checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
