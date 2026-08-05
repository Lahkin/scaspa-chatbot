import { useEffect } from 'react';
import { ChatCore } from '@/components/chat/ChatCore';
import { ChatSessionProvider, useChatSessionContext } from '@/features/chat/ChatSessionContext';
import { Icon, IconButton, Sheet } from '@/components/ui';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { useVesselPositions } from '@/features/ops/queries';
import { config } from '@/lib/config';
import { ScaspaMark } from './ScaspaMark';
import { HealthBanner } from './HealthBanner';
import { SourcePanel } from './SourcePanel';

/**
 * The embedded widget: a 380 × 600 panel inside an iframe on scaspa.com.
 *
 * ### It gets no styling from the parent, and that is the point
 *
 * An iframe is a separate document. None of scaspa.com's CSS reaches in, and none
 * of ours leaks out — which is the whole reason to embed this way rather than
 * injecting a div into someone else's page. The practical consequence is that this
 * component may assume **nothing** about its surroundings and must bring its own
 * background, its own font and its own box. It does: `bg-surface` is set here
 * explicitly rather than inherited, because inside an iframe there is nothing to
 * inherit from.
 *
 * ### 380 × 600, but capped
 *
 * `w-widget h-widget` are the embed contract — `public/embed.js` creates an iframe
 * of exactly that size. `max-w-full max-h-dvh` sit alongside them so that if the
 * route is ever opened directly on a 320px phone, or the host page constrains the
 * frame, the box shrinks instead of forcing a sideways scroll. A fixed size that
 * cannot shrink is a horizontal scrollbar waiting for a narrow screen.
 *
 * ### Closing
 *
 * The widget cannot close itself — it does not own the iframe. It posts a message
 * and the host removes it. The target origin is the configured SCASPA origin and
 * **never `'*'`**: a wildcard would broadcast to whatever page happened to embed
 * us, which is exactly the thing an allow-list is for.
 */
export function WidgetShell() {
  // The provider wraps both `ChatCore` and the source panel, because a chip
  // rendered inside the transcript has to open a panel that is its sibling.
  return (
    <ChatSessionProvider>
      <WidgetShellInner />
    </ChatSessionProvider>
  );
}

function WidgetShellInner() {
  const { entries, grounding, highlighted, setHighlighted, scrollTo, panelOpen, setPanelOpen } =
    useChatSessionContext();

  /*
   * The one thing the widget keeps from the sidebar.
   *
   * Same query the full-page shell uses, so the two agree and React Query
   * serves it once. Null while it resolves, and the badge is then absent rather
   * than guessed at — a provenance claim nothing behind it supports is worse
   * than none.
   */
  const { data: positions } = useVesselPositions();
  const opsSource = positions?.source ?? null;

  const close = () => {
    // Guard the same-window case: opened directly rather than embedded, there is
    // no parent to tell, and posting to ourselves would be noise.
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'scaspa:widget:close' }, config.embedAllowedOrigin);
  };

  /**
   * Escape closes the widget, from inside the frame.
   *
   * The embed loader also listens for Escape, but that listener is on the *parent*
   * document — and once the panel opens, focus is inside the iframe, so the
   * parent never sees the key. A keyboard user pressing Escape in the assistant
   * would have nothing happen at all, which is the first thing they will try.
   *
   * Skipped while the source sheet is open: Escape there belongs to the sheet,
   * and closing the whole widget instead would be a surprising amount of
   * dismissal for one key.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  return (
    /*
     * The frame — §2.3.
     *
     * `--surface-1`, a 1px hairline and a 16px radius. It is `surface-1` and not
     * `surface-2` on purpose: inside a host page this panel is the main content
     * column, not a card, and the provenance cards that appear in it are
     * `surface-2` and have to stay a step lighter than what they sit on.
     *
     * `w-widget h-widget` are the embed contract — `public/embed.js` creates an
     * iframe of exactly 380 × 600, which sits inside the handoff's 380–560 wide
     * by 480-minimum-high range. `max-w-full max-h-dvh` sit alongside so a
     * directly-opened route on a 320px phone shrinks instead of forcing a
     * sideways scroll.
     */
    <div className="flex h-widget max-h-dvh w-widget max-w-full flex-col overflow-hidden rounded-panel border border-border bg-surface-1 text-ink">
      <HealthBanner />

      {/*
        The header — 52px, `0 16px`, one bottom hairline.

        It used to carry four controls and two hairlines: a `border-b` plus a
        separate 1px horizon div under it, which drew the divider twice.
      */}
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
        <ScaspaMark />

        {/*
          ── THE PROVENANCE BADGE MOVES HERE WHEN THE SIDEBAR GOES ────────────
          §2.3. Embedding drops the sidebar, and with it the data-source status
          card — so the source-kind badge moves into the widget header instead.
          "Embedding is not a reason to lose the one thing that says whether the
          figures are real."
        */}
        {opsSource ? (
          <span className="shrink-0">
            <ProvenanceBadge kind="source" value={opsSource.kind} />
          </span>
        ) : null}

        {/*
          ── THE ONE SECONDARY ACTION THAT SURVIVES, AND WHY ──────────────────
          §2.3 drops "secondary actions" from this header, and the sources
          button and the phone link went with them: a citation chip already
          opens the source panel, and the escalation block on every refusal
          already carries the number, so both were second routes to something
          reachable.

          The close button is different, and it is kept as a deliberate
          deviation. `public/embed.js` sets `launcher.style.display = 'none'`
          while the panel is open, so the host's own control is not on screen to
          close it again. Escape is handled below, but a pointer user with no
          launcher and no close button has no way out of the panel at all.
        */}
        <IconButton label="Close the assistant" variant="ghost" onClick={close}>
          <Icon name="x" size={16} />
        </IconButton>
      </header>

      {/* min-h-0, for the same reason as the full-page shell: without it the
          transcript never scrolls and the composer is pushed out of the frame. */}
      <main id="main" className="min-h-0 flex-1">
        <ChatCore variant="widget" />
      </main>

      {/* An internal sheet. `Sheet` is `position: fixed`, and inside an iframe the
          containing block is the iframe's own viewport — so "full screen" here
          means 380 × 600 and the sheet stays inside the widget. It also never
          reaches the `sm` breakpoint at 380px wide, so it is always a bottom
          sheet, never a side panel. */}
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
  );
}
