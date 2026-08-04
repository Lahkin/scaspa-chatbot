import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/Chip';
import { ProvenanceBadge } from './ProvenanceBadge';
import { ProvenanceCard } from './ProvenanceCard';
import { OpsCell, OpsRow, OpsRowCard, OpsTable } from './OpsTable';
import { Pagination } from './console/Pagination';
import type { DataSource, TariffRow } from '@/lib/types';

/**
 * Step 1 — the published table. §5.9.
 *
 * ```
 * meta strip:  Port tariff schedule 2026 · as of 1 Apr 2026
 * toolbar:     padding 14px 20px; column; gap 12 — 280px search, then category chips
 * columns:     Code · Charge · Rate · Source   at 0.8fr 2fr 1fr 1.1fr, rows 44px
 * pagination:  the single-page collapse — readout only
 * ```
 *
 * ## Every figure here is quoted, and none is derived
 *
 * That is the whole difference between this component and `QuoteResult` below
 * it, and it is why the rate cell does no arithmetic of any kind:
 *
 * > "**Rendered exactly as published** — `186.00 per container`, `0.42`,
 * > `37.50 per day`. No rounding, no conversion, no normalised unit column."
 *
 * A "per day" column and a bare number would be tidier and would be a different
 * claim: the basis is part of the published rate, not metadata about it.
 *
 * ## The chips come from the whole table
 *
 * "Selecting 'Cargo' must never make the other four vanish and strand the user."
 * `TariffTableResponse.categories` is computed server-side from every row rather
 * than from the filtered slice, so the chip that clears the filter is still
 * there after the filter is applied. Nothing here derives them from `rows`.
 *
 * ## What this replaced
 *
 * A navy-headed zebra table with columns Code · Service · Basis · Rate ·
 * Verified, an amber rate column borrowed from a departure board, no meta strip
 * at all, and a sideways scroller at every width. It was the pre-handoff design
 * in the legacy `ops-*` palette.
 */
export function TariffTable({
  source,
  rows,
  total,
  categories,
  category,
  onCategoryChange,
  search,
  onSearchChange,
  offset,
  limit,
  onOffsetChange,
}: {
  /** Required, like every operations payload — implementation requirement #1. */
  source: DataSource;
  rows: readonly TariffRow[];
  /** Matching rows before paging. The server's figure, never a recount. */
  total: number;
  /** From the whole table. See above. */
  categories: readonly string[];
  category: string | null;
  onCategoryChange: (next: string | null) => void;
  search: string;
  onSearchChange: (next: string) => void;
  offset: number;
  limit: number;
  onOffsetChange: (next: number) => void;
}) {
  const filtered = Boolean(category) || search.trim().length > 0;

  return (
    <ProvenanceCard source={source} wide label="Published tariff schedule">
      {/* §5.9's toolbar: 14px 20px, a column, gap 12. */}
      <div className="flex flex-col gap-3 border-b border-border px-5 py-3.5">
        <div className="flex h-11 w-70 max-w-full items-center gap-2 rounded-input border border-border bg-surface-muted px-3 focus-within:border-brand-500 sm:h-9">
          <Icon name="search" size={16} className="text-ink-muted" />
          <label htmlFor="tariff-search" className="sr-only">
            Search code or description
          </label>
          <input
            id="tariff-search"
            type="search"
            value={search}
            placeholder="Search code or description"
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-full w-full bg-transparent text-label text-ink outline-none placeholder:text-ink-disabled"
          />
        </div>

        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((value) => (
              <Chip
                key={value}
                selected={category === value}
                // Pressing the selected chip clears it. The board draws five
                // category chips and no "All" — the selected one is the way
                // back, which is what `aria-pressed` announces.
                onClick={() => onCategoryChange(category === value ? null : value)}
              >
                {categoryLabel(value)}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyBody filtered={filtered} />
      ) : (
        <OpsTable
          bare
          caption="Published SCASPA tariffs: code, charge, rate and source"
          columns={COLUMNS}
          widths={WIDTHS}
          footer={
            <Pagination
              offset={offset}
              limit={limit}
              total={total}
              onOffsetChange={onOffsetChange}
              noun="published rates"
            />
          }
          cards={rows.map((row) => (
            <OpsRowCard
              key={row.code}
              title={row.service}
              fields={[
                { label: 'Code', value: <span className="tabular">{row.code}</span> },
                { label: 'Rate', value: <Rate row={row} /> },
                { label: 'Source', value: <SourceCell row={row} source={source} /> },
              ]}
            />
          ))}
        >
          {rows.map((row) => (
            <OpsRow key={row.code}>
              <OpsCell first numeric>
                {row.code}
              </OpsCell>
              <OpsCell>{row.service}</OpsCell>
              <OpsCell numeric>
                <span className="font-medium text-ink">
                  <Rate row={row} />
                </span>
              </OpsCell>
              <OpsCell>
                <SourceCell row={row} source={source} />
              </OpsCell>
            </OpsRow>
          ))}
        </OpsTable>
      )}
    </ProvenanceCard>
  );
}

const COLUMNS = ['Code', 'Charge', 'Rate', 'Source'] as const;
/** §5.9: `0.8fr 2fr 1fr 1.1fr`, in the order above. */
const WIDTHS = [0.8, 2, 1, 1.1] as const;

/**
 * The rate, exactly as published — the amount and the basis it applies to.
 *
 * `Intl` rather than `toFixed(2)`: a rate published to three decimal places
 * would be **rounded** by the second, and §5.9 forbids rounding in this cell by
 * name. The minimum of two keeps `186` printing as `186.00`, which is how the
 * schedule prints it.
 */
const RATE = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
});

function Rate({ row }: { row: TariffRow }) {
  return (
    <>
      {RATE.format(row.amount)}
      {row.basis ? ` ${row.basis}` : ''}
    </>
  );
}

/**
 * The source cell, and its two null cases — §5.9.
 *
 * ```
 * verified_date empty → NO CHECK DATE dashed badge beside the link
 * kb_id: null         → no link at all; the cell reads "No source recorded"
 * ```
 *
 * ## The link is BLOCKED, and the cell says only what it can stand behind
 *
 * §5.9 draws a citation link labelled with the source's title — `Schedule 2026`
 * — pointing at the knowledge-base row the rate was published in. `TariffRow`
 * carries `kb_id` and nothing else: **no title to label the link with, and no
 * route in this product that renders a knowledge-base row.** "Never a link to
 * nowhere" is the rule the null case exists to keep, and a `--brand-200` label
 * with no destination breaks it in the other direction — it looks clickable.
 *
 * So a sourced row names the feed the rate came from, in ordinary text, and
 * carries the verified-date badge, which is real. The link ships unchanged the
 * day `TariffRow` carries a title and a href.
 */
function SourceCell({ row, source }: { row: TariffRow; source: DataSource }) {
  if (row.kb_id === null) {
    // In words, not an em dash: "No source recorded" is a fact about the row,
    // and a dash is a fact about the cell. A reader cannot act on the second.
    return <span className="text-label leading-5 text-ink-muted">No source recorded</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-label leading-5 font-medium text-ink">{source.label}</span>
      <ProvenanceBadge kind="checked" date={formatCheckDate(row.as_of)} />
    </span>
  );
}

/**
 * `1 Apr 2026` — §10's dense-row date, not the wire's `2026-04-01`.
 *
 * ── PINNED TO UTC, AND THAT IS NOT A DETAIL ─────────────────────────────────
 *
 * `TariffRow.as_of` is a **plain date**: "ISO date the rate was verified". A
 * date-only string parses as UTC midnight, so formatting it in the reader's own
 * zone moves it backwards a day anywhere west of Greenwich — `2026-01-01`
 * renders as **31 Dec 2025** in AST, which is the zone this port is in and the
 * one nearly every reader of this table is in.
 *
 * A verification date is not an instant and has no zone to convert to. It is
 * the same day everywhere, so it is formatted as written.
 *
 * `DataSource.as_of` in the meta strip above is the opposite case — a real
 * moment, correctly shown in the reader's zone with the zone named.
 */
const CHECK_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatCheckDate(asOf: string): string | null {
  if (!asOf) return null;
  const when = new Date(asOf);
  if (Number.isNaN(when.getTime())) return asOf;
  return CHECK_DATE.format(when);
}

/**
 * Nothing to show.
 *
 * Two cases, kept apart for the same reason §5.7 keeps them apart on the
 * vessels table: one is about the query and one is about the schedule. The
 * second does not get a "no feed connected" card here, because this card
 * already has a meta strip saying exactly that — the vessels table has no
 * strip, which is why §5.7 gives it one.
 */
function EmptyBody({ filtered }: { filtered: boolean }) {
  return (
    <p className="px-5 py-7 text-label leading-5 text-ink-muted">
      {filtered
        ? 'No published rates match those filters. Clear the search, or choose another category.'
        : 'No published rates are available.'}
    </p>
  );
}

/**
 * `cargo` → `Cargo`, `vessel_dues` → `Vessel dues`.
 *
 * The wire's own value, **never a renaming** — which is why the backend enum
 * carries §5.9's words rather than this function translating into them. An
 * underscore becomes a space and nothing else changes; a chip whose label this
 * file invented would drift from the value the filter sends.
 */
function categoryLabel(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
