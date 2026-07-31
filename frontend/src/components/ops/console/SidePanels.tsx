import { buildActivityFeed } from '@/features/ops/activity';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import type { DataSource, OperationalAdvisory, VesselArrival } from '@/lib/types';

/**
 * The right-hand panels of the console.
 *
 * Three of the four in the design cannot be built honestly as drawn, and each
 * says so rather than being quietly dropped — a missing panel is invisible, and
 * "we have no AIS feed" is information an operations user actually wants.
 */

/**
 * The map.
 *
 * The design shows "Port Zante Traffic — visualising real-time vessel proximity
 * and AIS data", a **Live AIS** badge and an "Open Interactive Map" button.
 * There is no AIS integration and no map tile source. Rendering a map frame
 * with a Live badge over data that does not exist is the most confident lie
 * available on this screen, so the panel states the position instead.
 *
 * It is a panel rather than nothing because the absence is the message: someone
 * looking for vessel positions should learn here that this tool does not have
 * them, and get a phone number, rather than concluding the map failed to load.
 */
export function MapPanel() {
  return (
    <section
      aria-labelledby="map-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="map-heading" className="text-small font-semibold text-ops-ink">
        Vessel positions
      </h2>
      <p className="mt-1 text-caption text-ops-ink-variant">
        No AIS or positioning feed is connected to this assistant, so there is no live map to show.
        For a vessel&rsquo;s current position, contact SCASPA.
      </p>
      <a
        href={SCASPA_TEL_HREF}
        className="mt-2 inline-flex min-h-touch items-center text-small font-medium text-ops-sky underline"
      >
        Call {SCASPA_TEL_TEXT}
      </a>
    </section>
  );
}

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

/**
 * The weather and runway panel.
 *
 * Unlike the two above, this one has a real source: `advisory` is a passthrough
 * of whatever the feed published. Nothing is forecast, inferred or converted —
 * if the feed says nothing, the panel does not appear.
 */
export function AdvisoryPanel({ advisory }: { advisory: OperationalAdvisory | null | undefined }) {
  if (!advisory) return null;

  return (
    <section
      aria-labelledby="advisory-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="advisory-heading" className="text-small font-semibold text-ops-ink">
        Aviation advisory
      </h2>
      <p className="mt-1 text-body text-ops-ink">
        {advisory.headline}
        {advisory.temperature_c !== null && advisory.temperature_c !== undefined ? (
          <span className="tabular"> · {advisory.temperature_c}°C</span>
        ) : null}
      </p>
      {advisory.detail ? (
        <p className="text-caption text-ops-ink-variant">{advisory.detail}</p>
      ) : null}
      {advisory.systems_status ? (
        <p className="mt-2 border-t border-ops-outline-variant pt-2 text-caption text-ops-ink-variant">
          {advisory.systems_status}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The gate map.
 *
 * Same position as `MapPanel`: the design offers "real-time aircraft positioning
 * and passenger flow across the terminal apron", and there is no such feed.
 * Gate assignments that *are* published appear in the table's Gate column.
 */
export function GatePanel() {
  return (
    <section
      aria-labelledby="gates-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="gates-heading" className="text-small font-semibold text-ops-ink">
        Gate map
      </h2>
      <p className="mt-1 text-caption text-ops-ink-variant">
        There is no apron or aircraft-positioning feed connected. Published gate assignments, where
        the feed provides them, are in the Gate column.
      </p>
    </section>
  );
}
