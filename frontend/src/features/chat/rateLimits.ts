/**
 * The three rate limits, and the three different things to say about them —
 * spec board 22, "Three rate limits, three copies".
 *
 * ## Each names the action it blocks
 *
 * "Send again in 0:42" / "Record again in 0:26" / "Refresh in 0:18". A shared
 * "try again in n seconds" would be shorter and would leave a user guessing
 * which of the three things they just did is the one that is blocked — on a
 * screen where they may have done all three.
 *
 * ## And there is no quota meter anywhere
 *
 * "The ring is drawn from Retry-After — there is no remaining-quota figure
 * anywhere, because the backend computes it and drops it." The out-of-scope
 * board says it again: "No 'questions remaining this minute'. The 429 countdown
 * is the only rate signal that exists."
 *
 * So this module deliberately exposes no `remaining` and no `limit` for display.
 * The per-minute figures below are the published budgets and appear only in the
 * sentence that explains the wait — never as a live counter, which would be the
 * client inventing a number the API does not send.
 */

export type RateLimitScope = 'chat' | 'voice' | 'ops';

interface RateLimitCopy {
  /** The published budget, from the API contract's "Rate limits by scope". */
  perMinute: number;
  /** What is blocked, as a sentence fragment: "15 questions a minute is the limit". */
  budget: string;
  /** The action, imperative: "Send again in 0:42". */
  action: (clock: string) => string;
}

export const RATE_LIMITS: Record<RateLimitScope, RateLimitCopy> = {
  chat: {
    perMinute: 15,
    budget: '15 questions a minute is the limit',
    action: (clock) => `Send again in ${clock}`,
  },
  voice: {
    // A third of the chat budget: billed per second and per character.
    perMinute: 5,
    budget: 'Five recordings a minute is the limit',
    action: (clock) => `Record again in ${clock}`,
  },
  ops: {
    // Four times it: no model, no embedding. Browsing an arrivals board is
    // naturally several requests, and they must not come out of the chat budget.
    perMinute: 60,
    budget: 'Sixty a minute is the limit on operations data',
    action: (clock) => `Refresh in ${clock}`,
  },
};

/** `0:42`. Minutes appear only once there are minutes. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** The full sentence a rate-limited surface shows. */
export function rateLimitMessage(scope: RateLimitScope, secondsRemaining: number): string {
  const copy = RATE_LIMITS[scope];
  return `${copy.budget}. ${copy.action(formatCountdown(secondsRemaining))}.`;
}
