/**
 * The boards added or rebuilt from the design spec: 02, 03, 04, 06, 08, 10, 11,
 * 12.
 *
 * These assert the rules the spec states in words — what must be ABSENT as
 * often as what must be present, because most of these components exist to
 * avoid claiming something the product cannot support.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderInRouter } from './helpers';
import { Breadcrumb } from '@/components/shells/Breadcrumb';
import { NotFound } from '@/components/shells/NotFound';
import { ContactCard } from '@/components/ops/ContactCard';
import { DataSourceCard } from '@/components/ops/DataSourceCard';
import { SeverityChip, VesselStatusChip } from '@/components/ops/StatusChip';
import { EnquiryReceipt } from '@/components/ops/EnquiryReceipt';
import { NoResults } from '@/components/ops/console/NoResults';
import { OpsListHeader } from '@/components/ops/OpsListHeader';
import { SpendSummary } from '@/components/ops/SpendSummary';
import type { ContactLocation, SupportTicketResponse } from '@/lib/types';

// ── Board 00c: Family B is the outline pill, and board 07 does not override it ─

describe('the operational status pill', () => {
  /*
   * Board 07 draws these filled and borderless; board 00c and §1.2 draw them as
   * outlines. The exported source says board 07 defines no distinct component
   * (identical markup), sits on the same surface, carries no note declaring a
   * special state, and is a subset of what 00c already draws — so it is
   * inconsistent rather than a variant. Board 00c is canonical.
   *
   * These assertions exist so that reading board 07 on its own cannot quietly
   * flip the family back.
   */
  it('outlines the hued variants and fills none of them', () => {
    const { container } = render(<VesselStatusChip status="at_berth" />);
    const chip = container.firstElementChild!;
    expect(chip.className).toContain('border-positive-edge');
    expect(chip.className).not.toContain('bg-positive-tint');
  });

  it('gives the settled variants a hairline and no ground', () => {
    // 00c: `1px solid #262A42`, nothing behind it. 07 adds `#1E2137`.
    const { container } = render(<VesselStatusChip status="departed" />);
    const chip = container.firstElementChild!;
    expect(chip.className).toContain('border-border');
    expect(chip.className).not.toMatch(/bg-surface/);
  });

  it('dashes the absent variant in text-3, and fills it with nothing', () => {
    // §1.2 says `--text-3`. The implementation had drifted to text-2 via
    // `ink-subtle`; board 07 goes the other way to `--border`.
    const { container } = render(<VesselStatusChip status="unknown" />);
    const chip = container.firstElementChild!;
    expect(chip.className).toContain('border-dashed');
    expect(chip.className).toContain('border-text-3');
    expect(chip.className).not.toMatch(/bg-(positive|caution|critical|live|surface)/);
  });

  it('fills exactly one variant in the whole enumeration — urgent', () => {
    // "or the 12% tint where noted", noted once.
    const { container } = render(<SeverityChip severity="high" />);
    expect(container.firstElementChild!.className).toContain('bg-critical-tint');
  });

  it('labels the vessel unknown state "Not reported", not "Unknown"', () => {
    // §1.2, §5.4 and board 00c agree; board 07's enumeration is the outlier.
    render(<VesselStatusChip status="unknown" />);
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).toBeNull();
  });
});

// ── Board 06: the data-source status card ────────────────────────────────────

describe('DataSourceCard', () => {
  const card = (kind: 'fixture' | 'live' | 'unavailable') => ({
    kind,
    label: 'Test fixture',
    as_of: '2026-08-01T10:10:00Z',
    notice: 'Figures come from the test fixture. Do not quote them to a customer.',
  });

  it('treats an absent feed as neutral, never as an error', () => {
    /*
     * The whole of §5.4 on this state, and it is the PRODUCTION DEFAULT — SCASPA
     * has published no feed, so whatever this card says is what every user sees
     * on every visit.
     *
     * "A feed that was never connected is a known state, not a failure. Reserve
     * critical for things that actually broke. Copy for this state is 'No feed
     * connected', never 'Error'." It used to be a solid red dot reading "Data
     * unavailable" — a permanent alarm, which is how a warning stops being read.
     */
    const { container } = render(<DataSourceCard source={card('unavailable')} />);
    expect(screen.getByText('No feed connected')).toBeInTheDocument();
    expect(screen.queryByText(/unavailable|error|fault|problem/i)).toBeNull();

    // Hollow, and not any status hue: a ring says "nothing is coming through"
    // where a solid dot of any colour says "here is a state".
    const dot = container.querySelector('[aria-hidden="true"].rounded-full')!;
    expect(dot.className).toContain('border-neutral-status');
    expect(dot.className).not.toContain('bg-critical');
  });

  it('keeps the last-known time rather than hiding a stale figure', () => {
    // "An agent needs to know whether the stale figure is an hour old or a day
    // old", so the timestamp survives the feed going away.
    render(<DataSourceCard source={card('unavailable')} />);
    expect(screen.getByText(/Last known/)).toBeInTheDocument();
  });

  it('never says everything is fine', () => {
    // "The card never says 'everything is fine'. `live` simply states when it
    // last refreshed and lets the user judge the time."
    render(<DataSourceCard source={card('live')} />);
    expect(screen.getByText('Live data')).toBeInTheDocument();
    expect(screen.getByText(/Refreshed/)).toBeInTheDocument();
    expect(
      screen.queryByText(/all (is )?well|healthy|connected and working|up to date/i)
    ).toBeNull();
  });

  it('writes the time 24-hour with its zone, not in the browser’s own format', () => {
    // §10: "Times are 24-hour with the zone: 06:40 AST." `toLocaleString()` on
    // a US-configured browser gives "8/1/2026, 6:10:00 AM" — a 12-hour clock
    // with no zone, in a product where every other time on screen is 24-hour.
    render(<DataSourceCard source={card('fixture')} />);
    const stamp = screen.getByText(/Loaded/);
    expect(stamp.textContent).toMatch(/\d{2}:\d{2}/);
    expect(stamp.textContent).not.toMatch(/\b(AM|PM)\b/i);
  });

  it('warns about conduct on sample data, in words a customer-facing agent needs', () => {
    render(<DataSourceCard source={card('fixture')} />);
    expect(screen.getByText('Sample data — not live')).toBeInTheDocument();
    expect(screen.getByText(/Do not quote them to a customer/)).toBeInTheDocument();
  });
});

// ── Board 03: breadcrumb ─────────────────────────────────────────────────────

describe('Breadcrumb', () => {
  const TRAIL = [{ label: 'Tariffs', to: '/tariffs' }, { label: 'Quote' }];

  it('does not make the current page a link', async () => {
    /*
     * A link to where you already are is a control that does nothing.
     *
     * Scoped to the `<nav>`: jsdom applies no stylesheet, so the mobile back
     * control and the desktop trail are BOTH in the tree here even though only
     * one is ever painted. Querying the document would find "Tariffs" twice and
     * say nothing about either.
     */
    renderInRouter(<Breadcrumb trail={TRAIL} title="Quote — 40ft container" />);
    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });

    expect(within(trail).getByRole('link', { name: 'Tariffs' })).toBeInTheDocument();
    expect(within(trail).queryByRole('link', { name: 'Quote' })).toBeNull();
    expect(within(trail).getByText('Quote')).toHaveAttribute('aria-current', 'page');
  });

  it('labels the mobile control with the parent it returns to', async () => {
    /*
     * "A bare arrow gives no clue where it lands, and on a receipt screen that
     * matters." The collapse is a different control, not fewer crumbs.
     */
    renderInRouter(
      <Breadcrumb
        trail={[
          { label: 'Contact directory', to: '/support' },
          { label: 'Enquiry form', to: '/support/new' },
          { label: 'Receipt' },
        ]}
        title="Enquiry received"
      />
    );
    // The immediate parent, not the root.
    const links = await screen.findAllByRole('link', { name: 'Enquiry form' });
    expect(links.length).toBeGreaterThan(0);
  });
});

// ── Board 04: the one 404 ────────────────────────────────────────────────────

describe('NotFound', () => {
  it('offers no lock, no sign-in prompt and no softer wording', async () => {
    /*
     * "Any difference between the two confirms the address exists." An
     * unauthenticated visitor to /admin/stats and a visitor to /adnim get this,
     * byte for byte.
     */
    const { container } = renderInRouter(<NotFound />);
    await screen.findByText('Page not found');

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/sign in|log in|permission|access|unauthorised|unauthorized|admin/i);
    expect(screen.getByRole('link', { name: /Back to the assistant/ })).toBeInTheDocument();
  });

  it('takes no props, so no variant can be added later', () => {
    // The security property is that there is exactly one of these.
    expect(NotFound.length).toBe(0);
  });
});

// ── Board 08: contact card ───────────────────────────────────────────────────

const LOCATION = (over: Partial<ContactLocation> = {}): ContactLocation => ({
  name: 'Sample Marine Operations',
  address: 'Sample Quay, Placeholder Port',
  status: '',
  contacts: [
    { label: 'Telephone', value: '869 000 0000', kind: 'phone' },
    { label: 'Post', value: 'Sample Box 000, Placeholder Port', kind: 'post' },
  ],
  ...over,
});

describe('ContactCard', () => {
  it('omits the empty status entirely — no em dash, no reserved gap', async () => {
    /*
     * "When the field is empty the element is not in the tree, so the postal
     * block moves up against the telephone block and the card simply becomes
     * shorter." A reserved gap says something is missing and might arrive.
     */
    const { container } = renderInRouter(<ContactCard location={LOCATION()} />);
    await screen.findByText('Sample Marine Operations');
    expect(container.textContent).not.toContain('—');
  });

  it('renders the status when the feed actually gives one', async () => {
    renderInRouter(<ContactCard location={LOCATION({ status: 'Open 08:00–16:00' })} />);
    expect(await screen.findByText('Open 08:00–16:00')).toBeInTheDocument();
  });

  it('offers telephone and post, and no third channel', async () => {
    const { container } = renderInRouter(<ContactCard location={LOCATION()} />);
    await screen.findByText('Sample Marine Operations');
    expect(screen.getByRole('link', { name: /call 869 000 0000/i })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/email|extension|web form/i);
  });
});

// ── Board 10: spend ──────────────────────────────────────────────────────────

describe('SpendSummary', () => {
  it('shows an em dash and says why for an unpriced category', () => {
    /*
     * "A 0.00 in a spend tile may mean 'unpriced', not 'free'." Null and zero
     * are different facts, and confusing them here understates a bill.
     */
    render(
      <SpendSummary
        currency="USD"
        total={null}
        categories={[
          { label: 'Chat', amount: 412.6 },
          { label: 'Voice', amount: null },
        ]}
      />
    );
    expect(screen.getByText('no price configured')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.00')).toBeNull();
  });

  it('makes no row clickable — no per-endpoint breakdown exists', () => {
    render(
      <SpendSummary currency="USD" total={412.6} categories={[{ label: 'Chat', amount: 412.6 }]} />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('always carries the estimate caveat', () => {
    render(<SpendSummary currency="USD" total={0} categories={[]} />);
    expect(screen.getByText(/not a bill/i)).toBeInTheDocument();
  });
});

// ── Board 11: receipt ────────────────────────────────────────────────────────

const RECEIPT: SupportTicketResponse = {
  reference: 'SC-0000',
  department: 'Sample Department',
  expected_response: 'Within 2 sample days',
  next_step: 'Quote this reference when you telephone the department.',
  transcript_included: false,
  request_id: 'r',
};

describe('EnquiryReceipt', () => {
  it('always renders next_step — nobody will make contact first', () => {
    render(<EnquiryReceipt receipt={RECEIPT} sentAt={new Date('2026-08-01T14:32:00Z')} />);
    expect(screen.getByText(/Quote this reference/)).toBeInTheDocument();
  });

  it('offers no status tracker, because nothing behind it could answer one', () => {
    const { container } = render(
      <EnquiryReceipt receipt={RECEIPT} sentAt={new Date('2026-08-01T14:32:00Z')} />
    );
    expect(container.textContent).not.toMatch(/track|status of|progress|check my/i);
  });

  it('reports what the server did with the transcript, not what was asked for', () => {
    /*
     * "A tick that means 'we tried' is the kind of thing people discover at the
     * worst moment."
     *
     * This asserted a `Conversation attached: No` row. §6.5 draws the state as a
     * **checkbox with two renderings**, not a detail row, and §6.6's rows are
     * Department · Telephone · Sent — so the claim is unchanged and the thing
     * carrying it is now the one the handoff draws.
     */
    const { unmount } = render(
      <EnquiryReceipt receipt={RECEIPT} sentAt={new Date()} transcriptRequested />
    );
    expect(screen.getByText('Not attached')).toBeInTheDocument();
    expect(screen.getByText(/could not be attached/)).toBeInTheDocument();
    unmount();

    render(
      <EnquiryReceipt
        receipt={{ ...RECEIPT, transcript_included: true }}
        sentAt={new Date()}
        transcriptRequested
      />
    );
    expect(screen.getByText('Requested: attach this conversation')).toBeInTheDocument();
  });

  it('says nothing about a transcript nobody asked for', () => {
    // There is no third rendering on the board, and "you did not ask for this"
    // is not news.
    const { container } = render(<EnquiryReceipt receipt={RECEIPT} sentAt={new Date()} />);
    expect(container.textContent).not.toMatch(/attach/i);
  });

  it('confirms a copy on screen, not only to a screen reader', async () => {
    /*
     * §7.6: "`500 13px/18px --text-1` **Copied to the clipboard**. Dismisses on
     * a timer. The originating ghost icon button simultaneously enters its
     * Copied state."
     *
     * A copy is the one action in this product with no visible result — the
     * clipboard is invisible — so an `sr-only` announcement said so to one
     * reader in three, and everyone else pressed the button again.
     */
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    render(<EnquiryReceipt receipt={RECEIPT} sentAt={new Date()} />);
    await user.click(screen.getByRole('button', { name: /Copy the reference SC-0000/ }));

    expect(await screen.findByText(/copied to the clipboard/i)).toBeInTheDocument();
  });

  it('copies the reference, and says it did', async () => {
    // `userEvent.setup()` installs its own clipboard stub, so the spy has to go
    // on afterwards or it is replaced before the click lands.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    render(<EnquiryReceipt receipt={RECEIPT} sentAt={new Date()} />);
    await user.click(screen.getByRole('button', { name: /Copy the reference SC-0000/ }));
    expect(writeText).toHaveBeenCalledWith('SC-0000');
  });
});

// ── Board 12: ops list header ────────────────────────────────────────────────

function HeaderHarness() {
  const [query, setQuery] = useState('');
  return (
    <OpsListHeader
      title="Port advisories"
      total={3}
      shown={query ? 2 : 3}
      query={query}
      onQueryChange={setQuery}
      placeholder="Filter advisories"
    />
  );
}

describe('OpsListHeader', () => {
  it('states the feed size until a filter is typed, then what is shown', async () => {
    /*
     * `3 in total` is a fact about the feed; `2 of 3 shown` is a fact about the
     * view. Showing the first while filtering misreports the feed as smaller.
     */
    const user = userEvent.setup();
    render(<HeaderHarness />);
    expect(screen.getByText('3 in total')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'pilot');
    expect(screen.getByText('2 of 3 shown')).toBeInTheDocument();
  });

  it('echoes the active filter as a removable chip', async () => {
    // A filter visible only inside the input is easy to forget, and a forgotten
    // filter looks exactly like missing data.
    const user = userEvent.setup();
    render(<HeaderHarness />);
    await user.type(screen.getByRole('searchbox'), 'pilot');

    const chip = screen.getByRole('button', { name: /Clear the filter/ });
    await user.click(chip);
    expect(screen.getByText('3 in total')).toBeInTheDocument();
  });

  it('has no pagination — these endpoints return the complete set', () => {
    render(<HeaderHarness />);
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole('button', { name: /page/i })).toBeNull();
  });
});

// ── Board 01: the zero-results panel ─────────────────────────────────────────

describe('NoResults', () => {
  it('names the active filters and the one action that resolves it', async () => {
    const onClearAll = vi.fn();
    const user = userEvent.setup();
    render(
      <NoResults
        noun="vessel movements"
        total={100}
        onClearAll={onClearAll}
        filters={[
          { label: 'Berth', value: '3', onClear: () => {} },
          { label: 'Status', value: 'Alongside', onClear: () => {} },
        ]}
      />
    );

    expect(screen.getByText(/No vessel movements match these filters/)).toBeInTheDocument();
    expect(screen.getByText('Berth')).toBeInTheDocument();
    expect(screen.getByText('Alongside')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('lets one filter go without starting again', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <NoResults
        noun="vessel movements"
        onClearAll={() => {}}
        filters={[{ label: 'Berth', value: '3', onClear }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Remove the Berth filter' }));
    expect(onClear).toHaveBeenCalled();
  });
});
