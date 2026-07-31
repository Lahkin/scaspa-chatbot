import type { VesselArrival } from '@/lib/types';

/**
 * The console's activity feed, derived from vessel records.
 *
 * ## What this deliberately cannot produce
 *
 * The design's feed reads:
 *
 *   BLUE MARLIN EXPLORER successfully docked at Pier 4.      12 minutes ago
 *   Berth assignment updated for WONDER OF THE SEAS.          1 hour ago
 *   Security clearance pending for OCEAN CARRIER 7.           3 hours ago
 *
 * Only the first of those is derivable from anything this system has. The other
 * two are **events** — a reassignment, a clearance state — and there is no event
 * stream, no audit log and no record that either ever happened. Writing them
 * would be inventing operational history, which is rule 5 in its most
 * convincing form: an activity feed reads as a log, and a log reads as a fact
 * that was recorded at the time.
 *
 * So this restates the arrival records and nothing else. "Arrived at Berth 1"
 * from an `ata`, "due at Pier 1" from an `eta` — a rewording of a field that is
 * already on screen in the table above, not a new claim.
 *
 * A pure function taking `now` rather than reading the clock, so the relative
 * times are testable and the output is deterministic.
 */

export interface ActivityEntry {
  id: string;
  /** What happened, or is expected to. Safe to render as-is. */
  text: string;
  /** ISO timestamp this entry is about. */
  at: string;
  /** Whether `at` is a record or a prediction. Drives the wording and the tone. */
  kind: 'arrived' | 'expected';
  /** e.g. "12 minutes ago", "in 4 hours". */
  relative: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short relative time.
 *
 * Deliberately coarse past a day — "in 3 days" rather than "in 74 hours" —
 * because precision the source cannot support reads as confidence it has not
 * earned. An ETA three days out is a plan, not a timetable.
 */
export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const delta = then - now;
  const past = delta < 0;
  const magnitude = Math.abs(delta);

  const say = (value: number, unit: string): string => {
    const rounded = Math.max(1, Math.round(value));
    const plural = `${rounded} ${unit}${rounded === 1 ? '' : 's'}`;
    return past ? `${plural} ago` : `in ${plural}`;
  };

  if (magnitude < MINUTE) return past ? 'just now' : 'imminently';
  if (magnitude < HOUR) return say(magnitude / MINUTE, 'minute');
  if (magnitude < DAY) return say(magnitude / HOUR, 'hour');
  return say(magnitude / DAY, 'day');
}

/**
 * Turn vessel records into feed entries, newest first.
 *
 * Arrivals that have happened come before arrivals that are expected, because a
 * feed is read as a history and a prediction at the top of one reads as
 * something that occurred.
 */
export function buildActivityFeed(
  vessels: VesselArrival[],
  now: number,
  limit = 6
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const vessel of vessels) {
    if (vessel.ata) {
      entries.push({
        id: `${vessel.id}-arrived`,
        // "Arrived", not "docked": docking is an operation with a state this
        // system cannot see. Arrival is what the record says.
        text: `${vessel.name} arrived${vessel.berth ? ` at ${vessel.berth}` : ''}`,
        at: vessel.ata,
        kind: 'arrived',
        relative: relativeTime(vessel.ata, now),
      });
      continue;
    }

    if (vessel.eta) {
      entries.push({
        id: `${vessel.id}-expected`,
        // "Due" — the wording has to carry that this has not happened.
        text: `${vessel.name} due${vessel.berth ? ` at ${vessel.berth}` : ''}`,
        at: vessel.eta,
        kind: 'expected',
        relative: relativeTime(vessel.eta, now),
      });
    }
  }

  const rank = (entry: ActivityEntry) => (entry.kind === 'arrived' ? 0 : 1);

  return entries
    .sort((a, b) => {
      const byKind = rank(a) - rank(b);
      if (byKind !== 0) return byKind;
      // Within a group: most recent arrival first, soonest expected first.
      const at = Date.parse(a.at);
      const bt = Date.parse(b.at);
      return a.kind === 'arrived' ? bt - at : at - bt;
    })
    .slice(0, limit);
}
