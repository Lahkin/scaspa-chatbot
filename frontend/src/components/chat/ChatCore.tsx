import { useState } from 'react';
import { useChatSession } from '@/features/chat/useChatSession';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { SuggestedQuestions } from './SuggestedQuestions';

/**
 * The conversation.
 *
 * The layout contract from F003 is unchanged and still the important line:
 *
 * > **`ChatCore` fills its parent. The parent must be a fixed-height flex box.**
 *
 * The transcript scrolls (`flex-1 min-h-0`), the composer does not (`shrink-0`).
 * That is why both shells mount this unmodified — `100dvh` minus a header in one,
 * 600px minus a header in the other, and neither difference reaches here.
 */
export function ChatCore() {
  const { state, send, stop, dismissError } = useChatSession();
  const [draft, setDraft] = useState('');

  const idle = !state.busy && state.messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <MessageList
          messages={state.messages}
          emptyState={
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <h1 className="text-h2 font-semibold">Ask about ports and travel in St. Kitts</h1>
                <p className="text-small text-ink-muted">
                  Ferries, cruise arrivals at Port Zante, cargo at the Deep Water Harbour and Robert
                  L. Bradshaw International Airport. Every answer shows where it came from and when
                  it was checked.
                </p>
              </div>
              <SuggestedQuestions onSelect={setDraft} variant="empty" />
            </div>
          }
        />
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto max-w-measure space-y-2">
          {/*
            A conversation-level failure: the request never produced an answer.
            The message is the backend's own and is safe to display as-is — it
            already ends with the phone number.
          */}
          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-surface px-3 py-2 text-small text-danger"
            >
              <span className="flex-1">{state.error.message}</span>
              <button
                type="button"
                onClick={dismissError}
                aria-label="Dismiss"
                className="shrink-0 font-medium underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <Composer
            // `send` is async; the handler is a void slot. Explicitly discarding
            // the promise says the rejection is handled inside the hook (it is —
            // every failure becomes state) rather than dropped by accident.
            onSend={(text) => void send(text)}
            onStop={stop}
            busy={state.busy}
            draft={draft}
            onDraftChange={setDraft}
          />

          {/* Below the composer once there is something to follow up on. */}
          {idle && <SuggestedQuestions onSelect={setDraft} variant="idle" />}

          <p className="text-caption text-ink-subtle">
            Answers come from verified SCASPA information and show their source.
          </p>
        </div>
      </div>
    </div>
  );
}
