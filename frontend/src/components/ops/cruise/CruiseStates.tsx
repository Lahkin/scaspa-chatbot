import { AskPilot } from '@/components/ops/AskPilot';
import { Icon } from '@/components/ui/Icon';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * The published schedule's two non-error empty states.
 *
 * ── THEY ARE DIFFERENT PANELS BECAUSE THEY ARE DIFFERENT FACTS ───────────────
 *
 * | | |
 * | --- | --- |
 * | `NothingPublished` | The schedule was fetched, and SCASPA lists no cruise call in this window. **An answer**, and usually a correct one — St Kitts has quiet weeks. Nothing is wrong and nothing needs doing. |
 * | `ScheduleUnavailable` | Pilot has not managed to retrieve the schedule at all. **A statement about this service**, and the reader should go to the source or to a telephone. |
 *
 * On screen both are an empty table. Rendering them the same way would let an
 * outage read as a quiet week, which is the more expensive of the two mistakes:
 * a passenger who is told "no ships on Tuesday" stops looking.
 */

const RANGE_PHRASE: Record<string, string> = {
  today: 'today',
  tomorrow: 'tomorrow',
  week: 'in the next seven days',
  upcoming: 'for any upcoming date',
};

/**
 * SCASPA has published nothing for this window.
 *
 * Note what this panel does **not** say: it does not apologise, does not
 * suggest anything is broken, and does not offer to retry. It reports a fact
 * about the Authority's schedule.
 */
export function NothingPublished({ range, onWiden }: { range: string; onWiden: () => void }) {
  const phrase = RANGE_PHRASE[range] ?? 'in this period';

  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-input bg-surface-muted text-brand-300"
      >
        <Icon name="ship" size={20} />
      </span>
      <h3 className="text-section font-semibold text-ink">
        No cruise calls are published {phrase}
      </h3>
      <p className="max-w-105 text-label leading-5 text-ink-muted">
        SCASPA’s published schedule lists no cruise ship {phrase}. That is the schedule, not a gap
        in it — quiet days are ordinary at Port Zante.
      </p>
      {/*
        The one useful action. `All upcoming` is the widest window this screen
        can ask for, so a reader who expected a ship can see when it is actually
        due rather than concluding it is not coming.
      */}
      {range === 'upcoming' ? null : (
        <button
          type="button"
          onClick={onWiden}
          className="inline-flex min-h-touch items-center gap-2 rounded-button border border-border bg-surface-muted px-3.5 text-label font-medium text-ink hover:border-aqua-strong"
        >
          <Icon name="clock" size={16} />
          Show every upcoming call
        </button>
      )}
    </div>
  );
}

/**
 * Watchtower has never successfully retrieved the schedule.
 *
 * The sentence that matters is the second one. "The schedule could not be
 * retrieved" describes a deficiency; "Pilot will not guess which ships are
 * calling" describes the rule that makes every answer it *does* give worth
 * believing — and this is the one moment the product has nothing to show, so it
 * is the one moment that rule is worth stating.
 */
export function ScheduleUnavailable() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-border bg-surface px-6 py-8">
      <h3 className="text-section font-semibold text-ink">
        The published cruise schedule could not be retrieved
      </h3>
      <p className="max-w-105 text-label leading-5 text-ink-muted">
        <strong className="font-semibold text-ink">
          Pilot will not guess which ships are calling.
        </strong>{' '}
        SCASPA publishes the schedule on its own website, and Marine Operations can confirm a call
        by telephone on{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-brand-300 underline tabular">
          {SCASPA_TEL_TEXT}
        </a>
        .
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <PublishedScheduleLink />
        <AskPilot question="How do I contact SCASPA Marine Operations?" />
      </div>
    </div>
  );
}

/**
 * SCASPA's own page — the **human** page, never the API endpoint.
 *
 * The endpoint Watchtower reads is a Google Apps Script URL that returns JSON.
 * It is the Authority's own, and it is still not somewhere to send a person, so
 * `registry.Source` carries `page_url` separately and this is the only address
 * that ever reaches a reader.
 */
export function PublishedScheduleLink() {
  return (
    <a
      href="https://www.scaspa.com/cruise-ship-schedule.html"
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-h-touch items-center gap-2 rounded-button border border-border bg-surface-muted px-3.5 text-label font-medium text-ink hover:border-aqua-strong"
    >
      <Icon name="file" size={16} />
      View the published schedule
      <span className="sr-only"> on scaspa.com, opens in a new tab</span>
    </a>
  );
}
