/**
 * "No arbitrary hex value appears in any className" — CLAUDE.md, Style.
 *
 * The rule exists because the designers' token file is a wholesale replacement.
 * A `bg-[#0069b4]` sitting in a component survives that replacement and quietly
 * becomes the one thing on the page still wearing the old brand colour, which is
 * exactly the sort of defect nobody finds by looking.
 *
 * ESLint cannot see this: to it a className is a string. So it is checked here.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PROJECT_ROOT, globFiles } from './source-files';


function sourceFiles(): string[] {
  return globFiles('src/**/*.{ts,tsx}').filter(
    (file) => !file.endsWith('routeTree.gen.ts')
  );
}

/** Tailwind arbitrary value carrying a hex colour: bg-[#0069b4], text-[#fff]. */
const ARBITRARY_HEX = /[\w-]+-\[#[0-9a-fA-F]{3,8}\]/g;
/** A bare hex literal anywhere in a className string. */
const BARE_HEX_IN_CLASSNAME = /className=\{?["'`][^"'`]*#[0-9a-fA-F]{3,8}/g;

describe('no arbitrary hex in a className', () => {
  it('no Tailwind arbitrary hex utility exists anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const match of source.matchAll(ARBITRARY_HEX)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no bare hex literal appears inside a className string', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      for (const match of source.matchAll(BARE_HEX_IN_CLASSNAME)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the regex actually catches what it claims to', () => {
    // Without this, a broken regex reports a clean codebase forever.
    expect('bg-[#0069b4] p-4'.match(ARBITRARY_HEX)).toEqual(['bg-[#0069b4]']);
    expect('text-[#fff]'.match(ARBITRARY_HEX)).toEqual(['text-[#fff]']);
    expect('className="bg-blue-600"'.match(ARBITRARY_HEX)).toBeNull();
    expect('className="p-2 #ff0000"'.match(BARE_HEX_IN_CLASSNAME)).not.toBeNull();
  });
});

describe('no external font is fetched', () => {
  it('nothing references a font CDN', () => {
    // Users are on metered roaming data. A third-party DNS + TLS round trip before
    // first paint is a cost avoided by not incurring it.
    const files = [...sourceFiles(), 'index.html', 'src/styles/tokens.css'];
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      if (
        /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|cdn\.jsdelivr[^\s]*font/i.test(
          source
        )
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the font is preloaded from our own origin, with crossorigin', () => {
    const html = readFileSync(resolve(PROJECT_ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/rel="preload"[\s\S]*?as="font"/);
    // Without crossorigin the browser downloads the file a second time: a font is
    // fetched in CORS mode even same-origin.
    expect(html).toMatch(/inter-latin-variable\.woff2/);
    expect(html).toMatch(/crossorigin/);
  });

  it('font-display: swap, so text is readable before the font arrives', () => {
    const css = readFileSync(resolve(PROJECT_ROOT, 'src/styles/tokens.css'), 'utf8');
    expect(css).toMatch(/font-display:\s*swap/);
  });
});
