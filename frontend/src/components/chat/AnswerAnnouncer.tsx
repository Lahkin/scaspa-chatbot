import type { Message } from '@/features/chat/types';

/**
 * Announces a finished answer to a screen reader. Once.
 *
 * ### The bug this exists to avoid
 *
 * The obvious implementation is to wrap the transcript in `aria-live="polite"`.
 * It is also the standard bug: a live region announces its **entire** contents
 * every time they change, and a streamed answer changes forty times a second. A
 * screen-reader user hears the answer restart from the beginning on every token
 * and never reaches the end of a sentence. It is worse than no announcement at
 * all, and it looks correct in every visual test.
 *
 * So the live region is **separate from the transcript** and receives the text
 * exactly once, when `streaming` goes false. During generation it stays empty —
 * `AgentStatus` and `ThinkingIndicator` already announce "searching" and
 * "processing", which is the right amount of noise while waiting.
 *
 * `polite` rather than `assertive`: an answer the user asked for is not an
 * interruption, and `assertive` would cut off whatever they were reading.
 */
export function AnswerAnnouncer({ messages }: { messages: Message[] }) {
  /*
   * Derived, not stored.
   *
   * The newest assistant message that has **finished**. While one is streaming
   * this resolves to the previous completed answer, whose text does not change —
   * so the region's contents are stable throughout generation and the announcement
   * fires exactly once, when the new message stops streaming.
   *
   * Deriving also means no `setState` in an effect, which would cost a cascading
   * render on every token for a value that must not change on every token.
   */
  const announcement =
    [...messages].reverse().find((message) => message.role === 'assistant' && !message.streaming)
      ?.text ?? '';

  return (
    <div
      // `atomic` so the whole answer is read rather than only the changed part,
      // which is what a diff-based reading of a replaced string would give.
      aria-live="polite"
      aria-atomic="true"
      role="status"
      className="sr-only"
      data-testid="answer-announcer"
    >
      {announcement}
    </div>
  );
}
