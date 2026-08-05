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
  MOCK_VESSELS,
} from '@/mocks/opsFixtures';
import { CHAT_RESPONSE } from '@/mocks/fixtures';
import { renderInRouter } from './helpers';
import type { AssistantCard } from '@/lib/types';

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
    /*
     * Board 16 splits this into two emptinesses. A feed that answered with no
     * rows is a fact about today; a feed that is not connected is a fact about
     * the service, and it is the production default. This fixture is the
     * second, so it must not say "nothing recorded for today" — that would be a
     * claim about the day that nothing behind it supports.
     */
    await screen.findByText(/No vessel movements feed is connected/);
    expect(screen.getByText(/not connected/)).toBeInTheDocument();
    expect(screen.queryByText(/recorded for today/)).toBeNull();
  });

  it('and says the other emptiness differently when the feed did answer', async () => {
    // Narrowed before spreading: the fixture is typed as the whole union, and a
    // `tariff_calculator` has no `source` for the spread to reach.
    const empty = CARD_VESSELS_EMPTY as Extract<AssistantCard, { kind: 'vessel_arrivals' }>;
    renderInRouter(<CardBlock card={{ ...empty, source: { ...empty.source, kind: 'fixture' } }} />);
    await screen.findByText(/No vessel movements recorded for today/);
    expect(screen.getByText(/It is not a fault/)).toBeInTheDocument();
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
  it('carries no figure at all — not even a prefilled quantity', async () => {
    /*
     * §4.6, and this card used to break it: a segmented 20ft/40ft control, a
     * units field **defaulting to 1**, a storage-days field and an inline total.
     * Every one of those is a figure the assistant chose, sitting inside an
     * answer the assistant wrote.
     *
     * "A prefilled quantity would read as a quote the Authority had made."
     */
    const { container } = renderInRouter(<CardBlock card={CARD_TARIFF} />);
    await screen.findByRole('link', { name: 'Open the calculator' });

    expect(container.textContent).not.toMatch(/XCD|EC\$|\$\d/);
    expect(container.textContent).not.toMatch(/\d/);
    expect(screen.getByText(/Nothing here is prefilled/)).toBeInTheDocument();
  });

  it('offers no input to type into, because typing here does nothing', async () => {
    // The placeholders are drawn and inert. An empty box a user can type into
    // that then does nothing is worse than a picture of one; the button is the
    // only control and it goes to the real calculator.
    const { container } = renderInRouter(<CardBlock card={CARD_TARIFF} />);
    await screen.findByRole('link', { name: 'Open the calculator' });
    // Scoped to this render: `document` accumulates trees across the file.
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Open the calculator' })).toHaveAttribute(
      'href',
      '/tariffs'
    );
  });

  it('carries no currency field, so a fee cannot be converted', () => {
    // Converting a published fee applies a rate nobody published.
    renderInRouter(<CardBlock card={CARD_TARIFF} />);
    expect(screen.queryByLabelText(/currency/i)).toBeNull();
  });
});

// ── 4. The ticket form collects no identity ──────────────────────────────────

describe('the inline ticket card', () => {
  it('asks for no name, email or phone number', async () => {
    renderInRouter(<CardBlock card={CARD_TICKET} />);
    await screen.findByRole('link', { name: 'Continue to the form' });

    for (const label of [/name/i, /email/i, /phone/i, /attach/i]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('is one field and one way out, not the whole enquiry form', async () => {
    /*
     * §4.7 gives this card a subject field and a "Continue to the form" button.
     * It used to be the entire form — department, details, submit — rendering
     * its own receipt inline. The real form has a 4000-character details field
     * and a transcript checkbox whose consequence line is load-bearing (§6.5),
     * and none of that fits, or belongs, inside a chat turn.
     */
    renderInRouter(<CardBlock card={CARD_TICKET} />);
    await screen.findByRole('link', { name: 'Continue to the form' });
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /details/i })).toBeNull();
  });

  it('presents the subject as a draft to edit, not a value to confirm', async () => {
    // "The subject is model-written. It is presented as a draft the user edits,
    // never as a fixed value they merely confirm" — hence the brand-500 edge,
    // which is the focused treatment.
    renderInRouter(<CardBlock card={CARD_TICKET} />);
    const subject = await screen.findByLabelText(/Subject — drafted for you/);
    expect(subject).toHaveValue('Query about container storage rates');
    expect(subject).toBeEnabled();
    expect(subject.className).toContain('border-brand-500');
  });
});

// ── 5. A prediction still reads as a prediction, even compressed ─────────────

describe('compact rows keep the distinctions the full cards make', () => {
  it('marks a predicted time with ~ and leaves a recorded one upright', async () => {
    /*
     * This asserted the words "Arrived" and "Estimated" in the row meta.
     *
     * §4.4 writes that line `Berth 2 · 06:40` — berth, then the time, and no
     * verb. The distinction between a prediction and a record is carried the
     * way §5.4 carries it everywhere else in the product: **ETA is prefixed
     * `~`, ATA is not.** "One is a prediction, one is a record; that distinction
     * is the entire point of having two fields."
     *
     * The card shows the first three of `MOCK_VESSELS`, and those three are
     * chosen to cover the distinction: two have arrived (`ata`, upright) and one
     * is predicted only (`eta`, tilde). Counted rather than hardcoded, so the
     * assertion follows the fixture instead of drifting from it.
     */
    renderInRouter(<CardBlock card={CARD_VESSELS} />);
    await screen.findByText('MV SAMPLE CARRIER');

    const shown = MOCK_VESSELS.slice(0, 3);
    const predicted = shown.filter((v) => v.ata === null).length;
    const recorded = shown.length - predicted;

    const metas = [...document.querySelectorAll('li p:nth-of-type(2)')].map(
      (p) => p.textContent ?? ''
    );
    expect(metas.filter((line) => line.includes('~'))).toHaveLength(predicted);
    expect(metas.filter((line) => !line.includes('~'))).toHaveLength(recorded);
    // Both cases must actually occur, or the test proves nothing.
    expect(predicted).toBeGreaterThan(0);
    expect(recorded).toBeGreaterThan(0);
    // And no verb: the berth leads, per §4.4.
    expect(metas.join(' ')).not.toMatch(/Arrived|Estimated/);
  });

  it('links on to the full board rather than pretending to be it', async () => {
    renderInRouter(<CardBlock card={CARD_VESSELS} />);
    const link = await screen.findByRole('link', { name: /See all/ });
    expect(link).toHaveAttribute('href', '/vessels');
  });

  it('renders a flight card with its own notice and statuses', async () => {
    renderInRouter(<CardBlock card={CARD_FLIGHTS} />);
    await screen.findByText(/SAMPLE DATA/);
    // The flight number now shares its line with the route — board 16 draws
    // "LI 631 · Antigua" as one row, so match within rather than exactly.
    expect(screen.getByText(/ZZ 1111/)).toBeInTheDocument();
    expect(screen.getByText('Delayed')).toBeInTheDocument();
  });

  it('never invents airline initials when no code was reported', async () => {
    /*
     * Board 16: "Airline avatar falls back to an outline glyph when no code
     * exists — never to invented initials." Deriving "CH" from "Charter" puts
     * two letters that look like an IATA code next to a flight number, in a
     * product where a code means something.
     */
    const flights = CARD_FLIGHTS as Extract<AssistantCard, { kind: 'flight_schedules' }>;
    const noCode = {
      ...flights,
      flights: flights.flights.map((flight) => ({
        ...flight,
        airline_code: '',
        airline: 'Charter',
      })),
    };
    const { container } = renderInRouter(<CardBlock card={noCode} />);
    await screen.findByText(/SAMPLE DATA/);
    expect(screen.queryByText('CH')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('says the gate is not reported rather than "TBD"', async () => {
    // "TBD" sounds like the Authority has decided and is withholding.
    const withGates = CARD_FLIGHTS as Extract<AssistantCard, { kind: 'flight_schedules' }>;
    const noGate = {
      ...withGates,
      flights: withGates.flights.map((flight) => ({ ...flight, gate: null })),
    };
    renderInRouter(<CardBlock card={noGate} />);
    await screen.findByText(/SAMPLE DATA/);
    expect(screen.getAllByText(/gate not reported/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/TBD/)).toBeNull();
  });
});
