import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import { SeverityChip } from './StatusChip';
import type { MarineAdvisory, OperationalAdvisory } from '@/lib/types';

/**
 * Advisories — spec board 17 (operational) and board 20 (marine).
 *
 * ## The assistant never authors one
 *
 * "Always attributed to whoever published it, with a time. The assistant never
 * authors an advisory, and the panel never implies a forecast this service
 * produced." So every rendered notice carries a source and a timestamp, and
 * there is no code path that composes advisory text.
 *
 * ## Three fills, and the third is nothing at all
 *
 * §5.6 draws the panel in three states:
 *
 * | Full     | `--caution-fill`, `1px solid rgba(217,162,59,0.3)`, caution megaphone,
 * |          | attribution line, body                                              |
 * | Partial  | `--surface-3`, `1px solid --border`, `--text-3` megaphone, body only |
 * | Absent   | **not rendered** — no empty container, no "no advisories" line       |
 *
 * The third is the one that needs saying out loud: an empty advisory panel with
 * a heading implies a notice is loading, and the "no notice was published"
 * treatment belongs to the Console's advisory *list*, where it gets the
 * deliberate not-an-all-clear wording (§6.2).
 *
 * ## The full fill is gated on attribution, and today nothing supplies it
 *
 * The caution fill IS the claim that a named authority published this. Drawing
 * it over text with no publisher and no time is the panel implying the forecast
 * is ours, which is the one thing §5.6 exists to prevent — so without
 * attribution it falls back to the partial fill, which makes no such claim.
 *
 * **`OperationalAdvisory` carries no publisher and no published time** — only
 * `headline`, `detail`, `temperature_c` and `systems_status`. The full fill is
 * therefore unreachable until the wire grows them, exactly like the other gated
 * components in `08-blocked-and-forbidden.md`: built, not enabled, and waiting
 * on a named field rather than on a guess.
 */
export function OperationalAdvisoryPanel({
  advisory,
  publishedBy,
  at,
}: {
  advisory: OperationalAdvisory | null;
  /** **BLOCKED** — needs `published_by` on `OperationalAdvisory`. */
  publishedBy?: string | undefined;
  /** **BLOCKED** — needs `published_at` on `OperationalAdvisory`. */
  at?: string | null | undefined;
}) {
  // Not rendered at all — see above.
  if (!advisory) return null;

  const attributed = Boolean(publishedBy);

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-input p-3.5',
        attributed
          ? 'border border-caution-notice-edge bg-caution-tint'
          : 'border border-border bg-surface-muted'
      )}
    >
      <Icon
        name="megaphone"
        size={16}
        className={cn('mt-0.5', attributed ? 'text-caution' : 'text-ink-muted')}
      />
      <div className="flex flex-col gap-0.5">
        {/* Attribution first: who said this, and when. */}
        {publishedBy ? (
          <span className="text-label font-medium text-caution tabular">
            Published by {publishedBy}
            {at ? `, ${at}` : ''}
          </span>
        ) : null}
        <span className="text-label font-medium text-ink">{advisory.headline}</span>
        <span className="text-label text-ink-muted">{advisory.detail}</span>
      </div>
    </div>
  );
}

/**
 * Marine advisories — §6.9, and the one empty state in the product drawn in
 * caution rather than neutral.
 *
 * ```
 * header: 600 16/24 --text-1 "Advisories" + 500 13/18 --text-2 "0 in total"
 * empty:  padding 24px 16px; --caution-fill; border-bottom
 *         16px alert --caution + 500 14/22 --text-1
 *         body 400 13/20 --text-2
 * ```
 *
 * ## An empty list is NOT an all-clear
 *
 * The API contract says it, the handoff says it twice, and it is the only place
 * either does:
 *
 * > "**No notice has been published to this assistant.** That is not
 * > confirmation that conditions are normal. Telephone Marine Operations on
 * > 869 465 8121 before sailing."
 *
 * A quiet screen read as safety has physical consequences here — someone
 * decides to sail. So the empty state is amber, not grey; it says what it does
 * not know rather than what is fine; there is no tick, no green chip and no use
 * of the word "clear" anywhere in it; **and the panel renders when empty**,
 * because a panel that disappears teaches the reader that its absence is good
 * news.
 *
 * The number is the last thing missing from that sentence and it was missing:
 * "telephone Marine Operations" without a number is advice a reader cannot act
 * on from the screen they are looking at.
 */
export function MarineAdvisoryPanel({
  advisories,
  total,
}: {
  advisories: MarineAdvisory[];
  total: number;
}) {
  return (
    <section className="overflow-hidden rounded-panel border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3.5">
        <h3 className="text-section font-semibold text-ink">Advisories</h3>
        <span className="text-label text-ink-muted tabular">{total} in total</span>
      </div>

      {advisories.length === 0 ? (
        <div
          // `alert`, not `status`. Arriving at a sailing decision with no notice
          // published is something the reader has to be told, not something
          // they might notice.
          role="alert"
          className="flex flex-col items-start gap-2.5 border-b border-border bg-caution-tint px-4 py-6"
        >
          <div className="flex items-center gap-2.5">
            <Icon name="alert" size={16} className="text-caution" />
            <span className="text-body font-medium text-ink">
              No notice has been published to this assistant
            </span>
          </div>
          <p className="text-label leading-5 text-ink-muted">
            That is not confirmation that conditions are normal. Telephone Marine Operations on{' '}
            <a href={SCASPA_TEL_HREF} className="font-medium text-brand-200 underline tabular">
              {SCASPA_TEL_TEXT}
            </a>{' '}
            before sailing.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {advisories.map((advisory) => (
            <li key={advisory.id} className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <SeverityChip severity={advisory.severity} size="sm" />
                <span className="text-label font-medium text-ink">{advisory.headline}</span>
              </div>
              <p className="text-label text-ink-muted">{advisory.detail}</p>
              {/*
                Attribution, always — and in §10's form.
                `toLocaleString()` writes `8/1/2026, 6:10:00 AM` on a
                US-configured browser. On a notice to mariners that is the
                fourth instance of the same defect (F018, F019, F021) and the
                one where a misread time has physical consequences.
              */}
              <span className="text-caption font-medium text-ink-muted tabular">
                {advisory.port}
                {advisory.issued_at ? ` · issued ${issuedAt(advisory.issued_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/*
        Kept from the panel this replaced, and not drawn by §6.9.
        A populated list is the case where a reader might treat this as the
        official notice to mariners. It is not one, and saying so costs a line.
      */}
      {advisories.length > 0 ? (
        <p className="border-t border-border px-4 py-3 text-caption font-medium text-ink-muted">
          Not an official notice to mariners. Confirm with the maritime authority.
        </p>
      ) : null}
    </section>
  );
}

/** `06:10 AST, 1 Aug 2026` — §10, 24-hour with the zone. */
const ISSUED = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
  day: 'numeric',
  month: 'short',
});

function issuedAt(value: string): string {
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? value : ISSUED.format(when);
}
