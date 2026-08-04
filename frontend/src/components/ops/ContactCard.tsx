import { Icon } from '@/components/ui/Icon';
import { ContactPointRow } from './ContactPointRow';
import type { ContactLocation } from '@/lib/types';

/**
 * A location card — §6.2, and the contact card of board 08.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px; gap: 12px
 * name: 600 16px/24px --text-1
 * rows: 16px glyph --brand-300 (3px top offset) + a label/value stack
 * ```
 *
 * ## An empty field is absent from the tree, not drawn as a gap
 *
 * The rule both boards are arranged around: *"Cards 4 and 5 have `address: ""`.
 * The postal row is **absent from the tree**. No em dash, no `—` placeholder, no
 * reserved space, no empty label. The card is simply shorter and still reads as
 * complete."*
 *
 * That is a stronger claim than "hide it with CSS". A reserved gap tells a
 * reader that something is missing and might arrive; an absent element tells
 * them the card is complete as it stands. On this product the second is true —
 * the Authority publishes what it publishes.
 *
 * `status` is the field §6.2 calls the slot that never fills: *"`status: ""` is
 * **always empty** on every location … there is no status row in the shipping
 * markup at all, and no code path that renders an empty one."* It is modelled
 * because the API sends it, and it has never been non-empty.
 *
 * ## The rows are `ContactPointRow`, not a second implementation
 *
 * §6.2's rows and §6.3's rows are the same row. This card used to draw its own —
 * a 44px `TapToCall` control for telephones, where both boards draw a
 * `--brand-200` link — so the two drifted apart the moment either was touched.
 */
export function ContactCard({
  location,
  /** The department's remit, when the directory gives one — board 08. */
  description,
}: {
  location: ContactLocation;
  description?: string | undefined;
}) {
  const rows = location.contacts.filter((contact) => contact.value.trim());
  const hasPost = rows.some((contact) => contact.kind === 'post');

  return (
    <section className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-4.5">
      <div className="flex flex-col gap-1">
        <h3 className="text-section font-semibold text-ink">{location.name}</h3>
        {description ? <p className="text-label text-ink-muted">{description}</p> : null}

        {/*
         * The slot that never fills.
         *
         * §6.2 reads two ways — "there is no status row in the shipping markup
         * at all" describes what ships when the field is always empty, and "no
         * code path that renders an empty one" describes the guard. The board's
         * own annotation is the narrower of the two: `status: "" — element not
         * rendered`.
         *
         * The narrow reading is kept, because it satisfies the wide one for the
         * data that exists — `status` has never been non-empty on any location,
         * so nothing renders — while still saying something rather than nothing
         * if a feed ever fills it. Deleting the path would delete a guard for no
         * gain.
         */}
        {location.status ? (
          <span className="mt-1 inline-flex h-6.5 items-center self-start rounded-pill border border-border bg-surface-muted px-3 text-caption font-medium text-ink-muted">
            {location.status}
          </span>
        ) : null}
      </div>

      {rows.length > 0 || location.address ? (
        <ul className="flex flex-col gap-3">
          {rows.map((contact) => (
            <ContactPointRow key={`${contact.kind}-${contact.value}`} contact={contact} />
          ))}

          {/*
           * A location with an address but no separate postal contact still says
           * where it is. `address` is its own field and is omitted entirely when
           * empty, exactly like `status`.
           */}
          {!hasPost && location.address ? (
            <li className="flex items-start gap-3">
              <Icon name="pin" size={16} className="mt-[3px] shrink-0 text-brand-300" />
              <address className="text-body whitespace-pre-line text-ink not-italic">
                {location.address}
              </address>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/*
        ── NO FOOTER LINK ───────────────────────────────────────────────────
        §2.5 gives the footer link to "the footer of an ANSWER card" and lists
        four destinations. A location card on the support screen is not an
        answer card, and the one it carried pointed at `/support` — the screen
        the card is already on. §6.2 draws this card as a name and its rows,
        and nothing else.
      */}
    </section>
  );
}
