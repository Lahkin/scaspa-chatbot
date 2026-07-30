import { Badge, Card } from '@/components/ui';

/**
 * The sources for the current answer.
 *
 * One component, three placements — docked column on a wide screen, bottom sheet
 * on a phone, internal sheet in the widget — because the *content* is identical
 * and only the container differs. Duplicating it per placement is how the mobile
 * one ends up a version behind.
 *
 * Sources are not decoration. "Where did that come from, and when was it checked"
 * is the difference between an answer a passenger acts on and one they ring up to
 * confirm anyway, so `as_of` is shown on every entry.
 */
interface SourcePanelProps {
  /**
   * Omit the panel's own heading when the container already provides one.
   *
   * Inside a `Sheet` it does: the sheet renders "Sources" in its header, and the
   * panel rendering it again gave the dialog two identical `<h2>`s. Harmless to
   * look at, confusing to hear — a screen-reader user navigating by heading finds
   * the same section twice.
   */
  headed?: boolean;
}

export function SourcePanel({ headed = true }: SourcePanelProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {headed ? (
        <div>
          <h2 className="text-h3 font-semibold">Sources</h2>
          <p className="mt-1 text-caption text-ink-subtle">
            Every factual claim shows where it came from and the date it was verified.
          </p>
        </div>
      ) : (
        <p className="text-caption text-ink-subtle">
          Every factual claim shows where it came from and the date it was verified.
        </p>
      )}

      <Card title="Nothing to show yet" tone="muted">
        <p className="text-small text-ink-muted">
          Citations appear here once an answer arrives. Each one links to the SCASPA page it came
          from.
        </p>
      </Card>

      <div className="mt-auto border-t border-border pt-3">
        <p className="text-caption text-ink-subtle">
          Information is a snapshot, not a live feed.{' '}
          <Badge tone="info" srPrefix="Status: ">
            Verified
          </Badge>{' '}
          means checked on the date shown, not confirmed today.
        </p>
      </div>
    </div>
  );
}
