import { Icon } from '@/components/ui/Icon';

/**
 * "Some figures were replaced" — spec board 05, the grounding correction.
 *
 * ## What actually happened, and why it has to be said
 *
 * The model drafted an answer containing a money or time value that could not
 * be matched to any retrieved knowledge-base row. Rather than publish it, the
 * backend threw the draft away and rebuilt the answer from published figures
 * (`app/rag/answer.py`, the numeric grounding gate).
 *
 * So the user is reading something different from what was first written. That
 * is a good outcome — it is the guard working — but it is invisible, and an
 * answer that was silently rewritten looks exactly like one that was right the
 * first time.
 *
 * ## Why it took a backend change to ship
 *
 * The spec marked this component **blocked**: "The client has no reliable flag
 * for a corrected answer, so it cannot tell a replaced figure from an original
 * one. Showing the note on every answer would be a lie; showing it on none
 * hides the correction."
 *
 * `answer_replaced` was being computed on every turn and dropped at the wire
 * boundary. It is now on `ChatResponse` and on the stream's `done` event, so
 * this renders on exactly the answers it happened to.
 *
 * ## It does not claim the answer is now correct
 *
 * It says which figures moved and where the replacements came from. `grounded`
 * is explicitly not a correctness guarantee — a false claim carrying a valid
 * citation still passes — so this must not read as a quality stamp.
 */
export function AnswerCorrectionNotice() {
  return (
    <div
      // `status`, not `alert`. It arrives with the answer rather than
      // interrupting one, and it qualifies text the user is about to read.
      role="status"
      className="flex items-start gap-3 rounded-md border border-caution/30 bg-caution-tint p-3"
    >
      <Icon name="alert" size={16} className="mt-0.5 text-caution" />
      <div className="flex flex-col gap-1">
        <span className="text-label font-medium text-caution">Some figures were replaced</span>
        <span className="text-small text-ink-muted">
          Figures in the first draft could not be matched to a published SCASPA source, so they were
          removed. What you are reading below comes from the verified records.
        </span>
      </div>
    </div>
  );
}
