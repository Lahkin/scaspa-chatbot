/**
 * Airport Information — the published half, and the cards that had to go.
 *
 * This screen replaced a table over a feed that does not exist. In production
 * it showed three metric tiles reading "Arrivals today —, Departures today —,
 * Delayed —" above a panel explaining there was nothing, which is the empty
 * dashboard the brief names by name.
 *
 * What replaced it is riskier than what it replaced, and that is what these
 * assert. An empty screen makes no claims. A screen full of confident answers
 * about an airport makes eighteen of them, so the questions worth testing are:
 *
 *   1. does anything on it come from a developer rather than a researcher;
 *   2. does every answer carry the date it was verified;
 *   3. do the blank cards stay gone.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { renderWithProviders } from './helpers';
import { routeTree } from '@/routeTree.gen';
import { server } from '@/mocks/server';
import { config } from '@/lib/config';
import { setScenario } from '@/mocks/scenarios';
import { guideResponseSchema } from '@/lib/schemas';

function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithProviders(<RouterProvider router={router as never} />);
}

/** The published section, by its heading. */
function guideSection() {
  return screen.getByRole('region', { name: /What SCASPA publishes/ });
}

/**
 * The section once its data has arrived, which is not the same moment as the
 * section existing.
 *
 * `findByRole('region', ...)` resolves on the first paint, while the panel is
 * still three skeleton bars — so every synchronous query after it ran against a
 * half-loaded page. Awaiting a control that only exists once the answers are in
 * is the difference, and it is the same trap the cruise tests hit.
 */
async function loadedGuide() {
  await screen.findByRole('button', { name: /What facilities are available/ });
  return within(guideSection());
}

function serveGuide(body: object) {
  server.use(http.get(`${config.apiBaseUrl}/api/guide`, () => HttpResponse.json(body)));
}

const PUBLISHED = {
  kind: 'published',
  label: 'Verified SCASPA published information',
  as_of: '2024-05-09T00:00:00Z',
  notice: null,
};

describe('Airport Information', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('shows published questions instead of three empty metric cards', async () => {
    /*
     * ── THE CARDS THE BRIEF NAMES ────────────────────────────────────────────
     *
     * "If no live flight feed is connected: remove blank KPI cards. Do not
     * show: Arrivals today —, Departures today —, Delayed —."
     *
     * With no feed they are gone entirely rather than dashed, and what a
     * visitor gets instead is the verified information that was always in the
     * product and only reachable by knowing what to ask.
     */
    setScenario('ops_unavailable');
    renderRoute('/flights');

    // Awaited on the SETTLED movements section: while its query is in flight
    // the tiles are legitimately on screen as skeletons, and asserting before
    // then would pass or fail on timing rather than on behaviour.
    await screen.findByText('Live flight movements are not currently connected');

    expect(screen.queryByText('Arrivals today')).toBeNull();
    expect(screen.queryByText('Departures today')).toBeNull();
    expect(screen.queryByText('Delayed')).toBeNull();
  });

  it('carries the verification date and volatility on every answer', async () => {
    /*
     * A page of answers about an airport is believed on sight, and the two
     * things that let a reader decide whether to act on one are how old it is
     * and how fast that kind of fact moves. Both are on the wire and both are
     * rendered — "rarely changes" and "check before use" lead to different
     * decisions, and only one of them is a question this product can settle.
     */
    const user = userEvent.setup();
    renderRoute('/flights');

    const section = await loadedGuide();
    await user.click(section.getByRole('button', { name: /What facilities are available/ }));

    const panel = document.getElementById('guide-kb-901');
    expect(panel).not.toBeNull();
    const inside = within(panel as HTMLElement);
    expect(inside.getByText('Checked 31 Jul 2026')).toBeVisible();
    expect(inside.getByText('Rarely changes')).toBeVisible();
  });

  it('shows each answer its own date, not one date for the page', async () => {
    /*
     * The fixture's two facilities answers were verified two years apart, which
     * is true of the real export as well. A single page-level stamp would
     * either advertise the freshest row or condemn a month-old answer as two
     * years stale, so there is deliberately no page-level date at all.
     */
    const user = userEvent.setup();
    renderRoute('/flights');

    const section = await loadedGuide();
    await user.click(section.getByRole('button', { name: /What facilities are available/ }));
    await user.click(section.getByRole('button', { name: /duty-free/ }));

    expect(
      within(document.getElementById('guide-kb-901') as HTMLElement).getByText(/31 Jul 2026/)
    ).toBeVisible();
    expect(
      within(document.getElementById('guide-kb-902') as HTMLElement).getByText(/9 May 2024/)
    ).toBeVisible();
  });

  it('links every answer to the SCASPA page it was verified against', async () => {
    const user = userEvent.setup();
    renderRoute('/flights');

    const section = await loadedGuide();
    await user.click(section.getByRole('button', { name: /What facilities are available/ }));

    const link = within(document.getElementById('guide-kb-901') as HTMLElement).getByRole('link', {
      name: /SCASPA source/,
    });
    expect(link).toHaveAttribute('href', 'https://www.scaspa.com/airport-about.html');
    // `noopener` is not optional on a `_blank` link: without it the opened page
    // gets a handle on this one through `window.opener`.
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('says nothing at all when nothing has been verified', async () => {
    /*
     * Reachable in production — a category the researchers have not covered, or
     * an export where every row for it is still `probable`. The screen reports
     * that nothing has been VERIFIED, which is a different and more useful
     * statement than "nothing was found", and it does not offer a retry because
     * there is nothing to retry.
     */
    serveGuide({
      source: {
        kind: 'unavailable',
        label: 'SCASPA published information',
        as_of: null,
        notice: 'Pilot has no verified information for this section yet.',
      },
      category: 'airport',
      topics: [],
      total: 0,
    });

    renderRoute('/flights');

    expect(
      await screen.findByText(/Pilot has no verified information about the airport yet/)
    ).toBeVisible();
    expect(screen.getByText('Nothing is shown rather than guessed.')).toBeVisible();
  });

  it('does not hatch verified information as sample data', async () => {
    /*
     * The movements feed below IS fixtures in development, and `OpsShell` would
     * hatch the whole page from the source it is handed. Hatching the
     * researchers' verified content as invented data is the precise lie the
     * hatch exists to prevent, so it lives inside the movements section only.
     */
    renderRoute('/flights');
    // The hatch belongs to the movements feed, so wait for THAT to settle.
    await screen.findByRole('table', { name: 'Flight movements' });

    expect(within(guideSection()).queryByTestId('sample-hatch')).toBeNull();
    // Still hatched where it is true.
    expect(screen.getByTestId('sample-hatch')).toBeInTheDocument();
  });

  it('tells a failed request apart from an empty knowledge base', async () => {
    // Rendering a 500 as an empty guide would say SCASPA has verified nothing
    // about its own airport.
    server.use(
      http.get(`${config.apiBaseUrl}/api/guide`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'boom', request_id: 'test' } },
          { status: 500 }
        )
      )
    );

    renderRoute('/flights');

    /*
     * The generous timeout is the point, not a workaround. `shouldRetry` retries
     * a 5xx twice with React Query's exponential backoff, which is deliberate —
     * a transient 500 on a page of published answers should heal itself rather
     * than showing an error somebody has to act on. So the error state cannot
     * settle inside the 1000ms default, and a test that asserted sooner would be
     * asserting that the retry policy does not exist.
     */
    expect(
      await screen.findByRole('button', { name: 'Try again' }, { timeout: 8000 })
    ).toBeVisible();
    expect(screen.queryByText(/no verified information about the airport/)).toBeNull();
  });

  it('still says plainly that live movements are not connected', async () => {
    setScenario('ops_unavailable');
    renderRoute('/flights');

    expect(
      await screen.findByText('Live flight movements are not currently connected')
    ).toBeVisible();
    expect(
      screen.getByText('Pilot will not guess arrival, departure or delay information.')
    ).toBeVisible();
  });
});

describe('the guide contract', () => {
  it('resolves an unrecognised volatility to the cautious value', () => {
    /*
     * Never to "rarely changes". Guessing low on a value we did not understand
     * is the one direction that costs somebody a wasted journey, and it is the
     * same rule `volatilityOf()` applies on the citation panel.
     */
    const parsed = guideResponseSchema.parse({
      source: PUBLISHED,
      category: 'airport',
      topics: [
        {
          name: 'facilities',
          entries: [
            {
              id: 'kb-901',
              question: 'Q?',
              answer: 'A.',
              source_url: 'https://www.scaspa.com/x.html',
              as_of: '2026-07-31',
              volatility: 'glacial',
            },
          ],
        },
      ],
      total: 1,
    });

    expect(parsed.topics[0]?.entries[0]?.volatility).toBe('medium');
  });

  it('refuses a payload that has lost its provenance', () => {
    // An answer without a source or a date is an anonymous claim about an
    // airport. Failing here is better than rendering one.
    const parsed = guideResponseSchema.safeParse({
      source: PUBLISHED,
      category: 'airport',
      topics: [{ name: 'facilities', entries: [{ id: 'kb-901', question: 'Q?', answer: 'A.' }] }],
      total: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
