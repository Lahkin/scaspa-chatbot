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
        className="mx-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-muted align-baseline text-caption text-ink-muted"
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
          /*
           * §3.5, settled: `height: 18px; padding: 0 6px; border-radius: 5px;
           * font: 600 11px/16px --brand-200; tabular`.
           *
           * It was a 20px circle at 12px. The difference is not decorative: a
           * round chip at citation size reads as a status dot, and the whole of
           * board 00c is arranged so that round means status and square-ish
           * means something else.
           */
          'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-tiny px-1.5',
          'text-micro font-semibold tabular',
          'transition-colors duration-fast ease-out-soft',
          highlighted
            ? 'bg-brand-700 text-ink-inverse ring-2 ring-brand-400'
            : // Board 14: the settled citation chip is a brand tint carrying
              // brand-200 — 6.37:1. It used to carry brand-700, which on that
              // tint is 1.02:1: two dark values that were a light ground and a
              // dark ink before the theme moved under them.
              // Hover DEEPENS the tint rather than brightening it: brand-200 on
              // brand-500 is 4.18:1, and the chip keeps its ink through the
              // state change. brand-700 gives 6.26:1 and reads as pressed-ward,
              // which is the direction a chip about to be activated should go.
              'bg-brand-tint text-brand-200 hover:bg-brand-700'
        )}
      >
        {index}
      </span>
    </button>
  );
}
