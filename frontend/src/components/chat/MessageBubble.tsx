import { cn } from '@/lib/cn';
import type { Message } from '@/features/chat/types';
import { AgentStatus } from './AgentStatus';
import { StreamingMarkdown } from './StreamingMarkdown';

/**
 * One message.
 *
 * **A user message is not markdown.** It is rendered as plain text, deliberately:
 * a user who types `**` means asterisks, and running their own input through a
 * parser is both wrong and a needless second path for untrusted content. Only
 * assistant text goes through the markdown pipeline.
 *
 * **Measure is capped**, and this is the part most easily got wrong on a wide
 * screen. A paragraph 1200px wide is unreadable no matter how much room there
 * is: the eye loses the start of the next line on the return sweep. The bubble
 * caps at `max-w-measure` (~68ch) regardless of the column it sits in.
 */

interface MessageBubbleProps {
  message: Message;
}

/**
 * The user's own locale and timezone, not ours.
 *
 * `Intl` reads the browser's settings, so a passenger in St. Kitts sees AST and
 * a judge watching remotely sees theirs — both correct, neither hard-coded. A
 * fixed `en-US` format would show 24-hour times to people who read 12-hour ones.
 */
function formatTime(at: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

function formatFullTime(at: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const verifiedOn = message.citations?.[0]?.as_of ?? null;
  const sourceId = message.citations?.[0]?.kb_id ?? null;

  return (
    <div
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
      data-role={message.role}
    >
      <div className={cn('flex max-w-measure min-w-0 flex-col', isUser && 'items-end')}>
        {/* Tool activity sits above the answer it belongs to, where a reader is
            already looking while waiting for the first token. */}
        {!isUser && message.activity && message.activity.length > 0 && (
          <AgentStatus activity={message.activity} answerStarted={message.text.length > 0} />
        )}

        <div
          className={cn(
            'rounded-lg px-4 py-3',
            // `break-words` matters: a long URL or a container number with no
            // spaces will otherwise push the bubble past the viewport.
            'min-w-0 break-words',
            isUser
              ? 'bg-blue-600 text-ink-inverse'
              : 'bg-surface-muted text-navy-deep border border-border'
          )}
        >
          {isUser ? (
            // Plain text, whitespace preserved. No parser touches user input.
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <StreamingMarkdown
              text={message.text}
              streaming={message.streaming ?? false}
              verifiedOn={verifiedOn}
              sourceId={sourceId}
            />
          )}

          {/* A mid-stream failure. Whatever text arrived before it stays on
              screen — it was real, and discarding it wastes the wait. */}
          {message.error && (
            <p className="mt-2 rounded-sm bg-danger-surface px-2 py-1 text-small text-danger">
              {message.error.message}
            </p>
          )}
        </div>

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
