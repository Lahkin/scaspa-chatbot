import { Icon } from '@/components/ui/Icon';

/**
 * The zero-results state — spec board 01, right-hand panel.
 *
 * ## The table and the pagination control are both removed
 *
 * "An empty table with a 'Showing 0–0 of 0' readout reads as a fault." So this
 * replaces both, rather than sitting under an empty header row with a control
 * that has nothing to page.
 *
 * ## It names the filters, because that is what is actually wrong
 *
 * "The state names the active filters and the one action that resolves it."
 * Nothing in the record matched all of them **at once**, which is a different
 * statement from "there is no data" — and a user who cannot see which three
 * filters are applied will conclude the second.
 *
 * Each chip is individually removable, so a user who wants to keep two of the
 * three does not have to start again.
 */
export interface ActiveFilter {
  /** What the filter is on, e.g. "Berth". */
  label: string;
  /** What it is set to, e.g. "3". */
  value: string;
  /** Removes just this one. */
  onClear: () => void;
}

export function NoResults({
  noun,
  total,
  filters,
  onClearAll,
}: {
  /** Plural, e.g. "vessel movements". */
  noun: string;
  /** How many there are with no filters at all — the size of what they are missing. */
  total?: number | undefined;
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-5 rounded-panel border border-border bg-surface p-8"
    >
      <span className="flex size-11 items-center justify-center rounded-input border border-border bg-surface-muted text-brand-300">
        <Icon name="filter" size={20} />
      </span>

      <div className="flex flex-col gap-2">
        <h3 className="text-section font-semibold text-ink">No {noun} match these filters</h3>
        <p className="max-w-105 text-body text-ink-muted">
          Nothing in the record matches all of them at once.{' '}
          {total === undefined
            ? 'Clear them to see the full list.'
            : `Clear them to see the full list of ${total} ${noun}.`}
        </p>
      </div>

      {filters.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <li key={`${filter.label}-${filter.value}`}>
              <button
                type="button"
                onClick={filter.onClear}
                aria-label={`Remove the ${filter.label} filter`}
                className="inline-flex h-7 items-center gap-2 rounded-pill border border-border bg-surface-muted pr-1.5 pl-3 text-caption font-medium text-ink-muted hover:text-ink"
              >
                {filter.label} <span className="text-ink">{filter.value}</span>
                <span className="flex size-4.5 items-center justify-center rounded-full text-ink-subtle">
                  <Icon name="x" size={12} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex min-h-touch items-center gap-2 rounded-button bg-brand-500 px-4 text-label font-medium text-ink-inverse hover:bg-brand-600 active:bg-brand-700"
      >
        <Icon name="refresh" size={16} />
        Clear filters
      </button>
    </div>
  );
}
