/**
 * The screens nobody demos and everybody hits.
 *
 * The claims that matter here are negative ones — what must *not* reach a user:
 * no error code, no request id, no stack, no model name, and no 422 that a
 * working character counter should have made unreachable.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './helpers';
import { ErrorState } from '@/components/chat/ErrorState';
import { NoAnswerCard } from '@/components/chat/NoAnswerCard';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { Composer, COUNTER_VISIBLE_FROM, MAX_LENGTH } from '@/components/chat/Composer';
import { HealthBanner } from '@/components/shells/HealthBanner';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { FullPageShell } from '@/components/shells/FullPageShell';
import { ERROR_COPY, OFFLINE, copyFor, isNoAnswerCode } from '@/features/chat/errorCopy';
import { getDraft, resetDraft, setDraft } from '@/features/chat/draft';
import { isStale } from '@/features/chat/useHealth';
import { setScenario } from '@/mocks/scenarios';
import { HEALTH, HEALTH_DEGRADED, HEALTH_STALE, NO_ANSWER_RESPONSE } from '@/mocks/fixtures';
import type { ErrorCode } from '@/lib/types';

afterEach(() => {
  resetDraft();
  setScenario('happy');
  vi.restoreAllMocks();
  // Unconditionally, not at the end of each timer test: a fake-timer test that
  // fails part-way leaves them installed, and every later test that awaits
  // anything then hangs on a clock that never advances. Ten tests timed out that
  // way before this line existed.
  vi.useRealTimers();
});

// ── Task 4: error copy ───────────────────────────────────────────────────────

const ALL_CODES: ErrorCode[] = [
  'VALIDATION_ERROR',
  'INDEX_MISSING',
  'RETRIEVAL_EMPTY',
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_TIMEOUT',
  'NOT_FOUND',
  'INTERNAL',
];

describe('error copy', () => {
  it('has an approved string for every code the contract defines, plus offline', () => {
    for (const code of ALL_CODES) {
      expect(ERROR_COPY[code], code).toBeDefined();
      expect(ERROR_COPY[code].title.length, code).toBeGreaterThan(0);
      expect(ERROR_COPY[code].body.length, code).toBeGreaterThan(0);
    }
    expect(copyFor(OFFLINE).title).toBe('You appear to be offline');
  });

  it('never leaks anything technical into user-facing copy', () => {
    // The rule, applied to the copy itself rather than to a rendered instance.
    for (const [kind, copy] of Object.entries(ERROR_COPY)) {
      const text = `${copy.title} ${copy.body}`;
      expect(text, kind).not.toMatch(/[A-Z]{4,}_[A-Z]{4,}/); // an error code
      expect(text, kind).not.toMatch(/request[_ ]id/i);
      expect(text, kind).not.toMatch(/\bgpt|\bmodel\b|openai/i);
      expect(text, kind).not.toMatch(/stack|traceback|exception/i);
      // An explicit list, not /[45]\d\d/ — that matched "465" inside the phone
      // number and would have failed on correct copy.
      expect(text, kind).not.toMatch(/\b(400|401|403|404|422|429|500|502|503|504)\b/);
      expect(text, kind).not.toMatch(/\bHTTP\b/i);
    }
  });

  it('routes RETRIEVAL_EMPTY to the no-answer treatment, not an error', () => {
    expect(isNoAnswerCode('RETRIEVAL_EMPTY')).toBe(true);
    expect(isNoAnswerCode('INTERNAL')).toBe(false);
  });
});

describe('ErrorState', () => {
  it('shows no code, no request id and no status to the user', () => {
    const { container } = render(
      <ErrorState kind="INTERNAL" requestId="ec970bed4d2b4a178f84a2f7a3619985" />
    );
    expect(container.textContent).not.toContain('INTERNAL');
    expect(container.textContent).not.toContain('ec970bed');
    expect(container.textContent).not.toContain('500');
  });

  it('logs the request id to the console in dev, and only there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ErrorState kind="INTERNAL" requestId="abc123" />);
    // The one thing that makes a bug report actionable, kept off the screen.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('abc123'));
  });

  it('offers a retry for a timeout', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState kind="UPSTREAM_TIMEOUT" onRetry={onRetry} />);
    expect(screen.getByText('That took too long')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('counts down from Retry-After and blocks retry until it expires', () => {
    vi.useFakeTimers();
    render(<ErrorState kind="UPSTREAM_RATE_LIMITED" retryAfterS={3} onRetry={vi.fn()} />);

    const button = screen.getByRole('button', { name: /Try again in 3s/ });
    expect(button).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: /Try again in 1s/ })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('shows the contact route immediately when the service is degraded', () => {
    render(<ErrorState kind="INDEX_MISSING" />);
    // No retry: the assistant genuinely cannot answer until the index is rebuilt.
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
    expect(screen.getByRole('link', { name: '869-465-8121' })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
  });

  it('states the offline case plainly and promises nothing was lost', () => {
    render(<ErrorState kind={OFFLINE} onRetry={vi.fn()} />);
    expect(screen.getByText('You appear to be offline')).toBeInTheDocument();
    expect(screen.getByText(/Nothing you typed has been lost/)).toBeInTheDocument();
  });
});

// ── Task 3: the no-answer treatment ──────────────────────────────────────────

describe('NoAnswerCard', () => {
  it('renders the backend copy verbatim, without rewriting it', () => {
    render(<NoAnswerCard message={NO_ANSWER_RESPONSE.answer} />);
    // Approved by the team leader and coach. The client supplies the frame, not
    // the words.
    expect(
      screen.getByText(/I do not have that in SCASPA's verified information/)
    ).toBeInTheDocument();
    expect(screen.getByText(/so I will not guess at it/)).toBeInTheDocument();
  });

  it('is not styled as an error', () => {
    const { container } = render(<NoAnswerCard message={NO_ANSWER_RESPONSE.answer} />);
    // Declining to guess is the most trustworthy thing the assistant does.
    // Dressing it in red teaches a reader that honesty is a malfunction.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('.bg-danger, .bg-danger-surface, .text-danger')).toBeNull();
  });

  it('turns the plain-text phone numbers into tappable links, without duplicating them', () => {
    render(<NoAnswerCard message={NO_ANSWER_RESPONSE.answer} />);
    expect(screen.getByRole('link', { name: '869-465-8121' })).toBeInTheDocument();
    // The backend's plain-text block is trimmed so the numbers appear once.
    expect(screen.queryByText(/Telephone: 869-465-8121 \/ 2 \/ 3/)).toBeNull();
  });

  it('a refusal with no category renders as a no-answer, not an escalation', () => {
    render(
      <MessageBubble
        message={{
          id: 'n',
          role: 'assistant',
          text: NO_ANSWER_RESPONSE.answer,
          at: new Date(),
          refusal: true,
          streaming: false,
        }}
      />
    );
    expect(document.querySelector('[data-state="no-answer"]')).not.toBeNull();
    expect(screen.queryByText('Talk to SCASPA directly')).toBeNull();
  });

  it('a refusal with a category still renders the escalation handoff', () => {
    render(
      <MessageBubble
        message={{
          id: 'e',
          role: 'assistant',
          text: 'That is not something I can advise on.',
          at: new Date(),
          refusal: true,
          refusal_category: 'personal_record',
          streaming: false,
        }}
      />
    );
    expect(screen.getByText('Talk to SCASPA directly')).toBeInTheDocument();
  });
});

// ── Task 2: thinking ─────────────────────────────────────────────────────────

describe('ThinkingIndicator', () => {
  it('says what it is doing without a number for the first three seconds', () => {
    vi.useFakeTimers();
    const now = Date.now();
    render(<ThinkingIndicator startedAt={now} />);
    expect(screen.getByText(/Looking through SCASPA information/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // A counter this early draws attention to a wait nobody had noticed.
    expect(screen.queryByTestId('elapsed')).toBeNull();
  });

  it('shows an elapsed counter past three seconds', () => {
    vi.useFakeTimers();
    render(<ThinkingIndicator startedAt={Date.now()} />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByTestId('elapsed')).toHaveTextContent('4s');
  });
});

// ── Task 6: the composer ─────────────────────────────────────────────────────

describe('the character counter makes a 422 unreachable', () => {
  function renderComposer(onSend = vi.fn()) {
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} />);
    return onSend;
  }

  it('stays out of the way below 900 characters', () => {
    setDraft('a'.repeat(COUNTER_VISIBLE_FROM - 1));
    renderComposer();
    expect(screen.queryByText(new RegExp(`/ ${MAX_LENGTH}`))).toBeNull();
  });

  it('appears at 900', () => {
    setDraft('a'.repeat(COUNTER_VISIBLE_FROM));
    renderComposer();
    expect(screen.getByText(`${COUNTER_VISIBLE_FROM} / ${MAX_LENGTH}`)).toBeInTheDocument();
  });

  it('turns red and disables send above the cap', () => {
    setDraft('a'.repeat(MAX_LENGTH + 1));
    renderComposer();
    const counter = screen.getByText(/1001 \/ 1000/);
    expect(counter.className).toContain('text-danger');
    // The backend's 422 is now unreachable by a human.
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('allows exactly the cap', () => {
    setDraft('a'.repeat(MAX_LENGTH));
    renderComposer();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('does not truncate as you type — a silent eat is worse than a visible count', () => {
    setDraft('a'.repeat(MAX_LENGTH + 50));
    renderComposer();
    expect(screen.getByLabelText('Your question')).toHaveValue('a'.repeat(MAX_LENGTH + 50));
  });

  it('blocks an empty or whitespace-only send, and trims on the way out', async () => {
    const user = userEvent.setup();
    const onSend = renderComposer();

    setDraft('   ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled());

    setDraft('  How much is a ferry ticket?  ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('How much is a ferry ticket?');
  });

  it('disables the composer while a request is in flight', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy />);
    expect(screen.getByLabelText('Your question')).toBeDisabled();
    // Stop is offered instead of Send: closing the connection is free.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});

describe('Enter behaviour', () => {
  it('sends on Enter and newlines on Shift+Enter with a pointer', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} />);

    const input = screen.getByLabelText('Your question');
    await user.click(input);
    await user.keyboard('ferry times');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalled();
  });

  it('tells the user which idiom applies', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />);
    // jsdom reports a fine pointer, so this is the keyboard hint.
    expect(screen.getByText(/Enter to send, Shift \+ Enter for a new line/)).toBeInTheDocument();
  });
});

describe('the draft survives a route change', () => {
  it('is restored from the store when the composer remounts', () => {
    setDraft('half a question about the ferry');
    const { unmount } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />);
    unmount();
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />);
    expect(screen.getByLabelText('Your question')).toHaveValue('half a question about the ferry');
  });

  it('is never written to storage — CLAUDE.md rule 5', () => {
    setDraft('a private question');
    // A half-typed question is message content, arguably the most sensitive kind:
    // what someone was about to ask and thought better of.
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
    expect(getDraft()).toBe('a private question');
  });
});

// ── Task 5: the health banner ────────────────────────────────────────────────

describe('degraded-service banner', () => {
  it('shows nothing when the service is healthy', async () => {
    renderWithProviders(<HealthBanner />);
    await waitFor(() => expect(document.querySelector('[data-health]')).toBeNull());
  });

  it('warns and offers the phone number when degraded', async () => {
    setScenario('degraded_health');
    renderWithProviders(<HealthBanner />);
    const banner = await screen.findByText(/not working properly/);
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call SCASPA/i })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
  });

  it('can be dismissed, because a banner that cannot be is a banner that gets ignored', async () => {
    const user = userEvent.setup();
    setScenario('degraded_health');
    renderWithProviders(<HealthBanner />);
    await screen.findByText(/not working properly/);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/not working properly/)).toBeNull();
  });

  it('notes a stale index quietly rather than as a warning', async () => {
    setScenario('stale_index');
    renderWithProviders(<HealthBanner />);
    const note = await screen.findByText(/last verified on/);
    expect(note).toBeInTheDocument();
    // The information may be perfectly current. A date is a fact to weigh, not an
    // alarm to sound.
    expect(document.querySelector('[data-health="stale"]')).not.toBeNull();
    expect(screen.queryByText(/not working properly/)).toBeNull();
  });

  it('never shows the raw diagnostics', async () => {
    setScenario('degraded_health');
    const { container } = renderWithProviders(<HealthBanner />);
    await screen.findByText(/not working properly/);
    for (const leak of ['degraded', 'kb_rows', 'index_built_at', 'mock-chat-model']) {
      expect(container.textContent).not.toContain(leak);
    }
  });

  it('staleness is measured against the configured threshold', () => {
    expect(isStale(HEALTH_STALE)).toBe(true);
    expect(isStale(HEALTH)).toBe(false);
    expect(isStale(null)).toBe(false);
    // Unknown is not stale: a client must not read "never built" as "very old".
    expect(isStale({ ...HEALTH, index: { ...HEALTH.index, kb_updated_at: null } })).toBe(false);
  });

  it('degraded is still HTTP 200, so it is not an error path', () => {
    expect(HEALTH_DEGRADED.status).toBe('degraded');
    expect(HEALTH_DEGRADED.index.ready).toBe(false);
    // Unknown values are null, never 0.
    expect(HEALTH_DEGRADED.index.kb_rows).toBeNull();
  });
});

// ── Task 1: the empty state ──────────────────────────────────────────────────

describe('the empty state', () => {
  it('says what it covers, offers questions, and is honest about the method', async () => {
    renderWithProviders(<FullPageShell />);

    expect(
      await screen.findByRole('heading', { name: /Ask about ports and travel/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/Ferry and cruise schedules/)).toBeInTheDocument();
    expect(screen.getByText(/cargo and import procedures/)).toBeInTheDocument();
    expect(screen.getByText(/published seaport\s+tariffs/)).toBeInTheDocument();
    expect(screen.getByText(/airport information/)).toBeInTheDocument();
    // The one honest sentence. A description of the method, which is the reason
    // to trust it — not a disclaimer.
    expect(
      screen.getByText(/answers from verified SCASPA information and shows you where/)
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /ferry|cruise|barrel|container/i }).length
    ).toBeGreaterThanOrEqual(4);
  });

  it('has no robot illustration and no "powered by AI" badge', () => {
    const { container } = renderWithProviders(<FullPageShell />);
    // A visitor on a pier does not care what it is built from; they care whether
    // they will make the last ferry.
    expect(container.textContent).not.toMatch(/powered by ai|\bAI\b|robot|GPT|LLM/i);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('nothing writes to browser storage', () => {
  it('rule 5 holds for the whole app, not just for the draft', async () => {
    // A regression guard with real history: TanStack Router's scroll restoration
    // wrote a `tsr-scroll-restoration-v1_*` key to sessionStorage until it was
    // turned off. A scroll offset is not message content — but rule 5 permits
    // only `conversation_id` there, and the rule is absolute.
    renderWithProviders(<FullPageShell />);
    await screen.findByRole('heading', { name: /Ask about ports and travel/ });

    const allowed = new Set(['conversation_id']);
    const sessionKeys = Object.keys(window.sessionStorage);
    expect(sessionKeys.filter((key) => !allowed.has(key))).toEqual([]);
    expect(Object.keys(window.localStorage)).toEqual([]);
  });
});

describe('a failed send does not lose the question', () => {
  it('puts the question back in the composer', async () => {
    setScenario('internal_error');
    renderWithProviders(<FullPageShell />);

    const user = userEvent.setup();
    const box = await screen.findByLabelText('Your question');
    await user.type(box, 'How much is a 40-foot container?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Something went wrong');
    // The offline and timeout copy both promise nothing was lost. An empty box
    // reads as exactly the loss the sentence denies.
    await waitFor(() => expect(getDraft()).toBe('How much is a 40-foot container?'));
  });
});
