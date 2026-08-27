/**
 * The primitives added for spec board 00d — buttons and inputs.
 *
 * These test the behaviour the board specifies in words rather than in pixels:
 * that the segmented control is a radio group and not a row of buttons, that
 * the disclosure arrives collapsed because it is evidence rather than answer,
 * and that the phone control has no disabled state at all.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RateLimitCard } from '@/components/chat/RateLimitCard';
import { ToolTrace } from '@/components/chat/ToolTrace';
import type { ToolActivity } from '@/features/chat/types';
import { Checkbox } from '@/components/ui/Checkbox';
import { Disclosure } from '@/components/ui/Disclosure';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { TapToCall } from '@/components/ui/TapToCall';

// ── Segmented ────────────────────────────────────────────────────────────────

const DIRECTIONS = [
  { value: 'arrivals', label: 'Arrivals' },
  { value: 'departures', label: 'Departures' },
] as const;

function SegmentedHarness() {
  const [value, setValue] = useState<'arrivals' | 'departures'>('arrivals');
  return <Segmented options={DIRECTIONS} value={value} onChange={setValue} label="Direction" />;
}

describe('Segmented', () => {
  it('is a radio group, so the count and the current choice are announced', () => {
    render(<SegmentedHarness />);
    expect(screen.getByRole('radiogroup', { name: 'Direction' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Arrivals' })).toBeChecked();
  });

  it('costs one tab stop, not one per segment', () => {
    // A four-segment control that takes four tabs to pass is a control that
    // gets skipped. Only the selected segment is in the tab order.
    render(<SegmentedHarness />);
    expect(screen.getByRole('radio', { name: 'Arrivals' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Departures' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves the selection with the arrow keys, and takes focus with it', async () => {
    const user = userEvent.setup();
    render(<SegmentedHarness />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Arrivals' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Departures' })).toBeChecked();
    /*
     * The part that is easy to get wrong: with a roving tabindex the old
     * segment drops out of the tab order the instant the selection moves, so
     * focus left behind on it means the next arrow press goes nowhere.
     */
    expect(screen.getByRole('radio', { name: 'Departures' })).toHaveFocus();
  });

  it('wraps, so the last option is a choice and not a wall', async () => {
    const user = userEvent.setup();
    render(<SegmentedHarness />);
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Departures' })).toBeChecked();
  });
});

// ── Checkbox ─────────────────────────────────────────────────────────────────

describe('Checkbox', () => {
  it('is a real input, so space toggles it and the state is announced', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox
        checked={false}
        onChange={onChange}
        label="Attach this conversation"
        description="The department will be able to read every question and answer."
      />
    );

    const box = screen.getByRole('checkbox', { name: /attach this conversation/i });
    expect(box).not.toBeChecked();

    await user.tab();
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('makes the whole panel the target, description included', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox
        checked={false}
        onChange={onChange}
        label="Attach this conversation"
        description="Every question and answer in this session."
      />
    );
    // A thumb landing on the explanation still toggles.
    await user.click(screen.getByText(/every question and answer/i));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ── Disclosure ───────────────────────────────────────────────────────────────

describe('Disclosure', () => {
  it('arrives collapsed — it is evidence, not part of the answer', () => {
    render(
      <Disclosure label="3 tools used · 1.94s">
        <p>vessels.search</p>
      </Disclosure>
    );
    expect(screen.getByRole('button', { name: /3 tools used/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText('vessels.search')).not.toBeInTheDocument();
  });

  it('reveals its rows and says so', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure label="3 tools used · 1.94s">
        <p>vessels.search</p>
      </Disclosure>
    );
    await user.click(screen.getByRole('button', { name: /3 tools used/ }));
    expect(screen.getByText('vessels.search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 tools used/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('offers no control at all when there is nothing to reveal', () => {
    render(<Disclosure label="No tools ran" emptyLabel="No tools ran" />);
    // An empty expander invites a click that does nothing.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('No tools ran')).toBeInTheDocument();
  });
});

// ── TapToCall ────────────────────────────────────────────────────────────────

describe('TapToCall', () => {
  it('is an anchor, so long-press and copy-number still work', () => {
    render(<TapToCall href="tel:+18694658121" display="869 465 8121" />);
    expect(screen.getByRole('link', { name: /869 465 8121/ })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
  });

  it('has no disabled state to pass — the number is always dialable', () => {
    /*
     * The spec puts a sentence where every other control has a disabled column.
     * It matters because every failure in this product ends by offering the
     * telephone: a refusal, a 503, an empty feed, a rate limit. A phone control
     * that could be disabled would be disabled in exactly the states where it
     * is the only thing left that works.
     */
    const source = TapToCall.toString();
    expect(source).not.toMatch(/\bdisabled\b/);
  });
});

// ── RateLimitCard (board 05) ─────────────────────────────────────────────────

describe('RateLimitCard', () => {
  it('shows a real countdown and blocks send until it ends', () => {
    render(<RateLimitCard remaining={42} total={60} />);
    expect(screen.getByText('0:42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send again' })).toBeDisabled();
  });

  it('enables send at zero', () => {
    render(<RateLimitCard remaining={0} total={60} />);
    expect(screen.getByRole('button', { name: 'Send again' })).toBeEnabled();
  });

  it('says the question is still in the box — a rate limit is a wait, not a rejection', () => {
    render(<RateLimitCard remaining={42} total={60} />);
    expect(screen.getByText(/still in the box/i)).toBeInTheDocument();
  });

  it('offers no quota meter, because the backend exposes none', () => {
    /*
     * Board 22: "there is no remaining-quota figure anywhere". The countdown is
     * the only rate signal that exists, and inventing a "questions remaining"
     * would be the client making up a number.
     */
    const { container } = render(<RateLimitCard remaining={42} total={60} />);
    expect(container.textContent).not.toMatch(/remaining|questions left|quota/i);
  });
});

// ── ToolTrace (boards 05 and 14) ─────────────────────────────────────────────

const STEP = (over: Partial<ToolActivity> = {}): ToolActivity => ({
  id: 'search_scaspa_knowledge-0',
  name: 'search_scaspa_knowledge',
  summary: 'Searching SCASPA knowledge base — ferry fares',
  ms: 240,
  done: true,
  ...over,
});

describe('ToolTrace', () => {
  /*
   * ── THE LABEL STOPPED BEING A COUNT OF FUNCTION CALLS ──────────────────────
   *
   * It read "3 tools used · 361 ms". A traveller deciding whether to believe a
   * fact about a ferry was being told how many function calls had run and how
   * long they took — the most inside-out sentence in the product.
   *
   * The detail did not go anywhere. It is still in the panel, under a heading
   * that says what the panel is for, one click away instead of on the face of
   * every answer. These tests moved with the label rather than being loosened
   * to accept either wording.
   */
  const HEADING = /how pilot verified this/i;

  it('arrives collapsed — evidence, not answer', () => {
    render(<ToolTrace activity={[STEP()]} />);
    expect(screen.getByRole('button', { name: HEADING })).toHaveAttribute('aria-expanded', 'false');
  });

  it('names what it is, and never the machinery, once settled', () => {
    render(<ToolTrace activity={[STEP()]} />);
    const label = screen.getByRole('button', { name: HEADING }).textContent ?? '';
    expect(label).not.toMatch(/tool/i);
    expect(label, 'no duration on the face of an answer').not.toMatch(/\d+\s*(ms|s)\b/i);
  });

  it('does show progress while tools are still running', () => {
    // Then the count is progress rather than trivia: "0 of 1" is the difference
    // between working and stuck, and it disappears the moment it settles.
    render(<ToolTrace activity={[STEP({ ms: null, done: false })]} />);
    expect(screen.getByRole('button', { name: /verifying — 0 of 1 steps/i })).toBeInTheDocument();
  });

  it('shows name, the backend summary and a duration — and no payloads', async () => {
    const user = userEvent.setup();
    render(<ToolTrace activity={[STEP()]} />);
    await user.click(screen.getByRole('button', { name: HEADING }));

    expect(screen.getByText('search_scaspa_knowledge')).toBeInTheDocument();
    expect(screen.getByText(/Searching SCASPA knowledge base/)).toBeInTheDocument();
    // The timing is demoted, not deleted: a reader who opened something called
    // "How Pilot verified this" is asking exactly this.
    expect(screen.getByText('240 ms')).toBeInTheDocument();
  });

  it('marks a running tool rather than showing it as instant', async () => {
    const user = userEvent.setup();
    render(<ToolTrace activity={[STEP({ ms: null, done: false })]} />);
    await user.click(screen.getByRole('button', { name: /verifying/i }));
    // `0 ms` would read as instant, which is the opposite of what is true.
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.queryByText('0 ms')).not.toBeInTheDocument();
  });

  it('states the six-tool cap only when it was actually reached', async () => {
    const user = userEvent.setup();
    const six = Array.from({ length: 6 }, (_, i) => STEP({ id: `t${i}`, name: `tool_${i}` }));
    const { unmount } = render(<ToolTrace activity={six} />);
    await user.click(screen.getByRole('button', { name: HEADING }));
    expect(screen.getByText(/most that can run for one question/i)).toBeInTheDocument();
    unmount();

    render(<ToolTrace activity={[STEP()]} />);
    await user.click(screen.getByRole('button', { name: HEADING }));
    // On a one-tool trace it would imply a limit was hit when none was.
    expect(screen.queryByText(/most that can run/i)).not.toBeInTheDocument();
  });
});

// ── Icon ─────────────────────────────────────────────────────────────────────

describe('Icon', () => {
  it('is decorative by default, because the word is always beside it', () => {
    const { container } = render(<Icon name="alert" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role', 'img');
  });

  it('takes a name only when it is genuinely alone', () => {
    render(<Icon name="alert" title="Warning" />);
    expect(screen.getByRole('img', { name: 'Warning' })).toBeInTheDocument();
  });

  it('keeps the 2px stroke on a 24 grid at every size', () => {
    // The stroke does not scale with the box: that is what keeps a chip's glyph
    // the same weight as a table row's.
    const { container } = render(<Icon name="ship" size={14} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg).toHaveAttribute('width', '14');
  });
});
