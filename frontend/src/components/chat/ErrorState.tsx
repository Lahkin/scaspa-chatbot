import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { SCASPA_PHONE_LINES, SCASPA_POSTAL_ADDRESS } from '@/features/chat/contact';
import { copyFor, logRequestId, type FailureKind } from '@/features/chat/errorCopy';

/**
 * A failure, told in human language.
 *
 * **Nothing technical reaches the screen.** No code, no `request_id`, no stack, no
 * model name. A traveller cannot act on `UPSTREAM_TIMEOUT`, and showing it makes a
 * working system look broken. The id is logged to the dev console and nowhere
 * else, which is what keeps a bug report actionable without putting our internals
 * in front of a passenger.
 *
 * Styling is calm rather than alarming. A red panel with a warning triangle
 * escalates a retryable timeout into something that feels like data loss.
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
  const countdown = useCountdown(kind === 'UPSTREAM_RATE_LIMITED' ? (retryAfterS ?? null) : null);

  useEffect(() => {
    logRequestId(`error:${kind}`, requestId);
  }, [kind, requestId]);

  const waiting = countdown !== null && countdown > 0;

  return (
    <div
      role="alert"
      className="rounded-md border border-border-strong bg-surface-muted p-4"
      data-error-kind={kind}
    >
      <p className="text-small font-semibold text-ink">{copy.title}</p>
      <p className="mt-1 text-small text-ink-muted">{copy.body}</p>

      {copy.showContact && (
        <div className="mt-3 rounded-sm bg-surface p-3">
          <p className="text-caption font-semibold text-ink">Reach SCASPA directly</p>
          <ul className="mt-1 flex flex-wrap gap-x-4">
            {SCASPA_PHONE_LINES.map((line) => (
              <li key={line.href}>
                <a
                  href={line.href}
                  className="inline-flex min-h-touch items-center text-small font-medium text-blue-700 underline tabular"
                >
                  {line.text}
                </a>
              </li>
            ))}
          </ul>
          <address className="mt-1 text-caption text-ink-subtle not-italic">
            {SCASPA_POSTAL_ADDRESS.join(', ')}
          </address>
        </div>
      )}

      {(copy.retryable || onDismiss) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {copy.retryable && onRetry && (
            <Button size="sm" onClick={onRetry} disabled={waiting}>
              {/* The countdown turns "try again later" into something a person can
                  actually wait out, instead of a guess followed by another failure. */}
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
