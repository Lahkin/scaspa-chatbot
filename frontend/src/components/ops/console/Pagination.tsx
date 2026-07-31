import { Button } from '@/components/ui';

/**
 * "Showing 1–10 of 42" plus previous and next.
 *
 * Previous/next rather than the mockup's numbered pages. Numbered pages need a
 * stable ordering to mean anything, and an arrivals board reorders itself as
 * ETAs change — "page 3" is a different set of vessels five minutes later, which
 * is a worse lie than having one fewer control. Offsets have the same weakness
 * but the range label makes the position explicit rather than implying a
 * bookmarkable page.
 *
 * The count is announced politely: someone filtering a table needs to know the
 * result count changed, and the table body itself is too large to announce.
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
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  const hasPrevious = offset > 0;
  const hasNext = last < total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-caption text-ops-ink-variant tabular">
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total} ${noun}`}
      </p>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={!hasPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={!hasNext}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
