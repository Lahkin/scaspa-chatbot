import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ChatCore } from '@/components/chat/ChatCore';
import { ChatSessionProvider, useChatSessionContext } from '@/features/chat/ChatSessionContext';
import { Icon, IconButton, Sheet } from '@/components/ui';
import { AboutScaspa } from '@/components/about/AboutScaspa';
import {
  useMarineAdvisories,
  useOperatorProfile,
  useVesselPositions,
} from '@/features/ops/queries';
import { SCASPA_PHONE_HREF, ScaspaMark } from './ScaspaMark';
import { HealthBanner } from './HealthBanner';
import { Sidebar } from './Sidebar';
import { SidebarDrawer } from './SidebarDrawer';
import { SourcePanel } from './SourcePanel';

/**
 * The standalone chat page.
 *
 * **Designed at 390px first**, then widened. Not a slogan — what follows *is* the
 * mobile layout, and every desktop affordance is a breakpoint addition on top.
 * Built the other way round, the phone layout becomes a squeezed desktop layout.
 *
 * ### `100dvh`, never `100vh`
 *
 * `h-dvh`, not `h-screen`. On iOS Safari `100vh` is the height of the viewport
 * *with the toolbar hidden*, which is taller than what is actually visible while
 * the toolbar is showing. A `100vh` column therefore puts its bottom edge — the
 * composer — behind the browser chrome, and the user cannot type. It looks correct
 * on a desktop browser and on Android, and it fails for every cruise passenger on
 * an iPhone. `dvh` tracks the *dynamic* viewport and shrinks when the toolbar and
 * the software keyboard appear.
 *
 * ### Three zones competing for one width
 *
 * Sidebar, conversation, sources. Resolved by giving the conversation priority
 * and letting the other two dock only once there is room to spare:
 *
 * | Viewport      | Sidebar        | Sources          |
 * | ------------- | -------------- | ---------------- |
 * | ≥ 1280 (`xl`) | docked, 260px  | docked, 320px    |
 * | 1024–1279     | docked, 260px  | right overlay    |
 * | 768–1023      | drawer         | right overlay    |
 * | < 768         | drawer         | bottom sheet     |
 *
 * The middle column **keeps a readable measure at every size** — `ChatCore`
 * centres its content on `max-w-measure` rather than filling whatever the
 * sidebar leaves behind. A 900px line of text is harder to read than a 600px
 * one, so the extra width becomes margin, not measure.
 *
 * ### Why the composer is not `position: sticky`
 *
 * It does not need to be. The document never scrolls: the shell is a fixed `dvh`
 * flex column and only the transcript inside `ChatCore` scrolls. Sticky
 * positioning inside a scrolling document is the arrangement that breaks when a
 * software keyboard opens; this one cannot, because there is nothing to scroll the
 * composer out of.
 */
export interface FullPageShellProps {
  /**
   * The screen title in the header row. Defaults to the chat screen's.
   *
   * `| undefined` on every prop here, not just `?`: `exactOptionalPropertyTypes`
   * is on, so an omitted key and an explicit `undefined` are different types and
   * a wrapper forwarding its own optional props needs the second.
   */
  title?: string | undefined;
  /**
   * The main column's content. **Absent means chat**, which is what every
   * caller meant before the operations screens moved in here.
   *
   * When it is present the source panel goes with it — docked column, overlay
   * sheet and header button alike. Sources are citations, a tariff table has
   * none, and an empty "Sources" panel beside one implies the rows were cited.
   */
  children?: ReactNode | undefined;
  /**
   * What a sidebar starter question does. Defaults to sending it into this
   * page's own conversation.
   *
   * A screen with no transcript has to override it, or the question is sent
   * somewhere the user cannot see it. `OpsShell` passes the navigating version.
   */
  onAsk?: ((question: string) => void) | undefined;
}

export function FullPageShell({ title, children, onAsk }: FullPageShellProps = {}) {
  // The provider wraps the sidebar, `ChatCore` and the source panel: a chip
  // rendered inside the transcript has to open a panel that is its sibling, and
  // a starter question in the sidebar has to send through the same path.
  //
  // It wraps the operations screens too, even though they hold no conversation:
  // the sidebar reads `recordedQuestions` off the transcript, and a provider per
  // route would give each screen its own empty one.
  return (
    <ChatSessionProvider>
      <FullPageShellInner title={title} onAsk={onAsk}>
        {children}
      </FullPageShellInner>
    </ChatSessionProvider>
  );
}

function FullPageShellInner({ title, children, onAsk }: FullPageShellProps) {
  const {
    entries,
    grounding,
    highlighted,
    setHighlighted,
    scrollTo,
    panelOpen,
    setPanelOpen,
    state,
    send,
  } = useChatSessionContext();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /*
   * The docked rail's width, and why it is not remembered.
   *
   * `frontend/CLAUDE.md` rule 5 permits exactly one key in exactly one storage:
   * `conversation_id` in `sessionStorage`. A collapsed-sidebar preference is
   * not that key, so it lives in component state and resets on reload.
   *
   * That is a real cost — someone who prefers the narrow rail sets it again
   * each visit — and it is the same trade the high-contrast switch made in
   * `/settings`. The difference here is that the cost is one click on a control
   * that is permanently on screen, rather than an accessibility setting the
   * user may not find twice.
   */
  const [railCollapsed, setRailCollapsed] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();

  /*
   * Where this session's operational figures come from — spec board 06.
   *
   * Read from `/api/ops/positions` because every `/api/ops/*` response carries
   * the same `DataSource`, and positions is the cheapest of them: it returns
   * the complete set, which in production is empty. One cached query answers
   * the question for the whole shell rather than each panel asking separately.
   *
   * A failure leaves this null and the card simply absent. The alternative —
   * assuming a kind when the request did not answer — would put a provenance
   * claim on screen that nothing behind it supports, which is the one thing
   * this card exists to prevent.
   */
  const { data: positions } = useVesselPositions();
  const opsSource = positions?.source ?? null;

  /** The demonstration profile. Null in production, and then no row at all. */
  const { data: operator } = useOperatorProfile();

  /*
   * The advisory count, from the server.
   *
   * `total` and never `advisories.length`. A client-side recount drops to zero
   * under a filter and lies, and on this particular figure a zero would read as
   * an all-clear — the one thing §6.9 spends a whole panel refusing to say.
   */
  const { data: advisories } = useMarineAdvisories();
  const advisoryCount = advisories?.total ?? 0;

  /*
   * The questions asked in this session, newest first — the sidebar's
   * "Recorded questions" list.
   *
   * Read off the transcript rather than kept in a second place, and
   * deduplicated: asking the same thing twice records one row, because the list
   * is a record of what was asked and not a log of keystrokes. It never touches
   * storage — `frontend/CLAUDE.md` rule 5 — so it ends with the tab, which is
   * the same lifetime as the conversation it came from.
   */
  const recordedQuestions = [
    ...new Set(
      state.messages
        .filter((message) => message.role === 'user')
        .map((message) => message.text)
        .reverse()
    ),
  ];

  /**
   * Chat is the default because it was the only case until the operations
   * screens moved into this shell. `children` is the discriminator rather than a
   * `variant` prop: a screen either supplies its own main column or it does not,
   * and there is no third state to get wrong.
   */
  const isChat = children === undefined;
  const ask = onAsk ?? ((question: string) => void send(question));

  const sidebar = (
    <Sidebar
      onAsk={ask}
      recordedQuestions={recordedQuestions}
      dataSource={opsSource}
      profile={operator?.profile ?? null}
      advisoryCount={advisoryCount}
      onToggleCollapsed={() => setRailCollapsed((value) => !value)}
    />
  );

  return (
    // h-dvh + overflow-hidden: the document never scrolls, only the transcript does.
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-ink">
      {/*
        The skip link lands on the conversation, past the sidebar.
        A skip link that drops you into the navigation has skipped nothing —
        and with a sidebar of four expandable groups in front of the composer,
        it is now doing real work rather than being a formality.

        It lives here rather than in the root layout because `/chat` is
        self-chromed and never renders the root's chrome, so until now this route
        had no skip link at all.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-touch focus:items-center focus:rounded-sm focus:bg-blue-600 focus:px-4 focus:text-ink-inverse"
      >
        Skip to the conversation
      </a>

      <HealthBanner />

      {/*
        Flat, and deliberately so.

        The contrast this layout is built on is the navy rail against the white
        conversation column. Putting a gradient on the header as well would
        surround the transcript with chrome on two sides and destroy the very
        distinction that makes the column read as the content.

        `neutral-300` rather than the usual `--color-border` (neutral-200): the
        header is now the only thing separating the white column from the navy
        rail beside it, so its edge does real work instead of hinting.
      */}
      {/*
        The header row — handoff §2.1, "Main column".

        60px, `0 28px`, a bottom hairline. The screen title takes `flex: 1`;
        the right-hand end carries the optional advisory pill and then 32px
        icon buttons. It is flat: depth in this product is surface lightness,
        and a header that shaded itself would be the only gradient inside the
        frame.
      */}
      <header className="flex h-header shrink-0 items-center gap-4 border-b border-border px-4 lg:px-7">
        {/* The hamburger only exists where the sidebar is a drawer. */}
        <span className="lg:hidden">
          <IconButton
            ref={hamburgerRef}
            label="Open navigation"
            variant="ghost"
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="panel" size={18} />
          </IconButton>
        </span>

        {/* The compact lockup stands in for the sidebar where there isn't one. */}
        <span className="lg:hidden">
          <ScaspaMark />
        </span>

        <h1 className="hidden min-w-0 flex-1 truncate text-h3 font-semibold text-ink lg:block">
          {title ?? 'New question'}
        </h1>
        <span className="flex-1 lg:hidden" />

        {/*
          The advisory pill. Present only when there is something published —
          a pill reading "0 advisories" is furniture, and worse, it reads as an
          all-clear, which §6.9 spends a whole panel refusing to say.
        */}
        {advisoryCount > 0 ? (
          <a
            href="/ops"
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-2 rounded-button px-3',
              'border border-caution-edge bg-caution-tint',
              'text-label font-medium text-caution'
            )}
          >
            <Icon name="megaphone" size={16} />
            <span className="tabular">{advisoryCount}</span>{' '}
            {advisoryCount === 1 ? 'advisory' : 'advisories'}
          </a>
        ) : null}

        {/* Sources are reachable from the header below xl, where the panel is
            an overlay. At xl it is docked and permanently visible — two ways
            to reach the same panel is one too many. */}
        {isChat ? (
          <span className="xl:hidden">
            <IconButton label="Show sources" variant="ghost" onClick={() => setPanelOpen(true)}>
              <Icon name="file" size={16} />
            </IconButton>
          </span>
        ) : null}

        {/*
          "Talk to a person" is not a fallback tucked into a footer. Someone who
          has decided the assistant cannot help them has already spent patience
          they did not have, so the way out is on screen from the start.
        */}
        {/*
          44px under a thumb, 32px on a desktop — §7's touch minimum applied at
          ≤640px, the same `h-11 sm:h-…` treatment `Button`, `Input`, `IconButton`
          and the toolbar fields already carry.

          It was a flat 32px at every width. That was one control on one route
          while only `/chat` used this shell; moving four operations screens in
          here would have propagated it to five, and `npm run check:responsive`
          reports it at 320 and 390 on every one of them.
        */}
        <a
          href={SCASPA_PHONE_HREF}
          aria-label="Telephone the Authority"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-button border border-border text-ink-muted hover:bg-surface-3 hover:text-ink sm:size-8"
        >
          <Icon name="phone" size={16} />
        </a>
      </header>

      {/* `min-h-0` is load-bearing. Without it a flex child refuses to shrink
          below its content height, the transcript's `overflow-y-auto` never
          engages, the whole page grows instead, and the composer leaves the
          screen. It is the single most common way this layout is got wrong. */}
      <div className="flex min-h-0 flex-1">
        {/* Docked from lg. Its own landmark, so a screen-reader user can jump
            straight to it — and skip past it, via the link above. */}
        {/*
          The animated rail.
          `transition-width` is width-only and token-timed, so
          `prefers-reduced-motion` collapses it to nothing along with every
          other transition — see the utility in tokens.css.

          `overflow-hidden` matters during the animation: the expanded panel's
          260px of content is still laid out for a frame or two while the box
          narrows, and without it the text spills across the transcript.
        */}
        <div
          className={cn(
            'hidden shrink-0 overflow-hidden border-r border-border lg:block',
            'transition-width',
            railCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
          )}
        >
          {sidebar}
        </div>

        {/*
          `lang="en"` on the conversation, and it is not redundant.

          The interface language is now selectable, and choosing Spanish sets
          `<html lang="es">` so a screen reader speaks the chrome with Spanish
          pronunciation. The assistant's answers stay English by rule — the
          knowledge base is English and CLAUDE.md rule 10 requires every figure
          to appear verbatim in the retrieved chunk, which no translation layer
          can promise. Without this attribute those English answers inherit the
          root's `es` and get read aloud with Spanish phonemes, which is close to
          unusable and entirely invisible to anyone testing with their eyes.

          See `features/i18n/locales.ts` for the full reasoning.
        */}
        {/*
          `overflow-y-auto` for an operations screen and NOT for chat.

          The shell is a fixed `dvh` column that never scrolls, and `ChatCore`
          owns its own scrolling transcript — giving this element a scrollbar too
          would nest one inside another. A tariff table has no such inner region,
          so without this the rows below the fold are simply unreachable.
        */}
        <main
          id="main"
          lang="en"
          className={cn('min-w-0 flex-1', isChat ? undefined : 'overflow-y-auto')}
        >
          {children ?? <ChatCore />}
        </main>

        {/*
          Docked sources at xl only. Below that the sidebar has the width, and a
          third column would leave the conversation unreadable.

          ── AND ONLY WHEN THERE IS EVIDENCE ────────────────────────────────
          The column used to render whatever happened — so a reader who had not
          yet asked anything was given a third of a wide screen occupied by the
          words "Nothing to show yet". A permanent empty panel does not read as
          "sources will appear here", it reads as a part of the product that is
          broken.

          The conversation takes that width until an answer earns it. That does
          mean the layout moves once, when the first cited answer lands, and
          that movement is the point: it is the evidence arriving. It happens
          under an answer the reader is about to start reading rather than under
          their cursor, and only once per conversation.
        */}
        {isChat && entries.length > 0 ? (
          <aside
            aria-label="Sources"
            className="hidden w-80 shrink-0 border-l border-border bg-surface-muted xl:block"
          >
            <SourcePanel
              entries={entries}
              grounding={grounding}
              highlighted={highlighted}
              onHighlight={setHighlighted}
              scrollTo={scrollTo}
            />
          </aside>
        ) : null}
      </div>

      {/* The drawer, below lg. Same `sidebar` element as the docked rail, so the
          two cannot drift. */}
      <SidebarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        returnFocusTo={hamburgerRef}
        id={drawerId}
      >
        {/* `onNavigate` closes the drawer after any action that took the user
            somewhere — sending a question, clearing the conversation, opening a
            panel. Docked, this prop is absent and nothing closes. */}
        <Sidebar
          onAsk={(question) => void send(question)}
          recordedQuestions={recordedQuestions}
          dataSource={opsSource}
          profile={operator?.profile ?? null}
          advisoryCount={advisoryCount}
          onNavigate={() => setDrawerOpen(false)}
        />
      </SidebarDrawer>

      {/* Sources as an overlay below xl. Same component as the docked panel, so
          the two placements cannot drift apart. `Sheet` is a bottom sheet below
          `md` and a right-hand panel from `md` up, which is exactly the split
          the table in this file's docstring calls for. */}
      {isChat ? (
        <div className="xl:hidden">
          <Sheet open={panelOpen} onClose={() => setPanelOpen(false)} title="Sources">
            <SourcePanel
              headed={false}
              entries={entries}
              grounding={grounding}
              highlighted={highlighted}
              onHighlight={setHighlighted}
              scrollTo={scrollTo}
            />
          </Sheet>
        </div>
      ) : null}

      {/*
        About SCASPA, as a sheet rather than a route.

        A hurried user who wonders what SCASPA is should not lose the answer they
        were reading to find out. A sheet keeps the conversation mounted behind
        it; a navigation event would unmount it and there is no history to get it
        back from. The same content is at `/about-scaspa` for deep links.
      */}
      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title="About SCASPA">
        <AboutScaspa />
      </Sheet>
    </div>
  );
}
