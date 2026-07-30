/**
 * Charts.
 *
 * The model never draws one — the backend validates a specification against
 * knowledge-base rows and this renders what survived. So the claims worth testing
 * are about faithfulness and provenance: the table matches the series exactly,
 * the caption and source are always present, and Recharts is not in the initial
 * bundle.
 *
 * The drawing itself is verified in a browser by `scripts/chart-check.mjs` —
 * jsdom has no layout, so `ResponsiveContainer` measures zero here and would
 * report every chart as invisible whether or not it is.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartBlock } from '@/components/chat/ChartBlock';
import { ChartDataTable } from '@/components/chat/ChartDataTable';
import { MessageBubble } from '@/components/chat/MessageBubble';
import {
  describeChart,
  seriesKey,
  shortenLabel,
  shouldLayoutHorizontally,
  tickInterval,
  toRows,
} from '@/features/chat/chartLayout';
import { SERIES_STYLES, styleFor, ACCENT_STYLE } from '@/features/chat/chartSeries';
import {
  ALL_CHART_FIXTURES,
  CHART_CARGO_TONNAGE,
  CHART_CRUISE_PASSENGERS,
  CHART_FLIGHTS,
  CHART_TARIFF_COMPARISON,
  CHART_VESSEL_CALLS,
} from '@/mocks/chartFixtures';
import type { ChartSpec } from '@/lib/types';

// ── Task 1: the spec, consumed exactly ───────────────────────────────────────

describe('the ChartSpec is consumed as sent', () => {
  it('renders every field the contract defines', () => {
    render(<ChartBlock spec={CHART_VESSEL_CALLS} />);

    // title and axis labels reach the accessible description
    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toContain('Vessel calls per year');
    expect(chart.getAttribute('aria-label')).toContain('calls');

    // caption, verbatim
    expect(screen.getByText(CHART_VESSEL_CALLS.caption)).toBeInTheDocument();
    // source
    expect(screen.getByText('kb-008')).toBeInTheDocument();
  });

  it('turns series into rows without inventing or dropping a point', () => {
    const rows = toRows(CHART_VESSEL_CALLS);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ x: '2022', [seriesKey(0)]: 220, [seriesKey(1)]: 110 });
  });

  it('a missing point becomes a gap, never a zero', () => {
    // On a tonnage chart those are very different claims: zero is a measurement,
    // a gap is an absence.
    const spec: ChartSpec = {
      ...CHART_VESSEL_CALLS,
      series: [
        {
          name: 'A',
          points: [
            { x: '2022', y: 10 },
            { x: '2023', y: 20 },
          ],
        },
        { name: 'B', points: [{ x: '2023', y: 5 }] },
      ],
    };
    const rows = toRows(spec);
    expect(rows[0]?.[seriesKey(1)]).toBeNull();
    expect(rows[1]?.[seriesKey(1)]).toBe(5);
  });
});

// ── Task 3: distinguishable without colour ───────────────────────────────────

describe('series are distinguishable without colour', () => {
  it('gives each of the four a distinct dash and marker', () => {
    const dashes = SERIES_STYLES.map((style) => style.dash);
    const shapes = SERIES_STYLES.map((style) => style.shape);
    const patterns = SERIES_STYLES.map((style) => style.patternId);
    // One man in twelve has a colour-vision deficiency, and the leave-behind is
    // printed in black and white.
    expect(new Set(dashes).size).toBe(4);
    expect(new Set(shapes).size).toBe(4);
    expect(new Set(patterns).size).toBe(4);
  });

  it('puts the two most distinct styles first, for the common two-series chart', () => {
    expect(SERIES_STYLES[0]?.dash).toBe('');
    expect(SERIES_STYLES[1]?.dash).not.toBe('');
    expect(SERIES_STYLES[0]?.shape).not.toBe(SERIES_STYLES[1]?.shape);
  });

  it('uses the amber only for a highlighted series', () => {
    expect(styleFor(0, null).colorVar).toBe('--color-blue-800');
    expect(styleFor(1, 1)).toBe(ACCENT_STYLE);
    expect(ACCENT_STYLE.colorVar).toBe('--color-amber-board');
  });

  it('wraps rather than running out of styles', () => {
    expect(styleFor(4, null)).toEqual(SERIES_STYLES[0]);
  });
});

// ── Task 4: the caption is mandatory ─────────────────────────────────────────

describe('provenance is always present', () => {
  it('renders the caption for every fixture, in full', () => {
    for (const { label, spec } of ALL_CHART_FIXTURES) {
      const { unmount } = render(<ChartBlock spec={spec} />);
      const caption = screen.getByText(spec.caption);
      expect(caption, label).toBeInTheDocument();
      // Never truncated: a chart is believed more readily than a sentence, so a
      // chart whose provenance is clipped is the artefact that ends up in a budget.
      expect(caption.className, label).not.toMatch(/truncate|line-clamp/);
      unmount();
    }
  });

  it('renders the source as a chip and as text for a screen reader', () => {
    render(<ChartBlock spec={CHART_CARGO_TONNAGE} />);
    // Text, so it is announced even when the chip resolves to nothing.
    expect(screen.getByText('kb-004')).toBeInTheDocument();
  });

  it('keeps caption and source even when charts are switched off', async () => {
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({
      config: { features: { charts: false }, isDev: true, isProd: false },
    }));
    const { ChartBlock: Flagged } = await import('@/components/chat/ChartBlock');

    render(<Flagged spec={CHART_CARGO_TONNAGE} />);
    // The numbers are the substance; the drawing is the presentation.
    expect(screen.getByText(CHART_CARGO_TONNAGE.caption)).toBeInTheDocument();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);

    vi.doUnmock('@/lib/config');
    vi.resetModules();
  });
});

// ── Task 5: a chart is data ──────────────────────────────────────────────────

describe('accessibility', () => {
  it('describes the trend rather than saying "chart"', () => {
    const description = describeChart(CHART_CARGO_TONNAGE);
    expect(description).toContain('area chart');
    expect(description).toContain('Cargo tonnage over time');
    expect(description).toContain('rises');
    expect(description).toContain('6 points from 2024 Q1 to 2025 Q2');
  });

  it('says "unchanged" rather than inventing a trend', () => {
    const flat: ChartSpec = {
      ...CHART_CARGO_TONNAGE,
      series: [
        {
          name: 'Flat',
          points: [
            { x: 'a', y: 100 },
            { x: 'b', y: 100 },
          ],
        },
      ],
    };
    expect(describeChart(flat)).toContain('is unchanged');
  });

  it('names each series when there is more than one', () => {
    const description = describeChart(CHART_FLIGHTS);
    expect(description).toContain('Scheduled:');
    expect(description).toContain('Charter:');
  });

  it('always exposes a data table to a screen reader, toggle or not', () => {
    const { container } = render(<ChartBlock spec={CHART_VESSEL_CALLS} />);
    // A chart is data; the data must never be behind a button for someone who
    // cannot see the drawing.
    const hidden = container.querySelector('.sr-only table');
    expect(hidden).not.toBeNull();
  });

  it('the table matches the series exactly', () => {
    render(<ChartDataTable spec={CHART_VESSEL_CALLS} />);
    const rows = document.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);

    for (const [index, point] of CHART_VESSEL_CALLS.series[0]!.points.entries()) {
      const row = rows[index]!;
      expect(within(row as HTMLElement).getByText(String(point.x))).toBeInTheDocument();
      const cells = row.querySelectorAll('td');
      expect(cells[0]?.textContent).toBe(String(point.y));
      expect(cells[1]?.textContent).toBe(String(CHART_VESSEL_CALLS.series[1]!.points[index]!.y));
    }
  });

  it('shows an em dash for a missing point, not a zero', () => {
    render(
      <ChartDataTable
        spec={{
          ...CHART_VESSEL_CALLS,
          series: [
            {
              name: 'A',
              points: [
                { x: '2022', y: 10 },
                { x: '2023', y: 20 },
              ],
            },
            { name: 'B', points: [{ x: '2023', y: 5 }] },
          ],
        }}
      />
    );
    const firstRow = document.querySelectorAll('tbody tr')[0]!;
    expect(firstRow.querySelectorAll('td')[1]?.textContent).toBe('—');
  });

  it('offers a visible toggle that reveals the table', async () => {
    const user = userEvent.setup();
    render(<ChartBlock spec={CHART_VESSEL_CALLS} />);

    const toggle = screen.getByRole('button', { name: /View as table/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('table')).toHaveLength(1); // only the sr-only one

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The visible copy is aria-hidden, so a screen reader is not read it twice.
    expect(document.querySelectorAll('table')).toHaveLength(2);
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });
});

// ── Task 6: mobile behaviour ─────────────────────────────────────────────────

describe('mobile layout decisions', () => {
  it('shortens month names instead of rotating them', () => {
    expect(shortenLabel('September')).toBe('Sep');
    expect(shortenLabel('January')).toBe('Jan');
  });

  it('truncates rather than inventing an abbreviation', () => {
    // Guessing at "Basseterre" would be worse than a clipped word.
    expect(shortenLabel('Basseterre')).toBe('Basse…');
    expect(shortenLabel('2024 Q1', 10)).toBe('2024 Q1');
  });

  it('thins ticks on a narrow chart and shows them all on a wide one', () => {
    // Twelve months at 320px cannot all be shown.
    expect(tickInterval(12, 320)).toBeGreaterThan(0);
    expect(tickInterval(12, 900)).toBe(0);
    expect(tickInterval(4, 320)).toBe(0);
  });

  it('flips a bar chart with more than six categories on a narrow screen', () => {
    expect(shouldLayoutHorizontally('bar', 7, 390)).toBe(true);
    expect(shouldLayoutHorizontally('bar', 6, 390)).toBe(false);
    // Room enough: leave it upright.
    expect(shouldLayoutHorizontally('bar', 7, 900)).toBe(false);
    // A horizontal line chart is a different chart, not a rotation.
    expect(shouldLayoutHorizontally('line', 12, 390)).toBe(false);
  });

  it('handles the real fixture shapes', () => {
    expect(CHART_CRUISE_PASSENGERS.series[0]?.points).toHaveLength(12);
    expect(CHART_TARIFF_COMPARISON.series[0]?.points).toHaveLength(7);
    expect(shouldLayoutHorizontally('bar', 7, 390)).toBe(true);
  });
});

// ── in a message ─────────────────────────────────────────────────────────────

describe('a chart inside an answer', () => {
  const message = (chart: ChartSpec | null, grounded = true) => ({
    id: 'a1',
    role: 'assistant' as const,
    text: 'Cruise arrivals peak in March.',
    at: new Date('2026-04-01T14:30:00Z'),
    chart,
    grounded,
    streaming: false,
    citations: [],
  });

  it('renders when the backend sent one', async () => {
    render(<MessageBubble message={message(CHART_CRUISE_PASSENGERS)} />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    expect(screen.getByText(CHART_CRUISE_PASSENGERS.caption)).toBeInTheDocument();
  });

  it('renders nothing when there is no chart, which is most turns', () => {
    render(<MessageBubble message={message(null)} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('is suppressed when the answer is ungrounded', () => {
    // A chart is believed more readily than a sentence, so drawing one from
    // figures the backend could not verify is the strongest possible version of
    // the claim it just declined to make.
    render(<MessageBubble message={message(CHART_CRUISE_PASSENGERS, false)} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/could not fully verify/)).toBeInTheDocument();
  });
});
