import { buildActivityFeed } from '@/features/ops/activity';
import type { DataSource, VesselArrival } from '@/lib/types';

/**
 * The console's one remaining side panel.
 *
 * ## Four of them moved out, because they existed twice
 *
 * Positions, gates and marine advisories were built here in the pre-handoff
 * palette **and** again under `ops/` to §6.7–6.9. Two implementations of the
 * marine panel meant two different empty-state sentences for the one empty
 * state in the product where a wrong sentence has physical consequences.
 *
 * `ops/PositionMap`, `ops/GateMap` and `ops/AdvisoryPanel`'s
 * `MarineAdvisoryPanel` are the ones the handoff draws. The versions that used
 * to be here are deleted rather than left behind: a dead component with passing
 * tests reads as covered, which is what got `VesselCard` and `FlightCard`
 * deleted on board 17.
 *
 * The fourth was the aviation advisory, and it went the same way for the same
 * reason — T-16, see the note further down. `OperationalAdvisoryPanel` now
 * draws both boards from one component.
 *
 * What stays is the one thing the handoff does not draw and this console still
 * needs: a restatement of the arrivals it sits beside.
 */

/**
 * Recent and expected movements.
 *
 * Every entry is a restatement of a row in the table beside it — see
 * `features/ops/activity.ts` for why it cannot say anything else, and in
 * particular why it will not say "docked" or "berth assignment updated".
 *
 * `now` is a **required prop**, not a `Date.now()` default. Reading the clock
 * during render is impure — React may render twice and get two answers — and it
 * also freezes the relative times at whatever they were on mount, which is worse
 * than showing none. Callers pass `useNow()`, which ticks; tests pass a fixed
 * number, which is what makes "12 minutes ago" assertable.
 */
export function ActivityPanel({
  vessels,
  source,
  now,
}: {
  vessels: VesselArrival[];
  source: DataSource | undefined;
  now: number;
}) {
  const entries = buildActivityFeed(vessels, now);

  return (
    <section
      aria-labelledby="activity-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="activity-heading" className="text-small font-semibold text-ops-ink">
        Recent movements
      </h2>

      {entries.length === 0 ? (
        <p className="mt-1 text-caption text-ops-ink-variant">
          {source?.kind === 'unavailable'
            ? 'No feed is connected, so there is nothing to report.'
            : 'No arrivals recorded in this data.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-2">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  entry.kind === 'arrived' ? 'bg-ops-active-fill' : 'bg-ops-transit-fill'
                }`}
              />
              <div className="min-w-0">
                <p className="text-small text-ops-ink">{entry.text}</p>
                <p className="text-caption text-ops-ink-variant">
                  {/* Said in words, not only by the dot's colour. An expected
                      movement must never read as one that happened. */}
                  {entry.kind === 'arrived' ? 'Recorded' : 'Expected'} ·{' '}
                  <time dateTime={entry.at}>{entry.relative}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-ops-outline-variant pt-2 text-caption text-ops-ink-variant">
        Derived from the arrivals above. This is not an operations log — berth changes, clearances
        and departures are not recorded here.
      </p>
    </section>
  );
}

/*
 * The weather and runway panel used to live here, as a second `AdvisoryPanel`.
 *
 * It rendered the same `OperationalAdvisory` as
 * `components/ops/AdvisoryPanel.tsx`, from an identical prop, differing only in
 * palette and in the two extra fields this board draws. T-16 merged the two:
 * it is now `<OperationalAdvisoryPanel tone="console" />`, and the console
 * rendering came across unchanged.
 */
