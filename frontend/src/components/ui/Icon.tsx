import { cn } from '@/lib/cn';
import { CIRCLES, ICON_PATHS, RECTS, type IconName } from './iconPaths';

/**
 * The icon set, transcribed from the design spec's sprite.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * Until the design import there were no icons in this product at all. The one
 * place that needed a symbol — `SourceNotice`, the most load-bearing component
 * on the operations screens — drew a literal `!` and a literal `i` in a span.
 * The spec is icon-led throughout: a provenance badge is defined as "filled,
 * icon-led"; a landed flight and an arrived flight are told apart by their
 * GLYPH and not by their colour. Neither is expressible without a real set.
 *
 * ── THE GEOMETRY IS THE SPEC'S, NOT AN APPROXIMATION ─────────────────────────
 *
 * Every path below is copied from the spec's `<symbol>` definitions verbatim,
 * on the same 24-unit grid. The stroke treatment — 2px, round caps, round
 * joins, no fill — is set once on the wrapper rather than per path, exactly as
 * the spec's own stylesheet does it. Redrawing these by eye would produce
 * something that looks close at 16px and wrong at 20px.
 *
 * ── SIZING ───────────────────────────────────────────────────────────────────
 *
 * 16px in dense rows, 18px in the sidebar, 14px inside chips — spec 00. The
 * stroke does NOT scale with the box: a 2px stroke on a 24 grid rendered into
 * 14px is what keeps a chip's glyph the same weight as a table row's.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────────
 *
 * `aria-hidden` by default, because an icon in this product is always beside
 * the word it illustrates — CLAUDE.md's rule that colour is never the only
 * signal cuts both ways, and an icon that announces itself next to its own
 * label reads the label twice. Pass a `title` only for an icon that is genuinely
 * alone, and it becomes a labelled `img` instead.
 */

export interface IconProps {
  name: IconName;
  /**
   * The six sizes the handoff draws, and no others — §5.9.
   *
   * 12 inside badges and pills · 14 inside suggestion chips and inline metadata
   * rows · 16 in dense rows, table cells, buttons and notice panels · 18 in the
   * sidebar nav and page-level controls · 20–24 for empty-state illustrations.
   */
  size?: 12 | 14 | 16 | 18 | 20 | 24;
  className?: string;
  /**
   * Only for an icon with no adjacent label. Supplying it turns the graphic into
   * a labelled `img` for assistive technology; leaving it out keeps the icon
   * decorative, which is correct whenever the word is already next to it.
   */
  title?: string;
}

export type { IconName };

export function Icon({ name, size = 16, className, title }: IconProps) {
  const paths = ICON_PATHS[name];
  const circles = CIRCLES[name] ?? [];
  const rects = RECTS[name] ?? [];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      /* Set here rather than per shape: the spec's own stylesheet does exactly
       * this, and a stroke declared 40 times is 40 chances to differ. */
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('block shrink-0', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      {rects.map(([x, y, w, h, r]) => (
        <rect key={`r${x}-${y}`} x={x} y={y} width={w} height={h} rx={r} />
      ))}
      {circles.map(([cx, cy, r]) => (
        <circle key={`c${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
