import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { ProvenanceBadge } from './ProvenanceBadge';
import type { OperatorProfile } from '@/lib/types';

/**
 * The operator profile card — §6.10.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px; gap: 12px
 * 32px circle --surface-3 + 1px solid --border + 16px anchor glyph --brand-300
 * name 500 14/22 --text-1  ·  DEMO ONLY provenance badge, right
 * body 400 13/20 --text-2
 * ```
 *
 * ## `profile: null` is the production state, and then there is no card
 *
 * "**The card is not rendered.** No placeholder, no 'sign in' prompt, no
 * silhouette avatar." The component returns nothing rather than an empty shell,
 * which is why the null case lives here and not at the call site: a caller that
 * forgets is a caller that ships a silhouette.
 *
 * ## It is not a sign-in and never becomes one
 *
 * README §6.7: "**No sign-in, session, account or current-user affordance
 * anywhere.** The backend has no accounts and never knows who is asking. The
 * sidebar's bottom row is a demonstration profile carrying an always-true
 * `is_demo` literal, precisely so it cannot quietly become a real identity."
 *
 * `is_demo` is a literal `true` in the schema, so a payload claiming otherwise
 * fails to parse rather than rendering an invented officer as a real one, and
 * `notice` is schema-enforced non-empty.
 *
 * ## The four states are a legend, not four cards
 *
 * §6.10 draws active × verified as a 2×2 of 6px dots. The one that is hollow is
 * the one where **both** are false — an absence drawn as an absence, the same
 * rule Family B's `unknown` chip follows.
 */
export function OperatorProfileCard({ profile }: { profile: OperatorProfile | null }) {
  // The production state. See above.
  if (!profile) return null;

  return (
    <section
      aria-label="Demonstration profile"
      className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-4.5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-brand-300"
        >
          <Icon name="anchor" size={16} />
        </span>
        <span className="min-w-0 flex-1 text-body font-medium text-ink">
          {profile.display_name}
        </span>
        {/*
          Loudest thing on the card, and first in reading order after the name.
          Putting the caveat underneath is how a screenshot of the top half
          becomes a fake identity card.
        */}
        <ProvenanceBadge kind="demo" />
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Legend
          tone="active-verified"
          label="Active · verified"
          on={profile.active && profile.verified}
        />
        <Legend
          tone="active-unverified"
          label="Active · unverified"
          on={profile.active && !profile.verified}
        />
        <Legend
          tone="inactive-verified"
          label="Inactive · verified"
          on={!profile.active && profile.verified}
        />
        <Legend
          tone="inactive-unverified"
          label="Inactive · unverified"
          on={!profile.active && !profile.verified}
        />
      </dl>

      <p className="text-label leading-5 text-ink-muted">
        A fixed demonstration object. It is not a sign-in, not an account and never becomes one.
      </p>

      {/*
        The payload's own notice, always. It is schema-enforced non-empty and
        says more than the badge can — see `OperatorProfile.notice`.
      */}
      <p className="text-label leading-5 text-ink-muted">{profile.notice}</p>
    </section>
  );
}

/**
 * One row of the 2×2.
 *
 * `on` marks which combination this profile actually is. The other three stay
 * on the card because §6.10 draws all four — the legend explains what the dot
 * beside this operator's name would mean in each case, and a legend with three
 * rows removed explains nothing.
 */
function Legend({
  tone,
  label,
  on,
}: {
  tone: 'active-verified' | 'active-unverified' | 'inactive-verified' | 'inactive-unverified';
  label: string;
  on: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', DOTS[tone])} />
      <dt className="text-caption font-medium text-ink-muted">{label}</dt>
      {/* Which one this profile is, in words — the dot alone is a colour. */}
      <dd className="sr-only">{on ? 'this profile' : 'not this profile'}</dd>
      {on ? (
        <span className="text-caption font-medium text-ink" aria-hidden="true">
          ←
        </span>
      ) : null}
    </div>
  );
}

const DOTS = {
  'active-verified': 'bg-positive',
  'active-unverified': 'bg-caution',
  'inactive-verified': 'bg-neutral-status',
  // Hollow: neither is true, and an absence is drawn as one.
  'inactive-unverified': 'border-[1.5px] border-neutral-status',
} as const;
