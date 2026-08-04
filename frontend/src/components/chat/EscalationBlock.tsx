import { Icon } from '@/components/ui/Icon';
import { TapToCall } from '@/components/ui/TapToCall';
import { SCASPA_PHONE_LINES, SCASPA_POSTAL_ADDRESS } from '@/features/chat/contact';

/**
 * "Speak to the Authority" — spec board 15.
 *
 * ## Identical wherever it appears
 *
 * The spec's own annotation: *"Identical wherever it appears. A refusal that
 * ends without a way forward is a dead end."*
 *
 * So this is one component used by every refusal and every error, rather than
 * the same three lines re-typed in five places where they would drift. Every
 * dead end in this product ends here, and it ends the same way.
 *
 * ## Telephone and post, and nothing else
 *
 * There is no email row and no web form — board 19 and the "deliberately not
 * designed" board both say so. The Authority publishes a switchboard and a
 * post box; inventing a contact channel is the same class of mistake as
 * inventing a sailing time.
 */
export function EscalationBlock() {
  return (
    <div className="flex flex-col gap-3.5 rounded-panel border border-border bg-surface-muted p-5">
      <span className="text-label font-medium text-ink">Speak to the Authority</span>

      <div className="flex flex-col gap-2">
        {/*
         * One `tel:` link per line, each its own 44px target.
         *
         * "8121 / 2 / 3" as a single link dials only the first, and a caller
         * who needed the second line has no way to reach it.
         */}
        <ul className="flex flex-col gap-2">
          {SCASPA_PHONE_LINES.map((line) => (
            <li key={line.href}>
              <TapToCall href={line.href} display={line.text} />
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-3 px-0.5">
          <Icon name="pin" size={16} className="mt-1 text-brand-300" />
          <address className="text-label text-ink-muted not-italic">
            {SCASPA_POSTAL_ADDRESS.join(', ')}
          </address>
        </div>
      </div>
    </div>
  );
}
