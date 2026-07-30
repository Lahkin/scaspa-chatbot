import { useEffect, useRef, useState } from 'react';
import { Button, Textarea } from '@/components/ui';

interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  /** Set by a suggested-question chip. Populates the box; does not send. */
  draft: string;
  onDraftChange: (text: string) => void;
}

/** The contract rejects anything longer, so the limit is enforced before the round trip. */
const MAX_LENGTH = 1000;

export function Composer({ onSend, onStop, busy, draft, onDraftChange }: ComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [touched, setTouched] = useState(false);

  // A chip fills the box, then focus moves to the end of it — so the next action
  // is either pressing send or editing "40-foot" into "20-foot", with no hunting
  // for the caret.
  useEffect(() => {
    if (!draft) return;
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [draft]);

  const tooLong = draft.length > MAX_LENGTH;
  const empty = draft.trim().length === 0;

  const submit = () => {
    if (busy || empty || tooLong) return;
    onSend(draft);
    onDraftChange('');
    setTouched(false);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-2"
    >
      <div className="min-w-0 flex-1">
        <Textarea
          ref={inputRef}
          label="Your question"
          labelHidden
          placeholder="Ask about ferries, cruise, cargo or the airport"
          value={draft}
          maxRows={6}
          onChange={(event) => {
            onDraftChange(event.target.value);
            setTouched(true);
          }}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter makes a new line. The usual chat idiom —
            // and on a phone the on-screen keyboard shows its own return key, so
            // the form submit below is what actually fires there.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          {...(touched && tooLong
            ? {
                error: `That is ${draft.length} characters. Please shorten it to ${MAX_LENGTH} or fewer.`,
              }
            : {})}
        />
      </div>

      {busy ? (
        // Stopping is free: closing the connection cancels generation server-side
        // and nothing further is charged.
        <Button type="button" variant="secondary" onClick={onStop}>
          Stop
        </Button>
      ) : (
        <Button type="submit" disabled={empty || tooLong}>
          Send
        </Button>
      )}
    </form>
  );
}
