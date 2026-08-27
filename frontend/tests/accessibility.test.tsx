/**
 * The accessibility baseline, asserted rather than described.
 *
 * Each of these is something that is easy to have *intended* and not to have.
 * A skip link that points at an id nothing owns, a `<title>` that never changes
 * between pages, a touch target that measures 32px — none of them announce
 * themselves in a browser, and all of them are visible to a judge with a screen
 * reader.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from './helpers';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { PROJECT_ROOT } from './source-files';
import { Button, Chip, IconButton, Input, Sheet } from '@/components/ui';

function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router as never} />);
  return router;
}

/**
 * Every route in the app, read out of the generated tree.
 *
 * Parsed from `routeTree.gen.ts` rather than walked at runtime: TanStack builds
 * the tree lazily, so `routeTree.children` is empty until a router mounts, and
 * the generated `FileRoutesByFullPath` interface is the one place that lists
 * every path unconditionally. Reading the file is the same technique
 * `tests/source-files.ts` uses for the other structural guards.
 *
 * Dev-only routes are excluded: `/dev/gallery` and `/dev/rehearsal` are behind
 * a lazy import and are not screens a user reaches.
 */
function routePaths(): string[] {
  const source = readFileSync(resolve(PROJECT_ROOT, 'src/routeTree.gen.ts'), 'utf8');
  const block = source.match(/interface FileRoutesByFullPath \{([\s\S]*?)^\}/m)?.[1] ?? '';
  const paths = [...block.matchAll(/'([^']+)':/g)].map((m) => m[1] as string);

  if (paths.length === 0) throw new Error('no routes parsed — has routeTree.gen.ts changed shape?');
  return paths.filter((path) => !path.startsWith('/dev'));
}

describe('landmarks and the skip link', () => {
  it('the skip link is first in the DOM and points at the main landmark', async () => {
    renderRoute('/');
    await screen.findByRole('main');

    const skip = screen.getByRole('link', { name: /skip to main content/i });
    expect(skip).toHaveAttribute('href', '#main');

    // The target must actually exist, and it must be the main landmark. A skip
    // link pointing at a missing id is worse than none: it looks handled.
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');

    // First focusable thing in the document, so one Tab from the address bar
    // reaches it.
    const focusable = document.querySelectorAll('a[href], button, input, [tabindex]');
    expect(focusable[0]).toBe(skip);
  });

  it('every page has exactly one main, one banner and one contentinfo', async () => {
    renderRoute('/about');
    await screen.findByRole('main');

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  /*
   * ── THE ABOVE CHECKED ONE ROUTE, AND THAT WAS THE HOLE ──────────────────────
   *
   * `__root.tsx` keeps `SELF_CHROMED_ROUTES`: screens that supply their own
   * header, `<main>` and footer, and must therefore NOT be wrapped in the
   * marketing chrome. A route added to the app but not to that list gets both,
   * so it renders two `<main>` landmarks — a screen-reader user hears the page
   * announce two main regions and cannot tell which holds the content.
   *
   * That has now happened twice. The first time, `check:responsive` caught it
   * through the width constraint; `__root.tsx` says so in a comment. The second
   * time was `/cargo`, and the same check caught it the same way — because the
   * landmark assertion above only ever rendered `/about`.
   *
   * A guard that examines one example is a guard for that example. This one
   * walks every route in the generated tree, so the next route to forget the
   * list fails here rather than in a layout check nobody runs before pushing.
   */
  it.each(routePaths())('%s has exactly one main landmark', async (path) => {
    renderRoute(path);
    await screen.findByRole('main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('the phone number is reachable from every page without scrolling into a menu', async () => {
    renderRoute('/privacy');
    await screen.findByRole('main');

    // `getAllBy`, not `getBy`: the privacy page now carries its own contact link
    // as well as the footer's. Asserting every one is the stronger claim anyway —
    // a phone number that is right in three places and wrong in the fourth is
    // worse than one that is wrong everywhere, because nobody notices.
    const links = screen.getAllByRole('link', { name: /869-465-8121/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'tel:+18694658121');
    }
  });
});

describe('per-route document head', () => {
  // Titles are matched by the deepest route, so a route that forgets inherits the
  // root default. These assert the routes did not all forget.
  const cases = [
    { path: '/', fragment: 'ports and travel' },
    { path: '/about', fragment: 'About' },
    { path: '/privacy', fragment: 'Privacy' },
    { path: '/chat', fragment: 'Chat' },
  ];

  for (const { path, fragment } of cases) {
    it(`${path} sets its own title`, async () => {
      renderRoute(path);
      await waitFor(() => expect(document.title).toContain(fragment));
      // Every page names the product. It is Pilot now — the Authority's name
      // belongs to the Authority, and the two stopped being the same thing when
      // the product got an identity of its own (decisions.md 0035).
      expect(document.title).toContain('Pilot');
    });
  }

  it('sets a meta description', async () => {
    renderRoute('/about');
    await waitFor(() => {
      const meta = document.head.querySelector('meta[name="description"]');
      expect(meta?.getAttribute('content')).toMatch(/Pilot/i);
    });
  });

  it('index.html declares lang and a fallback description', () => {
    // Asserted against the shipped file, not against jsdom. For a client-rendered
    // app <html lang> can only be set in the static shell, and a test that sets it
    // itself and then asserts it proves nothing.
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/<html[^>]*\slang="en"/);
    expect(html).toMatch(/<meta\s+name="description"/);
    // The phone number survives a JavaScript failure, because that is when it is
    // most needed.
    expect(html).toContain('869-465-8121');
  });
});

describe('interactive primitives are keyboard reachable and hit the target size', () => {
  it('a button is reachable by Tab and activates on Enter and Space', async () => {
    const user = userEvent.setup();
    let count = 0;
    render(
      <Button
        onClick={() => {
          count += 1;
        }}
      >
        Ask
      </Button>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(count).toBe(2);
  });

  it('a disabled button is skipped by Tab and does not fire', async () => {
    const user = userEvent.setup();
    let count = 0;
    render(
      <>
        <Button
          disabled
          onClick={() => {
            count += 1;
          }}
        >
          Ask
        </Button>
        <Button>After</Button>
      </>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(count).toBe(0);
  });

  it('a loading button announces itself busy and stays labelled', () => {
    render(
      <Button loading loadingLabel="Asking">
        Ask
      </Button>
    );
    const button = screen.getByRole('button', { name: /ask/i });
    expect(button).toHaveAttribute('aria-busy', 'true');
    // Exact, not substring: `toHaveTextContent('Ask')` is satisfied by 'Asking',
    // which is how a label-replacing loading state passed this test once already.
    // The visible label must be unchanged.
    const visible = [...button.querySelectorAll('span')].filter(
      (el) => !el.classList.contains('sr-only') && el.getAttribute('aria-hidden') !== 'true'
    );
    expect(visible.map((el) => el.textContent)).toEqual(['Ask']);
    // ...while the wait is announced separately, and politely.
    expect(button.querySelector('.sr-only')?.textContent).toBe('Asking');
  });

  it('an icon button carries an accessible name and the 44px minimum target', () => {
    render(
      <IconButton label="Send message">
        <span aria-hidden="true">↑</span>
      </IconButton>
    );
    const button = screen.getByRole('button', { name: 'Send message' });
    /*
     * `size-11` is 44px, and `sm:size-7` is the handoff's 28px ghost box above
     * the 640px threshold — §1.3 draws these at 28 and 36, and §7 grows them to
     * 44 at ≤640px. It used to be `size-touch-min` at every width, which is a
     * 44px ghost button sitting in a row of 28px ones on a desktop.
     *
     * Asserting the class is the honest check here — jsdom does not lay
     * anything out, so a measured height would be 0 and prove nothing.
     */
    expect(button.className).toContain('size-11');
    expect(button.className).toContain('sm:size-7');
  });

  it('an input is labelled, and an invalid one is described by its error', () => {
    render(<Input label="Your question" error="Please enter a question." />);
    const input = screen.getByLabelText('Your question');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Please enter a question.');
  });

  it('a chip reports its pressed state rather than only looking selected', async () => {
    const user = userEvent.setup();
    render(<Chip selected>Ferry times</Chip>);
    const chip = screen.getByRole('button', { name: 'Ferry times' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    expect(chip).toHaveFocus();
  });
});

describe('Sheet owns focus while it is open', () => {
  it('traps Tab inside, closes on Escape, and restores focus to the opener', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Sources">
            <Button>Inside</Button>
          </Sheet>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'Sources' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Tab all the way round: focus must never leave the panel.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Without this, a keyboard user is returned to the top of the document every
    // time they close a panel.
    expect(opener).toHaveFocus();
  });
});
