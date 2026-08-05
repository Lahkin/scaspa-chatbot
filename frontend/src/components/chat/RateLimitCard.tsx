import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * The 429 card — spec board 05, "Rate limited — HTTP 429".
 *
 * ## The countdown is the whole component
 *
 * "Seconds from Retry-After, ticking down, and a disabled send that enables at
 * zero. No questions-remaining counter, no quota meter: the backend exposes
 * nothing else." Board 22 says the same from the other direction — the ring is
 * drawn from `Retry-After` and there is no remaining-quota figure anywhere.
 *
 * So this shows one number, and it is a real one.
 *
 * ## It ships because the header is readable
 *
 * The spec marked this **blocked**: "needs Retry-After exposed to the client.
 * The header is sent but not listed in Access-Control-Expose-Headers, so the
 * browser cannot read it. Without the number the card can only say 'try again
 * shortly', which is the one thing a countdown exists to avoid."
 *
 * `app/main.py` lists it in `EXPOSED_HEADERS`. The block was already lifted; the
 * client had a stale comment saying otherwise. See docs/decisions.md 0031.
 *
 * ## And the question stays in the box
 *
 * Nothing here clears the composer. A rate limit is a wait, not a rejection,
 * and retyping a question you already typed is the most annoying possible way
 * to be told to wait.
 */
export function RateLimitCard({
  /** Seconds remaining, ticked by the caller. Null when the header was unreadable. */
  remaining,
  /** The total the countdown started from, for the ring's sweep. */
  total,
  onSend,
}: {
  remaining: number | null;
  total: number | null;
  onSend?: (() => void) | undefined;
}) {
  const waiting = remaining !== null && remaining > 0;

  /*
   * The ring's sweep, as a fraction of the original wait.
   *
   * Falls back to a full ring when the total is unknown, rather than to an
   * empty one: an empty ring next to a live number reads as "nearly done" at
   * the exact moment the wait begins.
   */
  const swept = total && total > 0 && remaining !== null ? 1 - remaining / total : 1;

  return (
    <section
      // `alert`: it interrupts an action the user just attempted, and they need
      // to know the question did not go.
      role="alert"
      data-error-kind="RATE_LIMITED"
      className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-section font-semibold text-ink">Too many questions in a short time</h3>
        <p className="text-body text-ink-muted">
          The assistant has paused this session. Your question is still in the box — send it again
          when the countdown ends.
        </p>
      </div>

      {waiting ? (
        <div className="flex items-center gap-3.5 rounded-input border border-border bg-surface-muted p-3.5">
          {/*
           * The conic ring. `aria-hidden` because the figure beside it says the
           * same thing in words, and a ring announced as an image would be read
           * as "graphic" and nothing else.
           */}
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-brand-400) 0deg ${swept * 360}deg, var(--color-border) ${swept * 360}deg 360deg)`,
            }}
          >
            <span className="flex size-7.5 items-center justify-center rounded-full bg-surface-muted text-brand-200">
              <Icon name="clock" size={14} />
            </span>
          </span>

          <div className="flex flex-col gap-0.5">
            {/*
             * `aria-live="off"`: the seconds change every second, and a polite
             * region that re-announces a number sixty times is unusable. The
             * card announced itself once when it arrived, which is the useful
             * moment; the button's own label carries the state after that.
             */}
            <span aria-live="off" className="text-h3 font-semibold text-ink tabular">
              {formatClock(remaining)}
            </span>
            <span className="text-caption font-medium text-ink-muted">until you can ask again</span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={waiting}
        onClick={onSend}
        /*
         * The disabled look is a `disabled:` variant, not a ternary.
         *
         * It has to be, for two reasons. The DOM `disabled` attribute is what
         * actually blocks the click, so styling driven by a separate boolean
         * can drift out of step with it. And `bg-surface-muted` under
         * `text-ink-subtle` is 3.44:1 — legitimate for an inactive control,
         * which WCAG 1.4.3 exempts, and a real failure anywhere else. Writing
         * it as a variant is what tells the contrast scan which of the two this
         * is, rather than having the scan carry an allowlist it cannot check.
         */
        className={cn(
          'inline-flex min-h-touch items-center justify-center rounded-button px-4',
          'text-body font-medium',
          'transition-colors duration-fast ease-out-soft',
          'bg-brand-500 text-ink-inverse hover:bg-brand-600 active:bg-brand-700',
          'disabled:cursor-not-allowed disabled:border disabled:border-border',
          'disabled:bg-surface-muted disabled:text-ink-disabled'
        )}
      >
        Send again
      </button>
    </section>
  );
}

/** `0:42`. Minutes only appear once there are minutes — `0:05`, not `5s`. */
function formatClock(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
