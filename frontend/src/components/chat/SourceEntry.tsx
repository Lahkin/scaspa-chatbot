import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui';
import {
  entryLabel,
  needsConfirmation,
  sourceTypeLabel,
  volatilityOf,
  type CitationEntry,
} from '@/features/chat/citations';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * One source.
 *
 * **Volatility drives emphasis, and that is the whole safety story made visible.**
 *
 * The handbook's schedule rule exists because someone missing a ferry is a real
 * harm, not a legal disclaimer. A ferry departure verified four months ago and
 * shown as a confident fact is how that harm happens. So a `high` volatility row
 * says, prominently and in plain words, that it must be confirmed — with the
 * phone number right there as a `tel:` link, because "confirm with SCASPA" is
 * useless if confirming means going to find a number.
 *
 * A `low` row — "there is Wi-Fi at the cruise terminal" — shows its date quietly.
 * If everything shouted, nothing would.
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
  const volatility = volatilityOf(citation);
  const confirm = needsConfirmation(citation);
  const urgent = volatility === 'high';

  return (
    <li
      id={`source-${citation.kb_id}`}
      data-kb-id={citation.kb_id}
      onMouseEnter={() => onHighlight?.(citation.kb_id)}
      onMouseLeave={() => onHighlight?.(null)}
      className={cn(
        'scroll-mt-2 rounded-md border p-3 transition-colors duration-fast ease-out-soft',
        highlighted ? 'border-blue-600 bg-blue-50' : 'border-border bg-surface'
      )}
    >
      <div className="flex items-start gap-2">
        {/* The number ties the entry to its inline chip. Absent for a source that
            was consulted but never cited — numbering it would imply a chip that
            does not exist. */}
        {index !== null ? (
          <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 px-1 text-caption font-semibold text-blue-800 tabular">
            {index}
          </span>
        ) : (
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-caption text-ink-subtle">
            <span aria-hidden="true">·</span>
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-small font-semibold text-ink">{entryLabel(citation)}</p>

          {/* Only rendered when the backend sends one. An excerpt is never
              fabricated from the answer text — that would be the UI inventing
              evidence for itself. */}
          {citation.snippet ? (
            <p className="text-caption text-ink-muted">{citation.snippet}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="info" srPrefix="Source type: ">
              {sourceTypeLabel(citation.source_type)}
            </Badge>
            {index === null && (
              <span className="text-caption text-ink-subtle">consulted, not quoted</span>
            )}
          </div>

          {/* ── the date, weighted by volatility ─────────────────────────────── */}
          {urgent ? (
            <div className="mt-2 rounded-sm bg-amber-surface p-2">
              <p className="text-small font-semibold text-amber-text">
                Verified on <time dateTime={citation.as_of}>{citation.as_of}</time>
              </p>
              <p className="mt-1 text-caption text-ink-muted">
                Schedules change. <strong>Confirm with SCASPA before you travel.</strong>
              </p>
              <a
                href={SCASPA_TEL_HREF}
                className="mt-1 inline-flex min-h-touch items-center text-small font-medium text-blue-700 underline"
              >
                Call {SCASPA_TEL_TEXT}
              </a>
            </div>
          ) : confirm ? (
            <p className="text-caption text-ink-muted">
              Verified on <time dateTime={citation.as_of}>{citation.as_of}</time>. Confirm with{' '}
              <a href={SCASPA_TEL_HREF} className="font-medium text-blue-700 underline">
                SCASPA
              </a>{' '}
              before you rely on it.
            </p>
          ) : (
            <p className="text-caption text-ink-subtle">
              Verified on <time dateTime={citation.as_of}>{citation.as_of}</time>
            </p>
          )}

          <a
            href={citation.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-touch items-center text-caption text-blue-700 underline underline-offset-2"
          >
            View the source
            <span aria-hidden="true"> ↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </li>
  );
}
