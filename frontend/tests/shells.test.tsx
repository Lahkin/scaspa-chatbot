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
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('has one main landmark and a labelled sources region', () => {
    render(<FullPageShell />);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    // The docked panel is present in the DOM and hidden by CSS below lg, which is
    // why the sheet is the same component rather than a second copy.
    expect(screen.getByRole('complementary', { name: 'Sources' })).toBeInTheDocument();
  });

  it('offers a way to a person from the header, not buried in a footer', () => {
    render(<FullPageShell />);
    const links = screen.getAllByRole('link', { name: /talk to a person/i });
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

  it('has a compact header carrying close, sources and a way to a person', () => {
    render(<WidgetShell />);
    expect(screen.getByRole('button', { name: 'Close the assistant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show sources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /talk to a person/i })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
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
