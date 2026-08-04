import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import type { CitationEntry, Grounding } from '@/features/chat/citations';
import { SourceEntry } from './SourceEntry';

/**
 * §3.8's four states, mapped onto the provenance badge's own vocabulary:
 * ALL CITED · PARTLY CITED · NO SOURCE · NOT CHECKED.
 */
const GROUNDING_BADGE = {
  all: 'all',
  partial: 'partial',
  none: 'none',
  unchecked: 'unchecked',
} as const;

/**
 * The list of sources for one answer.
 *
 * Split from the panel chrome so the same list renders in the docked desktop
 * column, the mobile bottom sheet and the widget's internal sheet without three
 * copies drifting apart.
 *
 * Cited sources come first, numbered to match their inline chips; sources that
 * were consulted but never quoted follow, unnumbered. Both are shown: hiding the
 * consulted-only ones would overstate how narrow the search was, and it is
 * evidence of work done.
 */
export function SourceList({
  entries,
  highlighted,
  onHighlight,
  scrollTo,
  grounding,
}: {
  entries: CitationEntry[];
  highlighted?: string | null | undefined;
  onHighlight?: ((id: string | null) => void) | undefined;
  /** kb id to scroll into view — set when a chip is activated. */
  scrollTo?: string | null | undefined;
  /**
   * How well the prose is sourced — §3.8. Omitted when the caller does not
   * know, and the badge is then absent rather than defaulting to NOT CHECKED.
   */
  grounding?: Grounding | undefined;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!scrollTo) return;
    /*
     * `li[data-kb-id]`, not `[data-kb-id]`.
     *
     * The citation *chip* carries the same attribute and appears earlier in the
     * document, so the unscoped selector matched the chip — scrolling to where
     * focus already was and then "focusing" it, which looked like success and
     * moved nothing. Entries are list items; chips are buttons.
     *
     * Queried from the document rather than from this list because on a wide
     * screen the docked panel and the sheet are both mounted.
     */
    const target = document.querySelector<HTMLElement>(`li[data-kb-id="${CSS.escape(scrollTo)}"]`);
    if (!target) return;

    // `block: 'nearest'` so an entry already in view is not shunted around; the
    // point is to reveal it, not to re-centre the panel.
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    /*
     * Focus follows.
     *
     * Without this a keyboard user presses a chip, the panel scrolls to an entry
     * they cannot see, and their focus is still in the middle of the answer —
     * the scroll happened for somebody else. `preventScroll` because the
     * scrollIntoView above has already chosen the position.
     */
    target.focus({ preventScroll: true });
  }, [scrollTo]);

  /*
   * ── ZERO SOURCES REMOVES THE SECTION, HEADING AND ALL ──────────────────────
   *
   * §3.7: "An empty 'Sources' heading implies one is loading." A heading with
   * nothing under it is read as a promise, and this product never has one to
   * make — if the backend vouched for nothing, there is nothing to show.
   */
  if (entries.length === 0) return null;

  /*
   * Cited first, then consulted-but-unquoted — the order the reconciliation
   * produced, so the numbers run 1, 2, 3 down the list and match the inline
   * chips exactly.
   *
   * ONE list and one header, not two sections. §3.7 gives the count three
   * treatments and no more: a single row carries no header at all, two to five
   * take a `"4 sources"` header numbered to match the markers, and zero removes
   * the section. The old "Cited in this answer" / "Sources consulted" split was
   * a second vocabulary for something the entries already say — an entry with
   * no index badge was never quoted, and that is visible without a heading
   * announcing it.
   */
  const ordered = [
    ...entries.filter((entry) => entry.index !== null),
    ...entries.filter((entry) => entry.index === null),
  ];

  return (
    <section aria-labelledby="sources-heading" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id="sources-heading"
          className={cn(
            'text-caption font-semibold text-ink-muted uppercase',
            // A single source needs no count: the row is the whole statement.
            // The heading stays in the tree for the landmark, visually hidden.
            ordered.length === 1 && 'sr-only'
          )}
        >
          {ordered.length === 1 ? 'Source' : `${ordered.length} sources`}
        </h3>

        {/*
          The grounding indicator — §3.8.

          "Placed at the head of the source list, not inline in the prose."
          Inline it would be a claim inside the sentence it is judging; here it
          is a statement about the whole answer, next to the evidence for it.

          Absent when the caller does not know yet, rather than defaulting to
          `NOT CHECKED` — a badge saying the answer was not checked, shown on an
          answer that simply has not finished arriving, is a worse lie than
          silence.
        */}
        {grounding ? <ProvenanceBadge kind="grounding" value={GROUNDING_BADGE[grounding]} /> : null}
      </div>

      <ul ref={listRef} className="space-y-2">
        {ordered.map((entry) => (
          <SourceEntry
            key={entry.citation.kb_id}
            entry={entry}
            highlighted={highlighted === entry.citation.kb_id}
            onHighlight={onHighlight}
          />
        ))}
      </ul>
    </section>
  );
}
