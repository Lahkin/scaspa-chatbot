import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * The operations list header — spec board 12.
 *
 * ## No pagination, and the count changes when a filter is typed
 *
 * "Positions, gates and advisories return the complete set and take no paging
 * parameters, so there is no pagination control here — filtering happens in the
 * client and the count changes to 'n of total shown' the moment a filter is
 * typed."
 *
 * That distinction is the component. `12 in total` is a fact about the feed;
 * `2 of 3 shown` is a fact about what the user is currently looking at, and
 * showing the first while a filter is active would misreport the feed as
 * smaller than it is.
 *
 * ## The active filter is echoed as a removable chip
 *
 * A filter that is only visible as text inside the input is easy to forget
 * about, and a forgotten filter looks exactly like missing data.
 */
export function OpsListHeader({
  title,
  total,
  shown,
  query,
  onQueryChange,
  placeholder,
}: {
  title: string;
  /** Everything the feed returned. */
  total: number;
  /** What survives the current filter. Equal to `total` when nothing is filtered. */
  shown: number;
  query: string;
  onQueryChange: (next: string) => void;
  placeholder: string;
}) {
  const inputId = useId();
  const filtering = query.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-panel border border-border bg-surface px-6 py-5">
      <div className="flex flex-1 flex-wrap items-baseline gap-2.5">
        <h2 className="text-section font-semibold whitespace-nowrap text-ink">{title}</h2>

        {/*
         * `role="status"`: a count that changes as you type is exactly the kind
         * of thing a screen-reader user needs told, and the table itself is far
         * too large to announce.
         */}
        <span role="status" className="text-label text-ink-muted tabular">
          {filtering ? `${shown} of ${total} shown` : `${total} in total`}
        </span>

        {filtering ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label={`Clear the filter “${query}”`}
            className="inline-flex h-6 items-center gap-1.5 rounded-pill border border-border bg-surface-muted pr-2 pl-2.5 text-caption font-medium text-ink-muted hover:text-ink"
          >
            &ldquo;{query}&rdquo;
            <Icon name="x" size={12} className="text-ink-subtle" />
          </button>
        ) : null}
      </div>

      <div className="flex h-11 w-55 shrink-0 items-center gap-2 rounded-input border border-border bg-surface-muted px-3 focus-within:border-brand-500 sm:h-9">
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <Icon
          name="filter"
          size={16}
          className={filtering ? 'text-brand-200' : 'text-ink-subtle'}
        />
        <input
          id={inputId}
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-full w-full bg-transparent text-label text-ink outline-none placeholder:text-ink-disabled"
        />
      </div>
    </div>
  );
}
