/**
 * Cruise & Vessel Activity — the published half.
 *
 * This is the first screen in the product with a **real** SCASPA source behind
 * it. Everything else on the operations surface is a feed nobody has connected,
 * and the guards there are about admitting that. The guards here are the
 * opposite problem: the data is genuine, so the screen carries the Authority's
 * credibility, and the ways it can now be wrong are new ones.
 *
 *   1. presenting a six-hour snapshot as live;
 *   2. rendering an unknown passenger count as `0`;
 *   3. reporting an outage as a quiet week;
 *   4. hatching real published data as sample data.
 *
 * One test each, below. None of this is about layout.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { renderWithProviders } from './helpers';
import { routeTree } from '@/routeTree.gen';
import { server } from '@/mocks/server';
import { config } from '@/lib/config';
import { setScenario } from '@/mocks/scenarios';
import { addDays, portToday } from '@/lib/portDate';
import { cruiseScheduleResponseSchema } from '@/lib/schemas';
import type { CruiseCall } from '@/lib/types';

function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithProviders(<RouterProvider router={router as never} />);
}

/** The published section, by its heading. */
function cruiseSection() {
  return screen.getByRole('region', { name: 'Official SCASPA cruise schedule' });
}

/**
 * The cruise table, awaited.
 *
 * Every row query goes through this rather than through `screen`. The movements
 * table in section B carries `MV SAMPLE HORIZON` and `MV SAMPLE VOYAGER`, so a
 * bare `findByRole('row', { name: /SAMPLE HORIZON/ })` matches in both tables
 * and fails on ambiguity — which is itself a small proof that the two sections
 * are genuinely separate documents on the page rather than one merged board.
 */
async function cruiseTable() {
  return within(await screen.findByRole('table', { name: /Published cruise calls/ }));
}

const CALL: CruiseCall = {
  call_date: portToday(),
  day: 'Monday',
  window: '07:00 - 18:00',
  vessel: 'SAMPLE VOYAGER',
  cruise_line: 'Placeholder Cruise Line',
  pier: 'PORTZANTE',
  inaugural: false,
  pax: 1840,
  capacity: 2100,
};

/** Replace the endpoint wholesale, for the cases the standard mock cannot reach. */
function serveSchedule(body: object) {
  server.use(http.get(`${config.apiBaseUrl}/api/cruise-schedule`, () => HttpResponse.json(body)));
}

const PUBLISHED = {
  kind: 'published',
  label: 'Official SCASPA cruise schedule',
  as_of: '2026-08-27T05:12:00Z',
  notice: null,
};

describe('the published cruise schedule', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('says PUBLISHED and CHECKED, and never says live', async () => {
    /*
     * ── THE CLAIM THIS SCREEN MUST NOT MAKE ──────────────────────────────────
     *
     * Watchtower fetches SCASPA's endpoint every six hours. A snapshot rendered
     * as a live feed is the one statement that would make every other statement
     * on the page worth less — and it is an easy one to make by accident,
     * because every other operations board in this product is built around a
     * `live` kind that simply never occurs.
     *
     * The badge and the stamp are one claim in two halves. PUBLISHED without a
     * date is authority with no age on it; a date without the badge is a number
     * nobody can place.
     */
    renderRoute('/vessels');
    // Awaited on the TABLE, not on the region: the section renders immediately
    // with a skeleton in it, so a region that exists is not yet a section that
    // has a source to describe.
    await cruiseTable();
    const section = within(cruiseSection());

    expect(section.getByText('Published')).toBeVisible();
    expect(section.getByText(/checked/i)).toBeVisible();
    expect(section.queryByText(/live feed/i)).toBeNull();
  });

  it('renders an unpublished passenger count as unknown, never as zero', async () => {
    /*
     * SCASPA's table writes an unknown passenger count as `0`. The parser turns
     * that into null so the screen can say so; a `?? 0` anywhere between there
     * and the cell would put the claim back — and "0 passengers" beside a
     * 900-berth ship is a statement the Authority never made.
     */
    serveSchedule({ source: PUBLISHED, calls: [{ ...CALL, pax: null }], total: 1 });

    renderRoute('/vessels');
    const table = await cruiseTable();
    const row = within(table.getByRole('row', { name: /SAMPLE VOYAGER/ }));

    expect(row.getByText('passenger count not published')).toBeInTheDocument();
    expect(row.queryByText('0')).toBeNull();
  });

  it('tells an outage apart from a quiet week', async () => {
    /*
     * Both are an empty table, and they are opposite facts. "SCASPA lists no
     * cruise call this week" is an answer, and often the correct one. "Pilot
     * could not retrieve the schedule" is a statement about this service.
     *
     * Rendering them the same way is the more expensive mistake in one
     * direction only: a passenger told there are no ships stops looking.
     */
    setScenario('ops_unavailable');
    renderRoute('/vessels');

    expect(
      await screen.findByText('The published cruise schedule could not be retrieved')
    ).toBeVisible();
    expect(screen.queryByText(/No cruise calls are published/)).toBeNull();
    // And the rule, which is the sentence worth having on the screen at all.
    expect(screen.getByText('Pilot will not guess which ships are calling.')).toBeVisible();
  });

  it('reports a genuinely empty window as an answer, not as a fault', async () => {
    serveSchedule({ source: PUBLISHED, calls: [], total: 0 });

    renderRoute('/vessels');

    expect(await screen.findByText(/No cruise calls are published/)).toBeVisible();
    expect(screen.queryByText(/could not be retrieved/)).toBeNull();
  });

  it('does not hatch the published schedule as sample data', async () => {
    /*
     * ── WHY THE HATCH MOVED OFF THE PAGE AND INTO ONE SECTION ────────────────
     *
     * `OpsShell` draws 0032's sample-data hatch behind the whole screen from the
     * source it is handed, and the movements feed below IS fixtures in
     * development. Handing the shell that source would hatch the Authority's
     * own published cruise schedule as invented data — which is the precise lie
     * the hatch exists to prevent, told by the mechanism built to prevent it.
     */
    renderRoute('/vessels');
    await screen.findByRole('table', { name: /Published cruise calls/ });

    expect(within(cruiseSection()).queryByTestId('sample-hatch')).toBeNull();
    // Still hatched where it is true: the movements feed is running fixtures.
    expect(screen.getByTestId('sample-hatch')).toBeInTheDocument();
  });

  it('publishes only the columns SCASPA publishes', async () => {
    /*
     * The endpoint behind this returns captain, pilot, agent and ship-worker
     * names. The backend drops them and `CruiseCall` has no field for them, so
     * this is defence in depth — but the same assertion exists in
     * `backend/tests/test_watchtower.py`, and the two ends of a governance rule
     * are worth asserting at both ends.
     */
    renderRoute('/vessels');
    const table = await screen.findByRole('table', { name: /Published cruise calls/ });

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['Date', 'Time', 'Vessel', 'Cruise line', 'Pier', 'PAX', 'Capacity']);
  });

  it('asks the server for the selected window rather than filtering on screen', async () => {
    /*
     * The fixture puts two calls today and one tomorrow. Selecting Today must
     * narrow the REQUEST — `since` and `until` both today — not hide rows the
     * client already holds, because "all upcoming" can exceed the endpoint's
     * limit and a client-side filter would then be filtering a truncated set
     * while the screen said nothing about it.
     */
    const user = userEvent.setup();
    renderRoute('/vessels');

    // The week, which the fixture fills with five calls across four days.
    expect((await cruiseTable()).getByRole('row', { name: /SAMPLE HORIZON/ })).toBeInTheDocument();

    await user.click(within(cruiseSection()).getByRole('radio', { name: 'Today' }));

    // Today's two survive; the one three days out does not.
    await waitFor(async () =>
      expect((await cruiseTable()).queryByRole('row', { name: /SAMPLE HORIZON/ })).toBeNull()
    );
    expect((await cruiseTable()).getByRole('row', { name: /SAMPLE MERIDIAN/ })).toBeInTheDocument();
  });

  it('blanks the summary rather than undercounting a truncated window', async () => {
    /*
     * The tiles count a COMPLETE result set, which is the only condition under
     * which counting rows is reading them rather than estimating from them.
     * When `total` exceeds what came back, the window was cut and any count
     * would be low — and "1 call today" reads as a fact where an em dash reads
     * as an em dash.
     */
    serveSchedule({ source: PUBLISHED, calls: [CALL], total: 40 });

    renderRoute('/vessels');
    await screen.findByRole('table', { name: /Published cruise calls/ });

    const tile = within(cruiseSection()).getByText('Cruise calls today').closest('div');
    expect(within(tile as HTMLElement).getByText('—')).toBeVisible();
    expect(within(tile as HTMLElement).getByText('not reported')).toBeVisible();
  });

  it('counts a complete window, and zero is a real answer in it', async () => {
    const today = portToday();
    serveSchedule({
      source: PUBLISHED,
      // Nothing today; one call the day after tomorrow. The tile must read 0,
      // which is what SCASPA published — unlike the berth-occupancy tile, where
      // 0 would be a claim the feed never made.
      calls: [{ ...CALL, call_date: addDays(today, 2) }],
      total: 1,
    });

    renderRoute('/vessels');
    await screen.findByRole('table', { name: /Published cruise calls/ });

    const tile = within(cruiseSection()).getByText('Cruise calls today').closest('div');
    expect(within(tile as HTMLElement).getByText('0')).toBeVisible();
  });

  it('states the truncation instead of silently stopping', async () => {
    serveSchedule({ source: PUBLISHED, calls: [CALL], total: 137 });

    renderRoute('/vessels');

    expect(await screen.findByText(/Showing the first/)).toBeVisible();
    expect(screen.getByText('137')).toBeVisible();
  });
});

describe('the cruise schedule contract', () => {
  it('refuses a payload whose shape has changed', () => {
    /*
     * No `.catch()` fallbacks on this schema, unlike the vessel status enum. A
     * status that arrives unrecognised should render one row oddly rather than
     * lose the board; a cruise call whose shape has changed means the parser has
     * stopped understanding SCASPA's table, and quietly repairing it here would
     * hide exactly the event Watchtower exists to notice.
     */
    const parsed = cruiseScheduleResponseSchema.safeParse({
      source: PUBLISHED,
      calls: [{ ...CALL, pax: 'lots' }],
      total: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a published source and keeps its timestamp', () => {
    const parsed = cruiseScheduleResponseSchema.parse({
      source: PUBLISHED,
      calls: [CALL],
      total: 1,
    });
    expect(parsed.source.kind).toBe('published');
    expect(parsed.source.as_of).toBe('2026-08-27T05:12:00Z');
    // No notice, and that is correct: the data is real, so there is nothing to
    // warn about. The timestamp is what does the honesty here.
    expect(parsed.source.notice).toBeNull();
  });
});
