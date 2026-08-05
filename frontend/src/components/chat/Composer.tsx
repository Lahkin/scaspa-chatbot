import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Icon, Textarea } from '@/components/ui';
import { SCASPA_PHONE_HREF } from '@/components/shells/ScaspaMark';
import { SCASPA_PHONE_LINES } from '@/features/chat/contact';
import { formatCountdown, rateLimitMessage } from '@/features/chat/rateLimits';
import { VoiceButton } from './VoiceButton';
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
  /**
   * The knowledge index is missing or empty — health reports `ready: false`,
   * or a question came back `INDEX_MISSING` / `RETRIEVAL_EMPTY`.
   *
   * Blocks sending, because there is nothing to search. The operations screens
   * are unaffected and the message says so.
   */
  indexUnavailable?: boolean | undefined;
}

/** The contract rejects anything longer, so the cap is enforced before the round trip. */
export const MAX_LENGTH = 1000;
/*
 * The counter appears with the first character.
 *
 * It used to be hidden below 900, on the reasoning that a count of 12 is noise.
 * §3.2 draws `42/1000` in state 2 — the ordinary typing state — and the board
 * is right for a reason the old threshold missed: a counter that appears at 900
 * arrives as a warning, and the user has no idea a cap exists until they are
 * ninety percent of the way into it.
 */
export const COUNTER_VISIBLE_FROM = 1;

/**
 * The composer.
 *
 * ### The counter makes a 422 unreachable
 *
 * The backend rejects a message over 1000 characters. A user who hits that is told
 * *after* typing a long question and pressing send — the worst possible moment. So
 * the count is on screen from the first character, turns caution at the cap and
 * critical above it, and send is blocked above it. The `VALIDATION_ERROR` copy
 * exists, but if a human ever sees it the counter has a bug.
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
  indexUnavailable = false,
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
  /* State 3 — at the limit and STILL SENDABLE. Only `overCap` blocks. */
  const atCap = draft.length === MAX_LENGTH;
  const empty = trimmed.length === 0;
  const rateLimited = cooldownS !== null && cooldownS > 0;
  const canSend = !busy && !empty && !overCap && !rateLimited && !offline && !indexUnavailable;

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
      {/*
        State 8 — the search index is unavailable, spec board 13.

        The distinction that matters: the ASSISTANT cannot answer, but the
        operations screens are a different path entirely — no model, no
        embeddings, no index — so vessels, flights and tariffs still work. A
        message that just said "the service is down" would send someone away
        from three screens that would have answered them.

        Rendered above the field rather than below it, so it is read before the
        user types a question that cannot be sent.
      */}
      {indexUnavailable ? (
        <div
          role="status"
          className="mb-2 flex items-start gap-2.5 rounded-button bg-critical-tint px-3 py-2.5"
        >
          <Icon name="alert" size={14} className="mt-0.5 text-critical-text" />
          <p className="text-label text-ink-muted">
            The assistant cannot search its records at the moment, so it cannot answer. Vessels,
            flights and tariffs still work — or telephone{' '}
            <a href={SCASPA_PHONE_HREF} className="font-medium text-brand-200 underline tabular">
              {SCASPA_PHONE_LINES[0]?.text ?? '869 465 8121'}
            </a>
            .
          </p>
        </div>
      ) : null}

      {/*
        State 7 — rate limited, spec board 13.

        The sentence names the published budget AND the action it blocks:
        "15 questions a minute is the limit. Send again in 0:42." Board 22 keeps
        three of these, one per scope, because a shared "try again shortly"
        leaves a user guessing which of the things they just did is blocked.

        The question stays in the box throughout. A rate limit is a wait, not a
        rejection, and retyping a question you already typed is the most
        annoying possible way to be told to wait.
      */}
      {rateLimited ? (
        <div
          role="status"
          className="mb-2 flex items-center gap-2.5 rounded-button bg-caution-tint px-3 py-2"
        >
          <Icon name="clock" size={14} className="text-caution" />
          <p className="text-caption font-medium text-caution tabular">
            {rateLimitMessage('chat', cooldownS ?? 0)}
          </p>
        </div>
      ) : null}

      {/*
        ── ONE BOX, NOT A FIELD AND A BUTTON ──────────────────────────────────
        §3.2 draws the composer as a single container — `--surface-3`,
        `1px solid --border`, `border-radius: 12px`, `padding: 16px 16px 12px`,
        `gap: 16px` — holding the field and the control row. It used to be a
        bordered textarea with a send button floating beside it, which is a
        different component: the send control read as belonging to the page
        rather than to the question.

        The edge carries the state, and that is the whole of states 2–4:
        brand-500 while typing, caution at the limit, critical over it.
      */}
      <div
        className={cn(
          'flex flex-col gap-4 rounded-input border bg-surface-3 px-4 pt-4 pb-3',
          'transition-colors duration-fast ease-out-soft',
          overCap
            ? 'border-critical'
            : atCap
              ? 'border-caution'
              : trimmed.length > 0 && !busy
                ? 'border-brand-500'
                : 'border-border'
        )}
      >
        <div className="min-w-0 flex-1">
          <Textarea
            ref={inputRef}
            bare
            label="Your question"
            labelHidden
            /*
             * State 1 and state 6 share this slot. While a stream is open the
             * field reads "Answering…" rather than the ordinary invitation —
             * §3.2 — so a disabled empty box is never mistaken for a broken one.
             */
            placeholder={
              busy ? 'Answering…' : 'Ask about a vessel, a flight, a tariff or a department…'
            }
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

        {/*
          The transcript goes into the draft and focus follows it — it is NEVER
          sent. "Nevis" versus "never" is exactly the mishearing that happens on
          stage, and a confident answer to the wrong question is both a bad
          experience and a bad demo moment. Renders nothing when voice cannot
          work, so there is no layout hole.
        */}
        {/* ── The control row ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {/*
            The attach button. Bordered, 32px, and disabled while a stream is
            open — §3.2 state 6. It is drawn because the board draws it; nothing
            is wired behind it yet, so it is inert rather than pretending.
          */}
          <button
            type="button"
            disabled
            aria-label="Attach a file — not yet available"
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-button',
              // The variant prefix, not a bare class: this control is inert and
              // WCAG 1.4.3 exempts inactive controls, but the guard in
              // tests/contrast.test.ts recognises that only by the prefix.
              'border border-border',
              'disabled:cursor-not-allowed disabled:text-ink-disabled'
            )}
          >
            <Icon name="attach" size={16} />
          </button>

          <span className="flex-1" />

          {/*
            The helper, left of the counter and only when it has something to
            say. §3.2 gives states 3 and 4 a helper each, in the control row.
          */}
          {overCap ? (
            <p className="text-caption font-medium text-critical-text">
              Remove {draft.length - MAX_LENGTH}{' '}
              {draft.length - MAX_LENGTH === 1 ? 'character' : 'characters'} to send
            </p>
          ) : atCap ? (
            <p className="text-caption font-medium text-caution">
              {MAX_LENGTH} characters is the maximum
            </p>
          ) : offline ? (
            <p className="text-caption text-ink-muted">
              You are offline. Keep typing — your question is safe.
            </p>
          ) : null}

          {showCounter && (
            <p
              id="composer-counter"
              // Polite, not assertive: it must not interrupt a screen reader on
              // every keystroke, but the user has to be told before they send.
              aria-live="polite"
              className={cn(
                'shrink-0 text-caption font-medium tabular',
                overCap ? 'text-critical-text' : atCap ? 'text-caution' : 'text-ink-muted'
              )}
            >
              {draft.length}/{MAX_LENGTH}
            </p>
          )}

          {/*
            The transcript goes into the draft and focus follows it — it is
            NEVER sent. "Nevis" versus "never" is exactly the mishearing that
            happens on stage. Renders nothing when voice cannot work, so there
            is no layout hole.
          */}
          {!busy && <VoiceButton onTranscript={(text) => setDraft(text)} />}

          {busy ? (
            /*
              State 6. A 32px pill with an 8px square, not a filled danger
              button: stopping is free — closing the connection cancels
              generation server-side and nothing further is charged — so it must
              not look like a destructive action.
            */
            <button
              type="button"
              onClick={onStop}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-2 rounded-pill border border-border px-3',
                'text-label font-medium text-ink hover:bg-border'
              )}
            >
              <span aria-hidden="true" className="size-2 bg-ink-muted" />
              Stop
            </button>
          ) : (
            /*
              ── SEND IS BLOCKED, NEVER HIDDEN ──────────────────────────────
              §3.2, and it is the first line of the board: "A missing button
              gives the user nothing to reason about." So the control is always
              a 34px circle in the same place, and only its fill changes.

              Under a rate limit it shows the remaining seconds instead of the
              arrow — the countdown lives on the button because that is what the
              user is reaching for.
            */
            <button
              type="submit"
              disabled={!canSend}
              aria-label={rateLimited ? `Send — wait ${formatCountdown(cooldownS ?? 0)}` : 'Send'}
              className={cn(
                'inline-flex size-[34px] shrink-0 items-center justify-center rounded-pill',
                'transition-colors duration-fast ease-out-soft',
                canSend
                  ? 'bg-brand-500 text-ink-inverse hover:bg-brand-600 active:bg-brand-700'
                  : // Inert, and blocked rather than hidden — see the note above.
                    'cursor-not-allowed border border-border bg-surface-3 disabled:text-ink-disabled'
              )}
            >
              {rateLimited ? (
                <span className="text-caption font-semibold tabular">{cooldownS}</span>
              ) : (
                <Icon name="arrow-up" size={16} />
              )}
            </button>
          )}
        </div>
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
