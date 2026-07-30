/**
 * Series styling that works without colour.
 *
 * **Never rely on colour alone.** Around one man in twelve has some form of
 * colour-vision deficiency, the leave-behind will be printed in black and white,
 * and a projector in a bright room flattens a blue ramp into four greys. So every
 * series is distinguished three times over: by colour, by stroke pattern, and by
 * point marker or fill pattern.
 *
 * Colours are the brand blue ramp, darkest first so a two-series chart has the
 * strongest possible contrast between its two lines. `--amber-board` is the single
 * accent, used only for a highlighted series — it is a fill-and-dark-ground
 * colour and never appears as text on a light surface.
 */

/** Resolved at render time from the CSS variables so a token change moves the chart too. */
export interface SeriesStyle {
  /** CSS variable name, read via getComputedStyle at render. */
  colorVar: string;
  /** SVG dash pattern. Empty string means solid. */
  dash: string;
  /** Recharts dot shape for line and area. */
  shape: 'circle' | 'square' | 'triangle' | 'diamond';
  /** Id of the SVG pattern used to fill bars and areas. */
  patternId: string;
}

/**
 * Four styles, because the contract caps a chart at four series.
 *
 * Ordered so the first two are maximally distinct: darkest and lightest, solid
 * and long-dashed, circle and square. A two-series chart is the common case and
 * it should be the clearest.
 */
export const SERIES_STYLES: SeriesStyle[] = [
  { colorVar: '--color-blue-800', dash: '', shape: 'circle', patternId: 'scaspa-solid' },
  { colorVar: '--color-blue-400', dash: '7 4', shape: 'square', patternId: 'scaspa-diagonal' },
  { colorVar: '--color-blue-600', dash: '2 3', shape: 'triangle', patternId: 'scaspa-dots' },
  { colorVar: '--color-navy-deep', dash: '10 3 2 3', shape: 'diamond', patternId: 'scaspa-cross' },
];

/** The single accent, for a series the answer is drawing attention to. */
export const ACCENT_STYLE: SeriesStyle = {
  colorVar: '--color-amber-board',
  dash: '',
  shape: 'circle',
  patternId: 'scaspa-solid',
};

export function styleFor(index: number, highlighted: number | null): SeriesStyle {
  if (highlighted !== null && index === highlighted) return ACCENT_STYLE;
  return SERIES_STYLES[index % SERIES_STYLES.length] as SeriesStyle;
}

/**
 * Read a token to a concrete colour.
 *
 * Recharts writes `stroke` and `fill` attributes, and an SVG presentation
 * attribute cannot take `var(--x)` — it has to be a resolved value. Falls back to
 * the brand blue if the variable is missing, which is better than an SVG with no
 * stroke at all.
 */
export function resolveToken(variable: string, fallback = '#0069b4'): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value === '' ? fallback : value;
}
