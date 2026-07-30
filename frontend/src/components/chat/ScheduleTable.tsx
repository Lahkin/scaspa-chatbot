import type { ReactNode } from 'react';
import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  ZEBRA_MIN_ROWS,
  classifyColumn,
  quantityColumnIndex,
  type ColumnKind,
} from '@/lib/markdown/columns';

/**
 * The departure board.
 *
 * GFM tables are how ferry sailings, flight times and the seaport tariff
 * schedule arrive, so this is the one component the product is really about.
 * Generic markdown table styling — a thin grey grid, proportional figures, text
 * that overflows its container on a phone — is not adequate for a fee schedule
 * somebody is going to budget against.
 *
 * What it does that the default does not:
 *
 * - **Figures line up.** `tabular-nums` everywhere and right-aligned numeric
 *   columns, so a fee column can be scanned down and compared. Proportional
 *   digits make `1,111.11` narrower than `44.44` and the comparison has to be
 *   done character by character.
 * - **Column type comes from the cells**, never the header. See `columns.ts`.
 * - **The quantity column carries the amber.** `--amber-board` on the navy
 *   header, and as the emphasis colour for the figure column — it is a fill and
 *   a dark-ground colour, never text on white, which the contrast test enforces.
 * - **It scrolls, and says so.** Five columns do not fit at 390px. The scroll
 *   container is a labelled, focusable region with a right-edge gradient that
 *   fades out at the end, because a table that is silently cut off reads as a
 *   table with fewer columns.
 * - **It carries its date.** A tariff without a "verified on" is the artefact
 *   the handbook warns about: someone budgets against it a year later.
 */

interface ScheduleTableProps {
  children?: ReactNode;
  /** From the citation the answer was built on. Rendered under the table. */
  verifiedOn?: string | null | undefined;
  /** kb id, shown alongside the date so a reader can find the source row. */
  sourceId?: string | null | undefined;
  /** Describes the table for the scroll region's accessible name. */
  label?: string | undefined;
}

/**
 * A cell keeps **both** representations.
 *
 * `text` drives column classification; `node` is what gets rendered. They have to
 * be separate: flattening to text alone silently deleted any citation chip inside
 * a cell — a `[kb-014]` in a fee table vanished completely, chip *and* marker,
 * because the chip element carries no text of its own. Classification also wants
 * the text without the chip, so "44.44 [kb-014]" still reads as a figure.
 */
interface Cell {
  text: string;
  node: ReactNode;
}

interface ParsedTable {
  head: Cell[];
  rows: Cell[][];
}

/**
 * Read the cells back out of react-markdown's rendered children.
 *
 * react-markdown hands over a React element tree, not the AST, so the text is
 * recovered by walking it. Awkward, but the alternative — a custom remark plugin
 * that rewrites table nodes — means maintaining an AST transform to obtain
 * information that is already present here.
 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function rowCells(row: ReactNode): Cell[] {
  const cells: Cell[] = [];
  Children.forEach(row, (cell) => {
    if (!isValidElement<{ children?: ReactNode }>(cell)) return;
    const children = cell.props.children;
    cells.push({ text: textOf(children), node: children });
  });
  return cells;
}

function parseTable(children: ReactNode): ParsedTable {
  const head: Cell[] = [];
  const rows: Cell[][] = [];

  Children.forEach(children, (section) => {
    if (!isValidElement<{ children?: ReactNode }>(section)) return;
    const isHead = section.type === 'thead';
    Children.forEach(section.props.children, (row) => {
      if (!isValidElement(row)) return;
      const cells = rowCells((row.props as { children?: ReactNode }).children);
      if (cells.length === 0) return;
      if (isHead) head.push(...cells);
      else rows.push(cells);
    });
  });

  return { head, rows };
}

export function ScheduleTable({ children, verifiedOn, sourceId, label }: ScheduleTableProps) {
  const { head, rows } = parseTable(children);

  const columnCount = Math.max(head.length, ...rows.map((row) => row.length), 0);
  const kinds: ColumnKind[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    kinds.push(classifyColumn(rows.map((row) => row[column]?.text ?? '')));
  }
  const quantity = quantityColumnIndex(kinds);
  const zebra = rows.length >= ZEBRA_MIN_ROWS;

  const accessibleName =
    label ?? (head.length > 0 ? `Table: ${head.map((cell) => cell.text).join(', ')}` : 'Table');

  return (
    <figure className="my-3">
      <ScrollRegion label={accessibleName}>
        <table className="w-full border-collapse text-small tabular">
          {head.length > 0 && (
            <thead>
              <tr className="bg-navy text-ink-inverse">
                {head.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={cn(
                      'px-3 py-2 font-semibold whitespace-nowrap',
                      kinds[index] === 'numeric' ? 'text-right' : 'text-left',
                      // The amber belongs on the navy header, where it is a
                      // dark-ground colour and clears 3:1. It is never text on
                      // a light surface — 2.03:1 — and the contrast test pins that.
                      index === quantity && 'text-amber-board'
                    )}
                  >
                    {cell.node}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-border last:border-b-0',
                  zebra && rowIndex % 2 === 1 && 'bg-surface-muted'
                )}
              >
                {Array.from({ length: columnCount }, (_, column) => (
                  <td
                    key={column}
                    className={cn(
                      'px-3 py-2 align-top',
                      kinds[column] === 'numeric' ? 'text-right whitespace-nowrap' : 'text-left',
                      column === quantity && 'font-semibold text-ink'
                    )}
                  >
                    {row[column]?.node ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      {/*
        The caption slot. Always rendered, even with no date — an explicit "date
        not stated" is a prompt to go and check, where silence reads as "current".
      */}
      <figcaption className="mt-2 text-caption text-ink-subtle">
        {verifiedOn ? (
          <>
            Verified on <time dateTime={verifiedOn}>{verifiedOn}</time>
            {sourceId ? ` · ${sourceId}` : ''}. Confirm with SCASPA before you rely on it.
          </>
        ) : (
          <>Date not stated — confirm these figures with SCASPA before you rely on them.</>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * A horizontally scrollable region that announces itself.
 *
 * `role="region"` + `aria-label` + `tabIndex={0}`: a scroll container that
 * cannot be focused cannot be scrolled by keyboard, which is a real failure and
 * one automated checkers do flag. `tabIndex` makes it a tab stop so arrow keys
 * reach the overflow.
 *
 * The right-edge gradient is the visual half of the same message, and it
 * **disappears at the end of the scroll** — a permanent gradient is a decoration
 * that stops meaning "there is more".
 */
function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const overflow = element.scrollWidth - element.clientWidth;
      setScrollable(overflow > 1);
      setAtEnd(element.scrollLeft >= overflow - 1);
    };

    update();
    element.addEventListener('scroll', update, { passive: true });
    // Overflow depends on width, which changes on rotate and on font load.
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className="relative">
      <div
        ref={ref}
        // Only a region when it actually scrolls: announcing a region and a tab
        // stop for a table that fits is noise for a screen-reader user.
        {...(scrollable
          ? { role: 'region' as const, 'aria-label': `${label} (scrollable)`, tabIndex: 0 }
          : {})}
        className="overflow-x-auto rounded-md border border-border"
      >
        {children}
      </div>

      {scrollable && !atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-md bg-gradient-to-l from-surface to-transparent"
        />
      )}

      {scrollable && (
        <p className="sr-only" aria-live="polite">
          {atEnd ? 'End of table.' : 'This table scrolls sideways for more columns.'}
        </p>
      )}
    </div>
  );
}
