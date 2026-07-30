import { cn } from '@/lib/cn';
import { useCitations } from './CitationContext';
import { entryLabel } from '@/features/chat/citations';

/**
 * An inline citation.
 *
 * **Numbered, not identified.** It shows `1`, `2`, `3` in order of first
 * appearance, never `kb-014`. A reader does not care about our row ids, and
 * showing one makes an answer look like a database dump rather than something a
 * person can act on. The id is still in the DOM as a `data-` attribute, so the
 * panel can be matched to it and a developer can still see it.
 *
 * **44px minimum touch target.** The visible chip is small on purpose — it sits
 * mid-sentence and must not break the line — so the target is enlarged with
 * padding and a minimum size rather than by making the chip itself bigger.
 *
 * Three states:
 *   - `pending`   — the citations event has not arrived. Neutral, non-interactive.
 *   - `resolved`  — verified. Numbered, tappable, linked to the panel.
 *   - `unverified`— renders **nothing at all**. See features/chat/citations.ts.
 */
export function CitationChip({ kbId }: { kbId: string }) {
  const context = useCitations();
  const state = context?.reconciliation.markers.get(kbId);

  // No context, or an id the reconciliation never saw: render nothing rather
  // than falling back to the raw marker text.
  if (!context || !state) return null;

  if (state.status === 'unverified') {
    // The whole point of the rule. Not a placeholder, not the raw `[kb-047]` —
    // nothing.
    return null;
  }

  if (state.status === 'pending') {
    return (
      <span
        data-kb-id={kbId}
        aria-hidden="true"
        className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 align-baseline text-caption text-ink-subtle"
      >
        {/* Deliberately not a number: numbering before reconciliation would be a
            number that might change or vanish. A neutral dot says "being
            checked" without asserting anything. */}
        <span className="block h-1 w-1 rounded-full bg-neutral-500" />
      </span>
    );
  }

  const { index, citation } = state;
  const highlighted = context.highlighted === kbId;
  const label = entryLabel(citation);

  return (
    <button
      type="button"
      data-kb-id={kbId}
      onClick={() => context.openSource(kbId)}
      onMouseEnter={() => context.setHighlighted(kbId)}
      onMouseLeave={() => context.setHighlighted(null)}
      onFocus={() => context.setHighlighted(kbId)}
      onBlur={() => context.setHighlighted(null)}
      // The accessible name carries what the number cannot. "1" alone is
      // meaningless to a screen reader.
      aria-label={`Source ${index}: ${label}. Verified ${citation.as_of}. Open the sources panel.`}
      className={cn(
        // A 44px target around a 20px chip: the padding is the target, the
        // background is the chip. Negative margin keeps the line height intact so
        // a citation mid-paragraph does not push the lines apart.
        'relative -my-3 inline-flex min-h-touch min-w-touch items-center justify-center px-1 py-3 align-baseline',
        'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption font-semibold tabular',
          'transition-colors duration-fast ease-out-soft',
          highlighted
            ? 'bg-blue-800 text-ink-inverse ring-2 ring-blue-400'
            : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
        )}
      >
        {index}
      </span>
    </button>
  );
}
