import { Button, Card, Chip, Textarea } from '@/components/ui';

/**
 * Placeholder for the conversation itself. **No chat logic in this prompt.**
 *
 * It exists now because the layout contract has to be settled before any of it is
 * built, and that contract is one line:
 *
 * > **`ChatCore` fills its parent. The parent must be a fixed-height flex box.**
 *
 * Everything awkward about a chat layout follows from getting that wrong. The
 * transcript scrolls (`flex-1 overflow-y-auto`) and the composer does not
 * (`shrink-0`), so the composer stays put while messages scroll under it — on a
 * phone, in an iframe, and with a software keyboard open — without a single
 * `position: sticky` or a viewport-height calculation inside this component.
 *
 * That is why both shells can mount this unchanged: `FullPageShell` gives it
 * `100dvh` minus the header, `WidgetShell` gives it 600px minus the header, and
 * neither difference reaches here.
 */
export function ChatCore() {
  return (
    <div className="flex h-full flex-col">
      {/* The transcript. Scrolls; the composer below does not. */}
      <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="transcript">
        <div className="mx-auto flex max-w-measure flex-col gap-4">
          <Card title="Not built yet" tone="muted">
            <p className="text-small text-ink-muted">
              The conversation renders here: messages, streamed tokens, tool activity, citation
              chips and charts. This prompt builds the containers and the mock only.
            </p>
          </Card>

          <div>
            <p className="mb-2 text-caption text-ink-subtle">
              Suggested questions will sit here — how most people start, without typing.
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip>Ferry times</Chip>
              <Chip>Cruise arrivals</Chip>
              <Chip>Cargo at the Deep Water Harbour</Chip>
            </div>
          </div>
        </div>
      </div>

      {/* The composer. `shrink-0` is what keeps it on screen. */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-measure items-end gap-2">
          <div className="flex-1">
            <Textarea
              label="Your question"
              labelHidden
              placeholder="Ask about ferries, cruise, cargo or the airport"
              disabled
            />
          </div>
          <Button disabled>Send</Button>
        </div>
        <p className="mx-auto mt-2 max-w-measure text-caption text-ink-subtle">
          Answers come from verified SCASPA information and show their source.
        </p>
      </div>
    </div>
  );
}
