import { useEffect, useRef } from 'react';
import type { CitationEntry } from '@/features/chat/citations';
import { SourceEntry } from './SourceEntry';

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
}: {
  entries: CitationEntry[];
  highlighted?: string | null | undefined;
  onHighlight?: ((id: string | null) => void) | undefined;
  /** kb id to scroll into view — set when a chip is activated. */
  scrollTo?: string | null | undefined;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!scrollTo) return;
    const target = listRef.current?.querySelector(`[data-kb-id="${CSS.escape(scrollTo)}"]`);
    // `block: 'nearest'` so an entry already in view is not shunted around; the
    // point is to reveal it, not to re-centre the panel.
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [scrollTo]);

  if (entries.length === 0) return null;

  const cited = entries.filter((entry) => entry.index !== null);
  const consulted = entries.filter((entry) => entry.index === null);

  return (
    <div className="space-y-4">
      {cited.length > 0 && (
        <section aria-labelledby="sources-cited">
          <h3
            id="sources-cited"
            className="mb-2 text-caption font-semibold text-ink-muted uppercase"
          >
            Cited in this answer
          </h3>
          <ul ref={listRef} className="space-y-2">
            {cited.map((entry) => (
              <SourceEntry
                key={entry.citation.kb_id}
                entry={entry}
                highlighted={highlighted === entry.citation.kb_id}
                onHighlight={onHighlight}
              />
            ))}
          </ul>
        </section>
      )}

      {consulted.length > 0 && (
        <section aria-labelledby="sources-consulted">
          <h3
            id="sources-consulted"
            className="mb-2 text-caption font-semibold text-ink-muted uppercase"
          >
            Sources consulted
          </h3>
          <ul className="space-y-2">
            {consulted.map((entry) => (
              <SourceEntry
                key={entry.citation.kb_id}
                entry={entry}
                highlighted={highlighted === entry.citation.kb_id}
                onHighlight={onHighlight}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
