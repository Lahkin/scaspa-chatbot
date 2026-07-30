import { ChatCore } from '@/components/chat/ChatCore';
import { ChatSessionProvider, useChatSessionContext } from '@/features/chat/ChatSessionContext';
import { IconButton, Sheet } from '@/components/ui';
import { config } from '@/lib/config';
import { SCASPA_PHONE_HREF, ScaspaMark } from './ScaspaMark';
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
  const { entries, highlighted, setHighlighted, scrollTo, panelOpen, setPanelOpen } =
    useChatSessionContext();

  const close = () => {
    // Guard the same-window case: opened directly rather than embedded, there is
    // no parent to tell, and posting to ourselves would be noise.
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'scaspa:widget:close' }, config.embedAllowedOrigin);
  };

  return (
    <div className="flex h-widget max-h-dvh w-widget max-w-full flex-col overflow-hidden bg-surface text-ink">
      {/* Compact header: one row, 44px targets, no strapline. Sixty pixels of a
          600px panel is a tenth of the conversation. */}
      <HealthBanner />

      <header className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        <ScaspaMark compact />

        <span className="flex-1" />

        <IconButton label="Show sources" variant="ghost" onClick={() => setPanelOpen(true)}>
          <span aria-hidden="true">☰</span>
        </IconButton>

        <a
          href={SCASPA_PHONE_HREF}
          aria-label="Talk to a person — call SCASPA"
          className="inline-flex size-touch-min shrink-0 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50"
        >
          <span aria-hidden="true">☎</span>
        </a>

        <IconButton label="Close the assistant" variant="ghost" onClick={close}>
          <span aria-hidden="true">✕</span>
        </IconButton>
      </header>

      {/* min-h-0, for the same reason as the full-page shell: without it the
          transcript never scrolls and the composer is pushed out of the frame. */}
      <main id="main" className="min-h-0 flex-1">
        <ChatCore />
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
          highlighted={highlighted}
          onHighlight={setHighlighted}
          scrollTo={scrollTo}
        />
      </Sheet>
    </div>
  );
}
