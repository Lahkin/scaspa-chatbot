/**
 * The conversation surface.
 *
 * The claims worth testing here are the ones with a real failure mode behind
 * them: that raw HTML stays inert, that a fee column is right-aligned and
 * tabular, that the scroll region is keyboard reachable, that a half-written
 * table does not render as a broken grid, and that no status line is ever
 * invented.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Markdown } from '@/components/chat/Markdown';
import { StreamingMarkdown } from '@/components/chat/StreamingMarkdown';
import { AgentStatus } from '@/components/chat/AgentStatus';
import { SuggestedQuestions } from '@/components/chat/SuggestedQuestions';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MessageList } from '@/components/chat/MessageList';
import { STREAM_PARSE_INTERVAL_MS, splitAtSafePoint } from '@/lib/markdown/streaming';
import { classifyColumn, isNumericCell, quantityColumnIndex } from '@/lib/markdown/columns';
import { TABLE_ANSWER } from '@/mocks/fixtures';
import type { Message } from '@/features/chat/types';

// ── Task 2: markdown, safely ─────────────────────────────────────────────────

describe('markdown is rendered without becoming an HTML sink', () => {
  it('renders a script tag as text, not as an element', () => {
    render(<Markdown>{'Hello <script>alert(1)</script> world'}</Markdown>);
    // react-markdown escapes raw HTML by default. That default *is* the
    // protection; rehype-raw is what would remove it.
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.textContent).toContain('alert(1)');
  });

  it('strips an img onerror payload rather than rendering the attribute', () => {
    render(<Markdown>{'<img src=x onerror="alert(1)">'}</Markdown>);
    const img = document.querySelector('img');
    expect(img).toBeNull();
    expect(document.body.innerHTML).not.toContain('onerror');
  });

  it('drops a javascript: link', () => {
    render(<Markdown>{'[click me](javascript:alert(1))'}</Markdown>);
    const link = screen.queryByRole('link');
    // Either removed entirely or stripped of its href — never navigable.
    expect(link?.getAttribute('href') ?? '').not.toContain('javascript');
  });

  it('opens external links safely and says that it does', () => {
    render(<Markdown>{'[SCASPA](https://example.invalid/x)'}</Markdown>);
    const link = screen.getByRole('link', { name: /SCASPA/ });
    expect(link).toHaveAttribute('target', '_blank');
    // noopener stops window.opener reach-back; noreferrer stops the referrer leak.
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toContain('opens in a new tab');
  });

  it('styles the full element set', () => {
    render(
      <Markdown>
        {[
          '# Heading one',
          '',
          'A paragraph with **bold**, *italic* and `code`.',
          '',
          '- unordered',
          '- items',
          '',
          '1. ordered',
          '2. items',
          '',
          '> A blockquote.',
          '',
          '```js',
          'const x = 1;',
          '```',
          '',
          '[a link](https://example.invalid)',
        ].join('\n')}
      </Markdown>
    );

    // Capped at h3: the page already has an h1, and a second breaks the outline
    // a screen-reader user navigates by.
    expect(screen.getByRole('heading', { level: 3, name: 'Heading one' })).toBeInTheDocument();
    expect(document.querySelector('h1')).toBeNull();
    expect(document.querySelector('h2')).toBeNull();

    expect(document.querySelector('strong')).toHaveTextContent('bold');
    expect(document.querySelector('em')).toHaveTextContent('italic');
    expect(document.querySelector('blockquote')).toHaveTextContent('A blockquote.');
    expect(document.querySelectorAll('ul li')).toHaveLength(2);
    expect(document.querySelectorAll('ol li')).toHaveLength(2);
    expect(document.querySelector('pre')).toBeInTheDocument();

    // Every one of them carries styling, not just structure.
    for (const selector of ['p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'h3']) {
      const element = document.querySelector(selector);
      expect(element, `${selector} is unstyled`).toBeTruthy();
      expect(element!.className, `${selector} is unstyled`).not.toBe('');
    }
  });
});

// ── Task 3: the schedule table ───────────────────────────────────────────────

describe('column classification comes from the cells, not the header', () => {
  it('recognises currency, times and quantities', () => {
    for (const value of ['444.44', 'XCD 44.44', 'EC$100', '1,111.11', '18:00', '12%', '40ft']) {
      expect(isNumericCell(value), value).toBe(true);
    }
  });

  it('does not treat a label containing a digit as a figure', () => {
    for (const value of ['Bay 4', 'Berth 2', 'Per container', 'On application']) {
      expect(isNumericCell(value), value).toBe(false);
    }
  });

  it('one non-figure makes the whole column text', () => {
    // A fee column with an "On application" in it is not a clean set of
    // quantities, and right-aligning the rest would imply a precision the data
    // does not have.
    expect(classifyColumn(['444.44', '888.88', 'On application'])).toBe('text');
    expect(classifyColumn(['444.44', '888.88', '22.22'])).toBe('numeric');
  });

  it('ignores blanks and dashes rather than counting them against', () => {
    expect(classifyColumn(['444.44', '', '—', 'n/a', '22.22'])).toBe('numeric');
  });

  it('the quantity column is the last numeric one', () => {
    // Tables read left to right from identifier to value, so the answer is on
    // the right: "Service | Unit | Transit days | Charge" must light the charge.
    expect(quantityColumnIndex(['text', 'text', 'numeric', 'numeric'])).toBe(3);
    expect(quantityColumnIndex(['text', 'text'])).toBe(-1);
  });
});

describe('ScheduleTable renders a fee table properly', () => {
  function renderTable() {
    return render(
      <Markdown verifiedOn="2026-04-01" sourceId="kb-014">
        {TABLE_ANSWER}
      </Markdown>
    );
  }

  it('right-aligns the charge column and left-aligns the text ones', () => {
    renderTable();
    const rows = document.querySelectorAll('tbody tr');
    const firstRow = rows[0] as HTMLTableRowElement;
    const cells = firstRow.querySelectorAll('td');

    expect(cells[0]!.className).toContain('text-left'); // Service
    expect(cells[1]!.className).toContain('text-left'); // Unit
    expect(cells[2]!.className).toContain('text-right'); // Transit days
    // Charge column holds "On application" on the last row, so it classifies as
    // text — which is the correct answer and the point of the fixture.
    expect(cells[4]!.className).toContain('text-left');
  });

  it('applies tabular figures to the whole table', () => {
    renderTable();
    expect(document.querySelector('table')!.className).toContain('tabular');
  });

  /*
   * Tabular figures survive the departure-board treatment.
   *
   * The quantity column now carries its own background and text colour, and the
   * obvious way to get that wrong is a `className` that replaces the inherited
   * typography rather than adding to it. jsdom has no Tailwind stylesheet, so
   * `getComputedStyle` cannot answer this — asserting on it would produce a test
   * that passes because it measures nothing. What can be checked is that every
   * numeric cell still sits inside the element carrying `tabular`, and that the
   * base rule underwriting it is still in the token file.
   */
  it('every numeric cell still inherits tabular figures', () => {
    renderTable();
    const table = document.querySelector('table')!;
    const numeric = [...table.querySelectorAll('td, th')].filter((cell) =>
      cell.className.includes('text-right')
    );

    expect(numeric.length).toBeGreaterThan(0);
    for (const cell of numeric) {
      expect(cell.closest('table')).toBe(table);
      // Nothing on the cell resets the inherited value.
      expect(cell.className).not.toMatch(/font-variant|normal-nums|proportional-nums/);
    }
  });

  it('the base layer still sets tabular-nums on every cell', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(css).toMatch(/:where\(td,\s*th\)\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
  });

  it('the quantity column runs navy with amber figures, header and body alike', () => {
    renderTable();
    const header = document.querySelector('thead th.text-amber-board');
    expect(header).not.toBeNull();

    const quantityCells = document.querySelectorAll('tbody td.bg-navy');
    expect(quantityCells.length).toBe(document.querySelectorAll('tbody tr').length);
    for (const cell of quantityCells) {
      // The ground travels with the colour: amber is 5.38:1 on navy and 2.03:1
      // on the white row beside it. tests/contrast.test.ts pins both.
      expect(cell.className).toContain('text-amber-board');
    }
  });

  it('zebra-stripes only above four rows', () => {
    renderTable();
    const striped = document.querySelectorAll('tbody tr.bg-surface-muted');
    // The fixture has five rows, so striping is on.
    expect(striped.length).toBeGreaterThan(0);

    render(<Markdown>{'| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'}</Markdown>);
    // Two rows: striping would be noise.
    const tables = document.querySelectorAll('table');
    const small = tables[tables.length - 1]!;
    expect(small.querySelectorAll('tbody tr.bg-surface-muted')).toHaveLength(0);
  });

  it('carries the verified-on date under the table', () => {
    renderTable();
    const caption = document.querySelector('figcaption')!;
    expect(caption.textContent).toContain('Verified on');
    expect(caption.textContent).toContain('2026-04-01');
    expect(caption.textContent).toContain('kb-014');
  });

  it('says so explicitly when there is no date, rather than saying nothing', () => {
    render(<Markdown>{'| A | B |\n| --- | --- |\n| 1 | 2 |'}</Markdown>);
    // Silence reads as "current". A tariff table with no date is exactly the
    // artefact someone budgets against a year later.
    expect(document.querySelector('figcaption')!.textContent).toContain('Date not stated');
  });

  it('puts the amber on the navy header, never on a light surface', () => {
    renderTable();
    const amber = document.querySelector('.text-amber-board');
    expect(amber).not.toBeNull();
    // The rendered check the source grep cannot do: resolve the ancestor ground.
    const navyAncestor = amber!.closest('.bg-navy, .bg-navy-deep');
    expect(navyAncestor).not.toBeNull();
  });
});

describe('the table scroll region is reachable and announced', () => {
  it('is not a region when it fits — that would just be noise', () => {
    // jsdom reports zero scrollWidth, i.e. nothing overflows, so the region and
    // its tab stop are correctly absent. The overflowing case is measured for
    // real in scripts/responsive-check.mjs, where layout exists.
    render(<Markdown>{'| A | B |\n| --- | --- |\n| 1 | 2 |'}</Markdown>);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('becomes a labelled, focusable region once it overflows', async () => {
    // Force overflow: jsdom does no layout, so the measurement is stubbed.
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(800);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);

    render(<Markdown>{TABLE_ANSWER}</Markdown>);

    const region = await screen.findByRole('region');
    expect(region).toHaveAttribute('aria-label', expect.stringContaining('scrollable'));
    // A scroll container that cannot be focused cannot be scrolled by keyboard.
    expect(region).toHaveAttribute('tabindex', '0');

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  });
});

// ── Task 4: streaming without flicker ────────────────────────────────────────

describe('unterminated markdown is held back as plain text', () => {
  it('holds a table until it is complete', () => {
    const partial = 'Charges below.\n\n| Service | Fee |\n| --- | --- |\n| 20ft | 44';
    const { stable, tail } = splitAtSafePoint(partial);
    expect(stable).toBe('Charges below.\n');
    expect(tail).toContain('| Service | Fee |');
  });

  it('holds an open code fence, so it cannot swallow the rest of the answer', () => {
    const { stable, tail } = splitAtSafePoint('Before.\n\n```js\nconst x = 1;');
    expect(stable).toBe('Before.\n');
    expect(tail).toContain('```js');
  });

  it('releases the fence once it closes', () => {
    const { stable, tail } = splitAtSafePoint('Before.\n\n```js\nconst x = 1;\n```');
    expect(tail).toBe('');
    expect(stable).toContain('```');
  });

  it('holds a bare list marker with nothing after it', () => {
    const { tail } = splitAtSafePoint('Steps:\n\n- first\n-');
    expect(tail).toBe('-');
  });

  it('leaves ordinary prose alone', () => {
    const text = 'The fare is XCD 44.44 [kb-014]. Confirm before you travel.';
    expect(splitAtSafePoint(text)).toEqual({ stable: text, tail: '' });
  });

  it('never loses a character', () => {
    // The tail is displayed, not buffered out of sight — nothing is hidden.
    const partial = 'Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2';
    const { stable, tail } = splitAtSafePoint(partial);
    expect((stable + (stable && tail ? '\n' : '') + tail).length).toBe(partial.length);
  });

  it('renders a half-written table as text, not as a broken grid', () => {
    render(
      <StreamingMarkdown
        text={'Charges:\n\n| Service | Fee |\n| --- | --- |\n| 20ft | 44'}
        streaming
      />
    );
    // No <table> yet, and the characters that arrived are on screen.
    expect(document.querySelector('table')).toBeNull();
    expect(document.body.textContent).toContain('| Service | Fee |');
  });

  it('does a full parse once streaming ends', async () => {
    const complete = '| Service | Fee |\n| --- | --- |\n| 20ft | 44.44 |';
    const { rerender } = render(<StreamingMarkdown text={complete} streaming />);
    rerender(<StreamingMarkdown text={complete} streaming={false} />);
    await waitFor(() => expect(document.querySelector('table')).not.toBeNull());
  });
});

describe('the markdown parse is throttled during streaming', () => {
  /**
   * Counting parses directly. `Markdown` is memoised on its text, so a distinct
   * `children` value reaching it is exactly one remark/rehype pass — which makes
   * the count of distinct values the parse count.
   */
  function countParses(tokens: string[], streaming: boolean) {
    const seen = new Set<string>();
    const observer = new MutationObserver(() => {});
    void observer;

    vi.useFakeTimers();
    let text = '';
    const { rerender, container } = render(<StreamingMarkdown text={text} streaming={streaming} />);

    for (const token of tokens) {
      text += token;
      rerender(<StreamingMarkdown text={text} streaming={streaming} />);
      // 25ms per token — the fast end of the contract's 20–40ms.
      vi.advanceTimersByTime(25);
      seen.add(container.textContent ?? '');
    }
    vi.useRealTimers();
    return seen.size;
  }

  it('renders far fewer distinct states than there are tokens', () => {
    // 40 tokens at 25ms each = 1000ms of stream. At one parse per ~50ms the
    // ceiling is about 20 — comfortably under one per token.
    const tokens = Array.from({ length: 40 }, (_, index) => `word${index} `);
    const parses = countParses(tokens, true);

    expect(parses).toBeLessThan(tokens.length);
    // Guard against the throttle being so aggressive that text visibly lags.
    expect(parses).toBeGreaterThan(5);
  });

  it('the interval is the documented 50ms', () => {
    expect(STREAM_PARSE_INTERVAL_MS).toBe(50);
  });
});

// ── Task 5: agent status ─────────────────────────────────────────────────────

describe('AgentStatus shows the backend summary and nothing else', () => {
  const running = [
    {
      id: 'search_scaspa_knowledge-0',
      name: 'search_scaspa_knowledge' as const,
      summary: 'Searching SCASPA knowledge base — ferry schedules',
      ms: null,
      done: false,
    },
  ];
  const finished = [
    { ...running[0]!, ms: 148, done: true },
    {
      id: 'search_site_content-1',
      name: 'search_site_content' as const,
      summary: 'Searching scaspa.com — tariff PDF',
      ms: 90,
      done: true,
    },
  ];

  it('renders the summary string verbatim', () => {
    render(<AgentStatus activity={running} answerStarted={false} />);
    // Never composed, never prettified. A status line the backend did not send is
    // a claim about what the system did.
    expect(
      screen.getByText('Searching SCASPA knowledge base — ferry schedules')
    ).toBeInTheDocument();
  });

  it('collapses into one expandable line once the answer starts', async () => {
    const user = userEvent.setup();
    render(<AgentStatus activity={finished} answerStarted />);

    const toggle = screen.getByRole('button', { name: /Looked at 2 sources/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Counted from what happened, not asserted.
    expect(screen.queryByText('Searching scaspa.com — tariff PDF')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Searching scaspa.com — tariff PDF')).toBeInTheDocument();
  });

  it('stays expanded while a step is still running, even after tokens start', () => {
    render(<AgentStatus activity={[...finished, ...running]} answerStarted />);
    expect(screen.queryByRole('button', { name: /Looked at/ })).not.toBeInTheDocument();
  });

  it('renders nothing at all when there is no activity', () => {
    const { container } = render(<AgentStatus activity={[]} answerStarted={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ── Task 6: suggested questions ──────────────────────────────────────────────

describe('SuggestedQuestions', () => {
  it('offers the four demo questions and reports the one tapped', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SuggestedQuestions onSelect={onSelect} />);

    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: /last ferry back from Nevis/ }));
    // Populates the composer; does not send. The user still presses send, so
    // there is one habit for every question and room to edit first.
    expect(onSelect).toHaveBeenCalledWith('What time is the last ferry back from Nevis?');
  });

  it('uses the departure-board treatment on the empty state', () => {
    render(<SuggestedQuestions onSelect={vi.fn()} variant="empty" />);
    const chip = screen.getAllByRole('button')[0]!;
    expect(chip.className).toContain('bg-navy');
    const amber = chip.querySelector('.text-amber-board');
    expect(amber).not.toBeNull();
    // Amber on navy, which is where it belongs.
    expect(amber!.closest('.bg-navy')).not.toBeNull();
  });
});

// ── Task 1: bubbles and the scroll rule ──────────────────────────────────────

function message(partial: Partial<Message> & Pick<Message, 'id' | 'role' | 'text'>): Message {
  return { at: new Date('2026-04-01T14:30:00Z'), ...partial };
}

describe('MessageBubble', () => {
  it('renders user text as plain text, never as markdown', () => {
    render(
      <MessageBubble message={message({ id: 'u1', role: 'user', text: 'Is **this** bold?' })} />
    );
    // A user who types ** means asterisks.
    expect(document.querySelector('strong')).toBeNull();
    expect(screen.getByText('Is **this** bold?')).toBeInTheDocument();
  });

  it('renders assistant text as markdown', () => {
    render(
      <MessageBubble
        message={message({ id: 'a1', role: 'assistant', text: 'The fare is **XCD 44.44**.' })}
      />
    );
    expect(document.querySelector('strong')).toHaveTextContent('XCD 44.44');
  });

  it('aligns user right and assistant left, in SCASPA blue and on a light surface', () => {
    const { container: userBox } = render(
      <MessageBubble message={message({ id: 'u2', role: 'user', text: 'hi' })} />
    );
    expect(userBox.firstElementChild!.className).toContain('justify-end');
    expect(userBox.querySelector('.bg-blue-600')).not.toBeNull();

    const { container: assistantBox } = render(
      <MessageBubble message={message({ id: 'a2', role: 'assistant', text: 'hello' })} />
    );
    expect(assistantBox.firstElementChild!.className).toContain('justify-start');
    expect(assistantBox.querySelector('.text-navy-deep')).not.toBeNull();
  });

  it('caps the measure, so a wide screen does not produce an unreadable line', () => {
    const { container } = render(
      <MessageBubble message={message({ id: 'a3', role: 'assistant', text: 'x' })} />
    );
    expect(container.querySelector('.max-w-measure')).not.toBeNull();
  });

  it('shows a machine-readable timestamp in the local locale', () => {
    render(<MessageBubble message={message({ id: 'a4', role: 'assistant', text: 'x' })} />);
    const time = document.querySelector('time')!;
    expect(time).toHaveAttribute('dateTime', '2026-04-01T14:30:00.000Z');
    // Formatted by Intl from the browser's own settings, so it is never empty and
    // never a hard-coded en-US string.
    expect(time.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps the text that arrived before a mid-stream error', () => {
    render(
      <MessageBubble
        message={message({
          id: 'a5',
          role: 'assistant',
          text: 'The fare is',
          error: { code: 'INTERNAL', message: 'Something went wrong.', request_id: 'r' },
        })}
      />
    );
    expect(screen.getByText(/The fare is/)).toBeInTheDocument();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});

describe('MessageList scroll behaviour', () => {
  it('shows the empty state when there are no messages', () => {
    render(<MessageList messages={[]} emptyState={<p>Ask something</p>} />);
    expect(screen.getByText('Ask something')).toBeInTheDocument();
  });

  it('offers no jump control while following the newest message', () => {
    render(<MessageList messages={[message({ id: 'a', role: 'assistant', text: 'hello' })]} />);
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).not.toBeInTheDocument();
  });

  it('stops following and offers a jump once the user scrolls up', async () => {
    const messages = [message({ id: 'a', role: 'assistant', text: 'first' })];
    const { rerender } = render(<MessageList messages={messages} />);

    const viewport = screen.getByTestId('transcript');
    // jsdom has no layout, so the geometry is stubbed: a tall document scrolled
    // to the top.
    Object.defineProperty(viewport, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 500, configurable: true });
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll'));

    // Nothing new yet, so nothing to jump to.
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).not.toBeInTheDocument();

    rerender(
      <MessageList
        messages={[...messages, message({ id: 'b', role: 'assistant', text: 'second' })]}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Jump to latest/ })).toBeInTheDocument()
    );
  });

  it('a new message does not silently resume following', () => {
    // The bug this rule exists to prevent: being yanked away from the sentence
    // being read because another token arrived.
    const messages = [message({ id: 'a', role: 'assistant', text: 'first' })];
    const { rerender } = render(<MessageList messages={messages} />);
    const viewport = screen.getByTestId('transcript');
    Object.defineProperty(viewport, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 500, configurable: true });
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll'));

    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;

    rerender(
      <MessageList
        messages={[...messages, message({ id: 'b', role: 'assistant', text: 'second' })]}
      />
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// ── the standing rule ────────────────────────────────────────────────────────

describe('dangerouslySetInnerHTML appears nowhere', () => {
  it('is absent from every source file', async () => {
    const { globSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = process.cwd();
    // Matches the JSX attribute / object key, not the word. The rule is written
    // about in Markdown.tsx's own documentation, and a test that fails on its
    // own explanation is a test people delete.
    const USAGE = /dangerouslySetInnerHTML\s*[=:]/;
    const offenders = globSync('src/**/*.{ts,tsx}', { cwd: root }).filter((file) =>
      USAGE.test(readFileSync(resolve(root, file), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('rehype-raw is not a dependency, and must never become one', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('rehype-raw');
    expect(Object.keys(pkg.devDependencies ?? {})).not.toContain('rehype-raw');
  });
});
