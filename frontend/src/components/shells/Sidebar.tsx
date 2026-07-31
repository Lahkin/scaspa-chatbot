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
    <div className="flex h-full min-h-0 flex-col bg-surface-muted">
      <div className="shrink-0 border-b border-border p-3">
        <LogoLockup size="md" tagline="Ports and travel, St. Kitts" />
      </div>

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
           */
          className={cn(
            'flex min-h-touch w-full items-center justify-center gap-2 rounded-md',
            'bg-blue-600 px-3 text-small font-semibold text-ink-inverse',
            'transition-colors duration-fast ease-out-soft hover:bg-blue-700',
            'disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-ink-subtle'
          )}
        >
          <span aria-hidden="true">+</span>
          New conversation
        </button>
      </div>

      {/* The scrolling middle. `min-h-0` so it shrinks rather than pushing the
          footer off the bottom — the same trap as the transcript column. */}
      <nav aria-label="SCASPA facilities" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <h2 className="px-1 pb-2 text-caption font-semibold tracking-wide text-ink-subtle uppercase">
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

      <div className="shrink-0 space-y-1 border-t border-border p-3">
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
            'text-small text-ink-muted',
            'hover:bg-surface-sunken hover:text-ink',
            'disabled:cursor-not-allowed disabled:text-ink-subtle disabled:hover:bg-transparent',
            'xl:hidden'
          )}
        >
          <span>Sources in this conversation</span>
          <span
            className={cn(
              'inline-flex min-w-6 shrink-0 items-center justify-center rounded-full px-1.5',
              'text-caption font-semibold tabular',
              sourceCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-neutral-100 text-ink-subtle'
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
          className="flex min-h-touch w-full items-center rounded-md px-2 text-small text-ink-muted hover:bg-surface-sunken hover:text-ink"
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
          className="flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-small font-medium text-blue-700 hover:bg-blue-50"
        >
          <span aria-hidden="true">☎</span>
          Talk to a person
        </a>

        {/*
          Omitted, not faked, when health is unavailable.
          "Information verified as of —" is worse than silence: it looks like a
          fact with a missing value rather than an unanswered question.
        */}
        {knowledgeVerifiedAt ? (
          <p className="px-2 pt-1 text-caption text-ink-subtle">
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
          'hover:bg-surface-sunken',
          open && 'bg-surface-sunken'
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
            'inline-block shrink-0 text-ink-subtle transition-transform duration-fast ease-out-soft',
            open && 'rotate-90'
          )}
        >
          ›
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-medium text-ink">{facility.name}</span>
          <span className="block truncate text-caption text-ink-subtle">{facility.subLabel}</span>
        </span>
      </button>

      {open ? (
        <div id={panelId} className="mt-1 space-y-1 pb-1 pl-4">
          <ul className="space-y-1">
            {facility.questions.map((question) => (
              <li key={question}>
                {/*
                  The departure-board treatment: navy ground, amber chevron —
                  matching `SuggestedQuestions`' `empty` variant, because these
                  are the same affordance in a different place and two different
                  looks for one action is a thing to explain rather than a thing
                  to use.

                  Amber on navy is the pairing that colour is for; on a light
                  surface it measures 2.03:1. tests/contrast.test.ts asserts both.
                */}
                <button
                  type="button"
                  onClick={() => onAsk(question)}
                  disabled={busy}
                  className={cn(
                    'flex min-h-touch w-full items-start gap-2 rounded-md px-3 py-2 text-left',
                    'bg-navy text-caption font-medium text-ink-inverse',
                    'transition-colors duration-fast ease-out-soft hover:bg-navy-deep',
                    'disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                >
                  <span aria-hidden="true" className="shrink-0 text-amber-board">
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
