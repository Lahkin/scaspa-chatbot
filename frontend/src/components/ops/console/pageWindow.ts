/** The gap marker. Drawn, never clickable. */
export const ELLIPSIS = '…' as const;

/**
 * Which page numbers to draw — spec board 01.
 *
 * First, last, and the current page with a neighbour either side; gaps become a
 * single ellipsis. Up to five pages are shown whole — the spec draws 1 2 3 4
 * without a gap, and collapsing four numbers to save one cell is a control that
 * changes shape for no benefit.
 *
 * In its own module because a file exporting both a component and a function
 * defeats React fast refresh, and this is the part worth testing directly.
 */
export function pageWindow(current: number, pageCount: number): Array<number | typeof ELLIPSIS> {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set([1, pageCount, current, current - 1, current + 1]);
  const shown = [...pages].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);

  const out: Array<number | typeof ELLIPSIS> = [];
  let previous = 0;
  for (const page of shown) {
    // A gap of exactly one page becomes that page, not an ellipsis: "1 … 3" is
    // the same width as "1 2 3" and tells the reader less.
    if (page - previous === 2) out.push(page - 1);
    else if (page - previous > 2) out.push(ELLIPSIS);
    out.push(page);
    previous = page;
  }
  return out;
}
