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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/shells/Sidebar';
import { SidebarDrawer } from '@/components/shells/SidebarDrawer';
import { LogoLockup } from '@/components/brand/LogoLockup';
import { AboutScaspa } from '@/components/about/AboutScaspa';
import { SCASPA_EMAIL, SCASPA_FACILITIES } from '@/lib/scaspa-facts';
import { renderWithProviders } from './helpers';

function noop() {}

const RECORDED = [
  'Is the Vega Sirius alongside?',
  'Wharfage on a 40ft container',
  'Arrivals into RLB after 14:00',
] as const;

/** The demo object, whose `is_demo` is a required literal `true`. */
const DEMO_PROFILE = {
  is_demo: true,
  display_name: 'Basseterre operator',
  division: 'Marine Operations',
  agent_id: 'demo-1',
  jurisdiction: 'St Kitts',
  role: 'Operator',
  last_sync: null,
  active: true,
  verified: true,
  notice: 'A fixed demonstration object. It is not a sign-in and never becomes one.',
} as const;

async function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    onAsk: vi.fn(),
    recordedQuestions: RECORDED,
    ...overrides,
  };
  // The data-source card reads nothing from the network, but the sidebar sits
  // inside the same provider stack everywhere else, so it renders that way here.
  //
  // Async because the tree paints on a microtask after mount: a sync query
  // straight after `render` fails with a confusing "unable to find role".
  // Awaiting the landmark the sidebar always has means every caller gets a
  // painted tree.
  const result = renderWithProviders(<Sidebar {...props} />);
  await screen.findByRole('navigation', { name: 'Sections' });
  return { props, ...result };
}

/*
 * The hard rule on hardcoded facts used to be enforced from here.
 *
 * It now lives in `tests/scaspa-facts.test.ts`, which is the file
 * `src/lib/scaspa-facts.ts` has always claimed enforces it — the module named
 * for the module, where someone looking for it would look. Moved unchanged in
 * M5, along with a repo-wide scan for the same defect outside that one file.
 */

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

// ── 3. The destinations ──────────────────────────────────────────────────────

describe('the navigation', () => {
  it('groups the destinations in words a customer would use', async () => {
    /*
     * These headings used to read ASSISTANT, OPERATIONS and CONDITIONAL.
     *
     * The first two are jargon and the third is not a category at all — it is a
     * note to the developer that the route may not exist. The Pilot spec names
     * all three as things to stop showing, and "Conditional" above a public
     * navigation is the clearest possible sign of an interface labelled from
     * the inside out.
     *
     * Console moved into Services rather than keeping a group of its own: a
     * heading reading "Console" above a single item called "Console" says
     * nothing twice. It is still filtered out when its route is absent, which
     * was the only real content of the old label.
     */
    await renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Sections' });

    for (const label of ['Ask Pilot', 'Services']) {
      expect(within(nav).getByRole('heading', { name: label })).toBeInTheDocument();
    }
    for (const gone of ['Assistant', 'Operations', 'Conditional']) {
      expect(within(nav).queryByRole('heading', { name: gone })).not.toBeInTheDocument();
    }
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent?.trim());
    /*
     * The exact list, in order, and the exactness is the point: a nav that
     * grows an entry nobody meant to add is how "Diagnostics" and "Conditional"
     * got in front of customers before. Cargo joined when `/cargo` was built —
     * §4 of the navigation brief puts it in this group, and it was the last of
     * the four facilities to get a screen because it was the only one with
     * nothing to put on it (decisions.md 0043).
     */
    expect(links).toEqual(['Chat', 'Vessels', 'Flights', 'Cargo', 'Tariffs', 'Support', 'Console']);
  });

  it('has no Admin entry at all — not a disabled row, not a lock', async () => {
    /*
     * "When a route is not built, no entry appears." The dashed
     * "Admin — absent unless built" row on the board is documentation of that
     * absence, not a shipping state, and §2.8 turns it into a rule: any
     * difference between a route that exists and one that does not confirms
     * the address exists.
     */
    await renderSidebar();
    expect(screen.queryByText(/admin/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull();
  });

  it('returns nothing for an unbuilt address through the search either', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    await user.type(screen.getByRole('searchbox'), 'admin');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
  });

  it('filters the destinations it does hold', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    await user.type(screen.getByRole('searchbox'), 'ves');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent?.trim())
    ).toEqual(['Vessels']);
  });

  it('marks the current destination and nothing else', async () => {
    await renderSidebar({ currentPath: '/tariffs' });
    const current = screen.getByRole('link', { name: 'Tariffs' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Vessels' })).not.toHaveAttribute('aria-current');
  });

  it('shows the advisory count only when the server reports one', async () => {
    const { unmount } = await renderSidebar({ advisoryCount: 0 });
    expect(within(screen.getByRole('link', { name: /Console/ })).queryByText('0')).toBeNull();
    unmount();

    await renderSidebar({ advisoryCount: 2 });
    expect(
      within(screen.getByRole('link', { name: /Console/ })).getByText('2')
    ).toBeInTheDocument();
  });
});

// ── 4. Recorded questions re-ask; they do not restore anything ───────────────

describe('recorded questions', () => {
  it('shows no heading until there is something under it', async () => {
    /*
     * A labelled section with nothing beneath it reads as something that failed
     * to load, and on a fresh load — before anyone has asked anything — it was
     * the first thing an eye landed on in the T-23 rehearsal.
     *
     * There is deliberately no empty state to assert instead. The list explains
     * itself the moment it has a row and has nothing worth saying while it does
     * not, so the heading arrives with the first question.
     */
    await renderSidebar({ recordedQuestions: [] });
    expect(screen.queryByRole('heading', { name: /recorded questions/i })).toBeNull();

    cleanup();
    await renderSidebar({ recordedQuestions: RECORDED });
    expect(screen.getByRole('heading', { name: /recorded questions/i })).toBeInTheDocument();
  });

  it('re-asks through the normal path and fires onNavigate', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onNavigate = vi.fn();
    await renderSidebar({ onAsk, onNavigate });

    await user.click(screen.getByRole('button', { name: RECORDED[1] }));

    expect(onAsk).toHaveBeenCalledWith(RECORDED[1]);
    // On a drawer viewport this is what closes it. Docked, the prop is absent.
    expect(onNavigate).toHaveBeenCalled();
  });

  it('implies no thread — no count, no timestamp, no "continue"', async () => {
    /*
     * "Clicking a recorded question re-asks it. It does not restore a
     * conversation." History is recorded and never fed back into the prompt, so
     * a follow-up will not resolve pronouns, and
     * `08-blocked-and-forbidden.md` lists any UI promising conversational
     * memory among the things that must not be built.
     */
    await renderSidebar();
    for (const pattern of [
      /continue/i,
      /resume/i,
      /where we left off/i,
      /\d+ messages?/i,
      /conversation history/i,
    ]) {
      expect(screen.queryByText(pattern)).toBeNull();
    }
  });

  it('filters with the search, so one box covers both lists', async () => {
    const user = userEvent.setup();
    await renderSidebar();

    await user.type(screen.getByRole('searchbox'), 'wharfage');
    expect(screen.getByRole('button', { name: RECORDED[1] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RECORDED[0] })).toBeNull();
  });
});

// ── 5. The bottom row is not a user row ─────────────────────────────────────

describe('the demonstration profile row', () => {
  it('is not rendered at all when the profile is null', async () => {
    /*
     * **The production state.** No placeholder, no silhouette, no "sign in" —
     * the backend has no accounts and never knows who is asking, and an empty
     * identity slot is an invitation to fill it.
     */
    await renderSidebar({ profile: null });
    expect(screen.queryByText('Demonstration profile')).toBeNull();
    expect(screen.queryByText(/Basseterre operator/)).toBeNull();
  });

  it('says twice that it is a demonstration, and offers no account affordance', async () => {
    await renderSidebar({ profile: DEMO_PROFILE });
    expect(screen.getByText('Basseterre operator')).toBeInTheDocument();
    expect(screen.getByText('Demonstration profile')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();

    for (const pattern of [/sign out/i, /log out/i, /account/i, /profile settings/i]) {
      expect(screen.queryByText(pattern)).toBeNull();
    }
  });

  it('carries no conversation history, by design', async () => {
    // The backend holds conversations in memory with a 60-minute TTL, exposes no
    // endpoint to list them, and the privacy page says message content is never
    // written to the device. A history list needs all three reversed.
    await renderSidebar();
    expect(screen.queryByText(/recent conversations/i)).toBeNull();
  });
});

// ── 6. The lockup ────────────────────────────────────────────────────────────

describe('LogoLockup', () => {
  it('announces the product once, not twice', () => {
    const { container } = render(<LogoLockup />);
    const img = container.querySelector('img');
    // Decorative: the visible name beside it already says it.
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    /*
     * "SCASPA", not the product name. This is the INSTITUTIONAL lockup — the
     * Authority's seal, and the Authority beside it. It read "SCASPA Assistant"
     * while the product WAS the SCASPA Assistant; the product is Pilot now, and
     * `PilotBrand` is where its name lives.
     */
    expect(screen.getByText('SCASPA')).toBeInTheDocument();
  });

  it('lets the mark carry the name when the name is hidden', () => {
    const { container } = render(<LogoLockup nameHidden />);
    expect(container.querySelector('img')).toHaveAttribute('alt', 'SCASPA');
    expect(screen.getByAltText('SCASPA')).toBeInTheDocument();
  });

  it('never distorts the aspect ratio', () => {
    const { container } = render(<LogoLockup />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe(img.getAttribute('height'));
  });

  it('plates the seal at every size, including the small one', () => {
    /*
     * This used to assert the opposite twice over: no badge at all on a dark
     * ground, and no badge below 32px because the seal turns to mud there.
     *
     * The handoff overrules both. "The seal is dark blue line art on
     * transparency. It always sits on a white circular plate. Never
     * recoloured, outlined, cropped or knocked out to white. Never use it
     * without the plate at any size." The product is dark on every surface, so
     * the old rule hid the Authority's own mark everywhere it appears — and
     * the smallest pairing the handoff draws IS the compact one.
     */
    for (const size of ['lockup', 'compact'] as const) {
      const { container, unmount } = render(<LogoLockup size={size} />);
      const seal = container.querySelector('img');
      expect(seal).not.toBeNull();

      const plate = seal!.parentElement!;
      expect(plate.className).toContain('rounded-full');
      // Literally white, not a theme alias: a plate that darkened with the
      // surface would swallow dark blue line art, which is the whole point of
      // specifying a plate rather than a background.
      expect(plate.className).toContain('bg-white');
      unmount();
    }
  });

  it('draws the two pairings the handoff names, and no third', () => {
    // 32 inside 40 in the sidebar; 24 inside 32 in the widget, the 404 header
    // and the mobile header. A numeric size prop would let a caller invent a
    // pairing that is not drawn anywhere, so the two are an enum.
    const expected = { lockup: [40, 32], compact: [32, 24] } as const;

    for (const [size, [platePx, sealPx]] of Object.entries(expected)) {
      const { container, unmount } = render(<LogoLockup size={size as 'lockup' | 'compact'} />);
      const seal = container.querySelector('img')!;
      const plate = seal.parentElement!;
      expect(Number.parseInt(plate.style.width, 10)).toBe(platePx);
      expect(Number.parseInt(plate.style.height, 10)).toBe(platePx);
      expect(Number.parseInt(seal.style.width, 10)).toBe(sealPx);
      unmount();
    }
  });

  it('sets the wordmark nowrap rather than truncating the product name', () => {
    // `600 15px/20px, white-space: nowrap` — an ellipsis in the Authority's own
    // name is a layout bug shipped as a design.
    render(<LogoLockup />);
    const name = screen.getByText('SCASPA');
    expect(name.className).toContain('whitespace-nowrap');
    expect(name.className).not.toContain('truncate');
    expect(name.className).toContain('text-wordmark');
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

// ── The panel-collapse control ──────────────────────────────────────────────

describe('the panel-collapse control', () => {
  it('describes what it will do, not what it is', async () => {
    const onToggleCollapsed = vi.fn();
    const user = userEvent.setup();
    await renderSidebar({ onToggleCollapsed });

    // "Collapse the navigation" — an imperative. A label naming the current
    // state reads as an instruction to about half the people who meet it.
    const toggle = screen.getByRole('button', { name: 'Collapse the navigation' });
    // The state is on the control, so a screen reader is told it rather than
    // being left to infer it from a glyph.
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls');

    await user.click(toggle);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders no control at all when it cannot collapse', async () => {
    // The drawer passes no handler. An inert control is worse than none: it is
    // still a tab stop and still looks like it does something.
    await renderSidebar();
    expect(screen.queryByRole('button', { name: /collapse the navigation/i })).toBeNull();
  });

  it('does not persist the collapsed state anywhere', () => {
    /*
     * `frontend/CLAUDE.md` rule 5 permits exactly one key in exactly one
     * storage: `conversation_id` in `sessionStorage`. A sidebar preference is
     * not that key, so the rail resets on reload — a real cost, recorded rather
     * than quietly worked around with a second storage key.
     */
    const raw = readFileSync(
      resolve(process.cwd(), 'src/components/shells/FullPageShell.tsx'),
      'utf8'
    );
    // Comments stripped first: this file *explains* the rule in prose, and a
    // bare word match flagged the explanation as a violation of itself.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    // Actual API use — a member access or a call — rather than the word.
    expect(code).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\s*[.[]/);

    // And the matcher is not vacuous.
    expect('window.localStorage.setItem(x)').toMatch(
      /\b(localStorage|sessionStorage|indexedDB)\s*[.[]/
    );
  });
});
