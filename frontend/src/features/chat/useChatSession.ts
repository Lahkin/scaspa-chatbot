import { useCallback, useRef, useState } from 'react';
import { ApiFailure } from '@/lib/api';
import { StreamTimeout, streamChat } from '@/lib/stream';
import type { ApiError } from '@/lib/types';
import { OFFLINE, isNoAnswerCode, type FailureKind } from './errorCopy';
import { setDraft } from './draft';
import {
  initialChatState,
  type ChatFailure,
  type ChatState,
  type Message,
  type ToolActivity,
} from './types';

/**
 * Drives one conversation.
 *
 * State lives here and only here. Nothing is written to localStorage,
 * sessionStorage or IndexedDB — CLAUDE.md rule 5. Losing the tab loses the
 * conversation, which is the documented and intended behaviour: there is no
 * account, and a transcript that survives on a shared cruise-terminal tablet is
 * a privacy problem, not a feature.
 */

const CLIENT_FAILURE: ApiError = {
  code: 'INTERNAL',
  message:
    'Something went wrong at our end. Please try again, or call SCASPA on ' +
    '869-465-8121 / 2 / 3.',
  request_id: 'client-side',
};

let counter = 0;
/**
 * Ids for React keys only.
 *
 * `crypto.randomUUID` needs a secure context, and on plain HTTP over a LAN
 * address — the usual way this gets demonstrated on a phone — it is undefined.
 * A counter is sufficient: these never leave the tab and identify nothing.
 */
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function useChatSession() {
  const [state, setState] = useState<ChatState>(initialChatState);
  const abort = useRef<AbortController | null>(null);

  /** Update the assistant message currently being streamed. */
  const patchLast = useCallback((patch: (message: Message) => Message) => {
    setState((current) => {
      const messages = [...current.messages];
      const index = messages.length - 1;
      const last = messages[index];
      if (!last || last.role !== 'assistant') return current;
      messages[index] = patch(last);
      return { ...current, messages };
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question) return;

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      const userMessage: Message = {
        id: nextId('user'),
        role: 'user',
        text: question,
        at: new Date(),
      };
      const assistantMessage: Message = {
        id: nextId('assistant'),
        role: 'assistant',
        text: '',
        at: new Date(),
        streaming: true,
        activity: [],
        citations: [],
        chart: null,
        error: null,
      };

      let conversationId: string | null = null;
      setState((current) => {
        conversationId = current.conversationId;
        return {
          ...current,
          messages: [...current.messages, userMessage, assistantMessage],
          busy: true,
          error: null,
        };
      });

      try {
        const stream = streamChat({
          message: question,
          conversationId,
          signal: controller.signal,
        });

        for await (const event of stream) {
          switch (event.event) {
            case 'meta':
              setState((current) => ({
                ...current,
                conversationId: event.data.conversation_id,
              }));
              break;

            case 'tool_start':
              patchLast((message) => {
                const activity = message.activity ?? [];
                const step: ToolActivity = {
                  // name + order, which is how the contract says to match the pair.
                  id: `${event.data.name}-${activity.length}`,
                  name: event.data.name,
                  summary: event.data.summary,
                  ms: null,
                  done: false,
                };
                return { ...message, activity: [...activity, step] };
              });
              break;

            case 'tool_end':
              patchLast((message) => {
                const activity = [...(message.activity ?? [])];
                // The last still-running step with this name — order plus name.
                for (let i = activity.length - 1; i >= 0; i -= 1) {
                  const step = activity[i];
                  if (step && step.name === event.data.name && !step.done) {
                    activity[i] = { ...step, ms: event.data.ms, done: true };
                    break;
                  }
                }
                return { ...message, activity };
              });
              break;

            case 'token':
              patchLast((message) => ({ ...message, text: message.text + event.data.text }));
              break;

            case 'replace':
              // The tool-call cap was hit: everything streamed so far was an
              // internal message, not an answer. Discard it entirely.
              patchLast((message) => ({ ...message, text: event.data.text }));
              break;

            case 'citations':
              patchLast((message) => ({ ...message, citations: event.data.citations }));
              break;

            case 'chart':
              patchLast((message) => ({ ...message, chart: event.data }));
              break;

            case 'done':
              patchLast((message) => ({
                ...message,
                streaming: false,
                grounded: event.data.grounded,
                refusal: event.data.refusal,
              }));
              break;

            case 'error':
              // HTTP is already 200. Keep whatever text arrived — it was real,
              // and discarding it wastes the wait.
              patchLast((message) => ({
                ...message,
                streaming: false,
                error: event.data,
              }));
              break;
          }
        }
      } catch (thrown) {
        // `streamChat` converts an HTTP failure into an ApiFailure itself, so
        // everything reaching here is already typed.
        const failure = thrown instanceof ApiFailure ? thrown : null;

        const kind: FailureKind = failure?.offline
          ? OFFLINE
          : // `navigator.onLine === false` is conclusive; true proves nothing (a
            // captive portal answers DNS and drops the rest), which is why the
            // rejected-fetch signal above is the primary one.
            !navigator.onLine
            ? OFFLINE
            : (failure?.error.code ??
              (thrown instanceof StreamTimeout ? 'UPSTREAM_TIMEOUT' : 'INTERNAL'));

        const chatFailure: ChatFailure = {
          kind,
          requestId: failure?.error.request_id,
          retryAfterS: failure?.retryAfterS ?? null,
          question,
        };

        // Put the question back in the composer.
        //
        // The offline copy promises "nothing you typed has been lost", and until
        // this line that was only true in the sense that Retry could resend it —
        // the user saw an empty box, which reads as exactly the loss the sentence
        // denies. Restoring it also lets them edit before retrying, which is what
        // someone does after a timeout on a long question.
        setDraft(question);

        setState((current) => {
          const messages = [...current.messages];
          const index = messages.length - 1;
          const last = messages[index];

          // RETRIEVAL_EMPTY is routed to the calm no-answer treatment rather than
          // an error: from the user's side it is indistinguishable from the
          // assistant not knowing, and an error framing implies they hit a bug.
          if (failure && isNoAnswerCode(failure.error.code) && last?.role === 'assistant') {
            messages[index] = {
              ...last,
              streaming: false,
              refusal: true,
              text: failure.error.message,
            };
            return { ...current, messages, busy: false, error: null };
          }

          // A failure before any token means there is no answer to keep. Drop the
          // empty bubble rather than leaving a blank one on screen.
          if (last && last.role === 'assistant' && last.text.length === 0) {
            messages.splice(index, 1);
            return { ...current, messages, busy: false, error: chatFailure };
          }
          if (last && last.role === 'assistant') {
            messages[index] = {
              ...last,
              streaming: false,
              error: failure?.error ?? CLIENT_FAILURE,
            };
          }
          return { ...current, messages, busy: false, error: null };
        });
        return;
      } finally {
        patchLast((message) => (message.streaming ? { ...message, streaming: false } : message));
        setState((current) => ({ ...current, busy: false }));
      }
    },
    [patchLast]
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    patchLast((message) => ({ ...message, streaming: false }));
    setState((current) => ({ ...current, busy: false }));
  }, [patchLast]);

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return { state, send, stop, dismissError };
}
