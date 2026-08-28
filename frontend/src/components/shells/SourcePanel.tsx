import { Card } from '@/components/ui';
import { SourceList } from '@/components/chat/SourceList';
import type { Grounding } from '@/features/chat/citations';
import type { CitationEntry } from '@/features/chat/citations';
import { useStrings } from '@/features/i18n';

/**
 * The sources for the current answer.
 *
 * One component, three placements — docked column on a wide screen, bottom sheet
 * on a phone, internal sheet in the widget — because the *content* is identical
 * and only the container differs. Duplicating it per placement is how the mobile
 * one ends up a version behind.
 *
 * Sources are not decoration. "Where did that come from, and when was it checked"
 * is the difference between an answer a passenger acts on and one they ring up to
 * confirm anyway.
 */
export function SourcePanel({
  headed = true,
  entries = [],
  grounding,
  highlighted,
  onHighlight,
  scrollTo,
}: {
  /**
   * Omit the panel's own heading when the container already provides one.
   *
   * Inside a `Sheet` it does: the sheet renders "Sources" in its header, and the
   * panel rendering it again gave the dialog two identical `<h2>`s. Harmless to
   * look at, confusing to hear.
   */
  headed?: boolean;
  entries?: CitationEntry[];
  /** How well the answer is sourced — §3.8, shown at the head of the list. */
  grounding?: Grounding | undefined;
  highlighted?: string | null | undefined;
  onHighlight?: ((id: string | null) => void) | undefined;
  scrollTo?: string | null | undefined;
}) {
  const t = useStrings();
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {headed ? (
        <div>
          <h2 className="text-h3 font-semibold">{t.shell.sources}</h2>
          <p className="mt-1 text-caption text-ink-subtle">{t.sources.lead}</p>
        </div>
      ) : (
        <p className="text-caption text-ink-subtle">{t.sources.lead}</p>
      )}

      {entries.length === 0 ? (
        <Card title={t.sources.emptyTitle} tone="muted">
          <p className="text-small text-ink-muted">{t.sources.emptyBody}</p>
        </Card>
      ) : (
        <SourceList
          entries={entries}
          grounding={grounding}
          highlighted={highlighted}
          onHighlight={onHighlight}
          scrollTo={scrollTo}
        />
      )}

      <div className="mt-auto border-t border-border pt-3">
        <p className="text-caption text-ink-subtle">{t.sources.snapshotNote}</p>
      </div>
    </div>
  );
}
