/**
 * Cargo & Shipping — the page whose source publishes nothing.
 *
 * `/cargo` is the only operational screen where the brief's central feature
 * cannot be built: it asks for a status lookup by vessel or agent, and SCASPA
 * publishes no cargo status anywhere. The inspection is in `decisions.md` 0043.
 *
 * So the assertions here are mostly about restraint — what the page declines to
 * offer, and what it says instead.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { renderWithProviders } from './helpers';
import { routeTree } from '@/routeTree.gen';
import { server } from '@/mocks/server';
import { setScenario } from '@/mocks/scenarios';

function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithProviders(<RouterProvider router={router as never} />);
}

describe('Cargo & Shipping', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('offers no search box over data that does not exist', async () => {
    /*
     * ── THE FEATURE THE BRIEF ASKED FOR, DELIBERATELY ABSENT ─────────────────
     *
     * §20: "Search: Search by vessel or agent". There is nothing behind it —
     * scaspa.com/cargo.html publishes no cargo table and exposes no endpoint.
     *
     * A search field over nothing is not a neutral placeholder, it is a
     * promise. Somebody types a vessel name, gets "no results", and reasonably
     * concludes their cargo is not at the port — a different and much worse
     * answer than "this is not published". Recorded as a deviation in 0043.
     */
    renderRoute('/cargo');

    const section = within(await screen.findByRole('region', { name: 'Checking a consignment' }));
    expect(section.queryByRole('searchbox')).toBeNull();
    expect(section.queryByPlaceholderText(/vessel|agent/i)).toBeNull();
  });

  it('says the source is missing, and says where SCASPA stops', async () => {
    /*
     * The Authority's own FAQ answers "How do I Check my Cargo Status" by
     * telling the reader to search a Cargo Info table, and that table is not on
     * the page. An agent following SCASPA's instructions reaches a dead end,
     * and the useful thing this product can do is say so rather than reproduce
     * the dead end more prettily.
     */
    renderRoute('/cargo');

    expect(await screen.findByText('Cargo status is not published online')).toBeVisible();
    expect(screen.getByText('Pilot will not guess where a shipment is.')).toBeVisible();
    expect(screen.getByText(/describes a searchable Cargo Info table/)).toBeVisible();
  });

  it('promises no private consignment data, feed or no feed', async () => {
    /*
     * "Do not expose private shipment/account data beyond what SCASPA
     * officially publishes." Asserted now, while there is no feed, because the
     * day one is connected this sentence is what decides what it may serve —
     * and a rule that only exists in prose gets relaxed by whoever wires it up.
     */
    renderRoute('/cargo');
    expect(
      await screen.findByText(/Pilot has no accounts and never knows who is asking/)
    ).toBeVisible();
  });

  it('carries the contextual actions to things Pilot can actually do', async () => {
    renderRoute('/cargo');

    const section = within(await screen.findByRole('region', { name: 'Checking a consignment' }));
    expect(section.getByRole('button', { name: /Documents I need/ })).toBeVisible();
    expect(section.getByRole('button', { name: /Where do I go\?/ })).toBeVisible();
    // Charges go to the published tariff schedule — a real table with real
    // rates — rather than to the assistant.
    expect(section.getByRole('link', { name: /Estimate charges/ })).toHaveAttribute(
      'href',
      '/tariffs'
    );
    expect(section.getByRole('link', { name: /Contact SCASPA/ })).toHaveAttribute(
      'href',
      '/support'
    );
  });

  it('leads with the cargo answers SCASPA has published', async () => {
    renderRoute('/cargo');

    const guide = within(await screen.findByRole('region', { name: /What SCASPA publishes/ }));
    expect(
      await screen.findByRole('button', { name: /How do I clear cargo through customs/ })
    ).toBeVisible();
    expect(guide.getByText('Published')).toBeVisible();
  });

  it('asks the server for cargo, not for the airport', async () => {
    /*
     * The two categories return different sets in the mock precisely so a
     * `category` parameter that was ignored cannot look identical to one that
     * was honoured.
     */
    renderRoute('/cargo');

    await screen.findByRole('button', { name: /How do I clear cargo through customs/ });
    expect(screen.queryByRole('button', { name: /duty-free/ })).toBeNull();
  });

  it('does not label a cargo answer with an airport heading', async () => {
    /*
     * ── THE BUG THIS PINS ────────────────────────────────────────────────────
     *
     * `GuideTopics` was written for the airport and its subcategory labels were
     * too. The same slugs appear under cargo, so reusing the component rendered
     * "About the airport" over "What is the Deep Water Harbour?" and "Passenger
     * numbers" over "How much cargo does the port handle?".
     *
     * A heading is read as a claim about what is under it. Every label is now
     * neutral enough to be true of any facility — the constraint a shared
     * component was always under, and which was invisible while one screen used
     * it.
     */
    renderRoute('/cargo');

    const guide = within(await screen.findByRole('region', { name: /What SCASPA publishes/ }));
    await screen.findByRole('button', { name: /How do I clear cargo through customs/ });

    const headings = guide.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.join(' ')).not.toMatch(/airport|passenger|runway/i);
  });

  it('reports an uncovered category honestly rather than as an error', async () => {
    setScenario('ops_unavailable');
    renderRoute('/cargo');

    expect(
      await screen.findByText(/Pilot has no verified information about cargo yet/)
    ).toBeVisible();
    // The consignment panel is a statement about SCASPA's site, not about this
    // request, so it stands whatever the guide returns.
    expect(screen.getByText('Cargo status is not published online')).toBeVisible();
  });
});
