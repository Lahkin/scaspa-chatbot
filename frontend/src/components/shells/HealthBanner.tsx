import { useState } from 'react';
import { isStale, useHealth } from '@/features/chat/queries';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * Says out loud when the service is not at full strength.
 *
 * Two levels, deliberately different in weight:
 *
 * **Degraded** (`status !== 'ok'`) — the index is missing or empty, so answers
 * will be poor or absent. Dismissible, because someone who has read it and
 * decided to carry on should not have to read it again on every question, and a
 * banner that cannot be dismissed gets ignored rather than obeyed.
 *
 * **Stale** (`kb_updated_at` older than the threshold) — a quiet note, not a
 * warning. The information may be entirely current; "last verified on 1 April"
 * is a fact the reader can weigh, and weighing it is the posture this whole
 * product takes. Dressing it as an alarm would be dishonest in the other
 * direction.
 *
 * Nothing technical is shown either way. `status`, `kb_rows` and the rest are
 * diagnostics; what a user needs is what it means for them and who to ring.
 */
export function HealthBanner() {
  const health = useHealth();
  const [dismissed, setDismissed] = useState(false);

  if (!health || dismissed) return null;

  const degraded = health.status !== 'ok';
  const stale = isStale(health);
  if (!degraded && !stale) return null;

  if (degraded) {
    return (
      <div
        role="status"
        data-health="degraded"
        className="flex items-start gap-3 border-b border-amber-text/30 bg-amber-surface px-4 py-2"
      >
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-amber-text">
            The assistant is not working properly at the moment
          </p>
          <p className="mt-0.5 text-caption text-ink-muted">
            Its information is being updated, so answers may be missing or incomplete. For anything
            you need now,{' '}
            <a href={SCASPA_TEL_HREF} className="font-medium text-blue-700 underline">
              call SCASPA on {SCASPA_TEL_TEXT}
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="min-h-touch shrink-0 px-2 text-caption font-medium text-ink-muted underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-health="stale"
      className="border-b border-border bg-surface-muted px-4 py-1.5"
    >
      <p className="text-caption text-ink-subtle">
        SCASPA information was last verified on{' '}
        <time dateTime={health.index.kb_updated_at ?? undefined}>{health.index.kb_updated_at}</time>
        . Please confirm anything time-sensitive before you rely on it.
      </p>
    </div>
  );
}
