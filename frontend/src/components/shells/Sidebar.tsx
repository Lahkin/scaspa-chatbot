import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { LogoLockup } from '@/components/brand/LogoLockup';
import { FACILITY_NAV, type FacilityNavItem } from '@/features/chat/facilities';
import { SCASPA_PHONE_LINES } from '@/lib/scaspa-facts';

/**
 * The navigation sidebar for the full-page assistant.
 *
 * ## It holds no conversation history, and that is a decision, not an omission
 *
 * The obvious content for a sidebar like this is a list of past conversations.
 * There isn't one, and there cannot be without reversing three deliberate
 * choices: the backend holds conversations in memory with a sixty-minute TTL,
 * it exposes no endpoint to list them, and the privacy page tells users that
 * message content is never written to their device. A history list needs all
 * three undone.
 *
 * What goes here instead is the thing users actually get wrong. "The port" is
 * four different places — a cargo harbour, a cruise pier, a ferry terminal and
 * an airport — and a question that names one retrieves far better than one that
 * does not. So the sidebar teaches the distinction by navigating it.
 *
 * ## One component, two placements
 *
 * Docked from `lg` up, a focus-trapped drawer below it. The contents are
 * identical; only the frame differs, which is why this takes an `onNavigate`
 * callback rather than knowing about drawers. See `FullPageShell`.
 *
 * ## Navy, and what that forces
 *
 * The sidebar carries `--grad-sidebar`. The contrast is the navy rail against
 * the white conversation column, so this is the *only* side that gets a
 * gradient — `FullPageShell`'s header stays flat, and a gradient on both sides
 * would destroy the very distinction it is there to make.
 *
 * Everything in here is on a dark ground, so no `--color-ink-*` token is
 * correct any more; they are all tuned for a light surface. The four `on-navy`
 * tokens replace them, and each was measured against the WORSE endpoint of the
 * gradient (`#003F6C`) rather than the flattering one:
 *
 * | Role                        | Token                 | Ratio   |
 * | --------------------------- | --------------------- | ------- |
 * | Primary items, headings     | `--on-navy-primary`   | 10.89:1 |
 * | Sub-labels, secondary text  | `--on-navy-secondary` |  8.46:1 |
 * | Icons, dividers, timestamps | `--on-navy-muted`     |  4.83:1 |
 * | Quantities, and only those  | `--on-navy-accent`    |  5.38:1 |
 *
 * `--color-brand` is *forbidden* here: on this ground it measures 1.91:1 and is
 * very nearly invisible. tests/contrast.test.ts rejects it outright, which is
 * the only reason it will not creep back in — it is the obvious thing to reach
 * for, being the brand colour on the brand navy.
 */

interface SidebarProps {
  /** Send a question through the normal path. Same as a suggested chip. */
  onAsk: (question: string) => void;
  /** Clears the stored conversation id and the transcript together. */
  onNewConversation: () => void;
  /** Open the sources panel. */
  onOpenSources: () => void;
  /** Open the About SCASPA sheet. */
  onOpenAbout: () => void;
  /** Unique citations seen so far in this conversation. */
  sourceCount: number;
  /** `kb_updated_at` from health, or null when health is unavailable. */
  knowledgeVerifiedAt: string | null;
  /** True while a request is in flight — starter questions disable. */
  busy: boolean;
  /**
   * Called after any action that should dismiss a drawer. No-op when docked.
   * Kept as a callback so the sidebar does not need to know which it is.
   */
  onNavigate?: (() => void) | undefined;
  /** True when there is a conversation to clear. */
  hasConversation: boolean;
}

export function Sidebar({
  onAsk,
  onNewConversation,
  onOpenSources,
  onOpenAbout,
  sourceCount,
  knowledgeVerifiedAt,
  busy,
  onNavigate,
  hasConversation,
}: SidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-grad-sidebar">
      <div className="shrink-0 p-3">
        {/* `reversed` because the badge is navy-on-transparent and would vanish
            here. It currently declines to draw the badge at all rather than
            recolouring it — see LogoLockup. */}
        <LogoLockup size="md" variant="reversed" tagline="Ports and travel, St. Kitts" />
      </div>

      {/*
        The horizon line under the header.
        A 1px structural boundary rather than a border: it fades to transparent
        at both ends, so it separates the header from the navigation without
        drawing a hard rule across a gradient. `h-px` sizes it; the token paints
        it. It is decorative and carries no meaning, hence `aria-hidden`.
      */}
      <div aria-hidden="true" className="h-px shrink-0 bg-hairline-horizon" />

      <div className="shrink-0 p-3">
        <button
          type="button"
          onClick={() => {
            onNewConversation();
            onNavigate?.();
          }}
          disabled={!hasConversation}
          /*
           * No confirmation dialog. There is nothing to lose that could be
           * recovered — the transcript is not stored anywhere the user can get
           * it back from — so a "are you sure?" would be a modal protecting
           * something that does not exist.
           *
           * ── THE BORDER IS NOT DECORATION ──────────────────────────────────
           *
           * The fill stays `--color-brand`, and its white label measures 4.60:1
           * on it, which is fine. What is NOT fine is the button's edge: brand
           * blue against this navy ground is 1.91:1, so the shape of the
           * control is invisible and only the text says a button is there.
           * WCAG 1.4.11 wants 3:1 for the visual information that identifies a
           * component, so the edge is drawn explicitly in `on-navy-secondary`
           * at 8.46:1.
           *
           * The alternative was recolouring the button, which would have taken
           * the one solid brand-blue affordance off the surface that most needs
           * to look like SCASPA.
           */
          className={cn(
            'flex min-h-touch w-full items-center justify-center gap-2 rounded-md',
            'border border-on-navy-secondary bg-brand px-3 text-small font-semibold',
            'text-on-navy-primary',
            'transition-colors duration-fast ease-out-soft hover:bg-blue-700',
            'disabled:cursor-not-allowed disabled:border-on-navy-muted disabled:bg-transparent',
            'disabled:text-on-navy-muted'
          )}
        >
          <span aria-hidden="true">+</span>
          New conversation
        </button>
      </div>

      {/* The scrolling middle. `min-h-0` so it shrinks rather than pushing the
          footer off the bottom — the same trap as the transcript column. */}
      <nav aria-label="SCASPA facilities" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <h2 className="px-1 pb-2 text-caption font-semibold tracking-wide text-on-navy-muted uppercase">
          Ask about
        </h2>

        <ul className="space-y-1">
          {FACILITY_NAV.map((facility) => (
            <li key={facility.id}>
              <FacilityGroup
                facility={facility}
                busy={busy}
                onAsk={(question) => {
                  onAsk(question);
                  onNavigate?.();
                }}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Dividers are `on-navy-muted` at 4.83:1 — a real boundary rather than
          the hint `--color-border` gives on a light surface, which at this
          lightness would simply disappear. */}
      <div className="shrink-0 space-y-1 border-t border-on-navy-muted p-3">
        {/*
          Hidden at xl, where the source panel is already docked beside the
          conversation. A count of something permanently on screen, next to a
          button that reveals what is already revealed, is furniture.
        */}
        <button
          type="button"
          onClick={() => {
            onOpenSources();
            onNavigate?.();
          }}
          disabled={sourceCount === 0}
          className={cn(
            'flex min-h-touch w-full items-center justify-between gap-2 rounded-md px-2',
            'text-small text-on-navy-secondary',
            'hover:bg-neutral-0/10 hover:text-on-navy-primary',
            'disabled:cursor-not-allowed disabled:text-on-navy-muted disabled:hover:bg-transparent',
            'xl:hidden'
          )}
        >
          <span>Sources in this conversation</span>
          {/*
            The one amber in the sidebar, because it is the one quantity.
            `--on-navy-accent` is for figures on a navy ground and nothing else —
            not a label, not an icon, not an emphasis. It measures 5.38:1 here.
            Zero drops to the muted tone: an accent on a count of nothing is
            drawing the eye to the absence of news.
          */}
          <span
            className={cn(
              'inline-flex min-w-6 shrink-0 items-center justify-center rounded-full px-1.5',
              'text-caption font-semibold tabular',
              sourceCount > 0 ? 'text-on-navy-accent' : 'text-on-navy-muted'
            )}
          >
            {sourceCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onOpenAbout();
            onNavigate?.();
          }}
          className="flex min-h-touch w-full items-center rounded-md px-2 text-small text-on-navy-secondary hover:bg-neutral-0/10 hover:text-on-navy-primary"
        >
          About SCASPA
        </button>

        {/*
          The way out, in the footer as well as the header. Someone who has
          decided the assistant cannot help them has already spent patience they
          did not have; the phone number should never be somewhere they have to
          go and look for.
        */}
        <a
          href={SCASPA_PHONE_LINES[0].href}
          // `text-blue-700` was correct on the old light sidebar and measures
          // 2.3:1 here. The way out must be the most legible thing in the
          // footer, so it takes the primary tone at 10.89:1.
          className="flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-small font-semibold text-on-navy-primary hover:bg-neutral-0/10"
        >
          <span aria-hidden="true" className="text-on-navy-muted">
            ☎
          </span>
          Talk to a person
        </a>

        {/*
          Omitted, not faked, when health is unavailable.
          "Information verified as of —" is worse than silence: it looks like a
          fact with a missing value rather than an unanswered question.
        */}
        {knowledgeVerifiedAt ? (
          <p className="px-2 pt-1 text-caption text-on-navy-muted">
            Information verified as of{' '}
            <time dateTime={knowledgeVerifiedAt}>{knowledgeVerifiedAt}</time>
          </p>
        ) : null}
      </div>

      {/*
        No `<Link>` anywhere in here, deliberately.

        A privacy link in the footer looked like a free addition. It is not: a
        TanStack `<Link>` reads the router from context, so adding one made the
        whole `FullPageShell` un-renderable without a router and broke ten
        existing shell tests that had every right to expect otherwise. It also
        was not asked for.

        Keeping this component router-free keeps it a pure function of its
        props, which is why its tests need no harness beyond a query client.
        Anything here that should navigate takes a callback instead.
      */}
    </div>
  );
}

/**
 * One facility: a disclosure button revealing three starter questions.
 *
 * A real disclosure — `aria-expanded` on the trigger, `aria-controls` pointing
 * at the region, and the region unmounted when closed so a screen reader and a
 * Tab key agree with each other about what is there. A `hidden` panel that is
 * still in the tab order is the classic way this pattern is got wrong.
 */
function FacilityGroup({
  facility,
  busy,
  onAsk,
}: {
  facility: FacilityNavItem;
  busy: boolean;
  onAsk: (question: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex min-h-touch w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
          'hover:bg-neutral-0/10',
          open && 'bg-neutral-0/10'
        )}
      >
        {/*
          The chevron rotates, and the rotation is a `transition` on a token
          duration — which `prefers-reduced-motion` in tokens.css collapses to
          nothing. No JS gate is needed for a pure CSS transform; the hook is for
          animations that schedule work, which this does not.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'inline-block shrink-0 text-on-navy-muted transition-transform duration-fast ease-out-soft',
            open && 'rotate-90'
          )}
        >
          ›
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-on-navy-primary">
            {facility.name}
          </span>
          <span className="block truncate text-caption text-on-navy-secondary">
            {facility.subLabel}
          </span>
        </span>
      </button>

      {open ? (
        <div id={panelId} className="mt-1 space-y-1 pb-1 pl-4">
          <ul className="space-y-1">
            {facility.questions.map((question) => (
              <li key={question}>
                {/*
                  These were a navy fill with an amber chevron, matching
                  `SuggestedQuestions`' `empty` variant. Both halves of that had
                  to change once the sidebar itself went navy, and neither was a
                  free choice:

                  - A `bg-navy` fill on a navy gradient is a button you cannot
                    see. It is now outlined instead — `on-navy-muted` at 4.83:1,
                    which clears the 3:1 that WCAG 1.4.11 asks of the visual
                    boundary of a control.
                  - The chevron is `on-navy-muted`, not amber. In this sidebar
                    amber means "this is a quantity" and nothing else, so
                    spending it on a decorative arrow would make the source
                    count stop meaning anything. The chat's own suggestion chips
                    keep the amber chevron: they sit on a light surface where
                    amber is a fill on navy rather than the accent in a scheme.

                  So the two affordances no longer look identical. That is the
                  cost of the sidebar being dark and the transcript being light,
                  and it is a smaller cost than an invisible button.
                */}
                <button
                  type="button"
                  onClick={() => onAsk(question)}
                  disabled={busy}
                  className={cn(
                    'flex min-h-touch w-full items-start gap-2 rounded-md px-3 py-2 text-left',
                    'border border-on-navy-muted text-caption font-medium text-on-navy-primary',
                    'transition-colors duration-fast ease-out-soft hover:bg-neutral-0/10',
                    'disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                >
                  <span aria-hidden="true" className="shrink-0 text-on-navy-muted">
                    ›
                  </span>
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
