import { useEffect, useRef } from 'react';
import { useChatSessionContext } from '@/features/chat/ChatSessionContext';
import { setDraft } from '@/features/chat/draft';
import { takePendingQuestion } from '@/features/chat/pending';
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
export function ChatCore() {
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

  const idle = !busy && state.messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MessageList
          messages={state.messages}
          onOpenSource={openSource}
          emptyState={<EmptyState />}
        />
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto max-w-measure space-y-2">
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
          />

          {/* Below the composer once there is something to follow up on. */}
          {idle && <SuggestedQuestions onSelect={setDraft} variant="idle" />}
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
 * What is here instead: what it covers, four questions to tap, and one honest
 * sentence about where answers come from.
 */
function EmptyState() {
  return (
    <div className="space-y-6 py-4">
      <div className="space-y-3">
        <h1 className="text-h2 font-semibold">Ask about ports and travel in St. Kitts</h1>
        <p className="text-small text-ink-muted">
          Ferry and cruise schedules, cargo and import procedures, published seaport tariffs, and
          airport information.
        </p>
        {/* The honest sentence. Not a disclaimer — a description of the method,
            which is the reason to trust it. */}
        <p className="text-small text-ink-muted">
          It answers from verified SCASPA information and shows you where every answer came from.
        </p>
      </div>

      <SuggestedQuestions onSelect={setDraft} variant="empty" />
    </div>
  );
}
