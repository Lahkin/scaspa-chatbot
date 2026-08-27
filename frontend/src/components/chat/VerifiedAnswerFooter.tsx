import { Icon } from '@/components/ui/Icon';
import { entryLabel, sourceTypeLabel } from '@/features/chat/citations';
import type { Citation } from '@/lib/types';

/**
 * Where the answer came from, under the answer.
 *
 * ## This replaces "1 tool used · 361 ms"
 *
 * That line was the most developer-facing thing in the product. It told a
 * traveller standing on a pier how many function calls had run and how long
 * they took — a sentence about the machine, in the one place on screen where
 * they are deciding whether to believe a fact about a ferry.
 *
 * What belongs there is the evidence: which SCASPA source, and when it was last
 * checked. The timing has not been deleted, it has been demoted — it is inside
 * the collapsed trace, under a heading that says what it is.
 *
 * ## Every word comes from the citation
 *
 * `sourceTypeLabel` and `entryLabel` are the same helpers the sources rail uses,
 * so a source cannot be described one way beside the answer and another way in
 * the evidence panel. Nothing here is composed from anything the backend did not
 * send: no "probably", no "official-looking", no rewriting a category into
 * friendlier words. CLAUDE.md rule 6 — a citation the backend did not send is
 * not rendered, and that includes the description of one.
 *
 * ## It is absent, not empty
 *
 * No citation, no footer. A row reading "Source: —" under a refusal would be
 * claiming the refusal had a source, which is the precise failure the whole
 * citation chain exists to prevent.
 */

export interface VerifiedAnswerFooterProps {
  /** The first cited row. The rail carries the rest. */
  citation: Citation | null;
}

export function VerifiedAnswerFooter({ citation }: VerifiedAnswerFooterProps) {
  if (!citation) return null;

  const source = sourceTypeLabel(citation.source_type);
  const label = entryLabel(citation);
  const hasLink = Boolean(citation.source_url);

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-ink-subtle">
      <span>
        Source: {source} — {label}
      </span>

      {citation.as_of ? (
        <>
          <span aria-hidden="true">·</span>
          <span>
            Verified: <time dateTime={citation.as_of}>{citation.as_of}</time>
          </span>
        </>
      ) : null}

      {hasLink ? (
        <a
          href={citation.source_url ?? undefined}
          target="_blank"
          rel="noreferrer noopener"
          /*
           * The label says where it goes AND that it leaves. "Opens in a new
           * tab" is not decoration on a page a reader may be using one-handed
           * on a pier: a new tab they did not expect is a lost conversation.
           */
          aria-label={`Open the source for ${label} on the SCASPA website (opens in a new tab)`}
          className="inline-flex size-6 items-center justify-center rounded-sm text-brand-300 hover:text-ink"
        >
          <Icon name="arrow-right" size={14} aria-hidden="true" />
        </a>
      ) : null}
    </p>
  );
}
