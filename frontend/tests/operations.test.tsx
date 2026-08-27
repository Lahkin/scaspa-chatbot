/**
 * The operations surfaces imported from the SCASPA design mockups.
 *
 * What is actually under test here is not layout. It is the four places where
 * the design, rendered literally, would say something this product must not say:
 *
 *   1. sample data presented as an operations board;
 *   2. a calculated total presented as a fee;
 *   3. an ETA presented as an arrival;
 *   4. a ticket receipt implying somebody will be in touch.
 *
 * Each has a guard, and each guard has a test below.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { renderWithProviders } from './helpers';
import { routeTree } from '@/routeTree.gen';
import { server } from '@/mocks/server';
import { config } from '@/lib/config';
import { setScenario } from '@/mocks/scenarios';
import { clearConversationId, writeConversationId } from '@/features/chat/conversation';
import { OperationalAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { Segmented } from '@/components/ui';
import { QuoteResult } from '@/components/ops/QuoteResult';
import { SourceAge, SourceNotice } from '@/components/ops/SourceNotice';
import { MetricTile } from '@/components/ops/MetricTile';
import { OpsCell, OpsRow, OpsRowCard, OpsTable } from '@/components/ops/OpsTable';
import {
  FilteredOutState,
  NoFeedState,
  RateLimitedState,
  TableSkeleton,
} from '@/components/ops/TableStates';
import { ActualTime, EstimatedTime, FlightTime, GateCell } from '@/components/ops/TimeCell';
import { TariffTable } from '@/components/ops/TariffTable';
import { FlightStatusChip, VesselStatusChip } from '@/components/ops/StatusChip';
import {
  FIXTURE_SOURCE,
  MOCK_DIRECTORY,
  MOCK_DISCLAIMER,
  MOCK_FLIGHTS,
  MOCK_TARIFFS,
  MOCK_VESSELS,
  UNAVAILABLE_SOURCE,
} from '@/mocks/opsFixtures';
import {
  tariffQuoteSchema,
  vesselArrivalsResponseSchema,
  supportTicketResponseSchema,
} from '@/lib/schemas';
import type { TariffQuote } from '@/lib/types';

const QUOTE: TariffQuote = {
  // Complete: every applicable charge had a published rate, so the total is the
  // whole of it and the heading reads "Total". The short-total case is covered
  // separately by UNPRICED_QUOTE below.
  unpriced: [],
  line_items: [
    {
      code: 'SMP-011',
      label: 'Sample wharfage — 40 ft container',
      basis: 'per container',
      rate: 44.44,
      quantity: 2,
      quantity_label: '2 containers',
      amount: 88.88,
      kb_id: null,
    },
  ],
  subtotal: 88.88,
  total: 88.88,
  currency: 'XCD',
  derived: true,
  disclaimer: MOCK_DISCLAIMER,
  source: FIXTURE_SOURCE,
  request_id: 'test',
};

// ── 1. Sample data must announce itself ──────────────────────────────────────

describe('the source notice', () => {
  it('shows the sample-data warning for a fixture feed', () => {
    render(<SourceNotice source={FIXTURE_SOURCE} />);
    expect(screen.getByText(/SAMPLE DATA/)).toBeInTheDocument();
  });

  it('explains itself when no feed is configured, and gives the phone number', () => {
    render(<SourceNotice source={UNAVAILABLE_SOURCE} />);
    expect(screen.getByText(/not connected/)).toBeInTheDocument();
    expect(screen.getByText(/869-465-8121/)).toBeInTheDocument();
  });

  it('says nothing for a live feed, which has nothing to apologise for', () => {
    const { container } = render(
      <SourceNotice source={{ kind: 'live', label: 'AIS', as_of: null, notice: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the age of the data, not the age of the request', () => {
    // A screen that says "updated just now" because *it* refreshed, while the
    // feed last moved hours ago, is worse than showing no time at all.
    render(<SourceAge source={FIXTURE_SOURCE} />);
    const stamp = screen.getByText(/as of/);
    expect(stamp.querySelector('time')?.getAttribute('dateTime')).toBe(FIXTURE_SOURCE.as_of);
  });

  it('says so plainly when the source gave no timestamp', () => {
    render(<SourceAge source={UNAVAILABLE_SOURCE} />);
    expect(screen.getByText(/Age of this data is unknown/)).toBeInTheDocument();
  });
});

// ── 2. A derived total must never appear bare ────────────────────────────────

describe('the fee calculator result', () => {
  it('renders the disclaimer in full, next to the total', () => {
    render(<QuoteResult quote={QUOTE} />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Estimate only');
    expect(note).toHaveTextContent('not an official customs assessment');
    expect(note).toHaveTextContent('869-465-8121');
  });

  it('labels the figure an estimate, and never a charge that is due', () => {
    /*
     * "Estimated SCASPA charge", not "Total".
     *
     * §5.11 gives the block one label and changes it in exactly one case: the
     * "so far" qualifier appears ONLY when the unpriced flag is present — never
     * inferred by string-matching. That rule is unchanged; the word it modifies
     * is not.
     *
     * "Total" is what appears at the foot of an invoice, and this figure is
     * arithmetic over a published schedule. The Pilot spec asks that nothing
     * here imply a bill or a payment. The disclaimer below still carries the
     * full statement and is still the one string that may never be collapsed.
     */
    render(<QuoteResult quote={QUOTE} />);
    expect(screen.getByText('Estimated SCASPA charge')).toBeInTheDocument();
    // Scoped past the disclaimer, which says "not an invoice" — a search over
    // the whole render matches the sentence that exists to prevent exactly the
    // reading this is checking for.
    const note = screen.getByRole('note');
    const body = [...document.body.querySelectorAll('*')]
      .filter((node) => !note.contains(node))
      .map((node) => node.textContent)
      .join(' ');
    expect(body).not.toMatch(/amount due|total due/i);
  });

  it('shows every quantity and rate, so the arithmetic can be checked by hand', () => {
    /*
     * §5.11's line: label, then `quantity_label at rate`, then the amount.
     * "12 containers at 186.00" — the two figures that produce the third, in
     * the row that shows the third.
     *
     * The amounts are bare and only the total carries `XCD` — §10: "Currency is
     * `XCD 9,288.00` in totals, bare `9,288.00` in line items under an
     * XCD-labelled total." This used to print the currency on every figure,
     * which is how a breakdown starts reading like an invoice.
     */
    render(<QuoteResult quote={QUOTE} />);
    expect(screen.getByText(/2 containers at 44\.44/)).toBeInTheDocument();
    // Twice bare — the line and the subtotal — and once with the currency, in
    // the total. Subtotal and total are separate rows even when equal.
    expect(screen.getAllByText('88.88')).toHaveLength(2);
    expect(screen.getByText('XCD 88.88')).toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
  });

  it('REFUSES a quote whose disclaimer is missing, at the schema boundary', () => {
    // The safety property, mutation-tested. Rendering a bare total is worse than
    // rendering nothing: someone will budget a shipment against it.
    const stripped = { ...QUOTE, disclaimer: '' };
    expect(tariffQuoteSchema.safeParse(stripped).success).toBe(false);

    const withoutDerived: Record<string, unknown> = { ...QUOTE };
    delete withoutDerived['derived'];
    expect(tariffQuoteSchema.safeParse(withoutDerived).success).toBe(false);

    // And the untouched one still parses, so the assertions above are not
    // passing for some unrelated reason.
    expect(tariffQuoteSchema.safeParse(QUOTE).success).toBe(true);
  });

  it('shows no total at all when nothing priced, rather than a zero', () => {
    /*
     * Board 18: "A zero-line quote shows no total at all. 'XCD 0.00' would read
     * as free, and prices default to zero until configured." Two different
     * reasons to distrust a zero, and a reader can tell neither apart.
     */
    render(<QuoteResult quote={{ ...QUOTE, line_items: [], subtotal: 0, total: 0 }} />);
    expect(screen.getByText(/Nothing to charge for those figures/)).toBeInTheDocument();
    expect(screen.queryByText(/0\.00/)).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
  });
});

// ── 2b. A total short by a whole charge ──────────────────────────────────────
//
// The worst outcome this endpoint can produce, and the one that is invisible:
// the dropped charge is in no line and in no figure, so a short quote is
// byte-for-byte as tidy as a complete one. `unpriced` is the only thing in the
// payload that reveals it.

describe('a quote missing a published rate', () => {
  const SHORT = { ...QUOTE, unpriced: ['SMP-BTH'] };

  it('says "so far", and never the word Total', () => {
    render(<QuoteResult quote={SHORT} />);
    expect(screen.getByText(/Estimated charge so far/)).toBeInTheDocument();
    // And the settled wording is gone, rather than both appearing.
    expect(screen.queryByText('Estimated SCASPA charge')).not.toBeInTheDocument();
  });

  it('never calls the figure a total, because nobody has been billed', () => {
    /*
     * "Total" is what appears at the foot of an invoice. This figure is
     * arithmetic over a published schedule: no account has been debited and the
     * number can change when the real charge is raised. The Pilot spec asks
     * that nothing here imply a bill or a payment, and the single word implied
     * both.
     */
    const { container, unmount } = render(<QuoteResult quote={SHORT} />);
    expect(container.textContent).not.toMatch(/\bTotal\b/);
    unmount();

    const complete = render(<QuoteResult quote={QUOTE} />);
    expect(complete.container.textContent).not.toMatch(/\bTotal\b/);
  });

  it('names the missing code in the lines, above the total', () => {
    render(<QuoteResult quote={SHORT} />);
    // In the rows, not in a footnote: a warning under the total is read after
    // the number has already been believed.
    expect(screen.getByText(/code SMP-BTH is not in the table/)).toBeInTheDocument();
    expect(screen.getByText('Not priced')).toBeInTheDocument();
  });

  it('warns that the amount payable is higher, as an alert', () => {
    render(<QuoteResult quote={SHORT} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/This quote is incomplete/);
    expect(alert).toHaveTextContent(/less than the amount payable/);
  });

  it('counts the gap, and pluralises it', () => {
    const { unmount } = render(<QuoteResult quote={SHORT} />);
    expect(screen.getByText('1 charge missing')).toBeInTheDocument();
    unmount();

    render(<QuoteResult quote={{ ...QUOTE, unpriced: ['SMP-BTH', 'SMP-PIL'] }} />);
    expect(screen.getByText('2 charges missing')).toBeInTheDocument();
  });

  it('a complete quote shows none of it', () => {
    render(<QuoteResult quote={QUOTE} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/so far/)).not.toBeInTheDocument();
    expect(screen.getByText('Estimated SCASPA charge')).toBeInTheDocument();
  });

  it('the disclaimer is still rendered — it never substitutes for the warning', () => {
    // Both, always. "Confirmed on invoice" is about rounding and revision, not
    // about a charge that was never counted, so it cannot stand in for it.
    render(<QuoteResult quote={SHORT} />);
    expect(screen.getByRole('note')).toHaveTextContent(QUOTE.disclaimer);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ── 3. A prediction must not read as a record ────────────────────────────────

describe('vessel cards keep ETA and ATA apart', () => {
  /*
   * These used to render `VesselCard` and `FlightCard`, two components the
   * board-17 rebuild left with no callers: §5.1 requires a real table and §5.8
   * puts the card treatment below 640px, so both screens now use `OpsTable` and
   * `OpsRowCard`. The dead components are gone; the RULES they carried are
   * asserted here against the cells that carry them now.
   *
   * §5.4 gives all four ETA/ATA combinations, and the distinction is carried by
   * three signals at once — the tilde, the italic and the weight — so it
   * survives greyscale and a screen reader.
   */
  it('marks an ETA as a prediction and an ATA as a record', () => {
    const { unmount } = render(<EstimatedTime value="2026-08-01T06:30:00Z" />);
    const eta = screen.getByText(/~/);
    expect(eta.className).toContain('italic');
    unmount();

    render(<ActualTime value="2026-08-01T06:40:00Z" />);
    const ata = screen.getByText(/06:40|0[0-9]:[0-9]{2}/);
    expect(ata.className).not.toContain('italic');
    expect(ata.className).toContain('font-medium');
  });

  it('renders a missing time as an em dash that says "not reported"', () => {
    // Two em dashes and no guess — §5.4's fourth combination.
    render(<EstimatedTime value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('not reported')).toBeInTheDocument();
  });

  it('renders the status in words, not only in colour', () => {
    render(<VesselStatusChip status="en_route" />);
    expect(screen.getByText('En route')).toBeInTheDocument();
    expect(screen.getByText('Vessel status:')).toBeInTheDocument();
  });
});

describe('flight cards keep the schedule change visible', () => {
  it('a delay shows both times, with the original struck through', () => {
    const delayed = MOCK_FLIGHTS.find((f) => f.status === 'delayed')!;
    const { container } = render(
      <FlightTime scheduled={delayed.scheduled_time} estimated={delayed.estimated_time} />
    );
    // Showing only the new time loses the fact that it moved, which is the thing
    // someone waiting at the terminal needs to see.
    expect(container.querySelector('.line-through')).not.toBeNull();
    expect(screen.getByText(/revised from the scheduled time/)).toBeInTheDocument();
  });

  it('a missing gate reads "not reported", and never "TBD"', () => {
    // §5.5: "TBD" sounds like the Authority has decided and is withholding.
    render(<GateCell gate={null} />);
    expect(screen.getByText('not reported')).toBeInTheDocument();
    expect(screen.queryByText(/TBD/i)).toBeNull();
  });

  it('renders the status in words', () => {
    render(<FlightStatusChip status="delayed" />);
    expect(screen.getByText('Delayed')).toBeInTheDocument();
    expect(screen.getByText('Flight status:')).toBeInTheDocument();
  });
});

// ── 4. Unknown is not zero ───────────────────────────────────────────────────

describe('metric tiles', () => {
  it('renders an unreported metric as unknown, never as 0', () => {
    // "0 vessels at berth" describes an empty port. That is a completely
    // different statement from "this feed does not report berth occupancy".
    // §5.3 writes the second line "not reported" — the handoff's own words,
    // shorter than the "Not reported by this source" this used to say.
    render(<MetricTile label="Berth occupancy" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('not reported')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders a real zero as a zero', () => {
    render(<MetricTile label="Arrivals" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText(/Not reported/)).toBeNull();
  });

  it('does not round a percentage to a whole number', () => {
    render(<MetricTile label="On time" value={94.8} suffix="%" />);
    expect(screen.getByText('94.8')).toBeInTheDocument();
  });
});

// ── The tariff table quotes rather than derives ──────────────────────────────

describe('the published tariff table', () => {
  /** Everything the card needs; each test overrides the one thing it is about. */
  function renderTable(props: Partial<Parameters<typeof TariffTable>[0]> = {}) {
    return render(
      <TariffTable
        source={FIXTURE_SOURCE}
        rows={MOCK_TARIFFS.slice(0, 1)}
        total={1}
        categories={['cargo', 'vessel_dues']}
        category={null}
        onCategoryChange={() => {}}
        search=""
        onSearchChange={() => {}}
        offset={0}
        limit={100}
        onOffsetChange={() => {}}
        {...props}
      />
    );
  }

  it('shows the verification date for a rate that has a source', () => {
    // A tariff verified eighteen months ago is a different claim from one
    // verified last week, and only the reader can weigh that. §1.2 labels it
    // "Checked <date>" so the date says what kind of date it is, and §10 sets
    // the form — `1 Jan 2026`, not the wire's `2026-01-01`.
    const sourced = MOCK_TARIFFS.slice(0, 2).map((row) => ({ ...row, kb_id: 'kb-001' }));
    renderTable({ rows: sourced, total: 2 });
    // Scoped to the table: the row cards for ≤640px are in the DOM too, and CSS
    // chooses between them — see `OpsTable`.
    const table = within(screen.getByRole('table'));
    expect(table.getAllByText(/Checked 1 Jan 2026/).length).toBe(2);
    /*
     * `1 Jan 2026`, from a wire value of `2026-01-01`.
     *
     * A date-only string parses as UTC midnight, so formatting it in the
     * reader's own zone moves it back a day anywhere west of Greenwich — this
     * printed "Checked 31 Dec 2025" in AST, which is the zone the port is in.
     */
    expect(table.queryByText(/31 Dec 2025/)).toBeNull();
  });

  it('says "No source recorded" for a rate with no indexed row', () => {
    /*
     * §5.9: a row with `kb_id: null` says so in words rather than showing a
     * link to nowhere. "No source recorded" is a fact about the row; an em dash
     * is a fact about the cell, and a reader cannot act on the second.
     *
     * The fixture rows are all unsourced, which is the honest default — the
     * sample tariffs are not in the knowledge base.
     */
    renderTable();
    expect(screen.getAllByText('No source recorded').length).toBeGreaterThan(0);
    // And no date, because a check date belongs to a source.
    expect(screen.queryByText(/Checked/)).toBeNull();
  });

  it('marks an indexed rate that carries no check date', () => {
    const undated = MOCK_TARIFFS.slice(0, 1).map((row) => ({ ...row, kb_id: 'kb-001', as_of: '' }));
    renderTable({ rows: undated });
    expect(screen.getAllByText('No check date').length).toBeGreaterThan(0);
  });

  it('has an accessible caption and real column headers', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Rate' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName(/Published SCASPA tariffs/);
  });

  it('says so when nothing matches, rather than rendering an empty table', () => {
    renderTable({ rows: [], total: 0, search: 'zzz' });
    expect(screen.getByText(/No published rates match/)).toBeInTheDocument();
  });
});

// ── Contract shapes ──────────────────────────────────────────────────────────

describe('the operations contract', () => {
  it('accepts the shape the backend actually sends', () => {
    const parsed = vesselArrivalsResponseSchema.safeParse({
      source: FIXTURE_SOURCE,
      vessels: MOCK_VESSELS,
      metrics: {
        vessels_at_berth: 1,
        berth_capacity: 4,
        arrivals_next_24h: 1,
        daily_cargo_teu: 1111,
        // The calendar-day tile. Null here on purpose: the field is on the wire
        // from M2 and no feed fills it until M4, and this test exists to pin
        // the shape the backend actually sends.
        arrivals_today: null,
      },
      total: 3,
      request_id: 'test',
    });
    expect(parsed.success).toBe(true);
  });

  it('survives a status the client has not been taught', () => {
    // A feed that adds a sixth status should render one row oddly, not lose the
    // whole arrivals board.
    const parsed = vesselArrivalsResponseSchema.parse({
      source: FIXTURE_SOURCE,
      vessels: [{ ...MOCK_VESSELS[0], status: 'shifting_berth' }],
      metrics: {
        vessels_at_berth: null,
        berth_capacity: null,
        arrivals_next_24h: null,
        daily_cargo_teu: null,
        arrivals_today: null,
      },
      total: 1,
      request_id: 'test',
    });
    expect(parsed.vessels[0]?.status).toBe('unknown');
  });

  it('requires a ticket receipt to say what happens next', () => {
    // Nobody will make contact first, because no contact detail was taken. A
    // receipt that omits that reads as "we'll be in touch".
    const receipt = {
      reference: 'SC-4821',
      department: 'Port operations',
      expected_response: 'within 1 business day',
      next_step: 'Quote reference SC-4821 when you contact SCASPA.',
      transcript_included: false,
      request_id: 'test',
    };
    expect(supportTicketResponseSchema.safeParse(receipt).success).toBe(true);
    expect(supportTicketResponseSchema.safeParse({ ...receipt, next_step: '' }).success).toBe(
      false
    );
  });
});

// ── Board 17: the table primitives, and the two emptinesses ──────────────────

describe('the operations table — board 17', () => {
  const COLUMNS = ['Vessel', 'Type', 'Berth', 'ETA', 'ATA', 'Status'] as const;

  it('is a real table with real column headings', () => {
    /*
     * §5.1: "Use real `<table>` semantics." The vessels screen used to be a list
     * of cards at EVERY width — so nothing above the rows said what the values
     * were, and a screen-reader user got six unlabelled strings per vessel.
     */
    render(
      <OpsTable caption="Vessel movements" columns={COLUMNS}>
        <OpsRow>
          <OpsCell first>Vega Sirius</OpsCell>
          <OpsCell>Container</OpsCell>
          <OpsCell>Berth 2</OpsCell>
          <OpsCell numeric>—</OpsCell>
          <OpsCell numeric>06:40</OpsCell>
          <OpsCell>Alongside</OpsCell>
        </OpsRow>
      </OpsTable>
    );

    const table = screen.getByRole('table', { name: 'Vessel movements' });
    for (const column of COLUMNS) {
      expect(within(table).getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    // The row's identifier is a row header, so it is announced with every cell.
    expect(within(table).getByRole('rowheader', { name: 'Vega Sirius' })).toBeInTheDocument();
  });

  it('changes row height with the density toggle and nothing else', () => {
    // §5.1: 44px comfortable, 36px compact. Density is a display preference; it
    // must not change what is in the row.
    const row = (density: 'comfortable' | 'compact') => (
      <OpsTable caption="t" columns={COLUMNS} density={density}>
        <OpsRow density={density}>
          <OpsCell first>Vega Sirius</OpsCell>
        </OpsRow>
      </OpsTable>
    );

    const { unmount } = render(row('comfortable'));
    expect(document.querySelector('tbody tr')?.className).toContain('h-row-comfortable');
    unmount();

    render(row('compact'));
    expect(document.querySelector('tbody tr')?.className).toContain('h-row-compact');
  });

  it('keeps the column headers while loading, so the shape is stable', () => {
    // §5.7: "Column headers stay so the shape is stable." A table that dissolves
    // entirely and reappears has moved every column twice.
    render(<TableSkeleton columns={COLUMNS} />);
    for (const column of COLUMNS) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('tells a missing feed apart from a filtered-out result', () => {
    /*
     * §5.7: "The two empty states are distinct on purpose: one is about the
     * source, one is about the query. They lead to different actions."
     *
     * A table empty because no feed is connected cannot be fixed by changing a
     * filter, and one empty because of a filter is not a fault in the service.
     */
    const { unmount } = render(<NoFeedState noun="vessel" />);
    expect(screen.getByText('Live vessel movements are currently unavailable')).toBeInTheDocument();
    // The limitation, stated as a rule the product holds itself to.
    expect(screen.getByText(/Pilot will not invent operational data/)).toBeInTheDocument();
    // No badge in the panel: `SourceNotice` above carries it, and two identical
    // labels a few centimetres apart halve the message rather than doubling it.
    expect(screen.queryByText('Live data unavailable')).toBeNull();
    // It names the one action that helps: a telephone number, not a filter.
    expect(screen.getByRole('link', { name: /869/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull();
    unmount();

    render(
      <FilteredOutState
        filters={[{ label: 'Alongside' }, { label: 'Berth 3' }]}
        onClear={() => {}}
      />
    );
    expect(screen.getByText('No movements match these filters')).toBeInTheDocument();
    // The active filters are named as removable chips: "a forgotten filter looks
    // exactly like missing data".
    expect(screen.getByRole('button', { name: /Remove the filter Alongside/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryByText(/feed is connected/)).toBeNull();
  });

  it('names the published budget on a rate limit, and counts down', () => {
    // §5.7: "Sixty a minute is the limit on operations data" — actionable where
    // "too many requests" alone is not.
    render(<RateLimitedState retryAfterS={18} />);
    expect(screen.getByText('Too many requests')).toBeInTheDocument();
    expect(screen.getByText(/Sixty a minute is the limit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh in 0:18/ })).toBeDisabled();
  });

  it('lays the columns out in the proportions §5.4 gives them', () => {
    /*
     * "Columns: Vessel · Type · Berth · ETA · ATA · Status at
     * `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr`."
     *
     * An auto-layout table sizes its columns from whatever text is in them, so
     * the same table draws differently on page 1 and page 2 and the reader
     * loses the column they were scanning every time they page.
     */
    const { container } = render(
      <OpsTable caption="t" columns={COLUMNS} widths={[1.5, 0.9, 0.8, 1, 1, 1]}>
        <OpsRow>
          <OpsCell first>Vega Sirius</OpsCell>
        </OpsRow>
      </OpsTable>
    );

    const cols = [...container.querySelectorAll('colgroup col')];
    expect(cols).toHaveLength(6);
    // 1.5 / 6.2 = 24.19%, 0.9 / 6.2 = 14.52%, and so on. The DOM drops a
    // trailing zero, so 12.90 reads back as 12.9.
    expect(cols.map((col) => (col as HTMLElement).style.width)).toEqual([
      '24.19%',
      '14.52%',
      '12.9%',
      '16.13%',
      '16.13%',
      '16.13%',
    ]);
    expect(container.querySelector('table')?.className).toContain('table-fixed');
  });

  it('keeps the skeleton rows at the real height for the density', () => {
    // §7.5: "Rows keep their real height (44px/36px)" — otherwise switching to
    // compact and refetching moves every row twice. "No layout shift."
    const { unmount } = render(<TableSkeleton columns={COLUMNS} density="compact" />);
    expect(document.querySelector('tbody tr')?.className).toContain('h-row-compact');
    unmount();

    render(<TableSkeleton columns={COLUMNS} />);
    expect(document.querySelector('tbody tr')?.className).toContain('h-row-comfortable');
  });

  it('gives the countdown back as a working control at zero', () => {
    /*
     * §1.3's retry: "Disabled state is the countdown … **Re-enables at zero**."
     * A frozen `Refresh in 0:18` says the wait ends in eighteen seconds and then
     * never says anything again, so the reader reloads to find out.
     */
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<RateLimitedState retryAfterS={3} onRetry={onRetry} />);

    expect(screen.getByRole('button', { name: /Refresh in 0:03/ })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toBeEnabled();
    vi.useRealTimers();
  });

  it('shows no countdown when the server did not send Retry-After', () => {
    // §7.2: the countdown is drawn from `Retry-After` and from nothing else.
    // A default wait would be a number this client made up.
    render(<RateLimitedState retryAfterS={null} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByText(/Refresh in/)).toBeNull();
  });

  it('names the department the reader should actually telephone', () => {
    // §5.7 writes the vessel copy. The flights screen inherited it verbatim, so
    // an empty arrivals board told a passenger to ring the harbour.
    render(<NoFeedState noun="flight" department="Airport Operations" />);
    expect(screen.getByText(/telephone Airport Operations/)).toBeInTheDocument();
    expect(screen.queryByText(/Marine Operations/)).toBeNull();
  });

  it('keeps the status in the top-right corner of a row card', () => {
    // §5.8: "Status keeps the top-right corner so a column of cards is still
    // scannable."
    render(
      <OpsRowCard
        title="Vega Sirius"
        status={<VesselStatusChip status="at_berth" size="sm" />}
        fields={[
          { label: 'ETA', value: '~06:30' },
          { label: 'ATA', value: '06:40' },
        ]}
      />
    );
    expect(screen.getByText('Vega Sirius')).toBeInTheDocument();
    expect(screen.getByText('Alongside')).toBeInTheDocument();
    expect(screen.getByText('ETA')).toBeInTheDocument();
    expect(screen.getByText('ATA')).toBeInTheDocument();
  });
});

// ── Board 17: the time cells write 24-hour, whatever the laptop says ─────────

describe('the clock in a table cell', () => {
  /*
   * `toLocaleTimeString([], …)` renders `06:40 AM` on a US-configured browser.
   * The same defect was found and fixed in the source banner and in the sidebar
   * status card; these are the cells the board is about, and they were missed.
   *
   * Asserted as a SHAPE rather than against a literal time, because the test
   * machine's zone is not the assertion — `HH:MM` with no meridiem is.
   */
  const CLOCK = /^\d{2}:\d{2}$/;

  it('writes an ATA in 24 hours with no meridiem', () => {
    render(<ActualTime value="2026-08-01T06:40:00Z" />);
    const text = screen.getByText(CLOCK).textContent ?? '';
    expect(text).not.toMatch(/[AP]M/i);
  });

  it('writes an ETA the same way, behind its tilde', () => {
    render(<EstimatedTime value="2026-08-01T18:15:00Z" />);
    const text = screen.getByText(/^~\d{2}:\d{2}$/).textContent ?? '';
    expect(text).not.toMatch(/[AP]M/i);
  });

  it('writes both halves of a revision in 24 hours', () => {
    render(<FlightTime scheduled="2026-08-01T16:40:00Z" estimated="2026-08-01T17:25:00Z" />);
    for (const node of screen.getAllByText(CLOCK)) {
      expect(node.textContent).not.toMatch(/[AP]M/i);
    }
  });
});

// ── Board 17 §5.6: the advisory is a passthrough, and it is attributed ───────

describe('the operational advisory panel', () => {
  const ADVISORY = {
    headline: 'Sample conditions',
    detail: 'Placeholder advisory — not a real forecast',
    temperature_c: null,
    systems_status: '',
  };

  it('renders nothing at all when there is no advisory', () => {
    // §5.6: "Entirely absent — panel not rendered. No empty container, no 'no
    // advisories' line in this position."
    const { container } = render(<OperationalAdvisoryPanel advisory={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the caution fill for an attributed notice only', () => {
    /*
     * The caution fill IS the claim that a named authority published this.
     * Drawing it over text with no publisher is the panel implying the forecast
     * is ours — "the assistant never authors an advisory, and the panel never
     * implies a forecast this service produced".
     */
    const { container, unmount } = render(<OperationalAdvisoryPanel advisory={ADVISORY} />);
    expect(container.firstElementChild?.className).toContain('bg-surface-muted');
    expect(container.firstElementChild?.className).not.toContain('bg-caution-tint');
    expect(screen.queryByText(/Published by/)).toBeNull();
    unmount();

    const attributed = render(
      <OperationalAdvisoryPanel
        advisory={ADVISORY}
        publishedBy="Marine Operations"
        at="05:40 AST"
      />
    );
    expect(attributed.container.firstElementChild?.className).toContain('bg-caution-tint');
    expect(screen.getByText('Published by Marine Operations, 05:40 AST')).toBeInTheDocument();
  });
});

// ── Board 17: the toolbar's segmented control is the 26px one ────────────────

describe('the density toggle', () => {
  it('is 26px in a toolbar and 32px in a form, and 44px under a thumb', () => {
    /*
     * §5.1: "2-option segmented control in the toolbar, right-aligned, **26px
     * segments**" — and §4.5 draws the direction toggle the same way.
     *
     * Both sizes are the DESKTOP height. §7's 44px minimum applies at ≤640px,
     * so both start at `h-11` and take their drawn height from `sm` — the
     * treatment every other control in the product already carries.
     */
    const options = [
      { value: 'comfortable' as const, label: 'Comfortable' },
      { value: 'compact' as const, label: 'Compact' },
    ];
    const { unmount } = render(
      <Segmented
        label="Density"
        size="sm"
        value="comfortable"
        onChange={() => {}}
        options={options}
      />
    );
    const compact = screen.getByRole('radio', { name: 'Comfortable' }).className;
    expect(compact).toContain('sm:h-[26px]');
    expect(compact).toContain('h-11');
    unmount();

    render(<Segmented label="Density" value="comfortable" onChange={() => {}} options={options} />);
    const medium = screen.getByRole('radio', { name: 'Comfortable' }).className;
    expect(medium).toContain('sm:h-8');
    expect(medium).toContain('h-11');
  });
});

// ── Board 17: the two screens, rendered ──────────────────────────────────────
//
// Every defect this board's second pass found was invisible to the suite,
// because nothing rendered the SCREENS: the components were all tested in
// isolation and all passed while the pages that compose them said the banner
// twice, filtered a page instead of a table, and put a figure under the wrong
// label. These render the routes.
//
// Through the REAL route tree, and not by importing the page components: a
// `export function VesselsRoute` in a route file is a symbol the router plugin
// cannot code-split, and it silently folded both screens into the entry chunk.
// The test harness does not get to change what ships.

function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithProviders(<RouterProvider router={router as never} />);
}

describe('the vessels screen', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('says where the data came from exactly once', async () => {
    /*
     * §5.2 draws one banner above the tiles. The screen rendered its own on top
     * of the shell's, so the same badge, sentence and timestamp appeared twice
     * in a row — and a warning shown twice is a warning being decorated.
     */
    renderRoute('/vessels');
    await screen.findByRole('table', { name: 'Vessel movements' });
    expect(screen.getAllByText(/SAMPLE DATA/)).toHaveLength(1);
  });

  it('keeps the search box focused while a name is typed into it', async () => {
    /*
     * ── THE BUG THIS PINS ────────────────────────────────────────────────────
     *
     * Typing accepted ONE character and then lost focus, so a vessel name had to
     * be entered one letter at a time, clicking back into the field between each.
     *
     * The cause is not a recreated element. It is the query key:
     *
     *   1. a keystroke changes `search`, so `queryKey` becomes ['vessels', {q:'M'}]
     *   2. that is a NEW query with no cached data, so `isPending` is genuinely true
     *   3. the screen's conditional swaps <OpsTable> for <TableSkeleton>
     *   4. the toolbar — and the input inside it — is a CHILD of <OpsTable>,
     *      so it unmounts with the table and the browser drops focus
     *
     * `/tariffs` never had this because `useTariffs` carries
     * `placeholderData: keepPreviousData`, which keeps `isPending` false on a
     * key change so the card is never replaced. The same fix now applies to
     * vessels and flights, plus a debounce so a query is not issued per letter.
     */
    const user = userEvent.setup();
    renderRoute('/vessels');
    await screen.findByRole('table', { name: 'Vessel movements' });

    const box = screen.getByLabelText('Search vessel name or IMO');
    await user.click(box);
    await user.type(box, 'SAMPLE');

    // The whole word arrived, and the element still has the caret.
    expect(box).toHaveValue('SAMPLE');
    expect(box).toHaveFocus();
    // And it is the same node throughout — a remount would replace it.
    expect(screen.getByLabelText('Search vessel name or IMO')).toBe(box);
  });

  it('does not issue a request per keystroke', async () => {
    /*
     * Debounced. Without it every letter is a request and a rate-limit slot:
     * `shouldRetry` is shared with the chat path deliberately, so a search box
     * that fires per keystroke spends the budget the user's next question needs.
     */
    const seen: string[] = [];
    server.use(
      http.get(`${config.apiBaseUrl}/api/vessels`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q') ?? '');
        return HttpResponse.json({
          source: { kind: 'fixture', label: 'Sample feed', as_of: null, notice: 'Sample data.' },
          vessels: MOCK_VESSELS,
          metrics: {
            vessels_at_berth: null,
            berth_capacity: null,
            arrivals_next_24h: null,
            daily_cargo_teu: null,
            arrivals_today: null,
          },
          total: MOCK_VESSELS.length,
          request_id: 'test',
        });
      })
    );

    const user = userEvent.setup();
    renderRoute('/vessels');
    await screen.findByRole('table', { name: 'Vessel movements' });
    const before = seen.length;

    await user.type(screen.getByLabelText('Search vessel name or IMO'), 'SAMPLE');
    await waitFor(() => expect(seen).toContain('SAMPLE'));

    // Six characters typed. One request for the settled term, not six —
    // allowing a little slack for the leading request already in flight.
    expect(seen.length - before).toBeLessThanOrEqual(2);
  });

  it('sends the status filter to the server rather than filtering the page', async () => {
    /*
     * `GET /api/vessels?status=` exists and `total` is counted after it. Filtering
     * in the client filtered the twenty-five rows of the CURRENT PAGE while the
     * readout went on saying "Showing 1–25 of 100", so a status with two matches
     * on page 3 looked like a status with none.
     */
    const seen: string[] = [];
    server.use(
      http.get(`${config.apiBaseUrl}/api/vessels`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        seen.push(params.get('status') ?? '');
        // Rows, not an empty list: the toolbar lives inside the table container,
        // so a screen with no rows has no select to change.
        return HttpResponse.json({
          source: { kind: 'fixture', label: 'Sample feed', as_of: null, notice: 'Sample data.' },
          vessels: MOCK_VESSELS,
          metrics: {
            vessels_at_berth: null,
            berth_capacity: null,
            arrivals_next_24h: null,
            daily_cargo_teu: null,
            arrivals_today: null,
          },
          total: MOCK_VESSELS.length,
          request_id: 'test',
        });
      })
    );

    const user = userEvent.setup();
    renderRoute('/vessels');
    await waitFor(() => expect(seen).toHaveLength(1));

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'at_berth');
    await waitFor(() => expect(seen).toContain('at_berth'));
  });

  it('sends the facility filter, and sends nothing at all for "all"', async () => {
    /*
     * The API has filtered on `facility` since M4a. Nothing sent it until M5 —
     * `features/ops/queries.ts` did not mention the field, so the parameter was
     * reachable by curl and by no other means.
     *
     * Two assertions, and the second is the one worth having: `all` must send
     * NOTHING rather than `facility=all`. The API treats an absent facility as
     * unfiltered, and no row's facility is the string "all", so sending it
     * literally would empty the table on the option named "All facilities" —
     * a filter that looks broken precisely when it is set to not filter.
     */
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${config.apiBaseUrl}/api/vessels`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('facility'));
        return HttpResponse.json({
          source: { kind: 'fixture', label: 'Sample feed', as_of: null, notice: 'Sample data.' },
          vessels: MOCK_VESSELS,
          metrics: {
            vessels_at_berth: null,
            berth_capacity: null,
            arrivals_next_24h: null,
            daily_cargo_teu: null,
            arrivals_today: null,
          },
          total: MOCK_VESSELS.length,
          request_id: 'test',
        });
      })
    );

    const user = userEvent.setup();
    renderRoute('/vessels');
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0], 'the first load must not filter').toBeNull();

    await user.selectOptions(screen.getByLabelText('Filter by facility'), 'port_zante');
    await waitFor(() => expect(seen).toContain('port_zante'));

    await user.selectOptions(screen.getByLabelText('Filter by facility'), 'all');
    await waitFor(() => expect(seen.filter((v) => v === null)).toHaveLength(2));
    expect(seen, 'literal "all" would match no row').not.toContain('all');
  });

  it('offers a way back when the facility filter empties the table', async () => {
    /*
     * **The toolbar lives inside `OpsTable`.** When no row matches, the table is
     * replaced by `FilteredOutState` and every control goes with it — so a
     * filter that panel does not list is a filter with no way back, and the
     * reader is stranded on an empty screen whose only remedy is a reload.
     *
     * Facility was exactly that when it was first wired: it could empty the
     * table while "Clear filters" reset only the search box, so clearing
     * appeared to do nothing. Caught by driving it rather than by a gate — the
     * select is simply not in the document to click a second time.
     */
    server.use(
      http.get(`${config.apiBaseUrl}/api/vessels`, ({ request }) => {
        const wanted = new URL(request.url).searchParams.get('facility');
        const vessels = wanted ? [] : MOCK_VESSELS;
        return HttpResponse.json({
          source: { kind: 'fixture', label: 'Sample feed', as_of: null, notice: 'Sample data.' },
          vessels,
          metrics: {
            vessels_at_berth: null,
            berth_capacity: null,
            arrivals_next_24h: null,
            daily_cargo_teu: null,
            arrivals_today: null,
          },
          total: vessels.length,
          request_id: 'test',
        });
      })
    );

    const user = userEvent.setup();
    renderRoute('/vessels');
    await screen.findByLabelText('Filter by facility');

    await user.selectOptions(screen.getByLabelText('Filter by facility'), 'port_zante');
    await screen.findByText(/No .* match these filters/i);

    // The select is gone with the table, so the panel must name the filter.
    expect(screen.queryByLabelText('Filter by facility')).toBeNull();
    expect(screen.getByText('Port Zante')).toBeInTheDocument();

    // And clearing must actually restore the rows.
    await user.click(screen.getByRole('button', { name: /clear/i }));
    await waitFor(() => expect(screen.getByLabelText('Filter by facility')).toBeInTheDocument());
  });

  it('tells a rate limit apart from an empty result', async () => {
    // The screen used to render "No movements match these filters" for a 429:
    // an offer to clear filters the reader may never have set, over data that
    // was never fetched.
    server.use(
      http.get(`${config.apiBaseUrl}/api/vessels`, () =>
        HttpResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests.', request_id: 'test' } },
          { status: 429, headers: { 'Retry-After': '18' } }
        )
      )
    );

    renderRoute('/vessels');
    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
    expect(screen.getByText(/Sixty a minute is the limit/)).toBeInTheDocument();
    expect(screen.queryByText(/match these filters/)).toBeNull();
  });

  it('says the feed is missing, not that the filters are wrong', async () => {
    setScenario('ops_unavailable');
    renderRoute('/vessels');
    expect(
      await screen.findByText('Live vessel movements are currently unavailable')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });
});

// ── Board 20: the console, and the panels that existed twice ─────────────────

describe('the console screen', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('says why the map is empty, in the meta strip and in the plot', async () => {
    /*
     * §6.7: "Meta strip above it carries the `NO FEED` badge. **This is the
     * expected state, not an error.**" The console rendered a heading and a
     * paragraph with no strip at all.
     */
    // The positions mock is populated for development; production has no AIS,
    // which is the state §6.7 draws.
    server.use(
      http.get(`${config.apiBaseUrl}/api/ops/positions`, () =>
        HttpResponse.json({
          source: {
            kind: 'unavailable',
            label: 'No operational feed configured',
            as_of: null,
            notice: 'No live feed is connected to this assistant.',
          },
          positions: [],
          total: 0,
          request_id: 'test',
        })
      )
    );

    renderRoute('/ops/vessels');
    expect(await screen.findByText('No positions are being reported')).toBeInTheDocument();
    expect(screen.getByText(/No AIS receiver is connected/)).toBeInTheDocument();
    // The strip carries §6.7's `NO FEED` badge — the console's own version had
    // no meta strip at all.
    expect(screen.getAllByText('Live data unavailable').length).toBeGreaterThan(0);
  });

  it('reports the service and the index without offering to rebuild either', async () => {
    /*
     * §6.11 and §6.12 had no home at all. The index panel's rule is global rule
     * 1 at its sharpest — "Every field reads 'unknown', never 0" — and
     * `08-blocked-and-forbidden.md` forbids a rebuild control, a progress bar
     * and any job-status view.
     */
    renderRoute('/ops/vessels');
    expect(await screen.findByRole('heading', { name: /Search index/ })).toBeInTheDocument();
    expect(screen.getByText(/only visible trace of the offline scripts/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rebuild|reindex|refresh the index/i })).toBeNull();
    // The health panel says which part is unavailable, never just "degraded".
    expect(screen.queryByText(/^degraded$/i)).toBeNull();
  });

  it('draws one marine advisory panel, and its empty state is not an all-clear', async () => {
    /*
     * Two implementations shipped with two different empty-state sentences for
     * the one empty state in the product where a wrong sentence has physical
     * consequences. §6.9's is the one that ships, with the number to ring.
     */
    renderRoute('/ops/vessels');
    expect(
      await screen.findByText('No notice has been published to this assistant')
    ).toBeInTheDocument();
    expect(screen.getByText(/not confirmation that conditions are normal/)).toBeInTheDocument();
    expect(screen.queryByText(/all[- ]clear/i)).toBeNull();
  });

  it('keeps ETA and ATA in two columns on the console table', async () => {
    /*
     * Global rule 2 and §5.4: "One is a prediction, one is a record. **That
     * distinction is the entire point of having two fields.**"
     *
     * The console printed whichever of the two existed in one "Arrival" column
     * with `Actual` / `Estimated` captioned beneath it — a caption read after
     * the figure has been believed, and the first thing lost when the column is
     * narrow. It was flagged on board 17 and is board 20's screen.
     */
    renderRoute('/ops/vessels');
    const table = within(await screen.findByRole('table', { name: /Vessel arrivals/ }));
    expect(table.getByRole('columnheader', { name: 'ETA' })).toBeInTheDocument();
    expect(table.getByRole('columnheader', { name: 'ATA' })).toBeInTheDocument();
    expect(table.queryByRole('columnheader', { name: 'Arrival' })).toBeNull();
    // And the caption that used to carry the distinction is gone with it.
    expect(table.queryByText('Estimated')).toBeNull();
  });

  it('counts active gates from the server, not from the tiles on screen', async () => {
    // §6.8, and implementation requirement #5.
    renderRoute('/ops/flights');
    expect(await screen.findByRole('heading', { name: 'Gate assignments' })).toBeInTheDocument();
    expect(screen.getByText(/active of/)).toBeInTheDocument();
  });
});

// ── Board 19: the support screen ─────────────────────────────────────────────
//
// Every component §6.1–6.6 asks for already existed and **none of them was on
// this screen**: `EmergencyStrip`, `ContactCard`, `ContactPointRow` and
// `EnquiryReceipt` had no caller outside their own tests. These render the
// route, which is the only thing that would have said so.

describe('the support screen', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('offers the telephone before the form, always', async () => {
    /*
     * §6.1: "**Always present, and never a permanently-red alarm banner.** A bar
     * that is red on every visit teaches people to look past it, and then it is
     * not there when it matters." A neutral strip with exactly one red element —
     * the control that dials.
     */
    renderRoute('/support');
    expect(
      await screen.findByText(/In an emergency, telephone the port at once/)
    ).toBeInTheDocument();
    expect(screen.getByText(/read during office hours only/)).toBeInTheDocument();
  });

  it('explains why it asks for nothing about the person', async () => {
    // §6.4 is "**Required.** Without it, the absence of those fields reads as a
    // broken form."
    renderRoute('/support');
    expect(await screen.findByText('Why we ask for so little')).toBeInTheDocument();
    expect(screen.getByText(/takes no name, no email address/)).toBeInTheDocument();
  });

  it('asks for no name, email, telephone or attachment. Ever.', async () => {
    // §6.5, in bold. The backend accepts none of them either.
    renderRoute('/support');
    const form = within(await screen.findByRole('form', { name: 'Send an enquiry' }));
    for (const forbidden of [/your name/i, /e-?mail/i, /phone number/i, /attach a file/i]) {
      expect(form.queryByLabelText(forbidden)).toBeNull();
    }
    expect(form.getByLabelText('Subject')).toBeInTheDocument();
    expect(form.getByLabelText('Details')).toBeInTheDocument();
  });

  it('shows the published departments, and does not invent any', async () => {
    /*
     * §6.5 asks for the seven-option select. The list is the server's — §1.4
     * illustrates seven different names, and a client-side taxonomy would route
     * a ticket to a department nobody handles.
     */
    renderRoute('/support');
    const select = await screen.findByLabelText('Department');
    // The select renders before the directory resolves, with nothing in it —
    // which is correct: an option the server has not published is one this
    // client made up.
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(0));
    const options = within(select)
      .getAllByRole('option')
      .map((node) => node.textContent);
    expect(options).toEqual(MOCK_DIRECTORY.departments);
  });

  it('collapses an empty postal field instead of drawing a gap', async () => {
    /*
     * §6.2: "The postal row is **absent from the tree**. No em dash, no `—`
     * placeholder, no reserved space, no empty label."
     */
    renderRoute('/support');
    const airport = await screen.findByRole('heading', {
      name: 'R.L. Bradshaw International Airport',
    });
    const card = airport.closest('section') as HTMLElement;
    expect(card.textContent).not.toContain('—');
    expect(within(card).queryByRole('link', { name: /call/i })).toBeInTheDocument();
  });

  it('offers the transcript only when there is a conversation to attach', async () => {
    /*
     * A tick that would attach nothing is the same lie as a tick that means "we
     * tried". `conversation_id` lives in `sessionStorage` and is written by the
     * chat route, so a visitor who has not asked anything is not offered it.
     */
    const { unmount } = renderRoute('/support');
    await screen.findByRole('form', { name: 'Send an enquiry' });
    expect(screen.queryByLabelText(/Attach this conversation/)).toBeNull();
    unmount();

    writeConversationId('11111111-1111-4111-8111-111111111111');
    renderRoute('/support');
    await screen.findByRole('form', { name: 'Send an enquiry' });
    const box = screen.getByRole('checkbox', { name: /Attach this conversation/ });
    expect(box).not.toBeChecked();
    // §1.4's eighth input: the consequence, not a restatement of the label.
    expect(screen.getByText(/read every question and answer in this session/)).toBeInTheDocument();
    clearConversationId();
  });

  it('gives a reference, and says nobody will make contact first', async () => {
    const user = userEvent.setup();
    renderRoute('/support');

    const form = within(await screen.findByRole('form', { name: 'Send an enquiry' }));
    await user.type(form.getByLabelText('Subject'), 'Berthing window');
    await user.type(form.getByLabelText('Details'), 'When does the window open?');
    await user.click(form.getByRole('button', { name: 'Send enquiry' }));

    expect(await screen.findByText('Enquiry received')).toBeInTheDocument();
    expect(screen.getByText('SC-4821')).toBeInTheDocument();
    // §6.6: "**No status tracker, no 'check my ticket' field, no progress
    // steps.** Nothing behind this screen can answer 'where is my enquiry now'."
    expect(document.body.textContent).not.toMatch(/track|progress|check my/i);
  });
});

// ── Board 18: the tariffs screen, in two steps ───────────────────────────────

describe('the tariffs screen', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('says where the schedule came from, above the rates', async () => {
    /*
     * §5.9's meta strip. The table was a navy-headed zebra grid with **no strip
     * at all** — an operations payload rendering with no statement of where it
     * came from, which the definition of done forbids outright.
     */
    renderRoute('/tariffs');
    await screen.findByRole('table', { name: /Published SCASPA tariffs/ });
    /*
     * Exactly one, and it is the card's.
     *
     * `OpsPage` renders §5.2's screen banner for the tables that have no strip
     * of their own. Every payload on THIS screen has one, so passing the source
     * to the shell as well put the same sentence on screen twice — once in the
     * banner and once in the mandatory notice directly beneath it.
     */
    expect(screen.getAllByText(/SAMPLE DATA/)).toHaveLength(1);
  });

  it('prints a rate exactly as published, with its basis', async () => {
    // §5.9: "Rendered exactly as published — `186.00 per container`, `0.42`,
    // `37.50 per day`. No rounding, no conversion, no normalised unit column."
    renderRoute('/tariffs');
    const table = within(await screen.findByRole('table', { name: /Published SCASPA tariffs/ }));
    expect(table.getAllByText(/22\.22 per container/).length).toBe(1);
  });

  it('keeps every category chip on screen while one is selected', async () => {
    /*
     * §5.9: "Category chips are computed from the whole table, not from the
     * filtered rows. Selecting 'Cargo' must never make the other four vanish and
     * strand the user."
     *
     * The chips come from `categories`, which the server computes from every
     * row; this proves the client does not re-derive them from what it can see.
     */
    const user = userEvent.setup();
    renderRoute('/tariffs');
    const cargo = await screen.findByRole('button', { name: 'Cargo' });

    await user.click(cargo);
    await waitFor(() => expect(cargo).toHaveAttribute('aria-pressed', 'true'));
    // The other chip is still there, and it is the way back. "Vessel dues"
    // rather than "Maritime": the label is the wire value with its underscore
    // spaced, never a name this client invented.
    expect(screen.getByRole('button', { name: 'Vessel dues' })).toBeInTheDocument();
  });

  it('draws two calculators that do not look like each other', async () => {
    // §5.10: "A user must never fill in the wrong one by muscle memory."
    renderRoute('/tariffs');
    const maritime = await screen.findByRole('form', { name: 'Maritime charges' });
    const cargo = screen.getByRole('form', { name: 'Cargo charges' });

    expect(maritime.className).toContain('bg-surface');
    expect(cargo.className).toContain('bg-surface-muted');
    // The fields swap with them, so the two forms differ all the way down.
    expect(within(maritime).getByLabelText('Length').className).toBeTruthy();
    expect(within(cargo).getByLabelText('Units')).toBeInTheDocument();
  });

  it('carries no figures until the user enters some', async () => {
    // §4.6's rule, and the same reasoning: "a prefilled quantity would read as a
    // quote the Authority had made".
    renderRoute('/tariffs');
    const cargo = within(await screen.findByRole('form', { name: 'Cargo charges' }));
    expect(cargo.getByLabelText('Units')).toHaveValue(null);
    expect(cargo.getByLabelText('Storage')).toHaveValue(null);
  });

  it('lets a vessel type be chosen, and sends it', async () => {
    /*
     * ── THE BUG THIS PINS ────────────────────────────────────────────────────
     *
     * The select was `disabled` with a single "Choose a type" option, so it
     * could not be operated at all — on the calculator this product demonstrates
     * live.
     *
     * It was disabled for a good reason at the time: nothing read
     * `vessel_type`, and there was no published list of types, so an enabled
     * control would have moved no figure. Both are answerable now — the schedule
     * carries `DCK-FT` and `DCK-CR`, two dockage rates that differ only by type
     * — and the options are that pair rather than a set invented here.
     */
    const user = userEvent.setup();
    renderRoute('/tariffs');
    const maritime = within(await screen.findByRole('form', { name: 'Maritime charges' }));

    const select = maritime.getByLabelText('Vessel type');
    expect(select).toBeEnabled();
    // Both published types are offered, and nothing else.
    expect(maritime.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Commercial vessel',
      'Cruise vessel',
    ]);

    await user.selectOptions(select, 'cruise');
    expect(select).toHaveValue('cruise');
  });

  it('prices a cruise vessel differently from a commercial one', async () => {
    /*
     * The reason the control is allowed to be enabled at all: it moves a figure.
     * A select that changed nothing would be the product implying a rule it does
     * not apply, which is exactly why it shipped disabled.
     */
    const sent: unknown[] = [];
    server.use(
      http.post(`${config.apiBaseUrl}/api/tariffs/quote`, async ({ request }) => {
        const body = await request.json();
        sent.push(body);
        return HttpResponse.json({
          line_items: [],
          unpriced: [],
          subtotal: 0,
          total: 0,
          currency: 'XCD',
          derived: true,
          disclaimer: MOCK_DISCLAIMER,
          source: FIXTURE_SOURCE,
          request_id: 'test',
        });
      })
    );

    const user = userEvent.setup();
    renderRoute('/tariffs');
    const maritime = within(await screen.findByRole('form', { name: 'Maritime charges' }));

    await user.selectOptions(maritime.getByLabelText('Vessel type'), 'cruise');
    await user.type(maritime.getByLabelText('Length'), '100');
    await user.type(maritime.getByLabelText('Stay'), '2');
    await user.click(maritime.getByRole('button', { name: /Work out|Calculate|Estimate/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ category: 'vessel_dues', vessel_type: 'cruise' });
  });

  it('states the currency rather than offering to change it', async () => {
    /*
     * §5.10: "**Currency is a fixed label, not a select.**" Converting a
     * published fee applies a rate of exchange nobody published, and the API
     * refuses anything but XCD for that reason.
     */
    renderRoute('/tariffs');
    const cargo = within(await screen.findByRole('form', { name: 'Cargo charges' }));
    expect(cargo.getByText('XCD')).toBeInTheDocument();
    expect(cargo.getByText(/A label, not a selector/)).toBeInTheDocument();
    // Two controls in this form, and neither is a currency: the size toggle and
    // the submit button.
    expect(cargo.queryByLabelText(/currency/i)).toBeNull();
  });

  it('works out an estimate, and never shows it without the disclaimer', async () => {
    const user = userEvent.setup();
    renderRoute('/tariffs');
    const cargo = within(await screen.findByRole('form', { name: 'Cargo charges' }));

    await user.type(cargo.getByLabelText('Units'), '2');
    await user.click(cargo.getByRole('button', { name: /Work out the charge/ }));

    // The estimate, with its currency, and the subtotal as a separate row.
    expect(await screen.findByText('Estimated SCASPA charge')).toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    // Last child, never collapsed, never truncated.
    expect(screen.getByRole('note')).toHaveTextContent(/not an invoice/);
  });
});

describe('the flights screen', () => {
  afterEach(() => {
    server.resetHandlers();
    setScenario('happy');
  });

  it('draws §5.3’s three tiles, each reading its own field', async () => {
    /*
     * "Flights — three tiles: Arrivals today · Departures today · Delayed."
     *
     * This asserted three em dashes, which was right while none of the three was
     * on the wire. T-07 added them and M4a filled them, so the tiles carry
     * figures now — and the thing worth pinning has changed with it.
     *
     * What must stay true is that **no tile is `total_flights` wearing a
     * different label**. That field counts both directions across the whole
     * feed; rendering it under "Arrivals today" reported 4 arrivals where the
     * feed held 3, and relabelled the same figure "Departures today" when the
     * toggle flipped. Arrivals and departures must therefore differ from each
     * other and from the total.
     */
    renderRoute('/flights');
    await screen.findByRole('table', { name: 'Flight movements' });

    // Scoped to the tiles: "Delayed" is also a status chip in the rows below,
    // which is the whole reason the count has to come from the server and not
    // from them.
    const tiles = screen.getByText('Arrivals today').closest('div')?.parentElement as HTMLElement;
    for (const label of ['Arrivals today', 'Departures today', 'Delayed']) {
      expect(within(tiles).getByText(label)).toBeInTheDocument();
    }

    // The fixture's own figures: 7 arrivals, 5 departures, 2 delayed of 12.
    expect(within(tiles).getByText('7')).toBeInTheDocument();
    expect(within(tiles).getByText('5')).toBeInTheDocument();
    expect(within(tiles).getByText('2')).toBeInTheDocument();
    // And none of them is the both-directions total.
    expect(within(tiles).queryByText('12')).toBeNull();

    // The figures that were standing in belong to the Console.
    expect(screen.queryByText('On time')).toBeNull();
    expect(screen.queryByText('Gates active')).toBeNull();
  });

  it('says where the data came from exactly once', async () => {
    renderRoute('/flights');
    await screen.findByRole('table', { name: 'Flight movements' });
    expect(screen.getAllByText(/SAMPLE DATA/)).toHaveLength(1);
  });

  it('renders the advisory as a passthrough, unattributed', async () => {
    // §5.6. The panel existed and no screen rendered it; the wire carries no
    // publisher, so it draws in the neutral fill until one lands.
    renderRoute('/flights');
    expect(await screen.findByText('Sample conditions')).toBeInTheDocument();
    expect(screen.queryByText(/Published by/)).toBeNull();
  });
});
