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

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { DataTable, Td, Th, Tr } from '@/components/ops/console/DataTable';
import {
  ActivityPanel,
  GatePanel,
  MapPanel,
  MarineAdvisoryPanel,
} from '@/components/ops/console/SidePanels';
import { Pagination } from '@/components/ops/console/Pagination';
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

describe('the map panels', () => {
  it('says there is no positioning feed rather than showing a Live AIS badge', () => {
    const { container } = render(<MapPanel />);
    expect(screen.getByText(/No AIS or positioning feed is connected/i)).toBeInTheDocument();

    // Match the badge, not the word. The copy legitimately contains "live" —
    // in "there is no live map to show", the sentence that exists to prevent
    // exactly the reading this is checking for.
    expect(container.textContent).not.toMatch(/live (ais|data|feed|map view)/i);
    expect(screen.queryByRole('button', { name: /open .*map/i })).toBeNull();

    // And it routes to someone who does know.
    expect(screen.getByRole('link', { name: /Call/ })).toHaveAttribute(
      'href',
      expect.stringContaining('tel:')
    );
  });

  it('the gate panel points at the published gate column when there is no feed', () => {
    render(<GatePanel />);
    expect(screen.getByText(/no apron feed connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/real-time/i)).toBeNull();
  });

  /*
   * There is a gate feed now, and it changed what this panel does. What it did
   * NOT change is the claim: the design asks for "real-time aircraft
   * positioning and passenger flow across the terminal apron", and occupancy
   * per stand is neither of those. So the populated panel is a grid of stands
   * and still says nothing about aircraft, position or passengers.
   */
  it('the gate panel lists stands without claiming to be an apron view', () => {
    render(
      <GatePanel
        gates={[
          {
            gate: 'Z1',
            status: 'occupied',
            flight_number: 'ZZ111',
            airline: 'Placeholder Air',
            scheduled_at: null,
          },
          { gate: 'Z2', status: 'free', flight_number: null, airline: '', scheduled_at: null },
        ]}
        active={1}
        total={2}
      />
    );

    expect(screen.getByText('Z1')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    // The count comes from the response, not from recounting the rows here.
    expect(screen.getByText(/1 of 2 in use/)).toBeInTheDocument();
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
    render(<MarineAdvisoryPanel />);

    expect(screen.getByText(/not a statement that conditions are safe/i)).toBeInTheDocument();
    for (const word of [/all[- ]clear/i, /\bclear\b/i, /\bsafe to sail\b/i, /\bno warnings\b/i]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it('a marine advisory says its severity in words, not only in colour', () => {
    render(
      <MarineAdvisoryPanel
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

    expect(screen.getByText(/Moderate severity/)).toBeInTheDocument();
    expect(screen.getByText(/Not an official notice to mariners/i)).toBeInTheDocument();
  });

  /*
   * Positions are a list, not a map.
   *
   * A chart is the most confident element a screen can carry: a reader takes
   * proximity and distance-to-shore off the picture, none of which this data
   * supports. And `reported_by` is per row rather than one "Live AIS" badge
   * over the panel, because a transponder fix and a typed-in position are
   * different claims that a single badge would flatten into one.
   */
  it('the map panel names who reported each position', () => {
    render(
      <MapPanel
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

    expect(screen.getByText(/Reported by AIS transponder/)).toBeInTheDocument();
    expect(screen.getByText(/Reported manually/)).toBeInTheDocument();
    // Hemispheres, not signed decimals — a minus sign meaning "south" is a
    // database convention, not a chart one.
    expect(screen.getByText(/17\.100°N 62\.900°W/)).toBeInTheDocument();
    // A null speed is omitted rather than printed as zero.
    expect(screen.queryByText(/0\.0 kn/)).toBeNull();
  });
});

// ── 4. Pagination tells the truth about position ─────────────────────────────

describe('pagination', () => {
  it('shows the range and the true total', () => {
    render(
      <Pagination offset={0} limit={10} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByText('Showing 1–10 of 42 arrivals')).toBeInTheDocument();
  });

  it('clamps the range to the total on the last page', () => {
    render(
      <Pagination offset={40} limit={10} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByText('Showing 41–42 of 42 arrivals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('disables Previous on the first page', () => {
    render(
      <Pagination offset={0} limit={10} total={42} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('says "No arrivals" rather than "Showing 0–0 of 0"', () => {
    render(
      <Pagination offset={0} limit={10} total={0} onOffsetChange={() => {}} noun="arrivals" />
    );
    expect(screen.getByText('No arrivals')).toBeInTheDocument();
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
