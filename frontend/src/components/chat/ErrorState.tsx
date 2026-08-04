import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { copyFor, logRequestId, type FailureKind } from '@/features/chat/errorCopy';
import { EscalationBlock } from './EscalationBlock';
import { RateLimitCard } from './RateLimitCard';

/**
 * A failure, told in human language — §7.1's envelope.
 *
 * **Almost nothing technical reaches the screen.** No `request_id`, no stack, no
 * model name, no internal code name: a traveller cannot act on
 * `UPSTREAM_TIMEOUT`, and showing it makes a working system look broken. The id
 * is logged to the dev console and nowhere else.
 *
 * **The HTTP status is the exception**, and §7.1 and §3.11 both draw it — "code
 * at `600 12px/20px` tabular in the leading slot", `--caution` for 4xx and
 * `--critical-text` for 5xx. This component showed neither the code nor the
 * fills; it drew every failure in one neutral panel, so a 422 the reader could
 * fix and a 500 that is ours read as the same event.
 *
 * §6.16's transcription rows have drawn their codes since board 21, so the
 * product already had two treatments of one thing. It has one now.
 */
export function ErrorState({
  kind,
  requestId,
  retryAfterS,
  onRetry,
  onDismiss,
}: {
  kind: FailureKind;
  /** Logged in dev only. Never rendered. */
  requestId?: string | undefined;
  /** Seconds, from the `Retry-After` header. Drives the countdown. */
  retryAfterS?: number | null | undefined;
  onRetry?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
}) {
  const copy = copyFor(kind);
  /*
   * Both rate limits count down, and they used to be one.
   *
   * `RATE_LIMITED` (429) is THIS client being limited by us — the case board 05
   * draws a countdown card for, and the one where the number is both readable
   * and actionable. `UPSTREAM_RATE_LIMITED` (503) is the model provider
   * throttling the backend; the user can do nothing but wait, and the header is
   * still worth showing rather than guessing at.
   *
   * Only the 429 gets the card. The two take different copy — telling someone
   * to slow down when the fault is entirely ours is the specific mistake the
   * API contract calls out.
   */
  const countdown = useCountdown(
    kind === 'UPSTREAM_RATE_LIMITED' || kind === 'RATE_LIMITED' ? (retryAfterS ?? null) : null
  );

  useEffect(() => {
    logRequestId(`error:${kind}`, requestId);
  }, [kind, requestId]);

  const waiting = countdown !== null && countdown > 0;

  if (kind === 'RATE_LIMITED') {
    return <RateLimitCard remaining={countdown} total={retryAfterS ?? null} onSend={onRetry} />;
  }

  /*
   * §7.1's shell, and the fill says which half of the table this is.
   *
   * ```
   * padding: 12px 14px; border-radius: 12px; gap: 12px
   * code:  600 12/20 tabular, leading slot — --caution (4xx) / --critical-text (5xx)
   * body:  400 13/20 --text-2
   * fill:  --caution-fill (4xx) · --critical-fill (5xx)
   * ```
   *
   * A 4xx is something the reader can act on and a 5xx is ours; drawing both in
   * one neutral panel made them the same event. Offline has no status, so it
   * keeps the neutral ground rather than borrowing a colour it has not earned.
   */
  const status = copy.status;
  const ours = status !== null && status >= 500;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="alert"
        data-error-kind={kind}
        className={cn(
          'flex items-start gap-3 rounded-input border px-3.5 py-3',
          status === null
            ? 'border-border bg-surface-muted'
            : ours
              ? 'border-critical-notice-edge bg-critical-tint'
              : 'border-caution-notice-edge bg-caution-tint'
        )}
      >
        {status !== null ? (
          <span
            className={cn(
              'shrink-0 text-caption font-semibold tabular',
              ours ? 'text-critical-text' : 'text-caution'
            )}
          >
            {status}
          </span>
        ) : null}

        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-label font-medium text-ink">{copy.title}</p>
          <p className="text-label leading-5 text-ink-muted">{copy.body}</p>

          {(copy.retryable || onDismiss) && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {copy.retryable && onRetry && (
                <Button size="sm" onClick={onRetry} disabled={waiting}>
                  {/* The countdown turns "try again later" into something a
                      person can actually wait out, instead of a guess followed
                      by another failure. */}
                  {waiting ? `Try again in ${countdown}s` : 'Try again'}
                </Button>
              )}
              {onDismiss && (
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/*
       * §7.1: "**Every error is followed by the escalation block.**"
       *
       * This used to re-type the three phone lines and the postal address into
       * a panel of its own — the exact drift `EscalationBlock` exists to stop,
       * and its own docstring says so: "one component used by every refusal and
       * every error, rather than the same three lines re-typed in five places".
       * Two treatments of one thing is what this board is for.
       */}
      {copy.showContact ? <EscalationBlock /> : null}
    </div>
  );
}

/**
 * Counts `seconds` down to zero. Null when there is nothing to count.
 *
 * Counts *elapsed ticks* rather than comparing against a deadline: a deadline
 * needs `Date.now()` during render, which is impure and flagged as such, and
 * re-seeding a decrementing counter from an effect is a setState inside an effect
 * — one cascading render per tick. Ticking a number that starts at zero has
 * neither problem.
 *
 * It does not reset if `seconds` changes mid-display; `ErrorState` is keyed on the
 * failure in `ChatCore`, so a new failure is a new component.
 */
function useCountdown(seconds: number | null): number | null {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (seconds === null || seconds <= 0) return undefined;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  if (seconds === null) return null;
  return Math.max(0, seconds - elapsed);
}
