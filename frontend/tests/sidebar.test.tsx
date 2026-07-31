/**
 * The navigation sidebar, the SCASPA identity and the About panel.
 *
 * The interesting assertions are not that things render. They are:
 *
 *   1. `scaspa-facts.ts` contains no fee, schedule, hour or statistic — the one
 *      rule that keeps the chrome from becoming a second source of truth;
 *   2. the drawer traps focus and gives it back to the hamburger that opened it;
 *   3. a starter question goes through the normal send path and closes the drawer;
 *   4. the disclosure is a real disclosure, not a `hidden` div still in the tab
 *      order;
 *   5. the logo is announced once, never twice, and never as a badge too small
 *      to read.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/shells/Sidebar';
import { SidebarDrawer } from '@/components/shells/SidebarDrawer';
import { LogoLockup } from '@/components/brand/LogoLockup';
import { AboutScaspa } from '@/components/about/AboutScaspa';
import { FACILITY_NAV } from '@/features/chat/facilities';
import { SCASPA_EMAIL, SCASPA_FACILITIES } from '@/lib/scaspa-facts';
import { renderWithProviders } from './helpers';

function noop() {}

async function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    onAsk: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenSources: vi.fn(),
    onOpenAbout: vi.fn(),
    sourceCount: 0,
    knowledgeVerifiedAt: null,
    busy: false,
    hasConversation: true,
    ...overrides,
  };
  // The footer's `<Link to="/privacy">` reads the router from context and
  // throws without one, so this needs the router harness rather than the
  // provider-only one.
  //
  // Async because `RouterProvider` paints on a microtask after mount: a sync
  // query straight after `render` runs against an empty tree and fails with a
  // confusing "unable to find role". Awaiting the landmark the sidebar always
  // has means every caller gets a painted tree.
  const result = renderWithProviders(<Sidebar {...props} />);
  await screen.findByRole('navigation', { name: 'SCASPA facilities' });
  return { props, ...result };
}

// ── 1. The hard rule on hardcoded facts ──────────────────────────────────────

describe('scaspa-facts.ts holds only low-volatility facts', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/scaspa-facts.ts'), 'utf8');

  // Comments explain the rule and legitimately contain the forbidden words, so
  // the scan runs over code only.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');

  it('contains no currency amount', () => {
    // XCD 44.44, EC$100, $12, US$5 — any of them would be a fee that drifts.
    expect(code).not.toMatch(/(XCD|EC\$|US\$|USD|\$)\s?\d/i);
  });

  it('contains no clock time', () => {
    // A sailing time or an opening hour. 1993 is a year, not a time.
    expect(code).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(code).not.toMatch(/\b\d{1,2}\s?(a\.?m\.?|p\.?m\.?)\b/i);
  });

  it('does not talk about opening hours, fees or schedules', () => {
    for (const word of [
      'opening hour',
      'open at',
      'closes at',
      'fee',
      'fare',
      'tariff',
      'charge',
      'schedule',
      'timetable',
    ]) {
      expect(code.toLowerCase(), `"${word}" must come from the assistant`).not.toContain(word);
    }
  });

  it('contains no statistic', () => {
    // The only bare numbers permitted are the formation year and the phone
    // digits. Anything else — passenger counts, tonnage, berth totals — is a
    // figure that goes stale with nothing to say that it has.
    const numbers = code.match(/\b\d[\d,.]*\b/g) ?? [];
    const allowed = /^(1993|869|465|8121|8122|8123|963|18694658121|18694658122|18694658123|2|3)$/;
    const unexpected = numbers.filter((n) => !allowed.test(n.replace(/[,.]/g, '')));
    expect(unexpected).toEqual([]);
  });

  it('never links the payment portal', () => {
    // The header comment names it in order to say it is never linked, so the
    // scan runs over code. A test that failed on its own documentation would
    // teach people to delete the documentation.
    expect(code).not.toContain('pay.scaspa.com');
  });
});

// ── 2. The drawer's focus contract ───────────────────────────────────────────

describe('the sidebar drawer', () => {
  it('returns focus to the hamburger that opened it', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open navigation';
    document.body.appendChild(trigger);
    // A mutable ref object standing in for the one React fills from the
    // hamburger's `ref` prop. `createRef` gives a readonly `current` in the
    // type system, so the object is built directly.
    const ref: { current: HTMLButtonElement | null } = { current: trigger };

    function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
      return (
        <SidebarDrawer open={open} onClose={onClose} returnFocusTo={ref} id="drawer">
          <button type="button">Inside</button>
        </SidebarDrawer>
      );
    }

    const onClose = vi.fn();
    const { rerender } = render(<Harness open onClose={onClose} />);

    // Focus moved into the panel, so the next Tab lands inside it.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));

    rerender(<Harness open={false} onClose={onClose} />);
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    trigger.remove();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const ref: { current: HTMLButtonElement | null } = { current: null };

    render(
      <SidebarDrawer open onClose={onClose} returnFocusTo={ref} id="drawer">
        <button type="button">Inside</button>
      </SidebarDrawer>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('is a modal dialog with an accessible name', () => {
    const ref: { current: HTMLButtonElement | null } = { current: null };
    render(
      <SidebarDrawer open onClose={noop} returnFocusTo={ref} id="drawer">
        <button type="button">Inside</button>
      </SidebarDrawer>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Navigation');
    // The id the hamburger's aria-controls points at.
    expect(dialog).toHaveAttribute('id', 'drawer');
  });

  it('renders nothing when closed, so its contents leave the tab order', () => {
    const ref: { current: HTMLButtonElement | null } = { current: null };
    const { container } = render(
      <SidebarDrawer open={false} onClose={noop} returnFocusTo={ref} id="drawer">
        <button type="button">Inside</button>
      </SidebarDrawer>
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// ── 3. Starter questions send, and dismiss the drawer ────────────────────────

describe('facility starter questions', () => {
  it('sends through the normal path and fires onNavigate', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onNavigate = vi.fn();
    await renderSidebar({ onAsk, onNavigate });

    await user.click(screen.getByRole('button', { name: /Port Zante/ }));
    const question = FACILITY_NAV[1]!.questions[0];
    await user.click(screen.getByRole('button', { name: question }));

    expect(onAsk).toHaveBeenCalledWith(question);
    // On a drawer viewport this is what closes it. Docked, the prop is absent.
    expect(onNavigate).toHaveBeenCalled();
  });

  it('disables every question while a request is in flight', async () => {
    const user = userEvent.setup();
    await renderSidebar({ busy: true });

    await user.click(screen.getByRole('button', { name: /Deep Water Harbour/ }));
    for (const question of FACILITY_NAV[0]!.questions) {
      expect(screen.getByRole('button', { name: question })).toBeDisabled();
    }
  });

  it('asks questions and never states answers', () => {
    // A starter question carrying its own answer would be the chrome becoming a
    // second source of truth — the thing scaspa-facts.ts exists to prevent.
    for (const facility of FACILITY_NAV) {
      for (const question of facility.questions) {
        expect(question).toMatch(/\?$/);
        expect(question).not.toMatch(/(XCD|EC\$|\$)\s?\d/);
        expect(question).not.toMatch(/\b\d{1,2}:\d{2}\b/);
      }
    }
  });
});

// ── 4. A real disclosure ─────────────────────────────────────────────────────

describe('facility disclosures', () => {
  it('starts collapsed with aria-expanded false', async () => {
    await renderSidebar();
    for (const facility of FACILITY_NAV) {
      expect(screen.getByRole('button', { name: new RegExp(facility.name) })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    }
  });

  it('expands, and the panel it controls actually exists', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    const trigger = screen.getByRole('button', { name: /Basseterre Ferry Terminal/ });
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panelId = trigger.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();
  });

  it('unmounts the questions when collapsed rather than hiding them', async () => {
    const user = userEvent.setup();
    await renderSidebar();
    const question = FACILITY_NAV[2]!.questions[0];

    expect(screen.queryByRole('button', { name: question })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Basseterre Ferry Terminal/ }));
    expect(screen.getByRole('button', { name: question })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Basseterre Ferry Terminal/ }));
    // Gone from the tree, so it is gone from the tab order too. A `hidden` div
    // still focusable is the classic way this pattern is got wrong.
    expect(screen.queryByRole('button', { name: question })).toBeNull();
  });

  it('is a labelled navigation landmark', async () => {
    await renderSidebar();
    expect(screen.getByRole('navigation', { name: 'SCASPA facilities' })).toBeInTheDocument();
  });
});

// ── 5. The rest of the sidebar ───────────────────────────────────────────────

describe('sidebar chrome', () => {
  it('omits the verified-as-of line when health is unavailable', async () => {
    await renderSidebar({ knowledgeVerifiedAt: null });
    expect(screen.queryByText(/Information verified as of/)).toBeNull();
  });

  it('shows it when health supplies a date', async () => {
    await renderSidebar({ knowledgeVerifiedAt: '2026-06-01' });
    expect(screen.getByText(/Information verified as of/)).toBeInTheDocument();
  });

  it('disables new conversation when there is nothing to clear', async () => {
    await renderSidebar({ hasConversation: false });
    expect(screen.getByRole('button', { name: /New conversation/ })).toBeDisabled();
  });

  it('disables the source count at zero and enables it once there are sources', async () => {
    const { unmount } = await renderSidebar({ sourceCount: 0 });
    expect(screen.getByRole('button', { name: /Sources in this conversation/ })).toBeDisabled();
    unmount();

    await renderSidebar({ sourceCount: 3 });
    const button = screen.getByRole('button', { name: /Sources in this conversation/ });
    expect(button).toBeEnabled();
    expect(within(button).getByText('3')).toBeInTheDocument();
  });

  it('carries no conversation history, by design', async () => {
    // The backend holds conversations in memory with a 60-minute TTL, exposes no
    // endpoint to list them, and the privacy page says message content is never
    // written to the device. A history list needs all three reversed.
    await renderSidebar();
    expect(screen.queryByText(/history/i)).toBeNull();
    expect(screen.queryByText(/recent conversations/i)).toBeNull();
  });
});

// ── 6. The lockup ────────────────────────────────────────────────────────────

describe('LogoLockup', () => {
  it('announces the product once, not twice', () => {
    const { container } = render(<LogoLockup size="lg" />);
    const img = container.querySelector('img');
    // Decorative: the visible name beside it already says it.
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('SCASPA Assistant')).toBeInTheDocument();
  });

  it('lets the mark carry the name when the name is hidden', () => {
    const { container } = render(<LogoLockup size="lg" nameHidden />);
    expect(container.querySelector('img')).toHaveAttribute('alt', 'SCASPA Assistant');
    expect(screen.getByAltText('SCASPA Assistant')).toBeInTheDocument();
  });

  it('falls back to a wordmark below 32px rather than an illegible badge', () => {
    // The real mark is a circular seal with internal detail. At 24px the
    // aircraft and the ship are two grey smudges.
    const { container } = render(<LogoLockup size="sm" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('SCASPA Assistant')).toBeInTheDocument();
  });

  it('never distorts the aspect ratio', () => {
    const { container } = render(<LogoLockup size="md" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe(img.getAttribute('height'));
  });

  it('draws no badge in the reversed variant while its asset is outstanding', () => {
    // Recolouring the navy mark would break "never recolour"; drawing it on navy
    // would break "never on a mid-tone ground". The wordmark alone is the only
    // honest option until the reversed file arrives.
    const { container } = render(<LogoLockup size="lg" variant="reversed" />);
    expect(container.querySelector('img')).toBeNull();
  });
});

// ── 7. The About panel ───────────────────────────────────────────────────────

describe('AboutScaspa', () => {
  it('covers what SCASPA is, the merger and all four facilities', () => {
    render(<AboutScaspa />);

    expect(screen.getByText(/St. Christopher Air & Sea Ports Authority/)).toBeInTheDocument();
    expect(screen.getByText(/Formed in 1993/)).toBeInTheDocument();
    // Named twice on purpose: once in the summary, once in the line telling
    // someone with older paperwork it is the same organisation.
    expect(screen.getAllByText(/St. Christopher & Nevis Ports Authority/).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText(/Golden Rock Airport/).length).toBeGreaterThan(0);

    for (const facility of SCASPA_FACILITIES) {
      expect(screen.getByText(facility.name)).toBeInTheDocument();
    }
  });

  it('gives the phone numbers as tel: links', () => {
    render(<AboutScaspa />);
    const link = screen.getByRole('link', { name: '869-465-8121' });
    expect(link).toHaveAttribute('href', 'tel:+18694658121');
  });

  it('links out to scaspa.com safely, and never to the payment portal', () => {
    const { container } = render(<AboutScaspa />);
    const site = screen.getByRole('link', { name: /scaspa\.com/ });
    expect(site).toHaveAttribute('href', 'https://www.scaspa.com');
    expect(site).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(container.innerHTML).not.toContain('pay.scaspa.com');
  });

  it('omits the email row entirely while the address is pending', () => {
    // An empty slot is a promise with no date on it.
    expect(SCASPA_EMAIL).toBeNull();
    const { container } = render(<AboutScaspa />);
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(screen.queryByText(/coming soon|to be confirmed/i)).toBeNull();
  });

  it('points at the assistant for anything that changes', () => {
    render(<AboutScaspa />);
    expect(screen.getByText(/ask the assistant/i)).toBeInTheDocument();
  });
});
