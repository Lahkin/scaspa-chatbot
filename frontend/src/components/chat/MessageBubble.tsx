import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { Message } from '@/features/chat/types';
import { reconcile } from '@/features/chat/citations';
import { AgentStatus } from './AgentStatus';
import { CitationProvider } from './CitationContext';
import { EscalationCard } from './EscalationCard';
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
}

/**
 * The user's own locale and timezone, not ours.
 *
 * `Intl` reads the browser's settings, so a passenger in St. Kitts sees AST and a
 * judge watching remotely sees theirs — both correct, neither hard-coded.
 */
function formatTime(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at);
}

function formatFullTime(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
}

export function MessageBubble({ message, onOpenSource }: MessageBubbleProps) {
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
      <div className={cn('flex max-w-measure min-w-0 flex-col', isUser && 'items-end')}>
        {!isUser && message.activity && message.activity.length > 0 && (
          <AgentStatus activity={message.activity} answerStarted={message.text.length > 0} />
        )}

        {!isUser && message.refusal ? (
          // A refusal replaces the bubble entirely rather than sitting inside one.
          <EscalationCard category={message.refusal_category} answer={message.text} />
        ) : (
          <div
            className={cn(
              'rounded-lg px-4 py-3',
              // `break-words`: a long URL or container number with no spaces would
              // otherwise push the bubble past the viewport.
              'min-w-0 break-words',
              isUser
                ? 'bg-blue-600 text-ink-inverse'
                : grounded
                  ? 'border border-border bg-surface-muted text-navy-deep'
                  : // Ungrounded: deliberately not the confident surface. A muted
                    // ground and an amber edge, so the difference is visible
                    // before the note is read.
                    'border border-amber-text/30 bg-surface text-ink'
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
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

        <time
          dateTime={message.at.toISOString()}
          title={formatFullTime(message.at)}
          className="mt-1 px-1 text-caption text-ink-subtle"
        >
          {formatTime(message.at)}
        </time>
      </div>
    </div>
  );
}
