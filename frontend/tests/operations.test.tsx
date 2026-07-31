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

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuoteResult } from '@/components/ops/QuoteResult';
import { SourceAge, SourceNotice } from '@/components/ops/SourceNotice';
import { MetricTile } from '@/components/ops/MetricTile';
import { VesselCard } from '@/components/ops/VesselCard';
import { FlightCard } from '@/components/ops/FlightCard';
import { TariffTable } from '@/components/ops/TariffTable';
import { FlightStatusChip, VesselStatusChip } from '@/components/ops/StatusChip';
import {
  FIXTURE_SOURCE,
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

  it('labels the figure an estimate rather than a charge', () => {
    render(<QuoteResult quote={QUOTE} />);
    expect(screen.getByText('Estimated total')).toBeInTheDocument();
    // Scoped to the table. The disclaimer says "not an invoice", so a search
    // over the whole render matches the sentence that exists to prevent exactly
    // the reading this is checking for.
    const table = screen.getByRole('table');
    expect(table.textContent).not.toMatch(/invoice|amount due|total due/i);
  });

  it('shows every rate and quantity, so the arithmetic can be checked by hand', () => {
    render(<QuoteResult quote={QUOTE} />);
    expect(screen.getByText('XCD 44.44')).toBeInTheDocument();
    expect(screen.getByText('2 containers')).toBeInTheDocument();
    // Twice: once as the line amount, once as the total. A single line item and
    // the total are equal by definition, and that is the arithmetic being shown.
    expect(screen.getAllByText('XCD 88.88')).toHaveLength(2);
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

  it('says nothing was priced rather than showing a zero', () => {
    render(<QuoteResult quote={{ ...QUOTE, line_items: [], subtotal: 0, total: 0 }} />);
    expect(screen.getByText(/Nothing was priced/)).toBeInTheDocument();
  });
});

// ── 3. A prediction must not read as a record ────────────────────────────────

describe('vessel cards keep ETA and ATA apart', () => {
  it('an arrived vessel is labelled Arrived', () => {
    const arrived = MOCK_VESSELS.find((v) => v.ata !== null)!;
    render(
      <ul>
        <VesselCard vessel={arrived} />
      </ul>
    );
    expect(screen.getByText('Arrived')).toBeInTheDocument();
    expect(screen.queryByText('Estimated arrival')).toBeNull();
  });

  it('an expected vessel is labelled Estimated, and says so to a screen reader', () => {
    const expected = MOCK_VESSELS.find((v) => v.eta !== null && v.ata === null)!;
    render(
      <ul>
        <VesselCard vessel={expected} />
      </ul>
    );
    expect(screen.getByText('Estimated arrival')).toBeInTheDocument();
    expect(screen.getByText(/estimated, not confirmed/)).toBeInTheDocument();
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
      <ul>
        <FlightCard flight={delayed} />
      </ul>
    );
    // Showing only the new time loses the fact that it moved, which is the thing
    // someone waiting at the terminal needs to see.
    expect(container.querySelector('s')).not.toBeNull();
    expect(screen.getByText(/rescheduled from/)).toBeInTheDocument();
  });

  it('a missing gate renders as an em dash, not as blank or "null"', () => {
    const noGate = MOCK_FLIGHTS.find((f) => f.gate === null)!;
    render(
      <ul>
        <FlightCard flight={noGate} />
      </ul>
    );
    expect(screen.getByText('—')).toBeInTheDocument();
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
    render(<MetricTile label="Vessels at berth" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Not reported by this source/)).toBeInTheDocument();
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
  it('shows the verification date for every rate', () => {
    render(<TariffTable rows={MOCK_TARIFFS.slice(0, 2)} />);
    // A tariff verified eighteen months ago is a different claim from one
    // verified last week, and only the reader can weigh that.
    expect(screen.getAllByText('2026-01-01').length).toBe(2);
  });

  it('has an accessible caption and real column headers', () => {
    render(<TariffTable rows={MOCK_TARIFFS.slice(0, 1)} />);
    expect(screen.getByRole('columnheader', { name: 'Rate' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAccessibleName(/Published SCASPA tariffs/);
  });

  it('says so when nothing matches, rather than rendering an empty table', () => {
    render(<TariffTable rows={[]} />);
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
