import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { ContactPoint } from '@/lib/types';

/**
 * One contact point — §6.3, and the row §6.2's location cards are built from.
 *
 * ```
 * row:   gap 12px; 16px glyph --brand-300 (3px top offset)
 * label: 500 12px/16px      value: telephone 500 14/22 --brand-200 tabular
 *                                  post      400 14/22 --text-1
 * ```
 *
 * ## Five kinds, and three of them will never carry a value
 *
 * The API models five. Two are populated and three are not, for reasons that are
 * decisions rather than gaps:
 *
 *   phone      populated
 *   post       populated
 *   email      **open TODO** — scaspa.com obfuscates it, and a guessed address
 *              sends a cargo query into a void the sender never learns about
 *   extension  **never**. "A caller routed to the wrong security-gate extension
 *              is worse off than one who was never offered the number."
 *   web        not populated
 *
 * ## An unpopulated row is not rendered on a screen
 *
 * The board draws all five greyed, with state tags, because it is a **catalogue
 * of row types** — `08-blocked-and-forbidden.md` #7: "Draw the row types. None
 * is populated." In the product a row with no value is absent, the same rule as
 * the card's status line, so a directory with only a telephone number is simply
 * shorter.
 *
 * Both are here: the screen path returns `null`, and `ContactPointCatalogue`
 * draws the five types with their tags. A row type that exists only in a
 * screenshot is a row type nobody has checked.
 */
const GLYPHS: Record<ContactPoint['kind'], IconName> = {
  phone: 'phone',
  post: 'pin',
  // §6.3's own table: email is the **file** glyph. It was `receipt`, which is
  // the tariff calculator's mark.
  email: 'file',
  extension: 'headset',
  web: 'info',
};

export function ContactPointRow({ contact }: { contact: ContactPoint }) {
  // No value, no row. See above.
  if (!contact.value.trim()) return null;

  return (
    <li className="flex items-start gap-3">
      <Icon name={GLYPHS[contact.kind]} size={16} className="mt-[3px] shrink-0 text-brand-300" />
      <div className="flex min-w-0 flex-col gap-0.5">
        {/*
         * The label is the FEED's word, not the kind's.
         *
         * It reads "Telephone" and "Post" on the headquarters card and **"Via
         * SCASPA"** on the four locations that have no line of their own — which
         * is a fact about how to reach them that the glyph cannot carry. Board
         * 19 draws its five cards without labels because theirs would all have
         * read "Telephone"; §6.2 and board 08 both draw the stack.
         */}
        <span className="text-caption font-medium text-ink-muted">{contact.label}</span>
        <Value contact={contact} />
      </div>
    </li>
  );
}

function Value({ contact }: { contact: ContactPoint }) {
  if (contact.kind === 'phone') {
    return (
      <a
        href={`tel:${contact.value.replace(/[^\d+]/g, '')}`}
        /*
         * The visible text is the number, and the accessible name says what
         * pressing it does. WCAG 2.5.3 asks that the name contain the visible
         * label, which it does — a link announced as seven digits and nothing
         * else gives a screen-reader user no idea it dials.
         */
        aria-label={`${contact.label} — call ${contact.value}`}
        /*
         * `500 14/22 --brand-200` tabular — §6.2's table, and how boards 08 and
         * 19 both draw it. Not the 44px bordered `TapToCall`: §1.3's control is
         * what the escalation block uses, and putting it here made every contact
         * row a button the handoff draws as a link.
         *
         * `min-h-touch` below 640px and nothing above it, per §7 — the type is
         * unchanged, the hit area grows, exactly like every other control.
         */
        className="inline-flex min-h-touch items-center text-body font-medium text-brand-200 tabular underline-offset-3 hover:underline sm:min-h-0"
      >
        {contact.value}
      </a>
    );
  }

  if (contact.kind === 'post') {
    // Line breaks preserved — §6.2. A postal address is a shape, not a sentence.
    return (
      <address className="text-body whitespace-pre-line text-ink not-italic">
        {contact.value}
      </address>
    );
  }

  return <span className="text-body text-ink">{contact.value}</span>;
}

/**
 * The catalogue — §6.3, and requirement #7 of `08-blocked-and-forbidden.md`.
 *
 * Every row type at once, including the three that will never be populated, each
 * with the state tag that says why. **This is not a screen component**: nothing
 * in the product renders an unpopulated row, and the wire never sends one. It
 * exists so the row types are drawn, tested and visible in a review build rather
 * than living only in a screenshot.
 */
const CATALOGUE: readonly {
  kind: ContactPoint['kind'];
  text: string;
  state: 'populated' | 'todo' | 'never' | 'absent';
}[] = [
  { kind: 'phone', text: '869 465 8121', state: 'populated' },
  { kind: 'post', text: 'P.O. Box 963, Bird Rock', state: 'populated' },
  { kind: 'email', text: 'Email', state: 'todo' },
  { kind: 'extension', text: 'Extension', state: 'never' },
  { kind: 'web', text: 'Web', state: 'absent' },
];

/**
 * `height: 20px; padding: 0 7px; border-radius: 5px; 600 11px/16px`.
 *
 * §6.3's prose reads "populated `--positive-fill`/`--positive`, TODO and
 * not-populated `--caution-fill`/`--caution`, never `--critical-fill`/
 * `--critical-text`" — where "never" names the **extension row's tag**, not a
 * prohibition. The export settles it: that row's tag is `rgba(217,86,75,0.12)`
 * with `#E4736A`, reading "Never".
 */
const TAGS = {
  populated: { label: 'Populated', className: 'bg-positive-tint text-positive' },
  todo: { label: 'Open TODO', className: 'bg-caution-tint text-caution' },
  never: { label: 'Never', className: 'bg-critical-tint text-critical-text' },
  absent: { label: 'Not populated', className: 'bg-caution-tint text-caution' },
} as const;

export function ContactPointCatalogue() {
  return (
    <ul className="flex flex-col gap-3">
      {CATALOGUE.map((row) => {
        const populated = row.state === 'populated';
        const tag = TAGS[row.state];

        return (
          <li
            key={row.kind}
            className={cn('flex items-center gap-3', populated ? undefined : 'opacity-60')}
          >
            <Icon
              name={GLYPHS[row.kind]}
              size={16}
              className={cn('shrink-0', populated ? 'text-brand-300' : 'text-ink-muted')}
            />
            <span
              className={cn(
                'min-w-0 flex-1 text-body',
                row.kind === 'phone' && 'font-medium text-brand-200 tabular',
                row.kind === 'post' && 'text-ink',
                !populated && 'text-ink-muted'
              )}
            >
              {row.text}
            </span>
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center rounded-tiny px-[7px] text-micro font-semibold',
                tag.className
              )}
            >
              {tag.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
