import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/features/chat/types';
import { reconcile } from '@/features/chat/citations';
import { AgentStatus } from './AgentStatus';
import { ChartBlock } from './ChartBlock';
import { CardBlock } from './CardBlock';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { CitationProvider } from './CitationContext';
import { EscalationCard } from './EscalationCard';
import { AnswerCorrectionNotice } from './AnswerCorrectionNotice';
import { NoAnswerCard } from './NoAnswerCard';
import { SanitisedQuestion, SanitisedQuestionNotice } from './SanitisedQuestion';
import { StepLimitCard } from './StepLimitCard';
import { ToolTrace } from './ToolTrace';
import { SpeakButton } from './SpeakButton';
import { StreamingMarkdown } from './StreamingMarkdown';
import { UngroundedNotice } from './UngroundedNotice';

/**
 * One message, in one of three assistant shapes.
 *
 * The three are visually distinct on purpose, because they are three different
 * claims about how much the reader should trust what they are looking at:
 *
 *   - **normal** — light surface, navy text, numbered citation chips.
 *   - **refusal** — a navy handoff card. Not an error, and styled so it cannot be
 *     mistaken for one. See EscalationCard.
 *   - **ungrounded** — the same text with every chip suppressed and an amber note
 *     saying so. See UngroundedNotice.
 *
 * **A user message is not markdown.** It renders as plain text: someone who types
 * `**` means asterisks, and running their own input through a parser is both
 * wrong and a second path for untrusted content.
 *
 * **Measure is capped** at `max-w-measure` (~68ch). A paragraph 1200px wide is
 * unreadable no matter how much room there is — the eye loses the start of the
 * next line on the return sweep.
 */

interface MessageBubbleProps {
  message: Message;
  /** Opens the source panel scrolled to a citation. Supplied by the shell. */
  onOpenSource?: ((kbId: string) => void) | undefined;
  /**
   * How many knowledge-base rows exist to search — `index.kb_rows` from health,
   * for §3.14's "Records searched".
   *
   * A PROP rather than a `useHealth()` call in here. Reading a query from this
   * component would make every one of its twenty-five unit tests require a
   * `QueryClientProvider` to render one bubble, and a presentational component
   * that cannot be rendered without a network client is not one.
   *
   * Null renders "unknown" and never 0 — zero rows is a fact about an index
   * that was built; a null is one that has not reported.
   */
  recordsSearched?: number | null | undefined;
}

export function MessageBubble({
  message,
  onOpenSource,
  recordsSearched = null,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // `citations` is null until the SSE event lands, which is what puts every
  // marker in the pending state rather than resolving it early.
  const citations = message.streaming ? null : (message.citations ?? null);
  const grounded = message.grounded ?? true;

  const reconciliation = useMemo(
    () => reconcile(message.text, citations, grounded),
    [message.text, citations, grounded]
  );

  const verifiedOn = reconciliation.entries[0]?.citation.as_of ?? null;
  const sourceId = reconciliation.entries[0]?.citation.kb_id ?? null;

  return (
    <div
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
      data-role={message.role}
      data-state={message.refusal ? 'refusal' : grounded ? 'grounded' : 'ungrounded'}
    >
      {/*
        `w-full` is load-bearing, and its absence produced one of the stranger
        defects in this project: **"hi" rendered as "h" over "i".**

        This column is a flex item. Without a width it shrinks to fit, and
        `min-w-0` lets it shrink below its own min-content — so the column
        collapsed to 46px inside a 688px row, and the bubble, capped at 76% of
        a 46px parent, wrapped every character onto its own line. Measured: a
        one-character message was 34px wide and a two-character message 35px,
        which is padding plus almost nothing.

        `w-full` makes the column fill the row; `max-w-measure` still caps it,
        `items-end` still right-aligns the user's bubble, and the bubble still
        shrinks to its own content within that. The 76% cap now measures
        against the real width it was always written for.
      */}
      <div className={cn('flex w-full max-w-measure min-w-0 flex-col', isUser && 'items-end')}>
        {/*
          The live view, while the user is waiting. Handed over to `ToolTrace`
          the moment the stream settles — see the note beside it below.
        */}
        {!isUser && message.streaming && message.activity && message.activity.length > 0 && (
          <AgentStatus activity={message.activity} answerStarted={message.text.length > 0} />
        )}

        {/*
         * The correction notice sits ABOVE the answer, not below it.
         *
         * A note saying "some figures were replaced" placed under the figures
         * is read after they have already been believed — the same reasoning
         * that puts SourceNotice above its table and the incomplete-quote
         * warning above its total.
         *
         * Not shown while streaming: `answer_replaced` arrives on `done`, so
         * before then the honest state is "not known yet" rather than "no".
         */}
        {!isUser && !message.streaming && message.answer_replaced ? (
          <div className="mb-3">
            <AnswerCorrectionNotice />
          </div>
        ) : null}

        {/*
          The replace handler — §3.5.

          "When the backend replaces an in-flight answer, the accumulated tokens
          are shown struck through in `--text-3` and a caution line follows.
          **Do not silently swap the text.**"

          Streaming-time only: once the answer settles, `answer_replaced` drives
          the correction notice above instead. Showing both at once would
          explain the same event twice, in two vocabularies.

          `aria-hidden` on the struck text — a screen reader announcing a
          discarded draft word by word would read out the very figures the
          backend just refused to stand behind. The caution line beneath it is
          announced instead, and it says what happened.
        */}
        {!isUser && message.streaming && message.superseded ? (
          <div className="mb-2 flex flex-col gap-1.5">
            <p aria-hidden="true" className="text-body line-through opacity-60">
              {message.superseded}
            </p>
            <p
              role="status"
              className="flex items-center gap-2 text-caption font-medium text-caution"
            >
              <Icon name="refresh" size={14} />
              Rewriting with the published figures…
            </p>
          </div>
        ) : null}

        {!isUser && message.refusal ? (
          /*
           * THREE different refusals, and they deserve different framing. All
           * three arrive as `refusal: true` and nothing else separates them.
           *
           * `step_limit_reached`        → the agent ran out of tool calls. The
           *   only one of the three that the USER can resolve, by splitting the
           *   question — so it is the only one that says to try again.
           * `refusal_category` present  → a *boundary*: "I am not allowed to
           *   advise on that." The escalation handoff, because the right next
           *   step is a person who can see the case.
           * otherwise                   → a *gap*: "I do not have that." The calm
           *   no-answer treatment, which is the most trustworthy thing the
           *   assistant does and must not look like a failure.
           *
           * The step-limit case is checked FIRST. It can arrive with no
           * category, so testing the category first would route it to the
           * no-answer card — which tells someone their answerable question is
           * unanswerable.
           *
           * `refusal_category` and `step_limit_reached` are both carried on the
           * stream's `done` event as well as on `POST /api/chat`, so a streamed
           * refusal picks the same copy as a non-streamed one. (The note that
           * used to sit here said `done` lacked the category; it has carried it
           * since docs/decisions.md F005 was closed.)
           */
          message.step_limit_reached ? (
            <StepLimitCard message={message.text} />
          ) : message.refusal_category ? (
            <EscalationCard category={message.refusal_category} answer={message.text} />
          ) : (
            <NoAnswerCard message={message.text} />
          )
        ) : (
          <div
            className={cn(
              // `break-words`: a long URL or container number with no spaces would
              // otherwise push the bubble past the viewport.
              'min-w-0 break-words text-ink',
              isUser
                ? /*
                   * The user's turn: a right-aligned tinted bubble — spec board
                   * 05/14. brand-500 at ~32% with a brand-500 edge, 16px radius,
                   * capped at 76% so a long question still reads as one side of
                   * a conversation rather than as a full-width block.
                   */
                  /*
                   * 76% normally, 82% when it carries a neutralisation note —
                   * §3.1. The wider cap is not cosmetic: the inline pill
                   * replacing the removed span makes the sentence longer than
                   * the one the user typed, and at 76% a question that fitted
                   * on two lines wraps to four with the pill orphaned.
                   */
                  cn(
                    'rounded-panel border border-brand-500 bg-brand-tint px-4 py-3',
                    message.sanitised ? 'max-w-[82%]' : 'max-w-[76%]'
                  )
                : /*
                   * ── THE ASSISTANT'S TURN IS FLUSH, AND THAT IS THE WHOLE RULE ──
                   *
                   * No card. No border. No background. Board 00b is built on
                   * this: "Prose sits flush on surface-1 and carries citations,
                   * nothing else. It is never given a card, because a card in
                   * this product is a claim of provenance and a model cannot
                   * make one."
                   *
                   * So the card is the only bounded thing in the column, and a
                   * bounded thing therefore always means structured data with a
                   * source behind it. Putting model prose in a bordered box —
                   * which is what this did — made the two indistinguishable at
                   * a glance, in the one product where telling them apart is
                   * the entire point.
                   *
                   * The ungrounded case gets no border either. It is carried by
                   * `UngroundedNotice` below, in words, which survives greyscale
                   * and a screen reader; an amber edge does neither.
                   */
                  ''
            )}
          >
            {isUser ? (
              /*
               * The sanitised form wins when there is one — board 14. Showing
               * the draft the user typed while the assistant answered something
               * else would be the interface lying about what it sent.
               */
              message.sanitised ? (
                <SanitisedQuestion text={message.sanitised} />
              ) : (
                <p className="whitespace-pre-wrap">{message.text}</p>
              )
            ) : (
              <CitationProvider reconciliation={reconciliation} onOpenSource={onOpenSource}>
                <StreamingMarkdown
                  text={message.text}
                  streaming={message.streaming ?? false}
                  verifiedOn={verifiedOn}
                  sourceId={sourceId}
                />
              </CitationProvider>
            )}

            {/*
              The chart, when the backend built one. After the text, because the
              text is the answer and the chart is the evidence for it.

              Suppressed while ungrounded, for the same reason the citation chips
              are: a chart is believed more readily than a sentence, so drawing
              one from figures the backend could not verify is the strongest
              possible version of the claim it just declined to make.
            */}
            {!isUser && message.chart && grounded && !message.streaming && (
              <ChartBlock spec={message.chart} />
            )}

            {/*
              The card the assistant attached.

              Not gated on `grounded`, unlike the chart above: a chart's figures
              come from cited rows, so a failed citation invalidates it — a
              card's rows come from the operational feed and carry their own
              provenance, so a sentence going wrong above says nothing about
              them. Withholding it would hide the better-sourced of the two.
            */}
            {!isUser && message.card && !message.streaming && <CardBlock card={message.card} />}

            {!isUser && !grounded && !message.streaming && <UngroundedNotice />}

            {/* A mid-stream failure. Whatever text arrived stays on screen — it
                was real, and discarding it wastes the wait. */}
            {message.error && (
              <p className="mt-2 rounded-sm bg-danger-surface px-2 py-1 text-small text-danger">
                {message.error.message}
              </p>
            )}
          </div>
        )}

        {/*
          The explanation, under the bubble and inside the right-aligned column
          so it sits with the message it is about — spec board 14.
        */}
        {isUser && message.sanitised ? <SanitisedQuestionNotice /> : null}

        {/*
          The settled trace — spec board 05.

          `AgentStatus` above is the LIVE view: it says what is happening while
          the user waits, and it is the only visible sign the assistant is doing
          research rather than stalling. This is the evidence afterwards, and it
          is collapsed, because by then the answer is the thing being read.

          Two components rather than one that changes mode: the live view is a
          progress indicator that must not be collapsible mid-flight, and the
          settled one is a disclosure that must not animate.
        */}
        {!isUser && !message.streaming && message.activity && message.activity.length > 0 && (
          <ToolTrace activity={message.activity} />
        )}

        {/* Read-aloud, on the finished answer only: speaking a half-arrived
            sentence would cut off mid-word. */}
        {!isUser && !message.streaming && message.text.length > 0 && (
          <div className="mt-1">
            <SpeakButton messageId={message.id} text={message.text} />
          </div>
        )}

        {/*
          Diagnostics — §3.14, collapsed by default.

          On a settled answer only, and only when the server actually reported a
          time. A panel headed "Diagnostics" whose one figure is unknown is a
          disclosure with nothing behind it.

          `trackedKeys` is deliberately not passed: `tracked_clients` is
          computed by `backend/app/ratelimit.py` but returned only from
          `/admin/stats`, behind the administrator secret, so this surface
          cannot reach it. The row is built and waits for the field — see
          `DiagnosticsPanel`.
        */}
        {!isUser && !message.streaming && message.latency_ms ? (
          <div className="mt-2">
            <DiagnosticsPanel latencyMs={message.latency_ms} recordsSearched={recordsSearched} />
          </div>
        ) : null}

        {/*
          ── NO PER-TURN TIMESTAMP ───────────────────────────────────────────
          The handoff's turn pattern is a bubble, prose and the ghost
          icon-button row, and boards 05 and 14 draw every turn without a
          clock. It was removed rather than kept as a harmless extra: a time
          beside each turn is the strongest possible hint that the transcript
          is a thread being kept, and this product records history without ever
          feeding it back — the greeting exists to stop exactly that
          expectation forming.
        */}
      </div>
    </div>
  );
}
