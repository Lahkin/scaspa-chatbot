import { Icon } from '@/components/ui/Icon';
import { setDraft } from '@/features/chat/draft';
import { EscalationBlock } from './EscalationBlock';

/**
 * The example the card offers.
 *
 * A real question this assistant can answer in one pass, and deliberately one
 * about the operations feed rather than the knowledge base — the point is to
 * show a question with a single subject, and a vessel board is the clearest
 * case of that.
 */
const SIMPLER_QUESTION = 'Which vessels are alongside today?';

/**
 * "That took more steps than we can run in one go" — spec board 05.
 *
 * ## The distinction this exists to draw
 *
 * The agent may use at most six tools for one question. When it runs out before
 * finishing, the tokens already streamed were an internal message rather than
 * an answer, the backend sends `replace` with the text to show instead, and
 * `done` reports `refusal: true`.
 *
 * That arrives looking identical to "we do not hold that information" — and the
 * two need **opposite** advice:
 *
 *   step limit    → "ask for one thing at a time" resolves it. Splitting the
 *                   question usually gets an answer straight away.
 *   not our data  → simplifying cannot help. No phrasing reaches a fact the
 *                   knowledge base does not contain, and telling someone to try
 *                   again sends them round in circles.
 *
 * The spec marked this **blocked** for exactly that reason: "Today this arrives
 * as the same generic failure as 'not in our data'. Telling a user to simplify a
 * question we simply do not cover sends them round in circles."
 *
 * `hit_tool_limit` was already computed on every turn and discarded at the wire
 * boundary. It now reaches the client as `step_limit_reached`.
 *
 * ## No retry button
 *
 * Re-sending the same question hits the same cap. The action that helps is
 * editing the question, which the composer already offers — a retry control
 * here would be a button whose only outcome is the same card again.
 */
export function StepLimitCard({
  message,
  /**
   * What the suggestion does. Defaults to putting it in the composer.
   *
   * The same thing `SuggestedQuestions` does, and deliberately not "send it".
   * A question that fires itself takes the user's turn for them, and the whole
   * point of this card is that the user is being asked to narrow their own
   * question — arriving at an answer they did not press send on undoes that.
   */
  onAsk = setDraft,
}: {
  message: string;
  onAsk?: ((question: string) => void) | undefined;
}) {
  return (
    <section
      aria-labelledby="step-limit-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-2">
        <h3
          id="step-limit-heading"
          className="flex items-center gap-2 text-section font-semibold text-ink"
        >
          <Icon name="tool" size={16} className="text-brand-300" />
          That took more steps than we can run in one go
        </h3>
        <p className="text-body text-ink-muted">
          Try asking for one thing at a time. Splitting the question usually gets an answer straight
          away.
        </p>
      </div>

      {/*
       * The backend's own words for this turn.
       *
       * Rendered rather than replaced: it is approved copy and it may carry
       * detail this card cannot know. The heading above frames it; this does
       * not restate it.
       */}
      {message ? (
        <p className="rounded-input border border-border bg-surface-muted p-3 text-small text-ink-muted">
          {message}
        </p>
      ) : null}

      {/*
       * "Ask this instead" — boards 05 and 15.
       *
       * This is the one refusal the user can actually resolve, so it is the one
       * that offers a concrete next question rather than only advice. A single
       * suggestion, not a list: the point is to demonstrate the SHAPE of a
       * question that fits in one go, and three of them re-poses the problem.
       *
       * A button, not a link — it sends the question through the ordinary path
       * and nothing about it is navigation.
       */}
      {onAsk ? (
        <div className="flex flex-col gap-2 rounded-input border border-border bg-surface-muted p-4">
          <span className="text-micro font-semibold tracking-[0.06em] text-ink-subtle uppercase">
            Ask this instead
          </span>
          <button
            type="button"
            onClick={() => onAsk(SIMPLER_QUESTION)}
            className="group flex min-h-touch items-center gap-2.5 text-left"
          >
            <Icon name="sparkle" size={16} className="text-brand-300" />
            <span className="flex-1 text-body font-medium text-ink group-hover:underline">
              {SIMPLER_QUESTION}
            </span>
            <Icon
              name="arrow-right"
              size={16}
              className="text-brand-200 transition-transform duration-fast ease-out-soft group-hover:translate-x-[3px]"
            />
          </button>
        </div>
      ) : null}

      <EscalationBlock />
    </section>
  );
}
