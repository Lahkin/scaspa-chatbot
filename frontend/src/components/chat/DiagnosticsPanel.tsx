import { Disclosure } from '@/components/ui/Disclosure';
import { Icon } from '@/components/ui/Icon';

/**
 * The diagnostics panel — §3.14. Collapsed by default.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px
 * header: padding 14px 20px, 16px info glyph --text-3,
 *         500 13/18 --text-2 "Diagnostics", trailing chevron
 * rows:   padding 14px 20px, label 500 13/20 --text-2 left,
 *         value 500 13/20 --text-1 tabular right
 * ```
 *
 * | Label                  | Example |
 * | ---------------------- | ------- |
 * | Answer time            | `4.02 s`  |
 * | Records searched       | `1,284`   |
 * | Rate-limit keys tracked| `37`      |
 *
 * ## Every figure here comes from the server, and two of the three are honest
 *
 * `Answer time` is `latency_ms` off the response — the time the backend took,
 * not a stopwatch started in the browser, which would include the user's own
 * network and make a slow train look like a slow assistant.
 *
 * `Records searched` is `index.kb_rows` — how many knowledge-base rows exist to
 * search, not how many were retrieved. Null renders as "unknown" and **never as
 * 0**: zero rows is a fact about an index that was built, and a null is an index
 * that has not reported at all (§6.12 makes the same distinction).
 *
 * ## The third row is gated on a field this client cannot reach
 *
 * `tracked_clients` exists — `backend/app/ratelimit.py` computes it and
 * `backend/app/routers/admin.py` returns it — but **only from `/admin/stats`,
 * behind the administrator secret**. This panel sits beside an ordinary answer,
 * so the row is built and rendered only when a caller can supply the figure.
 * That is the `08-blocked-and-forbidden.md` pattern: draw it, gate it on the
 * named field, and ship it unchanged when the field lands.
 *
 * The footnote travels with the row rather than standing alone, because it
 * exists to qualify that one figure.
 *
 * ## The label is fixed and is not negotiable
 *
 * **"Rate-limit keys tracked"**, and the footnote under it. `tracked_clients` is
 * a count of hashed rate-limit keys — global rule 10 — and it is never labelled
 * users, visitors or addresses, because it is none of them: one person on two
 * networks is two keys, and a shared office is one.
 */
export function DiagnosticsPanel({
  latencyMs,
  recordsSearched,
  trackedKeys,
}: {
  /** `latency_ms` from the response or the `done` event. */
  latencyMs: number | null;
  /** `index.kb_rows` from health. Null is "unknown", never zero. */
  recordsSearched: number | null;
  /**
   * A count of hashed rate-limit keys.
   *
   * Undefined until a caller has one — see the note above. The row is then
   * absent rather than showing a placeholder, exactly like the sidebar's
   * data-source card.
   */
  trackedKeys?: number | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-surface">
      <Disclosure
        label={
          <span className="flex items-center gap-3">
            <Icon name="info" size={16} className="text-ink-muted" />
            <span className="text-label font-medium text-ink-muted">Diagnostics</span>
          </span>
        }
      >
        <dl>
          <Row label="Answer time" value={latencyMs === null ? null : formatSeconds(latencyMs)} />
          <Row
            label="Records searched"
            value={recordsSearched === null ? null : recordsSearched.toLocaleString('en-GB')}
          />
          {trackedKeys === undefined ? null : (
            <>
              <Row label="Rate-limit keys tracked" value={trackedKeys.toLocaleString('en-GB')} />
              <p className="px-5 pb-3.5 text-caption font-medium text-ink-muted">
                Hashed keys, not users, visitors or addresses.
              </p>
            </>
          )}
        </dl>
      </Disclosure>
    </div>
  );
}

/**
 * One row.
 *
 * A null value reads "unknown" rather than a dash: this panel's figures are all
 * counts and durations, and global rule 1 — "`null` is never `0`" — cuts both
 * ways here. An em dash in a diagnostics list looks like a measurement of
 * nothing; "unknown" says the server did not report.
 */
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <dt className="text-label leading-5 text-ink-muted">{label}</dt>
      <dd
        className={cnValue(value)}
        // Every figure in the product carries tabular figures.
      >
        {value ?? 'unknown'}
      </dd>
    </div>
  );
}

function cnValue(value: string | null): string {
  return value === null
    ? 'text-label leading-5 font-medium text-ink-muted'
    : 'text-label leading-5 font-medium text-ink tabular';
}

/** `4.02 s` — two decimals, the way the board writes it. */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}
