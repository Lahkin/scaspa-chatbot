/**
 * Structural tests for the two shells.
 *
 * jsdom does no layout, so nothing here measures anything — overflow, `dvh` and
 * touch-target size are verified for real by `scripts/responsive-check.mjs` in
 * headless Chromium. What jsdom *can* prove is structure: landmarks, the source
 * panel appearing exactly once per breakpoint mode, and the widget's close
 * message going to the right origin. Those are the parts a screenshot would not
 * catch either.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders as render } from './helpers';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { FullPageShell } from '@/components/shells/FullPageShell';
import { WidgetShell } from '@/components/shells/WidgetShell';
import { config } from '@/lib/config';

function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router as never} />);
}

describe('FullPageShell', () => {
  it('uses dvh, not vh — the whole reason the composer stays visible on iOS', () => {
    const { container } = render(<FullPageShell />);
    const root = container.firstElementChild!;

    // `h-screen` is Tailwind's 100vh. On iOS Safari that is taller than the
    // visible viewport while the toolbar is showing, so the bottom of the column —
    // the composer — sits behind the browser chrome.
    expect(root.className).toContain('h-dvh');
    expect(root.className).not.toContain('h-screen');
    // Nothing scrolls at the document level; only the transcript does.
    expect(root.className).toContain('overflow-hidden');
  });

  it('keeps the transcript scrollable and the composer fixed', () => {
    render(<FullPageShell />);
    const transcript = screen.getByTestId('transcript');
    expect(transcript.className).toContain('overflow-y-auto');
    expect(transcript.className).toContain('flex-1');

    // min-h-0 on the flex row. Without it the child never shrinks, the overflow
    // never engages, and the composer is pushed off screen — the single most
    // common way this layout is got wrong.
    const row = transcript.closest('.min-h-0');
    expect(row).not.toBeNull();
  });

  it('has one main landmark, and no sources region until there is evidence', () => {
    /*
     * The docked column used to render whatever happened, so a reader who had
     * not asked anything yet was given a third of a wide screen occupied by the
     * words "Nothing to show yet". A permanent empty panel does not read as
     * "sources will appear here" — it reads as a broken part of the product.
     *
     * The conversation holds that width until an answer earns it. Below xl the
     * panel is a sheet rather than a column, which is why one component serves
     * both and there is no second copy to drift.
     */
    render(<FullPageShell />);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('complementary', { name: 'Sources' })).not.toBeInTheDocument();
  });

  it('offers a way to a person from the header, not buried in a footer', () => {
    render(<FullPageShell />);
    // An icon button among the header's secondary actions — handoff §2.1 gives
    // that row 32px icon buttons and no wide labelled links.
    const links = screen.getAllByRole('link', { name: /telephone the authority/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      // Full international form, so it dials from a foreign handset — which is
      // what a cruise passenger is holding.
      expect(link).toHaveAttribute('href', 'tel:+18694658121');
    }
  });

  it('opens sources in a sheet and closes it on Escape', async () => {
    const user = userEvent.setup();
    render(<FullPageShell />);

    await user.click(screen.getByRole('button', { name: 'Show sources' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sources' });
    expect(within(dialog).getByRole('heading', { name: 'Sources' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('WidgetShell', () => {
  it('is a fixed 380x600 box that can still shrink', () => {
    const { container } = render(<WidgetShell />);
    const root = container.firstElementChild!;

    expect(root.className).toContain('w-widget');
    expect(root.className).toContain('h-widget');
    // The caps are what stop a 380px box forcing a sideways scroll on a 320px
    // phone if the route is ever opened directly.
    expect(root.className).toContain('max-w-full');
    expect(root.className).toContain('max-h-dvh');
  });

  it('brings its own background, because an iframe inherits nothing', () => {
    const { container } = render(<WidgetShell />);
    // None of scaspa.com's CSS reaches in. If this component does not set a
    // surface colour, it renders on whatever the UA default is.
    expect(container.firstElementChild!.className).toContain('bg-surface');
  });

  it('posts a close message to the configured origin, never to *', async () => {
    const user = userEvent.setup();
    const post = vi.fn();
    // Pretend to be embedded: parent !== window.
    vi.spyOn(window, 'parent', 'get').mockReturnValue({
      postMessage: post,
    } as unknown as Window);

    render(<WidgetShell />);
    await user.click(screen.getByRole('button', { name: 'Close the assistant' }));

    expect(post).toHaveBeenCalledWith({ type: 'scaspa:widget:close' }, config.embedAllowedOrigin);
    // A wildcard would broadcast to whatever page happened to embed us, which
    // defeats the point of having an allow-list.
    expect(post.mock.calls[0]?.[1]).not.toBe('*');
    vi.restoreAllMocks();
  });

  it('does not post to itself when opened directly rather than embedded', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(window, 'postMessage');

    render(<WidgetShell />);
    await user.click(screen.getByRole('button', { name: 'Close the assistant' }));

    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('drops the secondary actions but keeps the one that has nothing behind it', () => {
    /*
     * §2.3 drops "secondary actions" from the widget header. The sources button
     * and the phone link went with them and lost nothing: a citation chip
     * already opens the source panel, and the escalation block on every refusal
     * already carries the number.
     *
     * The close button stays, as a deliberate deviation. `public/embed.js` sets
     * `launcher.style.display = 'none'` while the panel is open, so the host's
     * own control is off screen; without this button a pointer user has no way
     * out of the panel at all.
     */
    render(<WidgetShell />);
    expect(screen.getByRole('button', { name: 'Close the assistant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show sources' })).toBeNull();
    expect(screen.queryByRole('link', { name: /talk to a person/i })).toBeNull();
  });

  it('is the handoff’s frame: surface-1, a hairline and a 16px radius', () => {
    const { container } = render(<WidgetShell />);
    const root = container.firstElementChild!;
    // surface-1 and not surface-2: inside a host page this panel is the main
    // content column, and the provenance cards in it must stay a step lighter.
    expect(root.className).toContain('bg-surface-1');
    expect(root.className).toContain('border-border');
    expect(root.className).toContain('rounded-panel');
  });

  it('shrinks the greeting and the chips, and keeps the stands-alone promise', async () => {
    render(<WidgetShell />);
    // 20/28 rather than 30/38, and the copy shortens with it — eight chips and
    // a four-line greeting are most of a 480px panel.
    expect(await screen.findByRole('heading', { name: 'How can I help?' })).toBeInTheDocument();
    expect(screen.getByText(/Each answer stands alone/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Clearing cargo through customs/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /SCASPA's opening hours/ })).toBeNull();
  });

  it('keeps the source-kind badge in the header when the sidebar goes — board 00a', async () => {
    /*
     * Embedding drops the navigation and with it the data-source status card.
     * The spec is explicit that the provenance badge moves rather than
     * disappearing: "Embedding is not a reason to lose the one thing that says
     * whether the figures are real."
     *
     * The fixture handler answers `unavailable`, which is also the production
     * default — so this is the badge most users would actually see.
     */
    render(<WidgetShell />);
    expect(await screen.findByText(/no feed|sample data|live feed/i)).toBeInTheDocument();
  });
});

describe('routes mount the shells without the marketing chrome', () => {
  it('/chat has exactly one main and no site navigation', async () => {
    renderRoute('/chat');
    await screen.findByRole('main');

    // Two <main> elements — or two elements with id="main" — would make the skip
    // link jump to whichever the browser found first.
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.querySelectorAll('#main')).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('/widget likewise, and is marked noindex', async () => {
    renderRoute('/widget');
    await screen.findByRole('main');

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    await waitFor(() => {
      // Embedded in someone else's page; it must never surface in search results
      // as a standalone page.
      const robots = document.head.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content')).toBe('noindex');
    });
  });

  it('the marketing pages keep their chrome', async () => {
    renderRoute('/about');
    await screen.findByRole('main');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
