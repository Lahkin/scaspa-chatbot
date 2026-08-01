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

/*
 * Images, and why this section exists at all.
 *
 * It was added after a 2.1 MB, 6000 x 6000 logo shipped and every check here
 * went green. Nothing was wrong with the checks — they measured JavaScript, and
 * the logo is not JavaScript. It was five times the weight of the entire app
 * bundle, for a mark drawn at 48px, on a page whose fonts are self-hosted to
 * save one DNS round trip.
 *
 * That is the failure worth guarding: a budget that measures one kind of byte
 * teaches everyone the other kinds are free.
 */

/** No single raster over this, RAW — an image is already compressed, so gzip does nothing. */
const IMAGE_BUDGET_KB = 100;
/** Every image together. A dozen small ones is the same download as one large one. */
const TOTAL_IMAGE_BUDGET_KB = 250;
/**
 * The largest any raster is drawn in this app is the 48px lockup badge, so this
 * is ~5x the highest-density case and still leaves room for a hero.
 *
 * Checked because it names the actual mistake. A file over budget tells you to
 * compress harder; 6000px tells you the asset was never resized, which is the
 * thing that was true and the thing that a byte count alone does not say.
 */
const MAX_IMAGE_PX = 512;

const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'];

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

console.log('\nImages');

/**
 * Width and height straight out of the PNG header.
 *
 * A PNG is an 8-byte signature followed by IHDR: length(4), type(4), then width
 * and height as big-endian uint32s — so they sit at offsets 16 and 20, always,
 * in every PNG. That is the whole reader, and it needs no dependency.
 *
 * PNG only, deliberately. JPEG stores its size in a marker segment that has to
 * be walked, WebP has three container variants, and neither is worth the code:
 * the byte budget below already catches an oversized asset in any format. This
 * is the diagnostic that explains one, and PNG is what this app ships.
 */
function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const distFiles = readdirSync('dist', { recursive: true }).map(String);
const images = distFiles.filter((file) =>
  RASTER_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext))
);

let totalImageKb = 0;
for (const file of images) {
  const buffer = readFileSync(join('dist', file));
  const kb = buffer.length / 1024;
  totalImageKb += kb;

  report(kb <= IMAGE_BUDGET_KB, `${file} under ${IMAGE_BUDGET_KB} kB`, `${kb.toFixed(1)} kB`);

  const size = pngDimensions(buffer);
  if (size) {
    const tooBig = size.width > MAX_IMAGE_PX || size.height > MAX_IMAGE_PX;
    report(
      !tooBig,
      `${file} at most ${MAX_IMAGE_PX}px on a side`,
      `${size.width} x ${size.height}${tooBig ? ' — resize the source, do not just compress it' : ''}`
    );
  }
}

/*
 * SVGs are measured gzipped and rasters are not, because that is what actually
 * crosses the wire: a server gzips text and leaves an already-compressed PNG
 * alone. Measuring an SVG raw would over-report it by roughly a factor of four
 * and push someone toward a raster, which is the wrong direction for a logo.
 */
const svgs = distFiles.filter((file) => file.toLowerCase().endsWith('.svg'));
for (const file of svgs) {
  const kb = gzipKb(readFileSync(join('dist', file)));
  totalImageKb += kb;
  report(
    kb <= IMAGE_BUDGET_KB,
    `${file} under ${IMAGE_BUDGET_KB} kB gzipped`,
    `${kb.toFixed(1)} kB`
  );
}

if (images.length === 0 && svgs.length === 0) {
  console.log('       no images in the build');
} else {
  report(
    totalImageKb <= TOTAL_IMAGE_BUDGET_KB,
    `all images under ${TOTAL_IMAGE_BUDGET_KB} kB together`,
    `${totalImageKb.toFixed(1)} kB across ${images.length + svgs.length} file(s)`
  );
}

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
