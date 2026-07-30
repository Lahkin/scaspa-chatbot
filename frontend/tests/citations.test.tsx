/**
 * The credibility feature.
 *
 * The rule under test is not "chips render". It is:
 *
 *   - a marker the backend vouched for becomes a numbered chip;
 *   - a marker it did **not** vouch for disappears entirely — no chip, and never
 *     the raw `[kb-047]`;
 *   - a citation with no marker still reaches the panel;
 *   - a high-volatility source says so, with a working `tel:` link.
 *
 * The second of those is the one worth being certain about: it is the difference
 * between a product that overstates what it verified and one that does not.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Markdown } from '@/components/chat/Markdown';
import { CitationProvider } from '@/components/chat/CitationContext';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { EscalationCard } from '@/components/chat/EscalationCard';
import { SourceEntry } from '@/components/chat/SourceEntry';
import {
  entryLabel,
  markerIdsInOrder,
  resetCitationWarnings,
  needsConfirmation,
  reconcile,
  sourceTypeLabel,
  volatilityOf,
} from '@/features/chat/citations';
import { CITATION_FARES, CITATION_SCHEDULE, CITATION_LOW } from '@/mocks/fixtures';
import type { Message } from '@/features/chat/types';
import type { Citation } from '@/lib/types';

const CITATIONS = [CITATION_FARES, CITATION_SCHEDULE];

afterEach(() => {
  vi.restoreAllMocks();
  // The warning is deduped per message so one dropped marker does not produce
  // four console lines; cleared here so each test observes its own.
  resetCitationWarnings();
});

// ── Task 2: reconciliation ───────────────────────────────────────────────────

describe('reconciliation', () => {
  it('numbers markers by first appearance, not by kb id order', () => {
    // kb-008 appears first in the text but sorts second by id.
    const text = 'Sailing at 18:00 [kb-008]. The fare is XCD 44.44 [kb-014].';
    const { markers } = reconcile(text, CITATIONS);

    expect(markers.get('kb-008')).toMatchObject({ status: 'resolved', index: 1 });
    expect(markers.get('kb-014')).toMatchObject({ status: 'resolved', index: 2 });
  });

  it('gives a repeated marker the same number both times', () => {
    const { markers } = reconcile('[kb-014] and again [kb-014] and [kb-008]', CITATIONS);
    expect(markers.get('kb-014')).toMatchObject({ index: 1 });
    expect(markers.get('kb-008')).toMatchObject({ index: 2 });
    expect(markerIdsInOrder('[kb-014] [kb-014]')).toEqual(['kb-014']);
  });

  it('everything is pending until the citations event arrives', () => {
    // The event lands after the last token, so this is the state for the whole
    // of generation — it has to be a real neutral visual, not an absence.
    const { markers, entries } = reconcile('Fare is XCD 44.44 [kb-014].', null);
    expect(markers.get('kb-014')).toEqual({ status: 'pending' });
    expect(entries).toEqual([]);
  });

  it('an unvouched marker becomes unverified, not a chip', () => {
    const { markers, unverified } = reconcile(
      'Opens at 06:00 [kb-047]. Fare XCD 44.44 [kb-014].',
      CITATIONS
    );
    expect(markers.get('kb-047')).toEqual({ status: 'unverified' });
    expect(unverified).toEqual(['kb-047']);
    // Numbering skips it entirely — the verified one is 1, not 2.
    expect(markers.get('kb-014')).toMatchObject({ index: 1 });
  });

  it('warns in dev about a dropped marker, because silent to the user is not silent to us', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reconcile('Opens at 06:00 [kb-047].', CITATIONS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kb-047'));
  });

  it('a citation with no marker still reaches the panel, unnumbered', () => {
    const { entries } = reconcile('Fare is XCD 44.44 [kb-014].', CITATIONS);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ index: 1 });
    // Numbering it would imply a chip that does not exist.
    expect(entries[1]).toMatchObject({ index: null });
    expect(entries[1]?.citation.kb_id).toBe('kb-008');
  });

  it('suppresses every chip when grounded is false', () => {
    const { markers, entries } = reconcile('Fare XCD 44.44 [kb-014].', CITATIONS, false);
    expect(markers.get('kb-014')).toEqual({ status: 'unverified' });
    expect(entries.every((entry) => entry.index === null)).toBe(true);
  });
});

// ── Task 1: parsing on the AST, not the string ───────────────────────────────

describe('markers are parsed on the AST', () => {
  function renderWithCitations(markdown: string, citations: Citation[] | null = CITATIONS) {
    const reconciliation = reconcile(markdown, citations);
    return render(
      <CitationProvider reconciliation={reconciliation}>
        <Markdown>{markdown}</Markdown>
      </CitationProvider>
    );
  }

  it('replaces a marker in prose with a numbered chip', () => {
    renderWithCitations('The fare is XCD 44.44 [kb-014].');
    const chip = screen.getByRole('button', { name: /Source 1/ });
    expect(chip).toHaveTextContent('1');
    // The raw marker is gone from the text.
    expect(document.body.textContent).not.toContain('[kb-014]');
    // And the row id is never shown to the reader.
    expect(chip.textContent).not.toContain('kb-014');
  });

  it('leaves a marker inside a code fence completely alone', () => {
    // This is why the parse cannot be a string replace: an answer explaining the
    // citation format legitimately contains a literal marker.
    renderWithCitations('Markers look like this:\n\n```\n[kb-014]\n```');
    expect(document.querySelector('pre')?.textContent).toContain('[kb-014]');
    expect(screen.queryByRole('button', { name: /Source/ })).toBeNull();
  });

  it('leaves a marker in inline code alone', () => {
    renderWithCitations('Use `[kb-014]` to cite it.');
    expect(document.querySelector('code')?.textContent).toBe('[kb-014]');
    expect(screen.queryByRole('button', { name: /Source/ })).toBeNull();
  });

  it('does not put a chip inside a link', () => {
    // A button inside an anchor is invalid HTML and an ambiguous tap target.
    renderWithCitations('[kb-014](https://example.invalid/x) is the row.');
    const link = screen.getByRole('link');
    expect(within(link).queryByRole('button')).toBeNull();
  });

  it('handles a marker inside a table cell', () => {
    renderWithCitations('| Route | Fare |\n| --- | --- |\n| Nevis | 44.44 [kb-014] |');
    expect(document.querySelector('table')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Source 1/ })).toBeInTheDocument();
  });

  it('renders nothing at all for an unvouched marker', () => {
    renderWithCitations('Opens at 06:00 [kb-047]. Fare XCD 44.44 [kb-014].');
    // Not a chip...
    expect(screen.getAllByRole('button', { name: /Source/ })).toHaveLength(1);
    // ...and never the raw marker, which is the tempting failure mode.
    expect(document.body.textContent).not.toContain('[kb-047]');
    expect(document.body.textContent).not.toContain('kb-047');
    // The sentence around it survives.
    expect(document.body.textContent).toContain('Opens at 06:00');
  });

  it('shows a neutral pending marker before citations arrive', () => {
    renderWithCitations('The fare is XCD 44.44 [kb-014].', null);
    expect(screen.queryByRole('button', { name: /Source/ })).toBeNull();
    expect(document.querySelector('[data-kb-id="kb-014"]')).not.toBeNull();
    // Not numbered: a number before reconciliation is one that might change.
    expect(document.body.textContent).not.toContain('[kb-014]');
  });
});

// ── Task 3: the chip ─────────────────────────────────────────────────────────

describe('CitationChip', () => {
  function renderChip(onOpenSource = vi.fn()) {
    const text = 'The fare is XCD 44.44 [kb-014].';
    render(
      <CitationProvider reconciliation={reconcile(text, CITATIONS)} onOpenSource={onOpenSource}>
        <Markdown>{text}</Markdown>
      </CitationProvider>
    );
    return { chip: screen.getByRole('button', { name: /Source 1/ }), onOpenSource };
  }

  it('clears the 44px touch target', () => {
    const { chip } = renderChip();
    // The visible chip is small so it does not break the line; the target is the
    // padding around it.
    expect(chip.className).toContain('min-h-touch');
    expect(chip.className).toContain('min-w-touch');
  });

  it('carries a name that means something without the number', () => {
    const { chip } = renderChip();
    // "1" alone tells a screen-reader user nothing.
    expect(chip.getAttribute('aria-label')).toContain('Ferry — fares');
    expect(chip.getAttribute('aria-label')).toContain('2026-04-01');
  });

  it('opens the panel at that source when activated', async () => {
    const user = userEvent.setup();
    const { chip, onOpenSource } = renderChip();
    await user.click(chip);
    expect(onOpenSource).toHaveBeenCalledWith('kb-014');
  });

  it('is reachable and activatable by keyboard', async () => {
    const user = userEvent.setup();
    const { chip, onOpenSource } = renderChip();
    await user.tab();
    expect(chip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpenSource).toHaveBeenCalled();
  });
});

// ── Task 4: the source panel ─────────────────────────────────────────────────

describe('SourceEntry', () => {
  function renderEntry(citation: Citation, index: number | null = 1) {
    return render(
      <ul>
        <SourceEntry entry={{ citation, index }} highlighted={false} />
      </ul>
    );
  }

  it('renders source_type as a readable badge, not a slug', () => {
    expect(sourceTypeLabel('official-site')).toBe('Official SCASPA website');
    expect(sourceTypeLabel('official-pdf')).toBe('Official SCASPA document');
    expect(sourceTypeLabel('client-interview')).toBe('From SCASPA directly');
    // Values the brief did not name but the knowledge base really uses.
    expect(sourceTypeLabel('regulator')).toBe('Government or regulator');
    expect(sourceTypeLabel('press')).toBe('Press report');
    expect(sourceTypeLabel('something-new')).toBe('Other source');
  });

  it('a high-volatility row demands confirmation, with a working tel: link', () => {
    renderEntry({ ...CITATION_SCHEDULE, volatility: 'high' });
    expect(screen.getByText(/Confirm with SCASPA before you travel/)).toBeInTheDocument();
    const call = screen.getByRole('link', { name: /Call 869-465-8121/ });
    // "Confirm with SCASPA" is useless if confirming means going to find a number.
    expect(call).toHaveAttribute('href', 'tel:+18694658121');
  });

  it('a medium-volatility row still asks for confirmation, more quietly', () => {
    renderEntry({ ...CITATION_FARES, volatility: 'medium' });
    expect(screen.queryByText(/before you travel/)).toBeNull();
    expect(screen.getByText(/before you rely on it/)).toBeInTheDocument();
  });

  it('a low-volatility row shows its date quietly', () => {
    renderEntry(CITATION_LOW);
    expect(screen.queryByText(/Confirm/)).toBeNull();
    expect(screen.getByText(/Verified on/)).toBeInTheDocument();
  });

  it('treats a citation with no volatility as high', () => {
    // The field is not in the contract yet. Defaulting to quiet would choose the
    // harm: a stale ferry departure shown as a confident fact.
    expect(volatilityOf(CITATION_SCHEDULE)).toBe('high');
    expect(needsConfirmation(CITATION_SCHEDULE)).toBe(true);
    renderEntry(CITATION_SCHEDULE);
    expect(screen.getByText(/Confirm with SCASPA before you travel/)).toBeInTheDocument();
  });

  it('derives a label from fields that exist, and prefers the real one', () => {
    expect(entryLabel(CITATION_FARES)).toBe('Ferry — fares');
    expect(entryLabel({ ...CITATION_FARES, label: 'How much is a ferry ticket?' })).toBe(
      'How much is a ferry ticket?'
    );
  });

  it('omits the excerpt rather than inventing one', () => {
    const { container } = renderEntry(CITATION_FARES);
    expect(container.textContent).not.toContain('undefined');
    renderEntry({ ...CITATION_FARES, snippet: 'A real excerpt.' });
    expect(screen.getByText('A real excerpt.')).toBeInTheDocument();
  });

  it('links out safely', () => {
    renderEntry(CITATION_FARES);
    const link = screen.getByRole('link', { name: /View the source/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

// ── Task 5: the escalation card ──────────────────────────────────────────────

describe('EscalationCard', () => {
  it('offers all three phone lines as separate tel: links', () => {
    render(<EscalationCard category="personal_record" />);
    // "8121 / 2 / 3" as a single link dials nothing at all.
    for (const number of ['869-465-8121', '869-465-8122', '869-465-8123']) {
      const link = screen.getByRole('link', { name: number });
      expect(link.getAttribute('href')).toMatch(/^tel:\+1869465812[123]$/);
    }
  });

  it('gives the postal address', () => {
    render(<EscalationCard />);
    expect(screen.getByText('P.O. Box 963')).toBeInTheDocument();
    expect(screen.getByText('Basseterre')).toBeInTheDocument();
  });

  it('marks the email slot as pending rather than omitting or inventing it', () => {
    render(<EscalationCard />);
    // scaspa.com obfuscates it. A guessed address sends a cargo query into a void
    // and the sender never learns it did not arrive.
    expect(screen.getByText('Pending from SCASPA')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('explains the specific boundary that was hit', () => {
    render(<EscalationCard category="personal_record" />);
    expect(
      screen.getByText(/cannot look up anything tied to a specific person/)
    ).toBeInTheDocument();
  });

  it('falls back to the backend copy when no category arrives', () => {
    // `refusal_category` is not on the `done` event. The backend's own text is
    // approved copy, so nothing is invented.
    render(<EscalationCard answer={'Backend refusal sentence.\n\nContact block.'} />);
    expect(screen.getByText('Backend refusal sentence.')).toBeInTheDocument();
  });

  it('does not look like an error', () => {
    const { container } = render(<EscalationCard category="personal_record" />);
    // A refusal is a successful 200 and the system working as designed. No alert
    // role, no danger styling.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('.bg-danger, .bg-danger-surface, .text-danger')).toBeNull();
  });
});

// ── the three assistant shapes ───────────────────────────────────────────────

function message(partial: Partial<Message> & Pick<Message, 'id' | 'text'>): Message {
  return { role: 'assistant', at: new Date('2026-04-01T14:30:00Z'), ...partial };
}

describe('the three assistant states are visually distinct', () => {
  it('a refusal renders the card instead of a bubble', () => {
    render(
      <MessageBubble
        message={message({
          id: 'r',
          text: 'That is not something I can advise on.',
          refusal: true,
          refusal_category: 'personal_record',
          streaming: false,
        })}
      />
    );
    expect(screen.getByText('Talk to SCASPA directly')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '869-465-8123' })).toBeInTheDocument();
    expect(document.querySelector('[data-state="refusal"]')).not.toBeNull();
  });

  it('an ungrounded answer suppresses chips and says why', () => {
    render(
      <MessageBubble
        message={message({
          id: 'u',
          text: 'The fare is XCD 44.44 [kb-014].',
          grounded: false,
          citations: CITATIONS,
          streaming: false,
        })}
      />
    );
    // No confidence styling at all: a chip beside an unverified sentence asserts
    // exactly the thing that could not be established.
    expect(screen.queryByRole('button', { name: /Source/ })).toBeNull();
    expect(screen.getByText(/could not fully verify this/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call SCASPA/ })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
    expect(document.querySelector('[data-state="ungrounded"]')).not.toBeNull();
  });

  it('a grounded answer shows chips and no warning', () => {
    render(
      <MessageBubble
        message={message({
          id: 'g',
          text: 'The fare is XCD 44.44 [kb-014].',
          grounded: true,
          citations: CITATIONS,
          streaming: false,
        })}
      />
    );
    expect(screen.getByRole('button', { name: /Source 1/ })).toBeInTheDocument();
    expect(screen.queryByText(/could not fully verify/)).toBeNull();
    // There is deliberately no "verified ✓" badge: the contract says grounded
    // true is not a correctness guarantee, so the signal only ever removes
    // confidence, never adds it.
    expect(document.body.textContent).not.toMatch(/verified\s*✓|Verified answer/i);
    expect(document.querySelector('[data-state="grounded"]')).not.toBeNull();
  });

  it('markers stay pending while the answer is still streaming', () => {
    render(
      <MessageBubble
        message={message({
          id: 's',
          text: 'The fare is XCD 44.44 [kb-014].',
          streaming: true,
          citations: CITATIONS,
        })}
      />
    );
    // Citations cannot be trusted mid-stream even if a previous turn left some on
    // the message: the event arrives after the last token.
    expect(screen.queryByRole('button', { name: /Source/ })).toBeNull();
  });
});
