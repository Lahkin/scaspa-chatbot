import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The operations table — §5.1's primitives.
 *
 * ```
 * container:   --surface-2; 1px solid --border; border-radius: 16px; overflow: hidden
 * toolbar row: padding 12px 20px; border-bottom: 1px solid --border; gap 10px; flex-wrap
 * column head: padding 10px 20px; border-bottom: 1px solid --border
 *              600 11px/16px uppercase 0.06em --text-3
 * row:         padding 0 20px; border-bottom: 1px solid --border
 *              height 44px comfortable / 36px compact
 * cell:        400 13px/20px --text-2   (first column 500 --text-1)
 * row hover:   background --surface-3
 * numbers:     tabular, always
 * ```
 *
 * ## It extends the chat language rather than switching to a data-grid look
 *
 * "Six of the nine screens in this product are dense operational tables. Extend
 * the chat language rather than switching to a generic data-grid look — row
 * height, hairline weight and hover fill all derive from the sidebar's nav-row
 * treatment, so the tables read as the same product."
 *
 * ## Real `<table>` semantics, and a real card list below 640px
 *
 * §5.1 requires the first; §5.8 requires the second — "every table row becomes a
 * card: title top-left, status pill top-right, remaining fields as a 2-column
 * label/value grid".
 *
 * Both are rendered and one is shown, rather than a JS breakpoint choosing. A
 * width read in JavaScript is wrong on the first paint, wrong after a rotation
 * until the listener fires, and wrong in every print stylesheet. The cost is
 * duplicate DOM; the cost of the alternative is a table on a phone.
 *
 * The caption is not decoration: a screen-reader user landing on a table needs
 * to know what it holds before reading forty cells of it.
 */
export type Density = 'comfortable' | 'compact';

export function OpsTable({
  caption,
  columns,
  widths,
  toolbar,
  density = 'comfortable',
  children,
  cards,
  footer,
  bare = false,
}: {
  /** Announced to screen readers. Visually hidden. */
  caption: string;
  columns: readonly string[];
  /**
   * The column proportions, as the handoff's `fr` values — §5.4 writes the
   * vessels table `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr`.
   *
   * Rendered as a `<colgroup>` of percentages with `table-fixed`, because an
   * auto-layout table sizes its columns from whatever text happens to be in
   * them: the same table draws differently on page 1 and page 2, and a reader
   * scanning down the ETA column loses it every time they page. Omit it and the
   * table lays out automatically, which is right where the handoff gives no
   * proportions.
   */
  widths?: readonly number[];
  toolbar?: ReactNode;
  density?: Density;
  /** `<tr>` rows. Use `OpsCell` for each cell so the type scale stays one thing. */
  children: ReactNode;
  /** The same rows as cards, for ≤640px — §5.8. */
  cards?: ReactNode;
  /** Pagination, inside the container's bottom edge — §2.4. */
  footer?: ReactNode;
  /**
   * Drop the 16px card chrome, for a table that is already inside one.
   *
   * §5.9's tariff table is a **provenance card** with a table in it, so the
   * container, the border and the radius belong to `ProvenanceCard` and drawing
   * them again here would put a card inside a card. The primitives — the column
   * heads, the row heights, the hairlines, the hover, the ≤640px row cards —
   * stay in this one component either way, which is the point of it.
   *
   * Same shape as `Textarea`'s `bare`.
   */
  bare?: boolean;
}) {
  const totalFr = widths?.reduce((sum, fr) => sum + fr, 0) ?? 0;
  const Container = bare ? Fragment : Section;

  return (
    <Container>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-3">
          {toolbar}
        </div>
      ) : null}

      {/* ── 640px and up: the table ─────────────────────────────────────── */}
      <table className={cn('hidden w-full border-collapse sm:table', widths && 'table-fixed')}>
        <caption className="sr-only">{caption}</caption>
        {widths ? (
          <colgroup>
            {columns.map((column, index) => (
              <col
                key={column}
                style={{ width: `${(((widths[index] ?? 1) / totalFr) * 100).toFixed(2)}%` }}
              />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-border px-5 py-2.5 text-left text-micro font-semibold tracking-eyebrow text-ink-muted uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody data-density={density}>{children}</tbody>
      </table>

      {/* ── Below 640px: one card per row ───────────────────────────────── */}
      {cards ? <div className="flex flex-col gap-3 p-4 sm:hidden">{cards}</div> : null}

      {footer ? <div className="border-t border-border px-5 py-3.5">{footer}</div> : null}
    </Container>
  );
}

/** §5.1's container: 16px, hairline, surface-2, clipped so the rows meet the edge. */
function Section({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-panel border border-border bg-surface">
      {children}
    </section>
  );
}

/** One row. The height is the density, and the hover is the sidebar's nav row. */
export function OpsRow({
  density = 'comfortable',
  children,
}: {
  density?: Density;
  children: ReactNode;
}) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors duration-fast last:border-b-0 hover:bg-surface-muted',
        density === 'compact' ? 'h-row-compact' : 'h-row-comfortable'
      )}
    >
      {children}
    </tr>
  );
}

/**
 * One cell.
 *
 * `first` is the row's identifier — a vessel name, a flight number — and takes
 * `500 --text-1` where every other cell is `400 --text-2`. That one difference
 * is what lets a reader scan down a column of names without reading the rest.
 */
export function OpsCell({
  first = false,
  numeric = false,
  children,
}: {
  first?: boolean;
  numeric?: boolean;
  children: ReactNode;
}) {
  const Tag = first ? 'th' : 'td';
  return (
    <Tag
      {...(first ? { scope: 'row' as const } : {})}
      className={cn(
        'px-5 text-left text-label leading-5',
        first ? 'font-medium text-ink' : 'font-normal text-ink-muted',
        // "Numbers: tabular, always."
        numeric && 'tabular'
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * One row as a card, below 640px — §5.8.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 14px 16px; gap: 10px
 * top row:  title 500 14/22 --text-1 · status pill top-right, flex: none
 * grid:     2 columns, gap 8px; label 500 12/16 --text-3
 * ```
 *
 * **Status keeps the top-right corner** so a column of cards is still scannable.
 */
export function OpsRowCard({
  title,
  status,
  fields,
}: {
  title: ReactNode;
  /**
   * Optional, because not every table has one. A tariff row is a published
   * charge and carries no operational status; drawing an empty pill in the
   * corner would invent a state the row does not have.
   */
  status?: ReactNode;
  fields: readonly { label: string; value: ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-panel border border-border bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-body font-medium text-ink">{title}</p>
        {status ? <span className="shrink-0">{status}</span> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-caption font-medium text-ink-muted">{field.label}</dt>
            <dd className="text-label leading-5 text-ink">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
