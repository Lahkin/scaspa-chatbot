/**
 * Surviving a bad network, a stressed backend and a judge typing nonsense.
 *
 * The claims here are all about what must *not* happen: no second request from a
 * double tap, no send during a rate-limit cooldown, no white screen from a thrown
 * render, and nothing at all leaving the browser.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers';
import { server } from '@/mocks/server';
import { config } from '@/lib/config';
import { Composer } from '@/components/chat/Composer';
import { RouteErrorBoundary } from '@/components/shells/RouteErrorBoundary';
import { FullPageShell } from '@/components/shells/FullPageShell';
import { chatReducer, initialMachineState, type ChatAction } from '@/features/chat/reducer';
import { resetDraft, setDraft } from '@/features/chat/draft';
import { writeConversationId, readConversationId } from '@/features/chat/conversation';
import { setScenario } from '@/mocks/scenarios';
import { startTurn } from '@/features/chat/telemetry';
import { useChatSession } from '@/features/chat/useChatSession';

const BASE = config.apiBaseUrl;

afterEach(() => {
  resetDraft();
  setScenario('happy');
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── Task 2: rate limiting ────────────────────────────────────────────────────

const send: ChatAction = {
  type: 'SEND',
  userId: 'u1',
  assistantId: 'a1',
  at: new Date('2026-04-01T14:30:00Z'),
  text: 'How much is a ferry ticket?',
  transport: 'stream',
};

describe('a 429 sets a cooldown the composer can see', () => {
  it('records Retry-After as a cooldown', () => {
    const state = chatReducer(chatReducer(initialMachineState, send), {
      type: 'REQUEST_FAILED',
      failure: {
        kind: 'UPSTREAM_RATE_LIMITED',
        message: 'Busy.',
        requestId: 'r',
        retryAfterS: 8,
        question: 'x',
      },
    });
    expect(state.cooldownS).toBe(8);
  });

  it('falls back to a sensible wait when the server did not say', () => {
    const state = chatReducer(chatReducer(initialMachineState, send), {
      type: 'REQUEST_FAILED',
      failure: {
        kind: 'UPSTREAM_RATE_LIMITED',
        message: 'Busy.',
        requestId: 'r',
        retryAfterS: null,
        question: 'x',
      },
    });
    // Guessing zero would let the user hammer the endpoint immediately.
    expect(state.cooldownS).toBe(30);
  });

  it('other failures set no cooldown', () => {
    const state = chatReducer(chatReducer(initialMachineState, send), {
      type: 'REQUEST_FAILED',
      failure: {
        kind: 'UPSTREAM_TIMEOUT',
        message: 'Slow.',
        requestId: 'r',
        retryAfterS: null,
        question: 'x',
      },
    });
    expect(state.cooldownS).toBeNull();
  });

  it('ticks down to null', () => {
    let state = chatReducer(chatReducer(initialMachineState, send), {
      type: 'REQUEST_FAILED',
      failure: {
        kind: 'UPSTREAM_RATE_LIMITED',
        message: 'Busy.',
        requestId: 'r',
        retryAfterS: 2,
        question: 'x',
      },
    });
    state = chatReducer(state, { type: 'COOLDOWN_TICK' });
    expect(state.cooldownS).toBe(1);
    state = chatReducer(state, { type: 'COOLDOWN_TICK' });
    // Null rather than 0, so "is there a cooldown" is one check.
    expect(state.cooldownS).toBeNull();
    expect(chatReducer(state, { type: 'COOLDOWN_TICK' }).cooldownS).toBeNull();
  });
});

describe('the composer during a cooldown', () => {
  it('shows the countdown on the send button and refuses to send', async () => {
    const onSend = vi.fn();
    setDraft('How much is a ferry ticket?');
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} cooldownS={8} />);

    // On the button, because that is what the user is reaching for. A clock
    // rather than a bare second count — board 22 keeps one format across the
    // strip, the button and the 429 card.
    /*
     * §3.2 state 7 draws the send control as the same 34px circle it always is,
     * showing the remaining seconds in place of the arrow — "send is blocked,
     * never hidden". The accessible name still starts with "Send", so a screen
     * reader is told which control this is before it is told to wait.
     */
    const button = screen.getByRole('button', { name: 'Send — wait 0:08' });
    expect(button).toBeDisabled();
    expect(button.textContent).toBe('8');

    // And the strip above names the published budget as well as the wait, so a
    // user on a screen where they have also recorded and refreshed can tell
    // which of the three is blocked — board 13 state 7, board 22.
    expect(screen.getByText(/15 questions a minute is the limit/)).toBeInTheDocument();
    expect(screen.getByText(/Send again in 0:08/)).toBeInTheDocument();

    await userEvent.setup().click(button);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('explains it in plain language, with no code and no status', () => {
    setDraft('x');
    const { container } = render(
      <Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} cooldownS={8} />
    );
    // The strip names the published budget and the action it blocks, in words.
    expect(screen.getByText(/15 questions a minute is the limit/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/429|UPSTREAM/i);
  });

  it('keeps the box usable so a half-typed question is not lost', () => {
    setDraft('half a question');
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} cooldownS={8} />);
    expect(screen.getByLabelText('Your question')).toBeEnabled();
  });

  it('sends again once the cooldown expires', async () => {
    const onSend = vi.fn();
    setDraft('ferry fare?');
    const { rerender } = render(
      <Composer onSend={onSend} onStop={vi.fn()} busy={false} cooldownS={1} />
    );
    rerender(<Composer onSend={onSend} onStop={vi.fn()} busy={false} cooldownS={null} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith('ferry fare?');
  });
});

// ── Task 3: request deduplication ────────────────────────────────────────────

describe('a double tap fires exactly one request', () => {
  it('does not send twice when the button is clicked twice in a tick', async () => {
    let requests = 0;
    server.use(
      http.post(`${BASE}/api/chat/stream`, async () => {
        requests += 1;
        // Slow enough that a second click lands while the first is in flight.
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'stop here', request_id: 'r' } },
          { status: 500 }
        );
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<FullPageShell />);
    const box = await screen.findByLabelText('Your question');
    await user.type(box, 'How much is a ferry ticket?');

    const button = screen.getByRole('button', { name: 'Send' });
    // Two clicks with no await between them — the real double tap.
    await act(async () => {
      button.click();
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // The disabled button is the visible half; the in-flight ref is the half that
    // actually holds, because two clicks land before React re-renders.
    expect(requests).toBe(1);
  });

  it('disables send while a request is in flight', () => {
    setDraft('x');
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy />);
    // Stop replaces Send: cancelling is free, sending again is not.
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});

// ── Task 4: the error boundary ───────────────────────────────────────────────

function Boom(): never {
  throw new Error('deliberate render failure');
}

describe('RouteErrorBoundary', () => {
  it('catches a thrown render instead of leaving a white screen', () => {
    // React logs the caught error; silenced so the suite output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RouteErrorBoundary routeName="/chat">
        <Boom />
      </RouteErrorBoundary>
    );
    expect(
      screen.getByRole('heading', { name: /Something went wrong on this page/ })
    ).toBeInTheDocument();
  });

  it('recovers by resetting the chat, not only by reloading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    writeConversationId('9131b944-2243-4d1e-8e87-1486a9d41f28');
    setDraft('a draft that may have caused it');

    // The cause is fixed *before* the user clicks reset — which is the realistic
    // sequence: whatever made it throw (a bad message, a stale id) is cleared by
    // the reset itself, and then the remount succeeds.
    let crashing = true;
    function Flaky() {
      if (crashing) throw new Error('boom');
      return <p>recovered</p>;
    }

    render(
      <RouteErrorBoundary routeName="/chat">
        <Flaky />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('heading', { name: /Something went wrong/ })).toBeInTheDocument();

    crashing = false;
    await userEvent.setup().click(screen.getByRole('button', { name: /Start a new conversation/ }));

    // Reloading would restore the conversation_id from sessionStorage and walk
    // straight back into the same crash, which is why reset clears it first.
    expect(readConversationId()).toBeNull();
    await waitFor(() => expect(screen.getByText('recovered')).toBeInTheDocument());
  });

  it('offers the phone number, which does not depend on any of this working', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RouteErrorBoundary routeName="/chat">
        <Boom />
      </RouteErrorBoundary>
    );
    expect(screen.getByRole('link', { name: '869-465-8121' })).toHaveAttribute(
      'href',
      'tel:+18694658121'
    );
  });

  it('shows no stack trace to a user', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <RouteErrorBoundary routeName="/chat">
        <Boom />
      </RouteErrorBoundary>
    );
    // The message is behind import.meta.env.DEV; the stack never renders at all.
    expect(container.textContent).not.toContain('at Boom');
    expect(container.querySelector('pre')?.textContent ?? '').not.toContain('\n    at ');
  });
});

// ── Task 5: offline ──────────────────────────────────────────────────────────

describe('the offline story is honest', () => {
  it('blocks sending but keeps the box usable', () => {
    setDraft('half a question');
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} offline />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    // Losing a half-written question to a dropped signal is the most annoying
    // possible outcome.
    expect(screen.getByLabelText('Your question')).toBeEnabled();
  });

  it('says so plainly and promises nothing', () => {
    setDraft('x');
    const { container } = render(
      <Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} offline />
    );
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    // No pretending: the assistant cannot function without the backend, and
    // saying so beats a spinner that never resolves.
    expect(container.textContent).not.toMatch(/queued|will retry|offline mode|cached/i);
  });
});

// ── Task 7: instrumentation, within the privacy position ─────────────────────

describe('instrumentation stays in the browser', () => {
  it('times a turn without recording anything about the user', () => {
    const turn = startTurn();
    turn.markFirstToken();
    const timing = turn.finish('stream', [{ name: 'search_scaspa_knowledge', ms: 148 }], 262);

    expect(timing.transport).toBe('stream');
    expect(timing.totalMs).toBeGreaterThanOrEqual(0);
    expect(timing.tools).toEqual([{ name: 'search_scaspa_knowledge', ms: 148 }]);
    // The *size* of the answer, never the answer.
    expect(timing.answerChars).toBe(262);
    expect(Object.keys(timing)).not.toContain('question');
    expect(Object.keys(timing)).not.toContain('answer');
  });

  it('the telemetry module cannot reach the network', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(process.cwd(), 'src/features/chat/telemetry.ts'), 'utf8');
    // Mechanical, not a promise: the ESLint rule confines fetch to lib/api.ts and
    // lib/stream.ts, and this asserts the same thing about this file directly.
    // Matches API usage, not prose: this file's own documentation says the word
    // "analytics" several times, and a test that fails on its own explanation is
    // a test people delete.
    for (const forbidden of ['fetch(', 'sendBeacon(', 'XMLHttpRequest', 'gtag(', 'dataLayer']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('no source file sets a cookie or talks to an analytics host', async () => {
    const { globSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = process.cwd();

    const offenders: string[] = [];
    for (const file of globSync('src/**/*.{ts,tsx}', { cwd: root })) {
      if (file.endsWith('routeTree.gen.ts')) continue;
      const source = readFileSync(resolve(root, file), 'utf8');
      if (/document\.cookie/.test(source)) offenders.push(`${file}: cookie`);
      // Hostnames and import specifiers only. `plausible` and `segment` are
      // ordinary English words and appear in fixture prose; matching them bare
      // produced a false positive on correct code.
      if (
        /google-analytics\.com|googletagmanager\.com|segment\.io|cdn\.segment|mixpanel\.com|posthog\.com|sentry\.io|plausible\.io|hotjar\.com/i.test(
          source
        ) ||
        /from ['"](@sentry|posthog-js|mixpanel|@amplitude|@datadog)/.test(source)
      ) {
        offenders.push(`${file}: analytics`);
      }
      if (/navigator\.sendBeacon/.test(source)) offenders.push(`${file}: beacon`);
    }
    expect(offenders).toEqual([]);
  });

  it('no analytics package is a dependency', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const names = Object.keys(pkg.dependencies ?? {}).join(' ');
    expect(names).not.toMatch(/analytics|sentry|posthog|mixpanel|segment|amplitude|datadog/i);
  });
});

describe('the hook refuses to send during a cooldown', () => {
  it('does not issue a request while a rate limit is counting down', async () => {
    // The disabled button masks this in the UI, so it is asserted at the hook.
    // Without it, a stale render, a keyboard Enter or a programmatic call would
    // walk straight past the countdown — and retrying a rate limit extends it.
    let requests = 0;
    server.use(
      http.post(`${BASE}/api/chat/stream`, () => {
        requests += 1;
        return HttpResponse.json(
          { error: { code: 'UPSTREAM_RATE_LIMITED', message: 'Busy.', request_id: 'r' } },
          { status: 429, headers: { 'Retry-After': '30' } }
        );
      })
    );

    const { result } = renderHook(() => useChatSession());

    await act(async () => {
      await result.current.send('How much is a ferry ticket?');
    });
    expect(requests).toBe(1);
    expect(result.current.state.cooldownS).toBe(30);

    await act(async () => {
      await result.current.send('And for a child?');
    });
    expect(requests).toBe(1);
  });
});
