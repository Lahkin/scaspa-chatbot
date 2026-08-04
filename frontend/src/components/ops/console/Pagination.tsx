import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ELLIPSIS, pageWindow } from './pageWindow';

/**
 * Pagination — spec board 01.
 *
 * "Driven by total, limit and offset. The readout always states the range,
 * never a bare page number."
 *
 * ## Numbered pages, and the objection that used to block them
 *
 * This was previous/next only, on the reasoning that an arrivals board reorders
 * itself as ETAs change — so "page 3" is a different set of vessels five
 * minutes later, which is a worse lie than one fewer control.
 *
 * The spec draws numbers, and its own annotation resolves the objection:
 * *"total 100 · limit 25 · offset 0."* The numbers are DERIVED from the offset
 * rather than being page identities — nothing here is bookmarkable, nothing is
 * addressable, and the range readout is still the primary statement of
 * position. A number is a shortcut to an offset, not a claim that the same rows
 * will be there later.
 *
 * ## Three collapses, each for its own reason
 *
 *   total === 0        Nothing renders. An empty table with "Showing 0–0 of 0"
 *                      reads as a fault; the caller shows the empty state.
 *   total <= limit     The readout only. Arrows that can never fire are furniture.
 *   below 640px        Two labelled 44px targets splitting the width. Numbered
 *                      pages are unusable at thumb size.
 *
 * ## Disabled arrows keep their place
 *
 * "The control must not reflow as the user pages." An arrow that disappears at
 * the first page moves every other control sideways at the exact moment
 * somebody is aiming at one.
 */
export function Pagination({
  offset,
  limit,
  total,
  onOffsetChange,
  noun,
}: {
  offset: number;
  limit: number;
  /** Matching records **before** paging. Without it there is no range to show. */
  total: number;
  onOffsetChange: (next: number) => void;
  /** Plural noun for the range label, e.g. "arrivals". */
  noun: string;
}) {
  // Nothing at all. The caller renders the zero-results state, which names the
  // filters and offers the one action that resolves it.
  if (total === 0) return null;

  const first = offset + 1;
  const last = Math.min(offset + limit, total);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.floor(offset / limit) + 1;
  const hasPrevious = offset > 0;
  const hasNext = last < total;

  /*
   * `Showing 1–25 of 100` — §2.4, verbatim.
   *
   * The noun used to be in the visible string. It is now only in the accessible
   * label: the handoff writes the readout exactly, and the column headings
   * above already say what is being counted, but a screen-reader user arriving
   * at a bare `role="status"` gets three numbers and no subject.
   */
  const readout = (
    <p role="status" aria-label={`Showing ${first} to ${last} of ${total} ${noun}`}>
      <span aria-hidden="true" className="text-label text-ink-muted tabular">
        Showing {first}–{last} of {total}
      </span>
    </p>
  );

  // One page: the readout is the whole control.
  if (pageCount === 1) {
    return <div className="flex flex-wrap items-center justify-between gap-4">{readout}</div>;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* Centred above the buttons on mobile, inline on desktop. */}
      <div className="w-full text-center sm:w-auto sm:text-left">{readout}</div>

      {/* ── Below 640px: two labelled targets, splitting the width ───────── */}
      <div className="flex w-full gap-2 sm:hidden">
        <MobileStep
          direction="previous"
          disabled={!hasPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        />
        <MobileStep
          direction="next"
          disabled={!hasNext}
          onClick={() => onOffsetChange(offset + limit)}
        />
      </div>

      {/* ── 640px and up: arrows with numbered pages between them ────────── */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <Arrow
          direction="previous"
          disabled={!hasPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        />

        {pageWindow(current, pageCount).map((page, index) =>
          page === ELLIPSIS ? (
            <span
              // Not a button: it is a gap, and a clickable "…" that guesses a
              // destination is worse than a label that admits there is one.
              key={`gap-${index}`}
              aria-hidden="true"
              className="flex h-8 min-w-8 items-center justify-center px-2.5 text-label text-ink-subtle"
            >
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              aria-label={`Page ${page} of ${pageCount}`}
              aria-current={page === current ? 'page' : undefined}
              onClick={() => onOffsetChange((page - 1) * limit)}
              className={cn(
                'flex h-8 min-w-8 items-center justify-center rounded-button px-2.5',
                'text-label font-medium tabular',
                'transition-colors duration-fast ease-out-soft',
                page === current
                  ? 'bg-brand-500 text-ink-inverse'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink active:bg-brand-700 active:text-ink-inverse'
              )}
            >
              {page}
            </button>
          )
        )}

        <Arrow
          direction="next"
          disabled={!hasNext}
          onClick={() => onOffsetChange(offset + limit)}
        />
      </div>
    </div>
  );
}

function Arrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === 'previous' ? 'Previous page' : 'Next page'}
      className={cn(
        'flex size-8 items-center justify-center rounded-button border border-border',
        'text-ink-muted',
        'transition-colors duration-fast ease-out-soft',
        'hover:bg-surface-muted hover:text-ink',
        'active:bg-border active:text-ink',
        // Kept in the row rather than hidden — the control must not reflow.
        'disabled:cursor-not-allowed disabled:border-surface-muted disabled:bg-transparent disabled:text-ink-disabled'
      )}
    >
      <Icon name={direction === 'previous' ? 'chevron-left' : 'chevron-right'} size={16} />
    </button>
  );
}

/** The mobile pair: labelled, 44px, and splitting the full width. */
function MobileStep({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const previous = direction === 'previous';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-touch flex-1 items-center justify-center gap-2 rounded-button border border-border',
        'text-label font-medium text-ink',
        'transition-colors duration-fast ease-out-soft',
        'hover:bg-surface-muted',
        'disabled:cursor-not-allowed disabled:border-surface-muted disabled:text-ink-disabled'
      )}
    >
      {previous ? <Icon name="arrow-left" size={16} /> : null}
      {previous ? 'Previous' : 'Next'}
      {previous ? null : <Icon name="arrow-right" size={16} />}
    </button>
  );
}
