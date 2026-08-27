import { MessageList } from '@/components/chat/MessageList';
import { SourceList } from '@/components/chat/SourceList';
import { reconcile } from '@/features/chat/citations';
import { REHEARSED_MESSAGES } from './rehearsedConversation';

/**
 * The demo failure drill.
 *
 * A recorded conversation, rendered from a local fixture with **no network at
 * all** — no fetch, no stream, no mock worker. If the venue wifi dies
 * mid-presentation the presenter switches here and keeps going.
 *
 * It is deliberately and visibly labelled as a recording. Passing a replay off as
 * a live answer would be the one unrecoverable thing to be caught doing in front
 * of judges, and the label costs nothing: the audience already knows the wifi has
 * failed, and showing a rehearsed fallback reads as preparation rather than as a
 * cover-up.
 *
 * Reached at `/dev/rehearsal`, dev only, and documented in the run book.
 */
export function Rehearsal() {
  const last = REHEARSED_MESSAGES[REHEARSED_MESSAGES.length - 2];
  const entries = last
    ? reconcile(last.text, last.citations ?? null, last.grounded ?? true).entries
    : [];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-ink">
      <div
        role="status"
        className="shrink-0 border-b border-amber-text/30 bg-amber-surface px-4 py-2"
      >
        <p className="text-small font-semibold text-amber-text">
          Rehearsed conversation — recorded, not live
        </p>
        <p className="text-caption text-ink-muted">
          Rendered from a local fixture with no network. Every figure is a placeholder.
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <MessageList messages={REHEARSED_MESSAGES} />
        </main>

        <aside
          aria-label="Sources"
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface-muted p-4 lg:block"
        >
          <h2 className="text-h3 font-semibold">Sources</h2>
          <p className="mt-1 mb-3 text-caption text-ink-subtle">
            Every factual claim shows where it came from and the date it was verified.
          </p>
          <SourceList entries={entries} />
        </aside>
      </div>
    </div>
  );
}

export default Rehearsal;
