/**
 * The conversation's view model.
 *
 * Deliberately *not* the wire types. `lib/types.ts` mirrors the contract exactly
 * and must never drift from it; this is what the UI needs in order to render,
 * which is a different question. Keeping them apart means a contract change
 * surfaces as a compile error in one mapping function rather than as a redesign.
 */

import type { ApiError, ChartSpec, Citation, RefusalCategory, ToolName } from '@/lib/types';

/** One tool step, assembled from a `tool_start` / `tool_end` pair. */
export interface ToolActivity {
  /** `name` plus arrival order — the contract says to match the pair by both. */
  id: string;
  name: ToolName;
  /** The backend's own summary string, rendered directly. Never composed here. */
  summary: string;
  /** Measured duration, from `tool_end`. Null while the step is still running. */
  ms: number | null;
  done: boolean;
}

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  /** When the message was created. Rendered in the user's own locale. */
  at: Date;

  // ── assistant only ─────────────────────────────────────────────────────────
  /** True while tokens are still arriving. Drives throttled parsing. */
  streaming?: boolean;
  activity?: ToolActivity[];
  citations?: Citation[];
  chart?: ChartSpec | null;
  /**
   * Internal integrity signal, never surfaced as a correctness warning — the
   * contract is explicit that `grounded: true` does not mean the answer is right.
   */
  grounded?: boolean;
  refusal?: boolean;
  /**
   * Which boundary was hit. Drives the explanation on the escalation card.
   *
   * Only present on the non-streaming endpoint: the `done` event carries
   * `refusal` but not `refusal_category`. Raised with the backend team — see
   * docs/decisions.md F005. The card falls back to the backend's own refusal
   * text, which is approved copy, so nothing is invented when it is absent.
   */
  refusal_category?: RefusalCategory | undefined;
  /** A failure that arrived after the message existed, e.g. a mid-stream error. */
  error?: ApiError | null;
}

export interface ChatState {
  messages: Message[];
  conversationId: string | null;
  /** True from send until `done` or `error`. */
  busy: boolean;
  /** A failure that stopped a message existing at all, e.g. a 503 before the stream. */
  error: ApiError | null;
}

export const initialChatState: ChatState = {
  messages: [],
  conversationId: null,
  busy: false,
  error: null,
};
