import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * Four trust signals, in a strip under the hero.
 *
 * ## Why this is not `TrustPoints`
 *
 * `TrustPoints` is the same four claims written out in full, and it still exists
 * for `/about`, where a reader has arrived specifically to find out how the
 * thing works. This is the glanceable version: a line each, on one row, for
 * someone deciding in three seconds whether to ask a question at all.
 *
 * The claims are identical on purpose. Two places making DIFFERENT promises
 * about the same product is how a privacy assurance ends up meaning one thing on
 * the landing page and another on the page that explains it, so the wording here
 * is a compression of that file's, never a rewrite of it.
 *
 * ## Each is a description, not an adjective
 *
 * "Sources shown with answers" is checkable in the next thirty seconds.
 * "Trusted and reliable" is not, and a visitor who has read one marketing page
 * can tell the difference immediately.
 *
 * ## The icons are the ones the sprite has
 *
 * The spec asks for shield, document, headset and a padlock. There is no padlock
 * in `iconPaths.ts`, which is transcribed from the design sprite verbatim rather
 * than drawn by eye — so the privacy signal takes the shield and the verified
 * signal takes the check. Inventing a padlock to fill a slot is precisely what
 * that file exists to prevent, and the words carry the meaning regardless.
 */

const SIGNALS: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'check', label: 'Verified SCASPA information' },
  { icon: 'file', label: 'Sources shown with answers' },
  { icon: 'headset', label: 'Human help when needed' },
  { icon: 'shield', label: 'We never ask for your personal data' },
];

export function TrustStrip() {
  return (
    <ul
      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border"
      aria-label="What this assistant guarantees"
    >
      {SIGNALS.map(({ icon, label }) => (
        <li key={label} className="flex items-center gap-2.5 lg:justify-center lg:px-3">
          <Icon name={icon} size={18} className="shrink-0 text-brand-400" />
          <span className="text-small text-ink-muted">{label}</span>
        </li>
      ))}
    </ul>
  );
}
