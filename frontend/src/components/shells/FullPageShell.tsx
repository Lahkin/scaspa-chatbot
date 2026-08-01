import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ChatCore } from '@/components/chat/ChatCore';
import { ChatSessionProvider, useChatSessionContext } from '@/features/chat/ChatSessionContext';
import { IconButton, Sheet } from '@/components/ui';
import { AboutScaspa } from '@/components/about/AboutScaspa';
import { useHealth } from '@/features/chat/queries';
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
export function FullPageShell() {
  // The provider wraps the sidebar, `ChatCore` and the source panel: a chip
  // rendered inside the transcript has to open a panel that is its sibling, and
  // a starter question in the sidebar has to send through the same path.
  return (
    <ChatSessionProvider>
      <FullPageShellInner />
    </ChatSessionProvider>
  );
}

function FullPageShellInner() {
  const {
    entries,
    highlighted,
    setHighlighted,
    scrollTo,
    panelOpen,
    setPanelOpen,
    state,
    busy,
    send,
    startNewConversation,
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
  const health = useHealth();

  const hasConversation = state.messages.length > 0;

  /**
   * Unique citations across the whole conversation.
   *
   * `entries` from the context is the *latest answer's* sources, which is what
   * the panel shows. The sidebar count is a different question — "how much has
   * this conversation been sourced from" — so it is computed over every message
   * and deduplicated by `kb_id`. Counting the latest answer's entries instead
   * would make the number drop when a follow-up cites fewer rows, which reads
   * as sources being lost.
   */
  const sourceCount = new Set(
    state.messages.flatMap((message) => (message.citations ?? []).map((c) => c.kb_id))
  ).size;

  const sidebar = (
    <Sidebar
      onAsk={(question) => void send(question)}
      onNewConversation={startNewConversation}
      onOpenSources={() => setPanelOpen(true)}
      onOpenAbout={() => setAboutOpen(true)}
      sourceCount={sourceCount}
      knowledgeVerifiedAt={health?.index.kb_updated_at ?? null}
      busy={busy}
      hasConversation={hasConversation}
      collapsed={railCollapsed}
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
      <header className="shrink-0 border-b border-neutral-300 bg-surface">
        <div className="flex items-center gap-2 px-4 py-2">
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
              <span aria-hidden="true">☰</span>
            </IconButton>
          </span>

          {/* Redundant beside the sidebar's own lockup, so it stands down there. */}
          <span className="lg:hidden">
            <ScaspaMark />
          </span>

          <span className="flex-1" />

          {state.messages.length > 0 && (
            <button
              type="button"
              onClick={startNewConversation}
              className="min-h-touch shrink-0 rounded-md px-2 text-caption font-medium text-ink-muted underline hover:text-ink lg:hidden"
            >
              Start again
            </button>
          )}

          {/* Sources are reachable from the header below xl, where the panel is
              an overlay. At xl it is docked and permanently visible — two ways
              to reach the same panel is one too many. */}
          <span className="xl:hidden">
            <IconButton label="Show sources" variant="ghost" onClick={() => setPanelOpen(true)}>
              <span aria-hidden="true">⌸</span>
            </IconButton>
          </span>

          {/*
            "Talk to a person" is not a fallback tucked into a footer. Someone who
            has decided the assistant cannot help them has already spent patience
            they did not have, so the way out is on screen from the start.
          */}
          <a
            href={SCASPA_PHONE_HREF}
            className="hidden min-h-touch shrink-0 items-center rounded-md border border-border-strong px-3 text-small font-medium text-blue-700 hover:bg-blue-50 sm:inline-flex"
          >
            Talk to a person
          </a>
          <a
            href={SCASPA_PHONE_HREF}
            aria-label="Talk to a person — call SCASPA"
            className="inline-flex size-touch-min shrink-0 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 sm:hidden"
          >
            <span aria-hidden="true">☎</span>
          </a>
        </div>
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
        <main id="main" lang="en" className="min-w-0 flex-1">
          <ChatCore />
        </main>

        {/* Docked sources at xl only. Below that the sidebar has the width, and
            a third column would leave the conversation unreadable. */}
        <aside
          aria-label="Sources"
          className="hidden w-80 shrink-0 border-l border-border bg-surface-muted xl:block"
        >
          <SourcePanel
            entries={entries}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            scrollTo={scrollTo}
          />
        </aside>
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
          onNewConversation={startNewConversation}
          onOpenSources={() => setPanelOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
          sourceCount={sourceCount}
          knowledgeVerifiedAt={health?.index.kb_updated_at ?? null}
          busy={busy}
          hasConversation={hasConversation}
          onNavigate={() => setDrawerOpen(false)}
        />
      </SidebarDrawer>

      {/* Sources as an overlay below xl. Same component as the docked panel, so
          the two placements cannot drift apart. `Sheet` is a bottom sheet below
          `md` and a right-hand panel from `md` up, which is exactly the split
          the table in this file's docstring calls for. */}
      <div className="xl:hidden">
        <Sheet open={panelOpen} onClose={() => setPanelOpen(false)} title="Sources">
          <SourcePanel
            headed={false}
            entries={entries}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            scrollTo={scrollTo}
          />
        </Sheet>
      </div>

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
