import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { LogoLockup } from '@/components/brand/LogoLockup';
import { FACILITY_NAV, type FacilityNavItem } from '@/features/chat/facilities';
import { SCASPA_PHONE_LINES } from '@/lib/scaspa-facts';
import { useStrings } from '@/features/i18n';

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
  /**
   * Render the 64px rail instead of the full panel.
   *
   * Docked placements only. The drawer never passes this: a drawer that opens
   * to a strip of icons has spent an animation and a tap to show less than the
   * hamburger already did.
   */
  collapsed?: boolean;
  /**
   * Toggle between the two widths. Absent means the sidebar cannot collapse,
   * and the control is not rendered rather than rendered inert.
   */
  onToggleCollapsed?: (() => void) | undefined;
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
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const navId = useId();
  const t = useStrings();

  /*
   * Which facility groups are open, held here rather than inside each group.
   *
   * It moved up for one reason: tapping a facility on the collapsed rail has to
   * both widen the sidebar and open that group, and a component cannot open a
   * disclosure that owns its own state. Kept as a list rather than a single id
   * so the existing behaviour survives — several groups may be open at once,
   * and turning this into an accordion would quietly take that away.
   */
  const [openIds, setOpenIds] = useState<readonly string[]>([]);

  const toggleGroup = (id: string) =>
    setOpenIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );

  /*
   * A tap on a collapsed facility means "show me this one".
   *
   * Widening without opening the group answers with a list of four names the
   * user has just picked from; opening without widening answers with three
   * questions in a 64px column. So it does both.
   */
  const revealFacility = (id: string) => {
    setOpenIds((current) => (current.includes(id) ? current : [...current, id]));
    onToggleCollapsed?.();
  };

  if (collapsed) {
    return (
      <CollapsedRail
        navId={navId}
        sourceCount={sourceCount}
        hasConversation={hasConversation}
        onNewConversation={onNewConversation}
        onOpenSources={onOpenSources}
        onSelectFacility={revealFacility}
        onExpand={onToggleCollapsed}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-grad-sidebar">
      <div className="flex shrink-0 items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          {/* `reversed` because the badge is navy-on-transparent and would vanish
              here. It currently declines to draw the badge at all rather than
              recolouring it — see LogoLockup. */}
          <LogoLockup size="md" variant="reversed" tagline="Ports and travel, St. Kitts" />
        </div>

        {/*
          The collapse control lives beside the lockup, not floating over the
          content, so it does not cover a nav item and does not move when the
          list scrolls.

          `aria-expanded` + `aria-controls` describe the region it operates, so
          a screen-reader user is told the state rather than left to infer it
          from an arrow. The label says what the button will DO — "Collapse
          navigation" — because a label describing the current state reads as an
          instruction to half of everyone who meets it.
        */}
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={true}
            aria-controls={navId}
            className={cn(
              'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
              'text-on-navy-muted hover:bg-neutral-0/10 hover:text-on-navy-primary',
              'transition-colors duration-fast ease-out-soft'
            )}
          >
            <span aria-hidden="true">«</span>
            <span className="sr-only">{t.sidebar.collapseNav}</span>
          </button>
        ) : null}
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
          {t.sidebar.newConversation}
        </button>
      </div>

      {/* The scrolling middle. `min-h-0` so it shrinks rather than pushing the
          footer off the bottom — the same trap as the transcript column. */}
      <nav
        id={navId}
        aria-label="SCASPA facilities"
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      >
        <h2 className="px-1 pb-2 text-caption font-semibold tracking-wide text-on-navy-muted uppercase">
          {t.sidebar.askAbout}
        </h2>

        {/*
          `lang="en"` on the list, not on the `<nav>` — the heading above it is
          translated and this list is not.

          Facility names are proper nouns someone will read off a sign, and the
          starter questions are sent verbatim to an English-language retriever,
          so a translated question would match nothing and come back "I don't
          know" to a perfectly good question. Both therefore stay English at
          every locale, and the attribute is what stops a screen reader set to
          Spanish pronouncing "Basseterre Ferry Terminal" with Spanish phonemes.
        */}
        <ul className="space-y-1" lang="en">
          {FACILITY_NAV.map((facility) => (
            <li key={facility.id}>
              <FacilityGroup
                facility={facility}
                busy={busy}
                open={openIds.includes(facility.id)}
                onToggle={() => toggleGroup(facility.id)}
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
          <span>{t.sidebar.sourcesInConversation}</span>
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
          {t.sidebar.aboutScaspa}
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
          {t.sidebar.talkToPerson}
        </a>

        {/*
          Omitted, not faked, when health is unavailable.
          "Information verified as of —" is worse than silence: it looks like a
          fact with a missing value rather than an unanswered question.
        */}
        {knowledgeVerifiedAt ? (
          <p className="px-2 pt-1 text-caption text-on-navy-muted">
            {t.sidebar.verifiedAsOf}{' '}
            <time dateTime={knowledgeVerifiedAt}>{knowledgeVerifiedAt}</time>
          </p>
        ) : null}
      </div>

      {/*
        Settings, last and on its own.

        Its own bordered band rather than another row in the footer above,
        because it is the only thing in this sidebar that *leaves* — everything
        else asks a question, opens a panel or dials a phone. Grouping it with
        those would make it look like a fifth panel toggle, and the two-line
        treatment (label plus what is behind it) is what tells a hurried reader
        that "Language" and "Accessibility" are down there without making them
        four separate rail entries.

        ── AND IT IS AN `<a>`, NOT A `<Link>` ────────────────────────────────

        Deliberately, and this is the whole reason the component stays
        router-free. A TanStack `<Link>` reads the router from context; a
        privacy link tried here once and made `FullPageShell` un-renderable
        without one, breaking ten shell tests that had every right to expect
        otherwise. `shells.test.tsx` still renders the shell with a query client
        and nothing else.

        The cost of the plain anchor is a document load instead of a client-side
        transition. That cost is very close to zero here: `/settings` is outside
        `FullPageShell`, so the chat session provider unmounts on the way there
        either way, and the transcript is gone under both mechanisms. Paying a
        reload to keep ten tests and this component's independence is the right
        side of that trade.
      */}
      <div className="shrink-0 border-t border-on-navy-muted p-3">
        <a
          href="/settings"
          onClick={() => onNavigate?.()}
          className={cn(
            'group flex min-h-touch w-full items-center gap-3 rounded-md px-2 py-1.5',
            'text-on-navy-secondary hover:bg-neutral-0/10 hover:text-on-navy-primary',
            'transition-colors duration-fast ease-out-soft'
          )}
        >
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-on-navy-muted text-on-navy-muted"
          >
            ⚙
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-small font-medium text-on-navy-primary">
              {t.sidebar.settings}
            </span>
            <span className="block truncate text-caption text-on-navy-secondary">
              {t.sidebar.settingsHint}
            </span>
          </span>
          {/* Points off the panel, because this one goes somewhere. The facility
              chevrons point down when open; this never does. */}
          <span aria-hidden="true" className="shrink-0 text-on-navy-muted">
            ›
          </span>
        </a>
      </div>
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
  open,
  onToggle,
  onAsk,
}: {
  facility: FacilityNavItem;
  busy: boolean;
  /** Controlled: the parent owns this so the collapsed rail can open a group. */
  open: boolean;
  onToggle: () => void;
  onAsk: (question: string) => void;
}) {
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
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

/**
 * The 64px rail.
 *
 * ## Every destination survives the collapse
 *
 * Nothing is dropped, because a control that disappears when the rail narrows
 * is a control the user has to remember exists. The four facilities, the new
 * conversation button and the source count are all still here as targets; only
 * the words are gone, and one click brings them back.
 *
 * ## Glyphs are not labels
 *
 * Nobody reliably guesses "ferry terminal" from a boat, so every button carries
 * a real accessible name and a `title`, and the glyph is `aria-hidden`. A
 * screen reader hears "Basseterre Ferry Terminal" either way; the difference
 * between the two widths is entirely visual.
 *
 * ## The one number that stays visible
 *
 * The source count. It is the only figure in the sidebar that changes as the
 * conversation goes on, and it is the reason someone glances at the rail
 * without meaning to open it. It keeps the amber, because in this sidebar amber
 * means "quantity" — see the note at the top of this file.
 */
function CollapsedRail({
  navId,
  sourceCount,
  hasConversation,
  onNewConversation,
  onOpenSources,
  onSelectFacility,
  onExpand,
}: {
  navId: string;
  sourceCount: number;
  hasConversation: boolean;
  onNewConversation: () => void;
  onOpenSources: () => void;
  onSelectFacility: (id: string) => void;
  onExpand?: (() => void) | undefined;
}) {
  const t = useStrings();

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-1 bg-grad-sidebar py-3">
      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-controls={navId}
          className={cn(
            'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
            'text-on-navy-muted hover:bg-neutral-0/10 hover:text-on-navy-primary',
            'transition-colors duration-fast ease-out-soft'
          )}
        >
          <span aria-hidden="true">»</span>
          <span className="sr-only">{t.sidebar.expandNav}</span>
        </button>
      ) : null}

      <div aria-hidden="true" className="my-1 h-px w-8 shrink-0 bg-hairline-horizon" />

      {/*
        The primary action keeps its brand fill and its border at both widths —
        it is the same button, and a control that changes colour when a panel
        resizes reads as a different control. Brand blue on navy is 1.91:1, so
        the border is what makes its edge visible; see the expanded version.
      */}
      <button
        type="button"
        onClick={onNewConversation}
        disabled={!hasConversation}
        title={t.sidebar.newConversation}
        className={cn(
          'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
          'border border-on-navy-secondary bg-brand text-on-navy-primary',
          'transition-colors duration-fast ease-out-soft hover:bg-blue-700',
          'disabled:cursor-not-allowed disabled:border-on-navy-muted disabled:bg-transparent',
          'disabled:text-on-navy-muted'
        )}
      >
        <span aria-hidden="true">+</span>
        <span className="sr-only">{t.sidebar.newConversation}</span>
      </button>

      {/* Same landmark and same label as the expanded panel, so the collapse is
          invisible to anyone navigating by landmark. */}
      <nav
        id={navId}
        aria-label="SCASPA facilities"
        className="min-h-0 flex-1 overflow-y-auto pt-1"
      >
        {/* English for the same reason as the expanded list — these are place
            names, not phrases. See the note on the other `lang="en"` above. */}
        <ul className="flex flex-col items-center gap-1" lang="en">
          {FACILITY_NAV.map((facility) => (
            <li key={facility.id}>
              <button
                type="button"
                onClick={() => onSelectFacility(facility.id)}
                title={facility.name}
                className={cn(
                  'inline-flex size-touch-min items-center justify-center rounded-md',
                  'text-on-navy-secondary hover:bg-neutral-0/10 hover:text-on-navy-primary',
                  'transition-colors duration-fast ease-out-soft'
                )}
              >
                <span aria-hidden="true">{facility.glyph}</span>
                <span className="sr-only">{facility.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div aria-hidden="true" className="my-1 h-px w-8 shrink-0 bg-hairline-horizon" />

      <button
        type="button"
        onClick={onOpenSources}
        disabled={sourceCount === 0}
        title={`${t.sidebar.sourcesInConversation}: ${sourceCount}`}
        className={cn(
          'inline-flex size-touch-min shrink-0 flex-col items-center justify-center rounded-md',
          'text-on-navy-secondary hover:bg-neutral-0/10 hover:text-on-navy-primary',
          'disabled:cursor-not-allowed disabled:text-on-navy-muted disabled:hover:bg-transparent',
          'xl:hidden'
        )}
      >
        <span aria-hidden="true" className="text-caption leading-none">
          ⌸
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'text-caption leading-none font-semibold tabular',
            sourceCount > 0 ? 'text-on-navy-accent' : 'text-on-navy-muted'
          )}
        >
          {sourceCount}
        </span>
        <span className="sr-only">
          {t.sidebar.sourcesInConversation}: {sourceCount}
        </span>
      </button>

      <a
        href={SCASPA_PHONE_LINES[0].href}
        title={t.sidebar.talkToPerson}
        className={cn(
          'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
          'text-on-navy-primary hover:bg-neutral-0/10'
        )}
      >
        <span aria-hidden="true">☎</span>
        <span className="sr-only">{t.sidebar.talkToPerson}</span>
      </a>

      {/* Settings survives the collapse like every other destination — the rail
          drops words, never targets. A control that vanishes when the sidebar
          narrows is one the user has to remember exists. */}
      <a
        href="/settings"
        title={t.sidebar.settings}
        className={cn(
          'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
          'text-on-navy-secondary hover:bg-neutral-0/10 hover:text-on-navy-primary',
          'transition-colors duration-fast ease-out-soft'
        )}
      >
        <span aria-hidden="true">⚙</span>
        <span className="sr-only">{t.sidebar.settings}</span>
      </a>
    </div>
  );
}
