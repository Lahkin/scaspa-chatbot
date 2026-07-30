/**
 * One approved user-facing string per failure. **This is copy, not code.**
 *
 * It lives in one file so the whole set can be read at once and signed off at
 * once — the alternative is a sentence written inline in whichever component
 * happened to need it, and then eight slightly different apologies nobody has
 * ever read together.
 *
 * ### The rule about what a user may see
 *
 * Never a stack trace, never an error code, never a `request_id`, never a model
 * name. Those are all things that leak *our* problem into *their* screen: a
 * traveller standing at a terminal cannot act on `UPSTREAM_TIMEOUT` and reading
 * it makes a working system look broken.
 *
 * The `request_id` **is** logged to the console in dev, and nowhere else, so a
 * failure on someone's laptop can still be matched to a backend log line.
 *
 * ### Why this file duplicates the backend's messages
 *
 * It does not, quite. The backend sends a user-safe `message` on every error and
 * the contract says it is safe to display as-is — and for a *streamed* error, or
 * any code this file does not know, that is exactly what gets rendered. What is
 * here is the client's own copy for the handful of codes where the UI can say
 * something more useful than a generic sentence, because it knows what the user
 * was doing and what button to offer next.
 */

import type { ErrorCode } from '@/lib/types';
import { SCASPA_TEL_TEXT } from './contact';

/** Not a backend code: the browser knows this one before any request is made. */
export const OFFLINE = 'OFFLINE' as const;

export type FailureKind = ErrorCode | typeof OFFLINE;

export interface ErrorCopy {
  /** Short, plain, no apology stack. */
  title: string;
  /** One or two sentences. What happened, in the user's terms. */
  body: string;
  /** Whether trying again could plausibly work. */
  retryable: boolean;
  /** Show the phone number and postal route immediately, not as an afterthought. */
  showContact: boolean;
}

const CALL = `call SCASPA on ${SCASPA_TEL_TEXT}`;

export const ERROR_COPY: Record<FailureKind, ErrorCopy> = {
  UPSTREAM_TIMEOUT: {
    title: 'That took too long',
    body: 'The assistant did not answer in time. It is worth trying again — the question was fine.',
    retryable: true,
    showContact: false,
  },

  UPSTREAM_RATE_LIMITED: {
    title: 'Busy right now',
    // The server has already retried with backoff by the time this arrives, so
    // the honest advice is to wait rather than to hammer the button.
    body: 'A lot of people are asking questions at once. Give it a moment and try again.',
    retryable: true,
    showContact: false,
  },

  INDEX_MISSING: {
    // The assistant genuinely cannot work. Contact route first, not buried.
    title: 'The assistant is not available',
    body: `Its information is being updated and it cannot answer questions until that finishes. Please ${CALL} — staff can help you straight away.`,
    retryable: false,
    showContact: true,
  },

  RETRIEVAL_EMPTY: {
    // Routed to the no-answer treatment before it ever reaches this table. Kept
    // here so the record is complete and so a future code path that does reach
    // it has a sentence rather than a fallback.
    title: 'No information available',
    body: `I do not have verified SCASPA information to answer from at the moment. Please ${CALL}.`,
    retryable: false,
    showContact: true,
  },

  VALIDATION_ERROR: {
    // Should be unreachable: the composer's counter disables send above the cap
    // and blocks an empty message. If a user ever sees this, the counter has a
    // bug — so the copy points at the input rather than at the service.
    title: 'That question cannot be sent',
    body: 'Please shorten it, or rephrase it, and try again.',
    retryable: false,
    showContact: false,
  },

  INTERNAL: {
    title: 'Something went wrong',
    body: `That is our problem, not yours. Please try again, or ${CALL} if it keeps happening.`,
    retryable: true,
    showContact: true,
  },

  NOT_FOUND: {
    title: 'Something went wrong',
    body: `That is our problem, not yours. Please try again, or ${CALL} if it keeps happening.`,
    retryable: true,
    showContact: true,
  },

  [OFFLINE]: {
    title: 'You appear to be offline',
    body: 'Check your connection and try again. Nothing you typed has been lost.',
    retryable: true,
    showContact: false,
  },
};

export function copyFor(kind: FailureKind): ErrorCopy {
  return ERROR_COPY[kind] ?? ERROR_COPY.INTERNAL;
}

/**
 * Whether a failure should be shown as a calm "I don't know" instead of an error.
 *
 * `RETRIEVAL_EMPTY` means the index exists but holds nothing to answer from. From
 * the service's point of view that is a fault; from the user's it is
 * indistinguishable from the assistant simply not knowing — and the no-answer
 * treatment tells them the useful thing (ask a person) without implying they hit
 * a bug.
 */
export function isNoAnswerCode(code: ErrorCode): boolean {
  return code === 'RETRIEVAL_EMPTY';
}

/**
 * Log the correlation id, in dev only.
 *
 * The id is the one thing that makes a bug report actionable, and the one thing
 * that must never be on screen. This is the whole compromise.
 */
export function logRequestId(context: string, requestId: string | undefined): void {
  if (!import.meta.env.DEV || !requestId) return;
  console.warn(`[${context}] request_id=${requestId}`);
}
