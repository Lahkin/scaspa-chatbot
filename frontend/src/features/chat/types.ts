/**
 * The conversation's view model.
 *
 * Deliberately *not* the wire types. `lib/types.ts` mirrors the contract exactly
 * and must never drift from it; this is what the UI needs in order to render,
 * which is a different question. Keeping them apart means a contract change
 * surfaces as a compile error in one mapping function rather than as a redesign.
 */

import type {
  ApiErrorBody,
  AssistantCard,
  ChartSpec,
  Citation,
  RefusalCategory,
  ToolName,
} from '@/lib/types';
import type { FailureKind } from './errorCopy';

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
   * A card rendered below the answer.
   *
   * Its rows never came from the model — see `AssistantCard`. Which is why,
   * unlike the chart, it is **not** gated on `grounded`: a card's provenance is
   * its own `DataSource`, not the prose's citations, and hiding a correctly
   * sourced board because a sentence above it had an unverified figure would
   * withhold the more trustworthy of the two.
   */
  card?: AssistantCard | null;
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
  /**
   * The draft carried figures that could not be matched to a retrieved row, so
   * it was discarded and the answer rebuilt from the published values.
   *
   * The user is reading something other than what was first written, and only
   * this says so. Showing the correction on every answer would be a lie;
   * showing it on none hides the rewrite.
   */
  answer_replaced?: boolean;
  /**
   * The tokens that were on screen when the backend replaced the answer.
   *
   * §3.5: "When the backend replaces an in-flight answer, the accumulated
   * tokens are shown struck through and a caution line follows. **Do not
   * silently swap the text.**" The reducer used to discard them, so a reader
   * watching a figure appear saw it vanish and a different one take its place
   * with nothing to say why.
   *
   * Transient: it lives for the rest of the stream and is cleared on `done`,
   * where `answer_replaced` takes over and the settled correction notice
   * explains what happened.
   */
  superseded?: string | undefined;
  /**
   * How long the backend took, in milliseconds — `latency_ms`.
   *
   * Kept on the message so §3.14's diagnostics panel can render "Answer time"
   * from what the SERVER measured. A stopwatch started in the browser would
   * include the reader's own network and make a slow train look like a slow
   * assistant.
   */
  latency_ms?: number;
  /**
   * The agent ran out of tool calls before it could finish.
   *
   * Distinct from a plain no-answer on purpose. "Ask for one thing at a time"
   * resolves this and sends someone asking about a fact we do not hold round in
   * circles — the two arrive as the same `refusal: true` and need opposite copy.
   */
  step_limit_reached?: boolean;
  /**
   * A user message as it was actually sent, when input safety changed it.
   *
   * Instruction-like phrasing is replaced **in place** with the marker
   * `[instruction-like text removed]`, so the position in the sentence
   * survives and the user can see exactly what went. Absent when nothing was
   * changed, which is almost always.
   */
  sanitised?: string;
  /** A failure that arrived after the message existed, e.g. a mid-stream error. */
  error?: ApiErrorBody | null;
}

/**
 * A failure, in the terms the UI needs.
 *
 * Not the `ApiErrorBody` itself: `kind` is what selects approved copy, and
 * `requestId` is carried only so it can be logged in dev. Neither the code nor
 * the id is ever rendered.
 */
export interface ChatFailure {
  kind: FailureKind;
  /** The backend's own user-facing sentence, when there was one. */
  message: string;
  requestId: string | undefined;
  retryAfterS: number | null;
  /** The question that produced it, so Retry can resend without retyping. */
  question: string;
}

export interface ChatState {
  messages: Message[];
  conversationId: string | null;
  /** True from send until `done` or `error`. */
  busy: boolean;
  /** A failure that stopped a message existing at all, e.g. a 503 before the stream. */
  error: ChatFailure | null;
}

export const initialChatState: ChatState = {
  messages: [],
  conversationId: null,
  busy: false,
  error: null,
};
