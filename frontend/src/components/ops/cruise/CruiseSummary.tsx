import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { addDays } from '@/lib/portDate';
import type { CruiseScheduleResponse } from '@/lib/types';

/**
 * The three figures the published schedule can actually support.
 *
 * ── WHAT IS NOT HERE IS THE POINT OF THIS FILE ───────────────────────────────
 *
 * The brief suggested four tiles: calls today, expected in the next 24 hours,
 * scheduled this week, and Port Zante capacity. Two of those cannot be derived
 * from what SCASPA publishes, and the instruction was to show "only values that
 * can be derived safely", so they are absent rather than dashed.
 *
 * | Suggested tile | Why it is not drawn |
 * | --- | --- |
 * | **Expected next 24h** | A rolling window needs a timestamp per call. The schedule publishes a *day* and a window as free text — `07:00 - 18:00` — which the backend deliberately never parses, because the page is inconsistent about the format and a parser that guessed would move a sailing time. A 24-hour count would therefore be arithmetic on a guess. The "today" and "tomorrow" tiles below answer the same question out of published facts. |
 * | **Port Zante capacity** | SCASPA publishes no berth count for Port Zante. A capacity tile would have to invent a denominator, and a denominator is what turns two numbers into a claim about how full the port is. |
 *
 * ## Counting here is allowed, and on the vessels board it is forbidden
 *
 * The rule on the movements table is that nothing is counted from the rows —
 * `total` is the server's figure, because the rows are one page of many and a
 * count of them is a count of the page. This is the other case: the query behind
 * these tiles asks for the **whole** seven-day window, and `complete` proves it
 * came back whole. Counting a complete result set is reading it, not estimating
 * from it.
 *
 * When the window is truncated the tiles go to `null` rather than to a low
 * number. An undercount here is worse than a blank, because "1 call today" reads
 * as a fact and a blank reads as a blank.
 */
export function CruiseSummary({
  week,
  today,
  loading = false,
}: {
  /** A response covering `today` through `today + 6`, unfiltered. */
  week: CruiseScheduleResponse | undefined;
  today: string;
  /**
   * The first response has not landed.
   *
   * Distinct from "the window came back truncated", which is also a null value
   * and is NOT loading: one is a bar, the other is an em dash reading "not
   * reported", and drawing the second while a request is in flight is the
   * momentary version of the empty dashboard this screen exists to remove.
   */
  loading?: boolean;
}) {
  // `total` counts matches before the limit; `calls` is what fitted. Equal means
  // nothing was cut, which is the only condition under which these are facts.
  const complete = week !== undefined && week.total === week.calls.length;
  const on = (date: string) =>
    complete ? week.calls.filter((call) => call.call_date === date).length : null;

  return (
    <MetricRow columns={3}>
      {/*
        Zero is a real answer here, and this is the one place in the product
        where that is true of a count.

        The berth-occupancy tile must never render 0, because the feed does not
        report occupancy and 0 would say the port is empty. This is the opposite
        situation: the schedule was fetched successfully and completely, and it
        lists no cruise call today. "0" is precisely what SCASPA published.
        `MetricTile` still draws the em dash whenever the value is null, which is
        what an incomplete or unfetched window produces.
      */}
      <MetricTile label="Cruise calls today" value={on(today)} loading={loading} />
      <MetricTile label="Calls tomorrow" value={on(addDays(today, 1))} loading={loading} />
      <MetricTile
        label="Scheduled this week"
        // The whole window, which is the query this component was given.
        value={complete ? week.calls.length : null}
        loading={loading}
      />
    </MetricRow>
  );
}
