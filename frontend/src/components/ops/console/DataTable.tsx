import type { ReactNode } from 'react';

/**
 * The console's data table.
 *
 * Three things it does that a plain `<table>` does not, each because the
 * alternative is a real failure on a real screen:
 *
 * 1. **It scrolls inside itself.** A seven-column arrivals table cannot fit a
 *    390px phone, and a page that scrolls sideways is unusable — the header
 *    slides away and nothing lines up. `overflow-x: auto` on the wrapper keeps
 *    the document still. `npm run check:responsive` fails the build otherwise.
 * 2. **The scroll container is focusable and labelled.** A region that scrolls
 *    but cannot be reached by keyboard is unreachable for anyone not using a
 *    mouse — the columns past the fold simply cannot be read (WCAG SC 2.1.1).
 *    `role="region"` plus a name plus `tabIndex={0}` is the pattern that fixes
 *    it; see the `no-noninteractive-tabindex` note in `eslint.config.js` for why
 *    the rule had to be told about it.
 * 3. **It takes a caption.** Not decoration: a screen reader user landing on a
 *    table needs to know what it holds before reading forty cells of it.
 */
export function DataTable({
  caption,
  head,
  children,
  minWidth = 'min-w-200',
}: {
  /** Announced to screen readers. Visually hidden. */
  caption: string;
  head: ReactNode;
  children: ReactNode;
  /** Tailwind min-width for the table, so columns do not crush. */
  minWidth?: string;
}) {
  return (
    <div
      role="region"
      aria-label={`${caption} (scrolls sideways)`}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-ops-outline-variant bg-ops-surface"
    >
      <table className={`w-full border-collapse text-small ${minWidth}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-ops-navy text-left text-ink-inverse">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 font-semibold whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  muted = false,
  nowrap = false,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  muted?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={[
        'px-3 py-2.5',
        align === 'right' ? 'text-right' : 'text-left',
        muted ? 'text-ops-ink-variant' : 'text-ops-ink',
        nowrap ? 'whitespace-nowrap' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  );
}

/** Zebra striping, applied by index so the row component stays dumb. */
export function Tr({ index, children }: { index: number; children: ReactNode }) {
  return (
    <tr
      className={`border-t border-ops-outline-variant ${
        index % 2 === 1 ? 'bg-ops-surface-low' : ''
      }`}
    >
      {children}
    </tr>
  );
}
