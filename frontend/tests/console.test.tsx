/**
 * The desktop operations console.
 *
 * Layout is not what is under test. These are the places where the console,
 * built literally from the export, would claim something the system cannot back:
 *
 *   1. nav links to features that do not exist — worst of all "Cargo Tracking",
 *      which is the personal-record refusal wearing a nav label;
 *   2. an activity feed of invented operational events;
 *   3. a "Live AIS" map over a feed that is not connected;
 *   4. relative times that imply a precision the source does not have.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { DataTable, Td, Th, Tr } from '@/components/ops/console/DataTable';
import { ActivityPanel } from '@/components/ops/console/SidePanels';
import { MarineAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { PositionMap } from '@/components/ops/PositionMap';
import { GateMap } from '@/components/ops/GateMap';
import { Pagination } from '@/components/ops/console/Pagination';
import { ELLIPSIS, pageWindow } from '@/components/ops/console/pageWindow';
import { buildActivityFeed, relativeTime } from '@/features/ops/activity';
import { FIXTURE_SOURCE, MOCK_VESSELS, UNAVAILABLE_SOURCE } from '@/mocks/opsFixtures';

/**
 * The shell renders `<Link>`s, which need a router in context. A memory router
 * with a catch-all is the smallest thing that satisfies them without pulling in
 * the real route tree.
 */
function renderInRouter(ui: React.ReactElement) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  // The router's generated types do not know this ad-hoc tree; the cast is
  // confined to the test harness.
  return render(<RouterProvider router={router as never} />);
}

// ── 1. The nav promises nothing it cannot deliver ────────────────────────────

describe('the console shell', () => {
  const shell = (
    <ConsoleShell breadcrumb={['Console', 'Vessel arrivals']} title="Vessel arrivals">
      <p>content</p>
    </ConsoleShell>
  );

  it('links only to destinations that exist', async () => {
    renderInRouter(shell);
    await screen.findByRole('heading', { name: 'Vessel arrivals' });

    const hrefs = Array.from(document.querySelectorAll('a[href]')).map((a) =>
      a.getAttribute('href')
    );
    const internal = hrefs.filter((href) => href?.startsWith('/'));
    const real = [
      '/chat',
      '/ops/vessels',
      '/ops/flights',
      '/tariffs',
      '/support',
      '/about',
      '/privacy',
      '/settings',
    ];

    for (const href of internal) {
      expect(real, `${href} is not a route that exists`).toContain(href);
    }
  });

  it('offers no cargo tracking, which is the personal-record refusal in a nav label', async () => {
    renderInRouter(shell);
    await screen.findByRole('heading', { name: 'Vessel arrivals' });

    // Someone's container is precisely what this assistant must not appear able
    // to look up. A nav link promising it is read long before the refusal is.
    expect(screen.queryByText(/cargo tracking/i)).toBeNull();
  });

  it('offers no chat history or saved reports, which have nothing behind them', async () => {
    renderInRouter(shell);
    await screen.findByRole('heading', { name: 'Vessel arrivals' });

    expect(screen.queryByText(/chat history/i)).toBeNull();
    expect(screen.queryByText(/saved reports/i)).toBeNull();
    expect(screen.queryByText(/live map/i)).toBeNull();
  });

  it('offers no account menu, because there is no account', async () => {
    renderInRouter(shell);
    await screen.findByRole('heading', { name: 'Vessel arrivals' });

    expect(screen.queryByText(/sign in|log in|my account|profile/i)).toBeNull();
  });

  it('keeps the phone number reachable from every console screen', async () => {
    renderInRouter(shell);
    await screen.findByRole('heading', { name: 'Vessel arrivals' });

    const tel = document.querySelectorAll('a[href^="tel:"]');
    expect(tel.length).toBeGreaterThan(0);
  });

  it('marks the current breadcrumb and does not link the trail', async () => {
    renderInRouter(shell);
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });

    expect(within(nav).getByText('Vessel arrivals')).toHaveAttribute('aria-current', 'page');
    // "Console" is not a page, so it must not look like one.
    expect(within(nav).queryByRole('link')).toBeNull();
  });
});

// ── 2. The activity feed restates records; it does not invent events ─────────

describe('the activity feed', () => {
  const NOW = Date.parse('2026-07-30T12:00:00Z');

  it('reports an arrival that happened as recorded', () => {
    const entries = buildActivityFeed(
      [{ ...MOCK_VESSELS[0]!, ata: '2026-07-30T11:48:00Z', eta: null }],
      NOW
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('arrived');
    expect(entries[0]?.relative).toBe('12 minutes ago');
  });

  it('reports an expected arrival as due, never as arrived', () => {
    const entries = buildActivityFeed(
      [{ ...MOCK_VESSELS[1]!, ata: null, eta: '2026-07-30T16:00:00Z' }],
      NOW
    );

    expect(entries[0]?.kind).toBe('expected');
    expect(entries[0]?.text).toMatch(/due/);
    expect(entries[0]?.text).not.toMatch(/arrived|docked/);
    expect(entries[0]?.relative).toBe('in 4 hours');
  });

  it('never says "docked", which is an operational state it cannot see', () => {
    const entries = buildActivityFeed(MOCK_VESSELS, NOW);
    for (const entry of entries) {
      expect(entry.text).not.toMatch(/dock/i);
    }
  });

  it('invents no event the records do not contain', () => {
    // The design's feed has "Berth assignment updated for X" and "Security
    // clearance pending for Y". There is no event stream, no audit log and no
    // record either ever happened.
    const entries = buildActivityFeed(MOCK_VESSELS, NOW);
    const text = entries.map((entry) => entry.text).join(' ');

    expect(text).not.toMatch(/assignment updated|clearance|pending|cleared|departed/i);
    // And every entry names a vessel that is actually in the input.
    for (const entry of entries) {
      expect(MOCK_VESSELS.some((vessel) => entry.text.includes(vessel.name))).toBe(true);
    }
  });

  it('puts what happened above what is merely expected', () => {
    // A prediction at the top of a feed reads as something that occurred.
    const entries = buildActivityFeed(MOCK_VESSELS, NOW);
    const firstExpected = entries.findIndex((entry) => entry.kind === 'expected');
    const lastArrived = entries.map((entry) => entry.kind).lastIndexOf('arrived');

    if (firstExpected !== -1 && lastArrived !== -1) {
      expect(lastArrived).toBeLessThan(firstExpected);
    }
  });

  it('coarsens beyond a day rather than implying precision it lacks', () => {
    // An ETA three days out is a plan, not a timetable. "in 74 hours" would read
    // as confidence the source has not earned.
    expect(relativeTime('2026-08-02T12:00:00Z', NOW)).toBe('in 3 days');
    expect(relativeTime('2026-07-30T12:00:30Z', NOW)).toBe('imminently');
    expect(relativeTime('2026-07-30T11:59:40Z', NOW)).toBe('just now');
  });

  it('says nothing at all rather than guessing from an unparseable date', () => {
    expect(relativeTime('not a date', NOW)).toBe('');
  });

  it('states in the panel that it is not an operations log', () => {
    render(<ActivityPanel vessels={MOCK_VESSELS} source={FIXTURE_SOURCE} now={NOW} />);
    expect(screen.getByText(/not an operations log/i)).toBeInTheDocument();
  });

  it('explains an empty feed by its cause', () => {
    render(<ActivityPanel vessels={[]} source={UNAVAILABLE_SOURCE} now={NOW} />);
    expect(screen.getByText(/No feed is connected/i)).toBeInTheDocument();
  });
});

// ── 3. No map is claimed ─────────────────────────────────────────────────────

describe('the console panels — board 20', () => {
  /*
   * These moved out of `console/SidePanels` and into `ops/`, where §6.7–6.9
   * draw them. The panels here were the pre-handoff versions; the RULES they
   * carried are asserted below against the components that carry them now.
   */

  it('says there is no positioning feed rather than showing a Live AIS badge', () => {
    // §6.7: "empty is the normal state" — a meta strip saying NO FEED, and the
    // plot saying what would fill it.
    const { container } = render(<PositionMap positions={[]} source={UNAVAILABLE_SOURCE} />);
    expect(screen.getByText('No positions are being reported')).toBeInTheDocument();
    expect(screen.getByText(/No AIS receiver is connected/i)).toBeInTheDocument();

    /*
     * Match the CLAIM, not the word "live".
     *
     * This used to be `/live (ais|data|feed|map view)/i`, which was right until
     * the unavailable badge was reworded from "No feed" to "Live data
     * unavailable" — at which point a label stating that live data is NOT
     * available failed a check that exists to catch a label claiming it is.
     *
     * The affirmative badges are named instead. A negation containing the word
     * "live" is the correct thing to show here.
     */
    for (const claim of ['Live AIS', 'Live feed', 'Live map view', 'Live data ']) {
      expect(container.textContent).not.toContain(claim);
    }
    expect(screen.getByText('Live data unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open .*map/i })).toBeNull();
  });

  /*
   * Positions are a list, not a chart.
   *
   * A chart is the most confident element a screen can carry: a reader takes
   * proximity and distance-to-shore off the picture, none of which this data
   * supports. And `reported_by` is per row rather than one "Live AIS" badge
   * over the panel, because a transponder fix and a typed-in position are
   * different claims that a single badge would flatten into one.
   */
  it('names who reported each position, and never prints a null as zero', () => {
    render(
      <PositionMap
        source={FIXTURE_SOURCE}
        positions={[
          {
            id: 'fx-vessel-1',
            name: 'MV SAMPLE CARRIER',
            latitude: 17.1,
            longitude: -62.9,
            heading_degrees: 111,
            speed_knots: 11.1,
            reported_by: 'ais',
            reported_at: null,
          },
          {
            id: 'fx-vessel-3',
            name: 'MV SAMPLE TRADER',
            latitude: 17.3,
            longitude: -62.7,
            heading_degrees: null,
            speed_knots: null,
            reported_by: 'manual',
            reported_at: null,
          },
        ]}
      />
    );

    expect(screen.getByText(/AIS fix/)).toBeInTheDocument();
    expect(screen.getByText(/Operator entry/)).toBeInTheDocument();
    // Hemispheres, not signed decimals — a minus sign meaning "south" is a
    // database convention, not a chart one.
    expect(screen.getByText(/17\.100°N 62\.900°W/)).toBeInTheDocument();
    /*
     * §6.7: "Null heading draws no arrow at all. **Null speed is never 0
     * knots** — that would say the vessel is stopped." Both say so in words.
     */
    expect(screen.getAllByText(/not reported/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/0\.0 kn/)).toBeNull();
  });

  it('points at the published gate column when there is no apron feed', () => {
    render(<GateMap gates={[]} active={0} total={0} />);
    expect(screen.getByText(/No apron feed is connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/real-time/i)).toBeNull();
  });

  /*
   * There is a gate feed, and it changed what this panel does. What it did NOT
   * change is the claim: the design asks for "real-time aircraft positioning
   * and passenger flow across the terminal apron", and occupancy per stand is
   * neither of those.
   */
  it('lists stands without claiming to be an apron view, and counts from the server', () => {
    render(
      <GateMap
        active={1}
        total={8}
        gates={[
          {
            gate: 'Z1',
            status: 'occupied',
            flight_number: 'ZZ111',
            airline: 'Placeholder Air',
            scheduled_at: null,
            facility: null,
          },
          {
            gate: 'Z2',
            status: 'free',
            flight_number: null,
            airline: '',
            scheduled_at: null,
            facility: null,
          },
        ]}
      />
    );

    expect(screen.getByText('Z1')).toBeInTheDocument();
    // Family B's own labels — `occupied` is drawn "Open", `free` is "Unassigned".
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    /*
     * §6.8: "**The active count comes from the server.** It is never recomputed
     * from the visible rows, which would drop to zero under a filter." Two rows
     * on screen, and the header still reads the response's 1 of 8.
     */
    expect(screen.getByText('1 active of 8')).toBeInTheDocument();
    expect(screen.queryByText(/real-time/i)).toBeNull();
    expect(screen.queryByText(/passenger flow/i)).toBeNull();
  });

  /*
   * The one panel whose silence could be acted on.
   *
   * A skipper reading an empty advisory box may conclude conditions are fine.
   * This assistant has no idea whether they are, so the empty state has to say
   * that in words — and must never render a tick, a green chip or the word
   * "clear", none of which a hurried reader distinguishes from an all-clear.
   */
  it('an empty marine advisory panel does not read as an all-clear', () => {
    render(<MarineAdvisoryPanel advisories={[]} total={0} />);

    expect(screen.getByText('No notice has been published to this assistant')).toBeInTheDocument();
    expect(screen.getByText(/not confirmation that conditions are normal/i)).toBeInTheDocument();
    // And it gives the number to ring, which "telephone Marine Operations"
    // alone does not.
    expect(screen.getByRole('link', { name: /869/ })).toBeInTheDocument();
    for (const word of [/all[- ]clear/i, /\bclear\b/i, /\bsafe to sail\b/i, /\bno warnings\b/i]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it('a marine advisory says its severity in words, not only in colour', () => {
    render(
      <MarineAdvisoryPanel
        total={1}
        advisories={[
          {
            id: 'ma-1',
            port: 'Placeholder Port',
            headline: 'Sample advisory — not a real notice to mariners',
            detail: 'Placeholder text.',
            severity: 'moderate',
            issued_at: null,
          },
        ]}
      />
    );

    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText(/Not an official notice to mariners/i)).toBeInTheDocument();
  });
});

// ── 4. Pagination tells the truth about position ─────────────────────────────

describe('pagination', () => {
  it('shows the range and the true total', () => {
    render(
      <Pagination offset={0} limit={10} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByText('Showing 1–10 of 42')).toBeInTheDocument();
  });

  it('clamps the range to the total on the last page', () => {
    render(
      <Pagination offset={40} limit={10} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByText('Showing 41–42 of 42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('disables Previous on the first page', () => {
    render(
      <Pagination offset={0} limit={10} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('renders no control at all at zero results', () => {
    /*
     * Board 01: "The table and the pagination control are both removed — an
     * empty table with a 'Showing 0–0 of 0' readout reads as a fault."
     *
     * This used to say "No arrivals" here. That is still true and still worth
     * saying — it just belongs in the empty state, next to the active filters
     * and the one action that clears them, rather than in a paging control that
     * has nothing to page.
     */
    const { container } = render(
      <Pagination offset={0} limit={10} total={0} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('collapses to the readout when everything fits on one page', () => {
    render(
      <Pagination offset={0} limit={100} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByText('Showing 1–42 of 42')).toBeInTheDocument();
    // Arrows that can never fire are furniture.
    expect(screen.queryByRole('button', { name: /page/i })).toBeNull();
  });

  it('numbers the pages and marks the current one', () => {
    render(
      <Pagination offset={25} limit={25} total={100} onOffsetChange={() => {}} noun="vessels" />
    );
    expect(screen.getByText('Showing 26–50 of 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2 of 4' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: 'Page 1 of 4' })).not.toHaveAttribute('aria-current');
  });

  it('keeps a disabled arrow in the row rather than removing it', () => {
    // "The control must not reflow as the user pages" — an arrow that vanishes
    // at the first page moves every other control sideways at the exact moment
    // somebody is aiming at one.
    render(
      <Pagination offset={0} limit={25} total={100} onOffsetChange={() => {}} noun="vessels" />
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('jumps to the offset a page number stands for', async () => {
    const user = userEvent.setup();
    const onOffsetChange = vi.fn();
    render(
      <Pagination
        offset={0}
        limit={25}
        total={100}
        onOffsetChange={onOffsetChange}
        noun="vessels"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Page 3 of 4' }));
    expect(onOffsetChange).toHaveBeenCalledWith(50);
  });
});

describe('the page window', () => {
  it('shows every page up to five, without a gap', () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('elides the middle of a long run, keeping first, last and the neighbours', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, ELLIPSIS, 20]);
    expect(pageWindow(10, 20)).toEqual([1, ELLIPSIS, 9, 10, 11, ELLIPSIS, 20]);
    expect(pageWindow(20, 20)).toEqual([1, ELLIPSIS, 19, 20]);
  });

  it('fills a gap of exactly one rather than eliding it', () => {
    // "1 … 3" is the same width as "1 2 3" and tells the reader less.
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, ELLIPSIS, 10]);
  });
});

// ── 5. The two mechanisms that keep a phone from scrolling sideways ──────────
//
// `npm run check:responsive` is the real proof and measures actual layout at
// 320px. It needs Playwright, which is not installed in every environment, so
// these pin the *mechanisms* it would be measuring. Weaker than the browser
// check and not a substitute for it — but a silent removal of either class is
// how this regresses, and jsdom can at least catch that.

describe('horizontal overflow guards', () => {
  it('the 256px rail is hidden below the desktop breakpoint', async () => {
    // A fixed-width rail inside a flex row is what pushes a 320px document
    // sideways. It is `hidden lg:block` for that reason, not for tidiness.
    renderInRouter(
      <ConsoleShell breadcrumb={['Console']} title="Vessel arrivals">
        <p>content</p>
      </ConsoleShell>
    );
    await screen.findByRole('heading', { name: 'Vessel arrivals' });

    const rail = document.querySelector('aside[aria-label="Console"]');
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain('hidden');
    expect(rail?.className).toContain('lg:block');
  });

  it('the wide table scrolls inside its own labelled, focusable region', () => {
    render(
      <DataTable caption="Test table" head={<Th>Column</Th>}>
        <Tr index={0}>
          <Td>value</Td>
        </Tr>
      </DataTable>
    );

    const region = screen.getByRole('region', { name: /Test table/ });
    expect(region.className).toContain('overflow-x-auto');
    // Focusable, or a keyboard user cannot reach the columns past the fold.
    expect(region).toHaveAttribute('tabindex', '0');
  });
});
