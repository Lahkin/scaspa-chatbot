import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useChatSessionContext } from '@/features/chat/ChatSessionContext';
import { setDraft } from '@/features/chat/draft';
import { takePendingQuestion } from '@/features/chat/pending';
import { useHealth } from '@/features/chat/queries';
import { Composer } from './Composer';
import { ErrorState } from './ErrorState';
import { MessageList } from './MessageList';
import { SuggestedQuestions } from './SuggestedQuestions';
import { ThinkingIndicator } from './ThinkingIndicator';

/**
 * The conversation.
 *
 * The layout contract from F003 is unchanged and still the important line:
 *
 * > **`ChatCore` fills its parent. The parent must be a fixed-height flex box.**
 *
 * The transcript scrolls (`flex-1 min-h-0`), the composer does not (`shrink-0`).
 * That is why both shells mount this unmodified.
 */
/**
 * Which shell is mounting this.
 *
 * The widget is a third layout, not a breakpoint — §2.3 — so it is a prop
 * rather than a media query. Three things shrink in it and nothing else moves:
 * the greeting, the sub-line and the chips. Everything a `full` shell renders
 * that says where a figure came from renders here too, without exception.
 */
export type ChatVariant = 'full' | 'widget';

export function ChatCore({ variant = 'full' }: { variant?: ChatVariant } = {}) {
  const widget = variant === 'widget';
  /*
   * Health is already fetched by the shells; React Query serves the same cached
   * entry rather than issuing a second request. Read here because the composer
   * is the thing that has to be blocked, and both shells mount this.
   */
  const health = useHealth();
  const { state, busy, offline, send, stop, dismissError, openSource, thinkingSince } =
    useChatSessionContext();

  /**
   * A question chosen on the landing page is sent on arrival.
   *
   * `takePendingQuestion` reads and clears, and the ref guards StrictMode's
   * double-invoked effect — without it the question would be asked twice in dev
   * and once in production, which is the worst kind of difference to debug.
   */
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const question = takePendingQuestion();
    if (question) void send(question);
  }, [send]);

  /*
   * Whether the last thing on screen was a refusal.
   *
   * Only the assistant's own turn can refuse, so the last message is the only
   * one worth asking. It drives the narrowed chip set and nothing else — a
   * refusal changes what is worth offering next, not what the composer does.
   */
  const last = state.messages.at(-1);
  const lastWasRefusal = last?.role === 'assistant' && last.refusal === true;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MessageList
          messages={state.messages}
          onOpenSource={openSource}
          // §3.14's "Records searched" — the size of the index, not the number
          // of rows retrieved. Health is already cached by both shells.
          recordsSearched={health?.index.kb_rows ?? null}
          emptyState={<EmptyState variant={variant} />}
        />
      </div>

      {/* The composer footer. `12px 16px` in the widget, where a 600px panel
          cannot spare the full shell's padding — §2.3. */}
      <div
        className={cn(
          'shrink-0 border-t border-border',
          widget ? 'px-4 py-3' : 'px-4 py-3 lg:px-7'
        )}
      >
        <div className={cn('space-y-2', !widget && 'mx-auto max-w-measure')}>
          {/* The wait before the first token. Shown here rather than in the
              transcript so it sits where the eye already is after pressing send,
              and does not push the conversation around as it appears. */}
          {thinkingSince !== null && <ThinkingIndicator startedAt={thinkingSince} />}

          {state.error && (
            <ErrorState
              // A new failure is a new component, so the countdown restarts.
              key={`${state.error.kind}:${state.error.retryAfterS ?? ''}:${state.error.question}`}
              kind={state.error.kind}
              requestId={state.error.requestId}
              retryAfterS={state.error.retryAfterS}
              // Retry resends the same question, so nobody has to retype it after
              // a timeout — which is exactly when retyping is most irritating.
              onRetry={() => {
                const question = state.error?.question;
                dismissError();
                if (!question) return;
                // The question is also back in the composer, so clear it here or
                // it would still be sitting there after a successful resend.
                setDraft('');
                void send(question);
              }}
              onDismiss={dismissError}
            />
          )}

          <Composer
            // `send` is async; the handler is a void slot. Explicitly discarding
            // the promise says the rejection is handled inside the hook — it is,
            // every failure becomes state — rather than dropped by accident.
            onSend={(text) => void send(text)}
            onStop={stop}
            busy={busy}
            cooldownS={state.cooldownS}
            offline={offline}
            /*
             * Read from health rather than from the last error, so the composer
             * says so BEFORE a question is typed and sent. Learning that the
             * index is missing by having your question rejected is learning it
             * one question too late.
             */
            indexUnavailable={health ? !health.index.ready : false}
          />

          {/*
            Beneath the composer, in two wrapping rows — §2.1.

            In the widget they are not here at all: the composer is pinned in a
            footer, so the chips sit in the body under the greeting instead —
            §2.3, and the board draws them exactly that way.

            `hidden` rather than a conditional at the call site: §3.4 makes the
            absence a rule of the component ("hidden means removed from the DOM,
            not disabled"), and a rule enforced by every caller is a rule one
            caller will eventually forget.

            Narrowed after a refusal, which is the only thing that changes the
            set: a refusal means the question was outside the published record,
            so offering the same eight again invites the same disappointment.
          */}
          {!widget && (
            <SuggestedQuestions
              onSelect={setDraft}
              variant={lastWasRefusal ? 'narrowed' : 'initial'}
              hidden={busy || state.cooldownS !== null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The first thing anyone sees.
 *
 * **No robot illustration and no "powered by AI" badge.** A visitor standing on a
 * pier does not care what the thing is built from; they care whether they will
 * make the last ferry. A badge spends the most valuable space on screen saying
 * something that helps nobody, and an illustration of a robot invites the reader
 * to treat the answers as a novelty.
 *
 * ## The second sentence is required
 *
 * > Ask one thing at a time. Every answer stands alone — this assistant does
 * > not carry anything over from your last question.
 *
 * History is recorded and never fed back into the prompt, so a follow-up will
 * not resolve pronouns. The copy has to set that expectation **before** the
 * user forms the wrong one; `08-blocked-and-forbidden.md` lists every UI that
 * would imply otherwise among the things that must not be built.
 */
function EmptyState({ variant }: { variant: ChatVariant }) {
  const widget = variant === 'widget';

  return (
    <div className="space-y-4">
      {/*
        30/38 in the shell, 20/28 in the widget — §2.3. The copy shortens with
        it, because "today" and the full second sentence wrap to four lines in a
        380px panel and the greeting stops being a greeting.

        Both forms keep the load-bearing clause: each answer stands alone. That
        is the expectation the product cannot afford a user to form wrongly.
      */}
      <h1
        className={cn(
          'font-semibold tracking-tight text-ink',
          widget ? 'text-h3' : 'text-h1 max-lg:text-h2'
        )}
      >
        {widget ? 'What do you need from the port?' : 'What do you need from the port today?'}
      </h1>
      <p className={cn('text-ink-muted', widget ? 'text-label font-normal' : 'text-body')}>
        {widget
          ? 'Ask one thing at a time. Each answer stands alone.'
          : 'Ask one thing at a time. Every answer stands alone — this assistant does not carry anything over from your last question.'}
      </p>

      {/* In the widget the chips live here, under the greeting, because the
          composer is pinned in a footer below. See the note at the call site. */}
      {widget && <SuggestedQuestions onSelect={setDraft} size="compact" />}
    </div>
  );
}
