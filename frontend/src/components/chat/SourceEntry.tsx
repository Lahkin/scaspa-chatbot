import { cn } from '@/lib/cn';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import {
  entryLabel,
  sourceTypeLabel,
  volatilityIsDefaulted,
  volatilityOf,
  type CitationEntry,
} from '@/features/chat/citations';

/**
 * One source — the citation chip of §3.7.
 *
 * ```
 * display: flex; gap: 12px; padding: 14px 16px;
 * --surface-2; 1px solid --border; border-radius: 12px
 * index badge 22 × 22, radius 6, brand tint, 600 11/16 --brand-200, tabular
 * title 500 13/18 --text-1 · volatility badge · verified-date badge
 * snippet 400 13/20 --text-2, in quotes
 * source type 500 12/16 --brand-300, as the trailing meta line
 * ```
 *
 * ## The four null cases, and each is a rule rather than a fallback
 *
 * | Field            | Rendering                                              |
 * | ---------------- | ------------------------------------------------------ |
 * | `label: null`    | `Untitled source`, italic. **Never falls back to the id.** |
 * | `snippet: null`  | "No extract available for this source." **Never fabricated.** |
 * | `source_url: ""` | No link at all; the meta line reads `· no link recorded`. |
 * | `volatility: null` | The cautious badge, ringed so the fallback is visible. |
 *
 * Scraped pages and PDFs genuinely have no extract, so inventing one would be
 * the single worst thing this component could do: a snippet is read as a quote
 * from the source.
 *
 * ## What this replaced
 *
 * A card that escalated by volatility — an amber panel with "Confirm with
 * SCASPA before you travel" and a phone number on a `high` row, a quieter line
 * on `medium`, a bare date on `low`. The instinct was right and the treatment
 * was not the handoff's: volatility is carried by a **badge** here, in the same
 * family and the same shape as everywhere else in the product, so a reader
 * learns one vocabulary rather than two. The escalation block on every refusal
 * and every error is where the phone number belongs, and it is always there.
 */
export function SourceEntry({
  entry,
  highlighted,
  onHighlight,
}: {
  entry: CitationEntry;
  highlighted: boolean;
  onHighlight?: ((id: string | null) => void) | undefined;
}) {
  const { citation, index } = entry;
  const label = entryLabel(citation);
  /** True when the backend sent no label and the name above was derived. */
  const untitled = !citation.label;
  const hasLink = citation.source_url.trim().length > 0;

  return (
    <li
      id={`source-${citation.kb_id}`}
      data-kb-id={citation.kb_id}
      /*
       * Focusable programmatically, but not a tab stop.
       *
       * Activating a citation chip must move focus *into* the panel — otherwise
       * a keyboard user presses the chip, the panel scrolls somewhere they
       * cannot see, and their focus is still in the middle of the answer. `-1`
       * makes it a valid focus target without adding an entry to the tab order
       * for every source, which would bury the controls after it.
       */
      tabIndex={-1}
      onMouseEnter={() => onHighlight?.(citation.kb_id)}
      onMouseLeave={() => onHighlight?.(null)}
      className={cn(
        'flex scroll-mt-2 gap-3 rounded-input border p-3.5',
        'transition-colors duration-fast ease-out-soft',
        highlighted ? 'border-brand-500 bg-brand-tint' : 'border-border bg-surface'
      )}
    >
      {/*
        The index badge, tying the entry to its inline chip. Absent for a source
        that was consulted but never cited — numbering it would imply a chip
        that does not exist.
      */}
      {index !== null ? (
        <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-small bg-brand-tint text-micro font-semibold text-brand-200 tabular">
          {index}
        </span>
      ) : (
        <span className="w-[22px] shrink-0" aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            `Untitled source`, italic, and never the id. An id in a title slot
            looks like a name to anyone who does not know the schema.
          */}
          <span
            className={cn(
              'text-label font-medium',
              untitled ? 'text-ink-muted italic' : 'text-ink'
            )}
          >
            {untitled ? 'Untitled source' : label}
          </span>

          <ProvenanceBadge
            kind="volatility"
            value={volatilityOf(citation)}
            defaulted={volatilityIsDefaulted(citation)}
          />
          <ProvenanceBadge kind="checked" date={citation.as_of || null} />
        </div>

        {/*
          The extract, in quotes, or a sentence saying there is none.

          Never fabricated and never summarised — it is copied verbatim from the
          indexed row, and a scraped page or a PDF genuinely has none.
        */}
        {citation.snippet ? (
          <p className="text-label leading-5 text-ink-muted">&ldquo;{citation.snippet}&rdquo;</p>
        ) : (
          /*
           * §3.7 sets this line in `--text-3`, which is 3.74:1 and documented
           * "placeholder and disabled only" by §5.3 — and §7 calls the 4.5:1
           * requirement non-negotiable. The requirement wins, as it does for
           * the sidebar's eyebrow labels.
           *
           * Italic rather than a dimmer ink is what keeps it distinct from a
           * real extract: this is a statement ABOUT the source, not a quotation
           * FROM it, and the two must not be confusable at a glance.
           */
          <p className="text-label leading-5 text-ink-muted italic">
            No extract available for this source.
          </p>
        )}

        {/*
          The trailing meta line: the source type, and then either a link or the
          statement that none was recorded. **No dead anchor.**
        */}
        <p className="text-caption font-medium text-brand-300">
          {sourceTypeLabel(citation.source_type)}
          {hasLink ? (
            <>
              {' · '}
              <a
                href={citation.source_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand-200 underline underline-offset-[3px] hover:text-brand-100"
              >
                Open the source
              </a>
            </>
          ) : (
            <span className="text-ink-muted"> · no link recorded</span>
          )}
        </p>
      </div>
    </li>
  );
}
