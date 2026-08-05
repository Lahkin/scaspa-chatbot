import { cn } from '@/lib/cn';
import type { DataSource } from '@/lib/types';

/**
 * The data-source status card — spec board 06.
 *
 * Pinned above the user row in the sidebar, 216px inside the 240px rail. It
 * says, permanently and without being asked, whether the operational figures
 * anywhere in this session are real.
 *
 * ── IT NEVER SAYS EVERYTHING IS FINE ─────────────────────────────────────────
 *
 * "The card never says 'everything is fine' — live simply states when it last
 * refreshed, and the user draws their own conclusion from the time." There is
 * no tick, no green "connected", no all-clear. A shipping agent reading
 * "Refreshed 14:32" at 18:00 knows something a green light would have hidden.
 *
 * ── AND UNAVAILABLE KEEPS ITS TIMESTAMP ──────────────────────────────────────
 *
 * "Unavailable keeps the last-known timestamp rather than hiding it. A shipping
 * agent needs to know whether the stale figure is an hour old or a day old."
 * So `as_of` is rendered in all three states and is only omitted when the feed
 * genuinely did not say.
 *
 * Fixture and unavailable are the two states to expect in practice: `live` is
 * the one kind that cannot currently occur, because SCASPA has published no
 * feed.
 */

interface Presentation {
  /** The dot's fill. Colour is never the only signal — the label carries it. */
  dot: string;
  headline: string;
  /** How the timestamp is introduced. Different words for a different claim. */
  stamp: (when: string) => string;
  /** Fixture is the only state whose detail line is a warning about conduct. */
  detail?: string;
}

const PRESENTATION: Record<DataSource['kind'], Presentation> = {
  fixture: {
    dot: 'bg-caution',
    headline: 'Sample data — not live',
    stamp: (when) => `Loaded ${when}`,
    detail: 'Figures come from the test fixture. Do not quote them to a customer.',
  },
  live: {
    dot: 'bg-live',
    headline: 'Live data',
    stamp: (when) => `Refreshed ${when}`,
  },
  /*
   * ── UNAVAILABLE IS NEUTRAL, NOT CRITICAL ─────────────────────────────────
   *
   * This was a solid red dot reading "Data unavailable", and both halves were
   * wrong. §5.4: "A feed that was never connected is a known state, not a
   * failure. Reserve critical for things that actually broke. Copy for this
   * state is 'No feed connected', never 'Error'."
   *
   * It is also the PRODUCTION DEFAULT — SCASPA has published no feed — so a red
   * alarm would be permanently on screen for every user, which is precisely how
   * a warning stops being read.
   *
   * The dot is hollow rather than filled, per §2.2: a ring says "nothing is
   * coming through" where a solid dot of any colour says "here is a state".
   */
  unavailable: {
    dot: 'border-[1.5px] border-neutral-status',
    headline: 'No feed connected',
    // "Last known", not "updated". The figure is old and the words say so.
    stamp: (when) => `Last known ${when}`,
  },
};

export function DataSourceCard({
  source,
  className,
}: {
  source: DataSource;
  className?: string | undefined;
}) {
  const presentation = PRESENTATION[source.kind];
  const when = formatStamp(source.as_of);

  return (
    <div
      // `status`, not `alert`. It is a standing condition of the session rather
      // than an event, and `alert` would interrupt a screen-reader user
      // mid-sentence every time an operations panel re-fetched.
      role="status"
      className={cn(
        'w-sidebar-card max-w-full rounded-md border border-border bg-surface-muted p-3',
        'flex flex-col gap-1.5',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', presentation.dot)} />
        <span className="text-label font-medium text-ink">{presentation.headline}</span>
      </div>

      {presentation.detail ? (
        <p className="text-caption font-medium text-ink-muted">{presentation.detail}</p>
      ) : null}

      {/*
       * The timestamp, when the feed gave one.
       *
       * Rendered from `as_of` and never from the time of the request. A card
       * that said "updated just now" because the CLIENT refreshed, while the
       * feed behind it last moved at 06:00, is worse than showing no time.
       */}
      {when ? (
        <p className="text-caption font-medium text-ink-muted tabular">
          {presentation.stamp(when)}
        </p>
      ) : (
        <p className="text-caption font-medium text-ink-muted">
          The source did not say when this was produced
        </p>
      )}
    </div>
  );
}

/**
 * `null` when absent or unparseable — never a guess, and never "now".
 *
 * ── 24-HOUR, WITH THE ZONE ──────────────────────────────────────────────────
 *
 * §10: "Times are 24-hour with the zone: `06:40 AST`. Dates are `1 Aug 2026` in
 * dense rows." This used to be `toLocaleString()`, which on a US-configured
 * browser renders `8/1/2026, 6:10:00 AM` — a 12-hour clock with no zone, in a
 * product where every other time on screen is 24-hour, and read by agents who
 * work in AST regardless of what their laptop is set to.
 *
 * `timeZoneName: 'short'` is what supplies AST rather than it being hard-coded,
 * so a reader in another zone is told which one they are looking at.
 */
const STAMP = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
  day: 'numeric',
  month: 'short',
});

function formatStamp(asOf: string | null): string | null {
  if (!asOf) return null;
  const when = new Date(asOf);
  if (Number.isNaN(when.getTime())) return null;
  return STAMP.format(when);
}
