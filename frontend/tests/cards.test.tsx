/**
 * Inline assistant cards.
 *
 * The design's whole reason for existing is that an answer can *show* an
 * arrivals board while the prose refuses to describe one. Which means the
 * properties worth testing are not "the card renders" but:
 *
 *   1. a data card always carries its feed's notice — the one thing telling a
 *      reader whether they are looking at a live feed or fixtures;
 *   2. a card whose `source` is missing is refused at the boundary, not shown
 *      unsourced;
 *   3. the calculator arrives with no figure on it;
 *   4. the ticket form collects no identity and its receipt says so;
 *   5. an ETA in a compact row still reads as an ETA.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { CardBlock } from '@/components/chat/CardBlock';
import { chatResponseSchema, assistantCardSchema } from '@/lib/schemas';
import {
  CARD_FLIGHTS,
  CARD_TARIFF,
  CARD_TICKET,
  CARD_VESSELS,
  CARD_VESSELS_EMPTY,
} from '@/mocks/opsFixtures';
import { CHAT_RESPONSE } from '@/mocks/fixtures';
import { renderInRouter } from './helpers';

// ── 1 & 2. Provenance travels with the rows, or the card does not render ─────

describe('a data card carries its provenance', () => {
  it('shows the feed notice above the rows', async () => {
    renderInRouter(<CardBlock card={CARD_VESSELS} />);
    await screen.findByText(/SAMPLE DATA/);
    expect(screen.getByText('MV SAMPLE CARRIER')).toBeInTheDocument();
  });

  it('explains an empty board instead of vanishing', async () => {
    // An answer saying "here is the board" with no board is worse than an empty
    // one. The notice is the explanation.
    renderInRouter(<CardBlock card={CARD_VESSELS_EMPTY} />);
    await screen.findByText(/No vessel movements are being reported/);
    expect(screen.getByText(/not connected/)).toBeInTheDocument();
  });

  it('REFUSES a vessel card whose source is missing', () => {
    // Mutation-tested. A board with no provenance is indistinguishable from a
    // live one, which is the single worst thing this feature could ship.
    const stripped: Record<string, unknown> = { ...CARD_VESSELS };
    delete stripped['source'];
    expect(assistantCardSchema.safeParse(stripped).success).toBe(false);
    expect(assistantCardSchema.safeParse(CARD_VESSELS).success).toBe(true);
  });

  it('drops an unrecognised card kind without losing the answer', () => {
    // The prose stands on its own. Refusing a whole response over a card kind
    // this build has not been taught would trade an answer for a feature.
    const parsed = chatResponseSchema.parse({
      ...CHAT_RESPONSE,
      card: { kind: 'berth_planner', title: 'Berths', href: '/x' },
    });
    expect(parsed.card).toBeNull();
    expect(parsed.answer).toBe(CHAT_RESPONSE.answer);
  });
});

// ── 3. The calculator arrives empty ──────────────────────────────────────────

describe('the inline calculator', () => {
  it('shows no figure until the user asks for one', async () => {
    const { container } = renderInRouter(<CardBlock card={CARD_TARIFF} />);
    await screen.findByRole('button', { name: 'Calculate' });

    // A pre-totalled card would be the assistant producing an estimate, which
    // its own rules forbid. The only numbers on screen are the quantity inputs
    // the user will change.
    expect(container.textContent).not.toMatch(/XCD|EC\$|\$\d/);
    expect(screen.queryByText(/Estimated total/)).toBeNull();
  });

  it('carries no currency field, so a fee cannot be converted', () => {
    // Converting a published fee applies a rate nobody published.
    renderInRouter(<CardBlock card={CARD_TARIFF} />);
    expect(screen.queryByLabelText(/currency/i)).toBeNull();
  });
});

// ── 4. The ticket form collects no identity ──────────────────────────────────

describe('the inline ticket form', () => {
  it('asks for no name, email or phone number', async () => {
    renderInRouter(<CardBlock card={CARD_TICKET} />);
    await screen.findByRole('button', { name: 'Send ticket' });

    for (const label of [/name/i, /email/i, /phone/i, /attach/i]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('says nobody will make contact first, before it is filled in', async () => {
    // Discovering this on the receipt is discovering it too late to pick up a
    // phone instead.
    renderInRouter(<CardBlock card={CARD_TICKET} />);
    await screen.findByText(/nobody will contact you first/);
    expect(screen.getByRole('link', { name: /869-465-8121/ })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
  });

  it('prefills the subject the assistant summarised, editable', async () => {
    renderInRouter(<CardBlock card={CARD_TICKET} />);
    const subject = await screen.findByLabelText('Subject');
    expect(subject).toHaveValue('Query about container storage rates');
    expect(subject).toBeEnabled();
  });
});

// ── 5. A prediction still reads as a prediction, even compressed ─────────────

describe('compact rows keep the distinctions the full cards make', () => {
  it('labels an expected arrival Estimated and an actual one Arrived', async () => {
    renderInRouter(<CardBlock card={CARD_VESSELS} />);
    await screen.findByText('MV SAMPLE CARRIER');

    // MOCK_VESSELS has one arrived (ata) and two expected (eta).
    expect(screen.getAllByText(/^Arrived /).length).toBe(1);
    expect(screen.getAllByText(/^Estimated /).length).toBe(2);
  });

  it('links on to the full board rather than pretending to be it', async () => {
    renderInRouter(<CardBlock card={CARD_VESSELS} />);
    const link = await screen.findByRole('link', { name: /See all/ });
    expect(link).toHaveAttribute('href', '/vessels');
  });

  it('renders a flight card with its own notice and statuses', async () => {
    renderInRouter(<CardBlock card={CARD_FLIGHTS} />);
    await screen.findByText(/SAMPLE DATA/);
    expect(screen.getByText('ZZ 1111')).toBeInTheDocument();
    expect(screen.getByText('Delayed')).toBeInTheDocument();
  });
});
