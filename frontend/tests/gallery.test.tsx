/**
 * The gallery is the design system's proof of work, so it gets a test.
 *
 * "It renders" is not the claim. The claim is that every primitive appears in
 * every state — because a disabled variant that was never placed on the page is a
 * disabled variant nobody has ever looked at.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders as render } from './helpers';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
  isNotFound,
} from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';

async function renderGallery() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/dev/gallery'] }),
  });
  render(<RouterProvider router={router as never} />);
  return screen.findByRole('heading', { name: 'Component gallery', level: 1 });
}

describe('component gallery', () => {
  it('renders in development', async () => {
    await renderGallery();
  });

  it('has a section for every primitive', async () => {
    await renderGallery();

    for (const name of [
      'Button',
      'IconButton',
      'Input',
      'Textarea',
      'Chip',
      'Badge',
      'Card',
      'Sheet',
      'Tooltip',
      'Spinner',
      'Skeleton',
      'VisuallyHidden',
    ]) {
      expect(screen.getByRole('heading', { name, level: 2 })).toBeInTheDocument();
    }
  });

  it('shows every Button variant in default, disabled and loading', async () => {
    await renderGallery();

    // 4 variants x 3 states, and the loading ones report aria-busy.
    const asks = screen.getAllByRole('button', { name: /Ask SCASPA/ });
    expect(asks).toHaveLength(12);
    expect(asks.filter((b) => b.hasAttribute('disabled'))).toHaveLength(8); // disabled + loading
    expect(asks.filter((b) => b.getAttribute('aria-busy') === 'true')).toHaveLength(4);
  });

  it('shows every IconButton variant plus disabled and loading', async () => {
    await renderGallery();
    for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
      expect(screen.getByRole('button', { name: `Send (${variant})` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Disabled send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sending' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows Input in every state, including the error and disabled ones', async () => {
    await renderGallery();
    expect(screen.getByLabelText('Default input')).toBeEnabled();
    expect(screen.getByLabelText('Disabled input')).toBeDisabled();
    expect(screen.getByLabelText('Input with error')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Numeric (tabular)').className).toContain('tabular');
    // A hidden label is still an accessible name.
    expect(screen.getByLabelText('Hidden label')).toBeInTheDocument();
  });

  it('shows Chip selected, unselected and disabled', async () => {
    await renderGallery();
    expect(screen.getByRole('button', { name: 'Toggle me' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Ferry times' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  });

  it('shows the departure-board badge as a fill, never as text', async () => {
    await renderGallery();
    const badge = screen.getByText('Departure board');
    expect(badge.className).toContain('bg-amber-board');
    expect(badge.className).not.toContain('text-amber-board');
  });
});

describe('the gallery is not reachable in production', () => {
  it('beforeLoad throws notFound when the build is not a dev build', async () => {
    // The guard is the whole reason this route can exist at all. Asserted by
    // running the real beforeLoad against a non-dev config rather than by reading
    // the source and believing it.
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({ config: { isDev: false, isProd: true } }));

    const { Route } = await import('@/routes/dev.gallery');
    const beforeLoad = Route.options.beforeLoad as () => void;

    expect(beforeLoad).toBeTypeOf('function');
    let thrown: unknown;
    try {
      beforeLoad();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(isNotFound(thrown)).toBe(true);

    vi.doUnmock('@/lib/config');
    vi.resetModules();
  });
});
