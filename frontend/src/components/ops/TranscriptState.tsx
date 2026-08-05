import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * What the server did with the transcript — §6.5.
 *
 * > "**The UI reflects the response, not the request.** Two renderings, and the
 * > second is the one people discover at the worst moment if you get it wrong."
 *
 * | Requested | Checked box, `--surface-3`, `1px solid --border`, `400 13/20 --text-2` |
 * | **Server did not attach** | **Unchecked box**, `1px solid rgba(217,162,59,0.3)`, title `500 13/18 --caution` "Not attached", body `400 13/20 --text-2` |
 *
 * > "The box shows what the server did. **A tick that means 'we tried' is a
 * > lie.**"
 *
 * So this is driven by `SupportTicketResponse.transcript_included` and never by
 * the checkbox the user ticked. The two are different facts: the request said
 * what was wanted, the response says what happened, and a receipt that shows the
 * first is a receipt that will be wrong exactly when it matters — when the
 * department reads a message with no conversation behind it.
 *
 * It renders nothing at all when the transcript was never requested. There is no
 * third state on the board, and "you did not ask for this" is not news.
 */
export function TranscriptState({
  requested,
  attached,
}: {
  /** What the user ticked. Decides whether this renders at all. */
  requested: boolean;
  /** `transcript_included` — what the server actually did. */
  attached: boolean;
}) {
  if (!requested) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-input bg-surface-muted p-3.5',
        attached ? 'border border-border' : 'border border-caution-notice-edge'
      )}
    >
      {/*
       * The box is a picture of a checkbox, not a control: nothing here is
       * togglable, and a real `<input>` would invite a reader to change a fact
       * about what already happened. `aria-hidden` because the words beside it
       * say the same thing.
       */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-tiny',
          attached ? 'bg-brand-500 text-ink-inverse' : 'border border-border'
        )}
      >
        {attached ? <Icon name="check" size={12} /> : null}
      </span>

      {attached ? (
        <span className="text-label leading-5 text-ink-muted">
          Requested: attach this conversation
        </span>
      ) : (
        <span className="flex flex-col gap-1">
          <span className="text-label font-medium text-caution">Not attached</span>
          <span className="text-label leading-5 text-ink-muted">
            The conversation could not be attached to this enquiry. The department will see your
            message only.
          </span>
        </span>
      )}
    </div>
  );
}
