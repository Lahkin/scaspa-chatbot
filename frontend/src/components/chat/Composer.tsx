import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Button, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  getDraft,
  getDraftServerSnapshot,
  setDraft,
  subscribeToDraft,
} from '@/features/chat/draft';

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  /** Seconds until another question may be sent, from `Retry-After`. */
  cooldownS?: number | null | undefined;
  /** The browser reports no connection. */
  offline?: boolean | undefined;
}

/** The contract rejects anything longer, so the cap is enforced before the round trip. */
export const MAX_LENGTH = 1000;
/** Below this the counter is noise; above it, it is information. */
export const COUNTER_VISIBLE_FROM = 900;

/**
 * The composer.
 *
 * ### The counter makes a 422 unreachable
 *
 * The backend rejects a message over 1000 characters. A user who hits that is told
 * *after* typing a long question and pressing send — the worst possible moment. So
 * the count appears at 900, turns red at the cap, and send is disabled above it.
 * The `VALIDATION_ERROR` copy exists, but if a human ever sees it the counter has
 * a bug.
 *
 * `maxLength` is deliberately **not** set on the textarea: a hard truncate silently
 * eats characters as they are typed, which is more confusing than a visible count
 * and a disabled button.
 *
 * ### Enter behaves differently on a touch device, and that is not a detail
 *
 * With a physical keyboard, Enter sends and Shift+Enter makes a newline — the usual
 * chat idiom. On a phone that is infuriating: the on-screen return key is where you
 * reach for a new line, there is no Shift, and every attempt at a second sentence
 * fires off a half-finished question. So on a touch device Enter inserts a newline
 * and the send button is the only way to send.
 *
 * Detected by pointer capability, not width: a narrow desktop window still has a
 * real keyboard, and treating it as a phone would break Enter-to-send for someone
 * who just resized their browser.
 */
export function Composer({
  onSend,
  onStop,
  busy,
  cooldownS = null,
  offline = false,
}: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draft = useSyncExternalStore(subscribeToDraft, getDraft, getDraftServerSnapshot);
  const coarsePointer = useCoarsePointer();

  // A chip fills the box, then focus lands at the end of it — so the next action is
  // pressing send or editing "40-foot" into "20-foot", with no hunt for the caret.
  useEffect(() => {
    if (!draft) return;
    const element = inputRef.current;
    if (!element || document.activeElement === element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [draft]);

  const trimmed = draft.trim();
  const overCap = draft.length > MAX_LENGTH;
  const empty = trimmed.length === 0;
  const rateLimited = cooldownS !== null && cooldownS > 0;
  const canSend = !busy && !empty && !overCap && !rateLimited && !offline;

  const submit = () => {
    if (!canSend) return;
    // Trimmed on the way out: trailing whitespace is not part of the question, and
    // the backend rejects a whitespace-only message anyway.
    onSend(trimmed);
    setDraft('');
  };

  const showCounter = draft.length >= COUNTER_VISIBLE_FROM;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-1"
    >
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Textarea
            ref={inputRef}
            label="Your question"
            labelHidden
            placeholder="Ask about ferries, cruise, cargo or the airport"
            value={draft}
            maxRows={6}
            /*
             * Disabled only while a request is in flight.
             *
             * NOT disabled when offline or rate-limited: someone who is typing a
             * question on a dead connection should be able to finish the
             * sentence, and losing a half-written question to a dropped signal is
             * the most annoying possible outcome. Only *sending* is blocked.
             */
            disabled={busy}
            aria-describedby={showCounter ? 'composer-counter' : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Touch device: Enter is always a newline.
              if (coarsePointer) return;
              // An IME Enter confirms a candidate. Sending there cuts a word in
              // half for anyone typing a non-Latin script.
              if (event.nativeEvent.isComposing) return;
              if (event.shiftKey) return;
              event.preventDefault();
              submit();
            }}
          />
        </div>

        {busy ? (
          // Stopping is free: closing the connection cancels generation
          // server-side and nothing further is charged.
          <Button type="button" variant="secondary" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!canSend}>
            {/*
              The countdown lives on the button because that is what the user is
              reaching for. A number beside a dismissed error, with an enabled
              Send next to it, is an invitation to make the rate limit worse.
            */}
            {rateLimited ? `Wait ${cooldownS}s` : 'Send'}
          </Button>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-caption text-ink-subtle">
          {offline
            ? 'You are offline. Keep typing — your question is safe and will send when you are back.'
            : rateLimited
              ? 'The assistant is busy right now. You can keep typing.'
              : coarsePointer
                ? 'Tap Send when you are ready.'
                : 'Enter to send, Shift + Enter for a new line.'}
        </p>

        {showCounter && (
          <p
            id="composer-counter"
            // Polite, not assertive: it must not interrupt a screen reader on every
            // keystroke, but the user has to be told before they press send.
            aria-live="polite"
            className={cn(
              'shrink-0 text-caption tabular',
              overCap ? 'font-semibold text-danger' : 'text-ink-muted'
            )}
          >
            {draft.length} / {MAX_LENGTH}
            {overCap && <span className="ml-1">— too long to send</span>}
          </p>
        )}
      </div>
    </form>
  );
}

/** True on a device whose primary input cannot hover — a phone or tablet. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const media = window.matchMedia('(pointer: coarse)');
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () =>
      typeof window !== 'undefined' && !!window.matchMedia
        ? window.matchMedia('(pointer: coarse)').matches
        : false,
    () => false
  );
}
