/**
 * A question chosen on the landing page, waiting for the chat route to open.
 *
 * In memory only — CLAUDE.md rule 5 permits nothing but `conversation_id` in
 * browser storage, and a question is message content.
 *
 * It exists because the landing chips promise "drop straight into a conversation
 * with that question already sent": the navigation and the send are two different
 * moments, and the question has to survive the gap without going through a URL
 * (which would put it in history, in the address bar, and in any screenshot).
 */
let pending: string | null = null;

export function setPendingQuestion(question: string): void {
  pending = question;
}

/** Reads and clears, so a question is never sent twice. */
export function takePendingQuestion(): string | null {
  const question = pending;
  pending = null;
  return question;
}

export function resetPendingQuestion(): void {
  pending = null;
}
