import { createFileRoute, Link } from '@tanstack/react-router';
import { OpsPage } from '@/components/ops/OpsPage';
import { SourceNotice } from '@/components/ops/SourceNotice';
import { OperatorProfileCard } from '@/components/ops/OperatorProfileCard';
import { MarineAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { useMarineAdvisories, useOperatorProfile } from '@/features/ops/queries';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * The design's `profile_settings` screen.
 *
 * ── READ THIS BEFORE CHANGING ANYTHING HERE ──────────────────────────────────
 *
 * **There is no sign-in behind this page, and there is not going to be.**
 * `frontend/CLAUDE.md` rule 2: no auth, no session token, no Authorization
 * header, no cookie. The card below is a demo fixture served by the backend
 * only when it is running `OPS_DATA_SOURCE=fixture`, which `main.py` refuses to
 * boot with when `ENV=prod`. Nothing on it is derived from who is looking,
 * because nothing about who is looking is ever known.
 *
 * The identity card is rendered because the mockup calls for it and it was
 * explicitly asked for. The guardrails are:
 *
 * 1. **The demo notice renders above the card, always.** It comes from the
 *    payload (`profile.notice`, non-empty by schema), so a card cannot arrive
 *    without one.
 * 2. **`is_demo` is a literal `true` in the schema.** A payload claiming
 *    otherwise fails to parse rather than rendering a fabricated officer as a
 *    real one.
 * 3. **When there is no fixture feed, there is no card** — not an empty card, and
 *    not a skeleton that looks like one loading. `/settings` is what a real
 *    deployment shows, and this page says so and links to it.
 * 4. **The design's own values are not reproduced.** "Senior Agent Alistair
 *    Vance" and "SKN-PORT-8829-X" are a plausible person and a plausible
 *    credential, which is exactly what gets screenshotted and passed on. The
 *    fixture says `Sample Agent A. Sample` and `SAMPLE-0000-X`.
 *
 * ## What the mockup asks for that is answered differently
 *
 * - **"Secure Gateway — your session is protected by 256-bit institutional
 *   encryption."** There is no session, so there is nothing to encrypt and the
 *   claim would be theatre. The panel keeps its position and its weight, and
 *   says the stronger true thing: there is nothing held about you to protect.
 * - **"Review Security Logs".** There are no per-user logs to review — CLAUDE.md
 *   rule 9 forbids logging an identifier at all. The link goes to `/privacy`,
 *   which is the honest version of the same question.
 * - **"System updates"** are the marine notices from the feed, which is real
 *   data, rather than an invented "Tariff API Update".
 * - **The preferences grid** is not duplicated here. `/settings` owns the one
 *   action with a side effect, and two screens writing the same storage key is
 *   how they drift apart.
 */
function ProfileRoute() {
  const { data, isPending } = useOperatorProfile();
  const marine = useMarineAdvisories();
  const profile = data?.profile ?? null;

  return (
    <OpsPage
      title="Profile &amp; Settings"
      intro="What this assistant knows about you, which is nothing, and how to change what it does."
    >
      {data?.source ? <SourceNotice source={data.source} /> : null}

      {/*
        §6.10's card, which returns nothing when `profile` is null — "**The card
        is not rendered.** No placeholder, no 'sign in' prompt, no silhouette
        avatar." `NoIdentityCard` is not that placeholder: it is this SCREEN
        explaining why its subject is absent and where the useful page is, which
        is the decision recorded at the top of this file.
      */}
      {profile ? <OperatorProfileCard profile={profile} /> : <NoIdentityCard pending={isPending} />}

      <section
        aria-labelledby="secure-heading"
        className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-h2 leading-none text-ops-sky">
            &#128737;
          </span>
          <div className="min-w-0">
            <h2 id="secure-heading" className="text-h3 font-semibold text-ops-ink">
              Nothing to secure
            </h2>
            {/*
              The mockup promises "256-bit institutional encryption" of a
              session. Stating that would be theatre over a session that does
              not exist. The true version is stronger and is what goes here.
            */}
            <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
              There is no sign-in, so there is no account, no session and no password. This
              assistant never learns who is asking. Your question and the time it took are logged so
              the service can be kept working; your IP address, your voice and anything that
              identifies you are not.
            </p>
            <Link
              to="/privacy"
              className="mt-2 inline-flex min-h-touch items-center text-small font-medium text-ops-sky underline"
            >
              What is and is not stored
            </Link>
          </div>
        </div>
      </section>

      {/*
        ── ONE ADVISORY PANEL, NOT A SECOND ONE IN SOFTER WORDS ────────────────
        This screen drew its own "System updates" panel whose empty state read
        "No notices have been published to this assistant. That is not a
        statement that there is nothing to know — it means nothing has been sent
        here", in neutral.

        §6.9 and §7.4 give that event **one** treatment, and it is the only
        empty state in the product drawn in caution: "That is not confirmation
        that conditions are normal. Telephone Marine Operations on
        869 465 8121 before sailing." A quiet screen read as safety has physical
        consequences, and two sentences of different weight for one fact is
        precisely what §7's first line refuses: "One grid, so the same event
        never gets two treatments across screens."
      */}
      <MarineAdvisoryPanel
        advisories={marine.data?.advisories ?? []}
        total={marine.data?.total ?? 0}
      />

      <section
        aria-labelledby="prefs-heading"
        className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
      >
        <h2 id="prefs-heading" className="text-h3 font-semibold text-ops-ink">
          Application preferences
        </h2>
        <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
          Appearance follows the contrast and reduced-motion settings you have already chosen on
          your device, so there is no switch here to remember. Clearing the conversation is on the
          settings page, which is the one place that does it.
        </p>
        <Link
          to="/settings"
          className="mt-2 inline-flex min-h-touch items-center text-small font-medium text-ops-sky underline"
        >
          Go to settings
        </Link>
      </section>

      <p className="text-caption text-ops-ink-variant">
        Something wrong, or something this cannot answer? Call SCASPA on{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-ops-sky underline tabular">
          {SCASPA_TEL_TEXT}
        </a>
        .
      </p>
    </OpsPage>
  );
}

/**
 * What a real deployment shows here.
 *
 * Not an empty version of the card and not a skeleton: either would imply an
 * identity is loading. There is no identity, and the page says which page does
 * have something useful on it.
 */
function NoIdentityCard({ pending }: { pending: boolean }) {
  return (
    <section
      aria-labelledby="no-identity-heading"
      className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
    >
      <h2 id="no-identity-heading" className="text-h3 font-semibold text-ops-ink">
        There is no account
      </h2>
      <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
        {pending
          ? 'Checking…'
          : 'This assistant has no sign-in and keeps no profile. Anyone can ask it anything, and it never knows who asked. There is nothing here to view or change.'}
      </p>
    </section>
  );
}

export const Route = createFileRoute('/profile')({
  component: ProfileRoute,
  head: () => ({
    meta: [
      { title: 'Profile & settings — SCASPA Assistant' },
      {
        name: 'description',
        content:
          'This assistant has no accounts and never knows who is asking. What it keeps on your device, and how to change what it does.',
      },
    ],
  }),
});
