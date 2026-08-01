import { buildActivityFeed } from '@/features/ops/activity';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import { SourceNotice } from '@/components/ops/SourceNotice';
import type {
  DataSource,
  GateAssignment,
  MarineAdvisory,
  OperationalAdvisory,
  VesselArrival,
  VesselPosition,
} from '@/lib/types';

/**
 * The right-hand panels of the console.
 *
 * Three of the four in the design cannot be built honestly as drawn, and each
 * says so rather than being quietly dropped — a missing panel is invisible, and
 * "we have no AIS feed" is information an operations user actually wants.
 */

/**
 * Vessel positions.
 *
 * The design shows "Port Zante Traffic — visualising real-time vessel proximity
 * and AIS data", a **Live AIS** badge and an "Open Interactive Map" button.
 * There is now a positions feed behind this — but there is still no map tile
 * source, and more importantly no licence to draw one.
 *
 * ## Why this is a list of coordinates and not a map
 *
 * A map frame is the most confident thing on a screen. A reader who sees a chart
 * with vessels on it believes the *chart* as much as the vessels: they read
 * proximity, heading and distance-to-shore off the picture, none of which this
 * data supports. A list of positions with each one's `reported_by` beside it
 * makes the same information available and claims exactly as much as it has.
 *
 * The **Live AIS** badge is still not drawn. `reported_by` is per row, because
 * a transponder fix and a harbour master typing into a form are different
 * claims and a single badge over the panel would flatten them into one.
 *
 * With no feed the panel keeps its original job: say so, and give the number.
 */
export function MapPanel({
  positions,
  source,
}: {
  positions?: VesselPosition[] | undefined;
  source?: DataSource | undefined;
}) {
  const rows = positions ?? [];

  return (
    <section
      aria-labelledby="map-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="map-heading" className="text-small font-semibold text-ops-ink">
        Vessel positions
      </h2>

      {rows.length === 0 ? (
        <>
          <p className="mt-1 text-caption text-ops-ink-variant">
            No AIS or positioning feed is connected to this assistant, so there are no positions to
            show. For a vessel&rsquo;s current position, contact SCASPA.
          </p>
          <a
            href={SCASPA_TEL_HREF}
            className="mt-2 inline-flex min-h-touch items-center text-small font-medium text-ops-sky underline"
          >
            Call {SCASPA_TEL_TEXT}
          </a>
        </>
      ) : (
        <>
          {source ? <SourceNotice source={source} className="mt-2" /> : null}
          <ul className="mt-3 space-y-2">
            {rows.map((position) => (
              <li
                key={position.id}
                className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-2"
              >
                <p className="text-small font-medium text-ops-ink">{position.name}</p>
                <p className="text-caption text-ops-ink-variant tabular">
                  {formatCoordinate(position.latitude, 'NS')}{' '}
                  {formatCoordinate(position.longitude, 'EW')}
                </p>
                <p className="text-caption text-ops-ink-variant">
                  {REPORTED_BY_LABEL[position.reported_by]}
                  {/* Null speed is omitted, not printed as zero: "not reported"
                      and "not moving" are different things to tell an operator. */}
                  {position.speed_knots !== null ? (
                    <span className="tabular"> · {position.speed_knots.toFixed(1)} kn</span>
                  ) : null}
                  {position.heading_degrees !== null ? (
                    <span className="tabular"> · {Math.round(position.heading_degrees)}°</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Spelled out rather than shortened. "AIS" means nothing to most readers. */
const REPORTED_BY_LABEL: Record<VesselPosition['reported_by'], string> = {
  ais: 'Reported by AIS transponder',
  manual: 'Reported manually',
  estimated: 'Estimated position — not a report',
};

/**
 * Degrees with a hemisphere letter, to three decimals.
 *
 * Signed decimals are the wrong presentation for a marine reader — a minus sign
 * carrying "south" is a convention from a database, not from a chart — and three
 * decimals is about 100 m, which is as much precision as any of these claims
 * can carry.
 */
function formatCoordinate(value: number, axis: 'NS' | 'EW'): string {
  const [positive, negative] = axis === 'NS' ? ['N', 'S'] : ['E', 'W'];
  return `${Math.abs(value).toFixed(3)}°${value >= 0 ? positive : negative}`;
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
 * The design offers "real-time aircraft positioning and passenger flow across
 * the terminal apron". There is a gate-occupancy feed now; there is still no
 * aircraft positioning and no passenger flow, and neither is drawn.
 *
 * A grid of stands rather than an apron diagram, for the same reason `MapPanel`
 * is a list: a plan view of the terminal would assert a geometry — which stand
 * is next to which — that this data does not contain.
 *
 * `active` comes from the response and is not recounted here. It is the same
 * number as the flight screen's "8 / 12" tile, and two components deciding
 * separately what "active" means is how those two numbers drift apart.
 */
export function GatePanel({
  gates,
  active,
  total,
  source,
}: {
  gates?: GateAssignment[] | undefined;
  active?: number | undefined;
  total?: number | undefined;
  source?: DataSource | undefined;
}) {
  const rows = gates ?? [];

  return (
    <section
      aria-labelledby="gates-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="gates-heading" className="text-small font-semibold text-ops-ink">
          Gate map
        </h2>
        {rows.length > 0 && active !== undefined && total !== undefined ? (
          <p className="text-caption text-ops-ink-variant tabular">
            {active} of {total} in use
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-1 text-caption text-ops-ink-variant">
          There is no apron feed connected. Published gate assignments, where the feed provides
          them, are in the Gate column.
        </p>
      ) : (
        <>
          {source ? <SourceNotice source={source} className="mt-2" /> : null}
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {rows.map((gate) => (
              <li
                key={gate.gate}
                className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-2"
              >
                <p className="text-small font-semibold text-ops-ink tabular">{gate.gate}</p>
                <p className="text-caption text-ops-ink-variant">
                  {GATE_STATUS_LABEL[gate.status]}
                </p>
                {gate.flight_number ? (
                  <p className="text-caption text-ops-ink-variant tabular">{gate.flight_number}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const GATE_STATUS_LABEL: Record<GateAssignment['status'], string> = {
  occupied: 'Occupied',
  boarding: 'Boarding',
  free: 'Free',
  closed: 'Closed',
};

/**
 * Notices to mariners.
 *
 * ── AN EMPTY LIST IS NOT AN ALL-CLEAR, AND MUST NOT READ AS ONE ─────────────
 *
 * This is the one panel in the console whose silence could be acted on. A
 * skipper who sees an advisory box with nothing in it may conclude conditions
 * are fine; this assistant has no idea whether they are. So the empty state is
 * a sentence saying exactly that, and not a tick, a green chip, or the word
 * "clear" — and the panel renders even with nothing in it, because a panel that
 * disappears when empty teaches the reader that its absence means good news.
 *
 * Severity is a word, never a colour alone: a red dot is unreadable to a
 * colour-blind reader and meaningless to anyone who has not learnt the scheme.
 */
export function MarineAdvisoryPanel({
  advisories,
  source,
}: {
  advisories?: MarineAdvisory[] | undefined;
  source?: DataSource | undefined;
}) {
  const rows = advisories ?? [];

  return (
    <section
      aria-labelledby="marine-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="marine-heading" className="text-small font-semibold text-ops-ink">
        Notices to mariners
      </h2>

      {rows.length === 0 ? (
        <p className="mt-1 text-caption text-ops-ink-variant">
          No notice has been published to this assistant. That is not a statement that conditions
          are safe — this assistant does not carry official marine warnings. Check with SCASPA and
          the relevant maritime authority before sailing.
        </p>
      ) : (
        <>
          {source ? <SourceNotice source={source} className="mt-2" /> : null}
          <ul className="mt-3 space-y-2">
            {rows.map((advisory) => (
              <li
                key={advisory.id}
                className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-2"
              >
                <p className="text-small font-medium text-ops-ink">{advisory.headline}</p>
                <p className="text-caption text-ops-ink-variant">
                  {advisory.port} · {SEVERITY_LABEL[advisory.severity]}
                </p>
                {advisory.detail ? (
                  <p className="mt-1 text-caption text-ops-ink-variant">{advisory.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-ops-ink-variant">
            Not an official notice to mariners. Confirm with the maritime authority.
          </p>
        </>
      )}
    </section>
  );
}

const SEVERITY_LABEL: Record<MarineAdvisory['severity'], string> = {
  low: 'Low severity',
  moderate: 'Moderate severity',
  high: 'High severity',
};
