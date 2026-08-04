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
 * Never a stack trace, never a `request_id`, never a model name, never an
 * internal code name. Those all leak *our* problem into *their* screen: a
 * traveller standing at a terminal cannot act on `UPSTREAM_TIMEOUT`, and reading
 * it makes a working system look broken.
 *
 * **The HTTP status is the exception, and it is drawn.** §7.1 puts "the code at
 * `600 12px/20px` tabular in the leading slot" and §3.11 colours it —
 * `--caution` for 4xx, `--critical-text` for 5xx. Two sections agreeing, and the
 * product already draws `422`, `413`, `429` and `503` on §6.16's transcription
 * rows. A three-digit number beside a plain sentence is what a caller reads out
 * to the switchboard; `UPSTREAM_TIMEOUT` is what nobody can.
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

/**
 * A 400 with no code in the body.
 *
 * §3.11 gives eight codes eight copies, and 400 is one of them — "We could not
 * read that request". It is **not** on `ErrorCode`, because that union is the
 * wire contract and the backend does not send this code; it is a client-side
 * kind, exactly like `OFFLINE`, reached from the HTTP status when the envelope
 * did not classify itself.
 *
 * Without it a 400 fell through to `INTERNAL` and told the user the fault was
 * ours, which §3.11 forbids in as many words: "Never a generic 'something went
 * wrong' for a code that knows better."
 */
export const BAD_REQUEST = 'BAD_REQUEST' as const;

export type FailureKind = ErrorCode | typeof OFFLINE | typeof BAD_REQUEST;

export interface ErrorCopy {
  /** Short, plain, no apology stack. */
  title: string;
  /** One or two sentences. What happened, in the user's terms. */
  body: string;
  /** Whether trying again could plausibly work. */
  retryable: boolean;
  /** Show the phone number and postal route immediately, not as an afterthought. */
  showContact: boolean;
  /**
   * The HTTP status this envelope carries, and it is **rendered**.
   *
   * §7.1: "code at `600 12px/20px` tabular in the leading slot"; §3.11: "Code
   * colour: `--caution` for 4xx, `--critical-text` for 5xx". Two sections
   * agreeing, and the product already draws status codes on the transcription
   * rows of §6.16 — `422`, `413`, `429`, `503`.
   *
   * Null only where there is no status to show: a request that never reached a
   * server has none, and inventing one would be worse than the blank.
   *
   * The statuses are the backend's own, from `app/errors.py`.
   */
  status: number | null;
}

const CALL = `call SCASPA on ${SCASPA_TEL_TEXT}`;

export const ERROR_COPY: Record<FailureKind, ErrorCopy> = {
  UPSTREAM_TIMEOUT: {
    title: 'That took too long',
    body: 'The assistant did not answer in time. It is worth trying again — the question was fine.',
    retryable: true,
    showContact: false,
    status: 504,
  },

  RATE_LIMITED: {
    // The *user* (or their venue's shared IP) has sent a lot of questions. In a
    // demo where several judges hit the same URL from the same venue IP, this is
    // the path that fires — so it has to read as deliberate, not broken.
    title: 'One moment',
    body: 'A lot of questions have come from this connection just now. The countdown on the Send button shows when you can ask again.',
    retryable: false,
    showContact: false,
    status: 429,
  },

  UPSTREAM_RATE_LIMITED: {
    title: 'Busy right now',
    // The server has already retried with backoff by the time this arrives, so
    // the honest advice is to wait rather than to hammer the button.
    body: 'A lot of people are asking questions at once. Give it a moment and try again.',
    retryable: true,
    showContact: false,
    status: 503,
  },

  INDEX_MISSING: {
    // The assistant genuinely cannot work. Contact route first, not buried.
    title: 'The assistant is not available',
    body: `Its information is being updated and it cannot answer questions until that finishes. Please ${CALL} — staff can help you straight away.`,
    retryable: false,
    showContact: true,
    status: 503,
  },

  RETRIEVAL_EMPTY: {
    // Routed to the no-answer treatment before it ever reaches this table. Kept
    // here so the record is complete and so a future code path that does reach
    // it has a sentence rather than a fallback.
    title: 'No information available',
    body: `I do not have verified SCASPA information to answer from at the moment. Please ${CALL}.`,
    retryable: false,
    showContact: true,
    status: 503,
  },

  VALIDATION_ERROR: {
    /*
     * Should be unreachable: the composer's counter disables send above the cap
     * and blocks an empty message. If a user ever sees this, the counter has a
     * bug — so the copy points at the input rather than at the service.
     *
     * §3.11 requires this one to name "the field and the actual limit it hit —
     * never a generic 'invalid input'", so it names the cap. "Please shorten it,
     * or rephrase it" said neither what was wrong nor by how much.
     */
    title: 'We could not use that',
    body: 'A question can be up to 1,000 characters. Shorten it and send again.',
    retryable: false,
    showContact: false,
    status: 422,
  },

  [BAD_REQUEST]: {
    title: 'We could not read that request',
    body: 'Something in the question was malformed. Retype it and send again.',
    retryable: false,
    showContact: false,
    status: 400,
  },

  INTERNAL: {
    title: 'Something went wrong',
    body: `That is our problem, not yours. Please try again, or ${CALL} if it keeps happening.`,
    retryable: true,
    showContact: true,
    status: 500,
  },

  NOT_FOUND: {
    /*
     * The 404 copy, and it used to be the 500 copy.
     *
     * "Something went wrong / that is our problem, not yours" is what §3.11
     * forbids by name: "Never a generic 'something went wrong' for a code that
     * knows better." A 404 knows better — the address is wrong, retrying it
     * will fail identically, and the useful next step is to check it or go
     * back. Byte-identical to `NotFound`'s own copy, because §2.8 ships one
     * 404 with one wording.
     */
    title: 'Page not found',
    body: 'We could not find that page. Check the address, or go back and ask the assistant.',
    retryable: false,
    showContact: false,
    status: 404,
  },

  [OFFLINE]: {
    title: 'You appear to be offline',
    body: 'Check your connection and try again. Nothing you typed has been lost.',
    retryable: true,
    showContact: false,
    status: null,
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
