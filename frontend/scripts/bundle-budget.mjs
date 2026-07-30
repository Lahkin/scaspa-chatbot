/**
 * The performance budget, enforced.
 *
 * Every kilobyte is money on a roaming plan, and this is a claim the presenters
 * can make with a number attached. It runs in CI and **fails the build** when
 * exceeded — a budget nobody enforces is a preference.
 *
 *   npm run build && npm run check:budget
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist/assets';

/** Initial JS: what a first-time visitor to any route must download to see anything. */
const INITIAL_JS_BUDGET_KB = 200;
/** The embed loader is pasted into someone else's page. It has to stay small. */
const EMBED_BUDGET_KB = 3;

/** Must NOT be in the initial bundle — each is lazy-loaded on demand. */
const MUST_BE_LAZY = [
  { name: 'Recharts', markers: ['ResponsiveContainer', 'CartesianGrid', 'recharts'] },
  { name: 'markdown renderer', markers: ['micromark', 'gfmTable'] },
  { name: 'MSW / mocks', markers: ['setupWorker', 'mockServiceWorker'] },
  // Voice is route-lazy rather than component-lazy: it has no heavy dependency
  // (it is all browser APIs), so the win is keeping it off the landing page,
  // which the chat chunk already achieves. Splitting the button itself would add
  // a Suspense boundary to a control that should simply be present.
  { name: 'voice', markers: ['MediaRecorder.isTypeSupported', 'CANDIDATE_MIME_TYPES'] },
];

const gzipKb = (buffer) => gzipSync(buffer).length / 1024;

let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

const files = readdirSync(DIST).filter((f) => f.endsWith('.js'));

/**
 * The entry chunk plus anything it statically imports.
 *
 * Vite names the entry `index-*.js`; the shared react chunk is pulled in by it.
 * A lazily-imported route chunk is not counted, because a visitor to `/` never
 * fetches `/chat`'s.
 */
const entryFiles = files.filter((f) => /^(index|react)-/.test(f));
let entryGzip = 0;
console.log('\nInitial JavaScript');
for (const file of entryFiles) {
  const size = gzipKb(readFileSync(join(DIST, file)));
  entryGzip += size;
  console.log(`       ${file}  ${size.toFixed(1)} kB gz`);
}
report(
  entryGzip <= INITIAL_JS_BUDGET_KB,
  `initial JS under ${INITIAL_JS_BUDGET_KB} kB gzipped`,
  `${entryGzip.toFixed(1)} kB`
);

console.log('\nLazy-loading');
for (const { name, markers } of MUST_BE_LAZY) {
  const leaked = entryFiles.filter((file) => {
    const source = readFileSync(join(DIST, file), 'utf8');
    return markers.some((marker) => source.includes(marker));
  });
  report(leaked.length === 0, `${name} is not in the initial bundle`, leaked.join(', '));
}

console.log('\nFonts');
const fontDir = 'dist/fonts';
let fonts = [];
try {
  fonts = readdirSync(fontDir).filter((f) => f.endsWith('.woff2'));
} catch {
  /* no fonts directory */
}
report(fonts.length > 0, 'a self-hosted woff2 is shipped', fonts.join(', '));
const html = readFileSync('dist/index.html', 'utf8');
report(/rel="preload"[\s\S]*?as="font"/.test(html), 'the font is preloaded');
report(/crossorigin/.test(html), 'the preload has crossorigin (or it downloads twice)');

console.log('\nThird parties');
// A render-blocking third-party request is a DNS lookup and a TLS handshake
// before first paint, on a connection that is paying for both.
const thirdParty = /https?:\/\/(?!localhost|127\.0\.0\.1)[^"' ]+\.(js|css)/g;
const offenders = [...html.matchAll(thirdParty)].map((m) => m[0]);
report(
  offenders.length === 0,
  'no third-party scripts or stylesheets in the HTML',
  offenders.join(', ')
);
report(
  !/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com/.test(html),
  'no CDN font or script host'
);

console.log('\nEmbed loader');
const embedSize = statSync('dist/embed.js').size / 1024;
const embedGzip = gzipKb(readFileSync('dist/embed.js'));
report(
  embedGzip <= EMBED_BUDGET_KB,
  `embed.js under ${EMBED_BUDGET_KB} kB gzipped`,
  `${embedGzip.toFixed(2)} kB gz (${embedSize.toFixed(1)} kB raw)`
);

console.log(
  failures === 0
    ? `\nPerformance budget met. Initial JS ${entryGzip.toFixed(1)} kB gzipped.\n`
    : `\n${failures} budget check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
