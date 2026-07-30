import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, sendMessage } from '@/lib/api';
import { config } from '@/lib/config';
import { NotAStream, streamMessage } from '@/lib/stream';
import { clearConversationId, readConversationId, writeConversationId } from './conversation';
import { setDraft } from './draft';
import { OFFLINE, isNoAnswerCode, type FailureKind } from './errorCopy';
import { chatReducer, initialMachineState, type Transport } from './reducer';
import { logTurn, startTurn } from './telemetry';
import type { ChatFailure } from './types';

/**
 * Drives one conversation.
 *
 * State lives in a **pure reducer** (`reducer.ts`) so a whole answer can be
 * replayed in a unit test with no network, no timers and no React. This hook owns
 * only the things a reducer cannot: the connection, the deadlines, and the
 * decision to give up on the stream and try the other endpoint.
 *
 * Nothing is written to localStorage, sessionStorage or IndexedDB except the
 * `conversation_id` — CLAUDE.md rule 5.
 */

/** Ids for React keys only; they never leave the tab and identify nothing. */
let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * How long to wait for `meta` before giving up on the stream.
 *
 * `meta` is the first thing the server sends, so its absence means the stream
 * never really started — which on a hostile network usually means a proxy is
 * buffering `text/event-stream` and will release it at the end, or not at all.
 * Shorter than the overall timeout because there is a working alternative and no
 * reason to spend the whole budget discovering that.
 */
const META_DEADLINE_MS = 6000;

export function useChatSession() {
  const [state, dispatch] = useReducer(chatReducer, initialMachineState, (initial) => ({
    ...initial,
    // Read on mount so a reload does not silently start a new conversation
    // mid-exchange.
    conversationId: readConversationId(),
  }));

  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  /**
   * Task 3's guard, and it is a ref rather than state on purpose.
   *
   * A double tap fires two `onClick`s in the same tick, before React has
   * re-rendered with `busy: true` — so a check against rendered state would let
   * the second through. A ref is written synchronously and is therefore the only
   * thing that can see the first send from inside the second.
   *
   * The disabled button is the visible half; this is the half that actually
   * holds.
   */
  const inFlight = useRef(false);

  /**
   * Abort on unmount, which covers a route change too.
   *
   * A leaked reader keeps the connection open, and the backend explicitly detects
   * a live connection to decide whether to keep generating — so unmounting
   * without this keeps burning tokens on an answer that has nowhere to go.
   */
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  /**
   * Tick the rate-limit cooldown down to zero.
   *
   * In the hook rather than the reducer because a reducer that reads a clock is
   * no longer replayable, and the replay tests are the insurance on this file.
   */
  // Depends on *whether* a cooldown is running, not on its value: depending on
  // the number would tear down and rebuild the interval on every tick, so each
  // second would be slightly longer than the last.
  const cooling = state.cooldownS !== null;
  useEffect(() => {
    if (!cooling) return undefined;
    const timer = setInterval(() => dispatch({ type: 'COOLDOWN_TICK' }), 1000);
    return () => clearInterval(timer);
  }, [cooling]);

  const toFailure = useCallback((thrown: unknown, question: string): ChatFailure => {
    const api = thrown instanceof ApiError ? thrown : null;

    const kind: FailureKind = api?.offline
      ? OFFLINE
      : // `navigator.onLine === false` is conclusive; true proves nothing — a
        // captive portal answers DNS and drops the rest. The rejected-fetch
        // signal above is therefore the primary one.
        !navigator.onLine
        ? OFFLINE
        : (api?.code ?? 'INTERNAL');

    return {
      kind,
      message:
        api?.message ??
        'Something went wrong at our end. Please try again, or call SCASPA on ' +
          '869-465-8121 / 2 / 3.',
      requestId: api?.requestId,
      retryAfterS: api?.retryAfter ?? null,
      question,
    };
  }, []);

  /**
   * The non-streaming path.
   *
   * Used directly when streaming is switched off, and as the automatic fallback
   * when the stream stalls. Its text is fully verified before it is sent, with
   * unverifiable markers already stripped — so there is no held tail and no
   * reconciliation window.
   */
  const runFetch = useCallback(
    async (question: string, signal: AbortSignal, why: 'configured' | 'fallback') => {
      const answer = await sendMessage(question, readConversationId(), { signal });
      writeConversationId(answer.conversation_id);
      if (!mounted.current) return null;

      if (why === 'fallback') {
        // Logged, not shown. Which path answered is the first thing worth knowing
        // when someone reports the demo "felt different" on venue wifi.
        console.info(
          '[chat] the stream stalled; this answer came from POST /api/chat instead. ' +
            'A proxy on this network is probably buffering text/event-stream.'
        );
      }

      dispatch({
        type: 'FALLBACK_ANSWER',
        text: answer.answer,
        citations: answer.citations,
        chart: answer.chart,
        grounded: answer.grounded,
        refusal: answer.refusal,
        refusalCategory: answer.refusal_category ?? null,
        toolCalls: answer.tool_calls,
        conversationId: answer.conversation_id,
      });
      return answer;
    },
    []
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question) return;
      // Double-tap, an Enter held down, a click landing on a re-rendered button.
      if (inFlight.current) return;
      // A rate limit stops the next attempt too — retrying one is how you extend
      // one, and the countdown is meaningless if the send still goes through.
      if (state.cooldownS !== null) return;
      inFlight.current = true;

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      const transport: Transport = config.useStreaming ? 'stream' : 'fetch';
      dispatch({
        type: 'SEND',
        userId: nextId('user'),
        assistantId: nextId('assistant'),
        at: new Date(),
        text: question,
        transport,
      });

      const turn = startTurn();

      if (!config.useStreaming) {
        try {
          const answer = await runFetch(question, controller.signal, 'configured');
          if (answer) {
            logTurn(
              turn.finish(
                'fetch',
                answer.tool_calls.map((tool) => ({ name: tool.name, ms: tool.ms })),
                answer.answer.length
              )
            );
          }
        } catch (thrown) {
          if (controller.signal.aborted || !mounted.current) return;
          setDraft(question);
          dispatch({ type: 'REQUEST_FAILED', failure: toFailure(thrown, question) });
        } finally {
          inFlight.current = false;
        }
        return;
      }

      // ── the stall guard ────────────────────────────────────────────────────
      //
      // Two deadlines, both reset by activity. Some conference and hotel networks
      // buffer or terminate `text/event-stream`, and this is what keeps the demo
      // alive when the venue wifi is hostile.
      let stalled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const arm = (ms: number) => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          stalled = true;
          controller.abort();
        }, ms);
      };
      const disarm = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };

      // Nothing has arrived yet, so the shorter deadline applies.
      arm(META_DEADLINE_MS);

      // Collected for the dev log only. Never sent anywhere.
      const tools: { name: string; ms: number | null }[] = [];
      let answerChars = 0;

      try {
        await streamMessage(
          { message: question, conversationId: readConversationId() },
          {
            onMeta: (data) => {
              writeConversationId(data.conversation_id);
              dispatch({ type: 'META', conversationId: data.conversation_id });
              // The stream is alive; switch to the longer inter-event deadline.
              arm(config.streamTimeoutMs);
            },
            onToken: (data) => {
              turn.markFirstToken();
              answerChars += data.text.length;
              arm(config.streamTimeoutMs);
              dispatch({ type: 'TOKEN', text: data.text });
            },
            onToolStart: (data) => {
              arm(config.streamTimeoutMs);
              dispatch({ type: 'TOOL_START', name: data.name, summary: data.summary });
            },
            onToolEnd: (data) => {
              arm(config.streamTimeoutMs);
              tools.push({ name: data.name, ms: data.ms });
              dispatch({ type: 'TOOL_END', name: data.name, summary: data.summary, ms: data.ms });
            },
            onCitations: (data) => dispatch({ type: 'CITATIONS', citations: data.citations }),
            onChart: (data) => dispatch({ type: 'CHART', chart: data }),
            onReplace: (data) => dispatch({ type: 'REPLACE', text: data.text }),
            onDone: (data) => {
              disarm();
              dispatch({ type: 'DONE', grounded: data.grounded, refusal: data.refusal });
              logTurn(turn.finish('stream', tools, answerChars));
            },
            onError: (data) => {
              disarm();
              dispatch({ type: 'STREAM_ERROR', error: data });
            },
          },
          controller.signal
        );
      } catch (thrown) {
        disarm();
        if (!mounted.current) return;

        // A stall, or a proxy that returned something other than a stream. Both
        // mean this network cannot carry SSE, and both have the same answer: ask
        // again over plain POST, transparently.
        const proxyMangled = thrown instanceof NotAStream;
        if (stalled || proxyMangled) {
          if (proxyMangled && import.meta.env.DEV) {
            console.warn(`[chat] ${thrown.message}`);
          }
          const retry = new AbortController();
          abort.current = retry;
          try {
            const answer = await runFetch(question, retry.signal, 'fallback');
            if (answer) {
              logTurn(
                turn.finish(
                  'fetch',
                  answer.tool_calls.map((tool) => ({ name: tool.name, ms: tool.ms })),
                  answer.answer.length
                )
              );
            }
          } catch (fallbackError) {
            if (retry.signal.aborted || !mounted.current) return;
            setDraft(question);
            dispatch({ type: 'REQUEST_FAILED', failure: toFailure(fallbackError, question) });
          }
          return;
        }

        // A deliberate cancel is not a failure to report.
        if (controller.signal.aborted) return;

        // RETRIEVAL_EMPTY reads to a user as the assistant simply not knowing, so
        // it is routed to the calm no-answer treatment rather than an error panel.
        if (thrown instanceof ApiError && isNoAnswerCode(thrown.code)) {
          dispatch({
            type: 'FALLBACK_ANSWER',
            text: thrown.message,
            citations: [],
            chart: null,
            grounded: false,
            refusal: true,
            refusalCategory: null,
            toolCalls: [],
            conversationId: readConversationId() ?? '',
          });
          return;
        }

        setDraft(question);
        dispatch({ type: 'REQUEST_FAILED', failure: toFailure(thrown, question) });
      } finally {
        disarm();
        inFlight.current = false;
      }
    },
    [runFetch, toFailure, state.cooldownS]
  );

  /** The visible stop control while streaming. */
  const stop = useCallback(() => {
    abort.current?.abort();
    dispatch({ type: 'ABORT' });
  }, []);

  /**
   * Start again.
   *
   * Clears the stored id *and* the transcript. Clearing only one leaves the more
   * confusing half of the state: a fresh id with the old conversation still on
   * screen, or an empty screen still threaded to a server-side history.
   */
  const startNewConversation = useCallback(() => {
    abort.current?.abort();
    clearConversationId();
    setDraft('');
    dispatch({ type: 'RESET' });
  }, []);

  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);

  return { state, send, stop, dismissError, startNewConversation };
}
