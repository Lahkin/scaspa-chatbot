/**
 * The conversation state machine.
 *
 * **Pure, and deliberately separated from the transport.** Every event that can
 * reach the UI is an action here, so a whole answer — including a split marker, a
 * mid-stream error and an abort — can be replayed in a unit test in
 * milliseconds, with no network, no timers and no React. That is the cheapest
 * insurance available on the most fragile code in the project, and it is the
 * reason this file has no imports from `lib/stream.ts`.
 *
 * No `Date.now()`, no `crypto.randomUUID()`, no reads of anything mutable: given
 * the same actions it produces the same state, which is what makes a recorded
 * sequence a test.
 */

import type { ApiErrorBody, ChartSpec, Citation, ChartType, ToolName } from '@/lib/types';
import { guardPartialMarker } from './markerGuard';
import type { ChatFailure, Message, ToolActivity } from './types';

export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

/** Which path produced the current answer. Recorded so it can be read afterwards. */
export type Transport = 'stream' | 'fetch';

export interface ChatMachineState {
  messages: Message[];
  /** The assistant message currently being written, or null. */
  streamingMessageId: string | null;
  /** Tool steps for the turn in flight. Mirrored onto the message as they arrive. */
  toolEvents: ToolActivity[];
  status: ChatStatus;
  error: ChatFailure | null;
  conversationId: string | null;
  /**
   * Text withheld by the marker guard.
   *
   * Kept in state rather than derived at render time so the guard is part of the
   * replayable machine — a rendering-time guard could not be tested without a DOM.
   */
  heldText: string;
  transport: Transport | null;
  /**
   * Seconds remaining before another question may be sent, or null.
   *
   * Set from `Retry-After` on a 429/503. Held in state rather than in the error
   * panel because it has to disable the *composer* — a countdown next to a
   * dismissed error, with an enabled send button beside it, is an invitation to
   * make the rate limit worse.
   */
  cooldownS: number | null;
}

export const initialMachineState: ChatMachineState = {
  messages: [],
  streamingMessageId: null,
  toolEvents: [],
  status: 'idle',
  error: null,
  conversationId: null,
  heldText: '',
  transport: null,
  cooldownS: null,
};

export type ChatAction =
  /** Ids and timestamps are supplied by the caller so the reducer stays pure. */
  | {
      type: 'SEND';
      userId: string;
      assistantId: string;
      at: Date;
      text: string;
      transport: Transport;
    }
  | { type: 'META'; conversationId: string }
  | { type: 'TOKEN'; text: string }
  | { type: 'TOOL_START'; name: ToolName; summary: string }
  | { type: 'TOOL_END'; name: ToolName; summary: string; ms: number }
  | { type: 'CITATIONS'; citations: Citation[] }
  | { type: 'CHART'; chart: ChartSpec }
  | { type: 'REPLACE'; text: string }
  | { type: 'DONE'; grounded: boolean; refusal: boolean }
  | { type: 'STREAM_ERROR'; error: ApiErrorBody }
  /** A failure before any answer existed — a 503, a timeout, offline. */
  | { type: 'REQUEST_FAILED'; failure: ChatFailure }
  /** The non-streaming path answered. Replaces the whole in-flight message. */
  | {
      type: 'FALLBACK_ANSWER';
      text: string;
      citations: Citation[];
      chart: ChartSpec | null;
      grounded: boolean;
      refusal: boolean;
      refusalCategory: Message['refusal_category'];
      toolCalls: { name: ToolName; summary: string; ms: number }[];
      conversationId: string;
    }
  /** One second of the rate-limit cooldown elapsed. Ticked by the hook. */
  | { type: 'COOLDOWN_TICK' }
  | { type: 'ABORT' }
  | { type: 'DISMISS_ERROR' }
  | { type: 'RESET' };

/**
 * Replace the streaming assistant message, or return state untouched.
 *
 * **Patch before clearing `streamingMessageId`.** This looks the message up by
 * that id, so passing a state whose id has already been nulled makes the patch a
 * silent no-op — which is exactly how the held tail stopped being flushed on
 * `done`. Every terminal action below patches first and clears second.
 */
function patchStreaming(
  state: ChatMachineState,
  patch: (message: Message) => Message
): ChatMachineState {
  const index = state.messages.findIndex((message) => message.id === state.streamingMessageId);
  if (index === -1) return state;
  const messages = [...state.messages];
  messages[index] = patch(messages[index] as Message);
  return { ...state, messages };
}

export function chatReducer(state: ChatMachineState, action: ChatAction): ChatMachineState {
  switch (action.type) {
    case 'SEND': {
      const user: Message = {
        id: action.userId,
        role: 'user',
        text: action.text,
        at: action.at,
      };
      const assistant: Message = {
        id: action.assistantId,
        role: 'assistant',
        text: '',
        at: action.at,
        streaming: true,
        activity: [],
        citations: [],
        chart: null,
        error: null,
      };
      return {
        ...state,
        messages: [...state.messages, user, assistant],
        streamingMessageId: action.assistantId,
        toolEvents: [],
        // `thinking` until the first token: the wait before anything arrives is a
        // different state from an answer being written, and the UI shows
        // different things for each.
        status: 'thinking',
        error: null,
        heldText: '',
        transport: action.transport,
      };
    }

    case 'META':
      // Adopted immediately, before any token, so the conversation is correct
      // even if the user navigates away mid-answer.
      return { ...state, conversationId: action.conversationId };

    case 'TOKEN': {
      const message = state.messages.find((m) => m.id === state.streamingMessageId);
      if (!message) return state;

      // The guard runs on the *accumulated* text, not on this token: a marker can
      // span more than two frames, and only the accumulation knows where it began.
      const accumulated = message.text + state.heldText + action.text;
      const { visible, held } = guardPartialMarker(accumulated);

      return patchStreaming({ ...state, status: 'streaming', heldText: held }, (current) => ({
        ...current,
        text: visible,
      }));
    }

    case 'TOOL_START': {
      const step: ToolActivity = {
        // name plus arrival order, which is how the contract says to match a pair.
        id: `${action.name}-${state.toolEvents.length}`,
        name: action.name,
        summary: action.summary,
        ms: null,
        done: false,
      };
      const toolEvents = [...state.toolEvents, step];
      return patchStreaming({ ...state, toolEvents }, (message) => ({
        ...message,
        activity: toolEvents,
      }));
    }

    case 'TOOL_END': {
      const toolEvents = [...state.toolEvents];
      // The last still-running step with this name — name plus order.
      for (let index = toolEvents.length - 1; index >= 0; index -= 1) {
        const step = toolEvents[index];
        if (step && step.name === action.name && !step.done) {
          toolEvents[index] = { ...step, ms: action.ms, done: true };
          break;
        }
      }
      return patchStreaming({ ...state, toolEvents }, (message) => ({
        ...message,
        activity: toolEvents,
      }));
    }

    case 'CITATIONS':
      return patchStreaming(state, (message) => ({ ...message, citations: action.citations }));

    case 'CHART':
      return patchStreaming(state, (message) => ({ ...message, chart: action.chart }));

    case 'REPLACE':
      // The tool-call cap was hit: everything streamed so far was an internal
      // message, not an answer. Discard it entirely, held tail included.
      return patchStreaming({ ...state, heldText: '' }, (message) => ({
        ...message,
        text: action.text,
      }));

    case 'DONE': {
      // Flush the guard unconditionally. If the answer genuinely ends mid-marker,
      // the text still appears — silently deleting the end of an answer is worse
      // than a flicker that never happens.
      const patched = patchStreaming(state, (message) => ({
        ...message,
        text: message.text + state.heldText,
        streaming: false,
        grounded: action.grounded,
        refusal: action.refusal,
      }));
      return { ...patched, status: 'idle', streamingMessageId: null, heldText: '' };
    }

    case 'STREAM_ERROR': {
      // HTTP is already 200 by the time this arrives. Whatever text has streamed
      // stays on screen — it was real, and discarding it wastes the wait.
      const patched = patchStreaming(state, (message) => ({
        ...message,
        text: message.text + state.heldText,
        streaming: false,
        error: action.error,
      }));
      return { ...patched, status: 'idle', streamingMessageId: null, heldText: '' };
    }

    case 'COOLDOWN_TICK': {
      if (state.cooldownS === null) return state;
      const next = state.cooldownS - 1;
      return { ...state, cooldownS: next > 0 ? next : null };
    }

    case 'REQUEST_FAILED': {
      const index = state.messages.findIndex((m) => m.id === state.streamingMessageId);
      const streaming = index === -1 ? null : (state.messages[index] as Message);
      // A rate limit is the one failure that must stop the next attempt too.
      const cooldownS =
        action.failure.kind === 'RATE_LIMITED' || action.failure.kind === 'UPSTREAM_RATE_LIMITED'
          ? (action.failure.retryAfterS ?? 30)
          : state.cooldownS;

      // Nothing arrived, so there is no answer to keep. Drop the empty bubble and
      // report at conversation level rather than leaving a blank one on screen.
      if (streaming && streaming.text === '') {
        const messages = [...state.messages];
        messages.splice(index, 1);
        return {
          ...state,
          messages,
          streamingMessageId: null,
          status: 'error',
          error: action.failure,
          heldText: '',
          cooldownS,
        };
      }

      // Some text arrived first: keep it and attach the failure to the message.
      const patched = patchStreaming(state, (message) => ({
        ...message,
        text: message.text + state.heldText,
        streaming: false,
        error: {
          code: action.failure.kind === 'OFFLINE' ? 'INTERNAL' : action.failure.kind,
          message: action.failure.message,
          request_id: action.failure.requestId ?? 'client-side',
        },
      }));
      return { ...patched, status: 'idle', streamingMessageId: null, heldText: '', cooldownS };
    }

    case 'FALLBACK_ANSWER': {
      // The non-streaming path answered. Its text is already fully verified, so
      // there is no held tail and no reconciliation window.
      const patched = patchStreaming(state, (message) => ({
        ...message,
        text: action.text,
        streaming: false,
        citations: action.citations,
        chart: action.chart,
        grounded: action.grounded,
        refusal: action.refusal,
        refusal_category: action.refusalCategory,
        activity: action.toolCalls.map((tool, index) => ({
          id: `${tool.name}-${index}`,
          name: tool.name,
          summary: tool.summary,
          ms: tool.ms,
          done: true,
        })),
      }));
      return {
        ...patched,
        status: 'idle',
        streamingMessageId: null,
        heldText: '',
        conversationId: action.conversationId,
        transport: 'fetch',
      };
    }

    case 'ABORT': {
      const index = state.messages.findIndex((m) => m.id === state.streamingMessageId);
      const streaming = index === -1 ? null : (state.messages[index] as Message);

      // Cancelled before anything arrived: remove the placeholder entirely rather
      // than leaving an empty bubble the user has to look at.
      if (streaming && streaming.text === '' && state.heldText === '') {
        const messages = [...state.messages];
        messages.splice(index, 1);
        return { ...state, messages, streamingMessageId: null, status: 'idle', heldText: '' };
      }

      // Cancelled mid-answer: keep what arrived, flushed. The user asked to stop,
      // not to lose what they had already read.
      const patched = patchStreaming(state, (message) => ({
        ...message,
        text: message.text + state.heldText,
        streaming: false,
      }));
      return { ...patched, status: 'idle', streamingMessageId: null, heldText: '' };
    }

    case 'DISMISS_ERROR':
      return { ...state, error: null, status: state.status === 'error' ? 'idle' : state.status };

    case 'RESET':
      return { ...initialMachineState };

    default:
      return state;
  }
}

/** Exhaustiveness helper for the chart type union, kept next to its user. */
export type { ChartType };
