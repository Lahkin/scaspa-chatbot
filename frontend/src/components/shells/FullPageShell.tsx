import { useState } from 'react';
import { ChatCore } from '@/components/chat/ChatCore';
import { IconButton, Sheet } from '@/components/ui';
import { SCASPA_PHONE_HREF, ScaspaMark } from './ScaspaMark';
import { SourcePanel } from './SourcePanel';

/**
 * The standalone chat page.
 *
 * **Designed at 390px first**, then widened. Not a slogan — what follows *is* the
 * mobile layout, and every desktop affordance is a `lg:` addition on top. Built
 * the other way round, the phone layout becomes a squeezed desktop layout and the
 * docked source panel becomes a 200px column nobody can read.
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
 * ### Why the composer is not `position: sticky`
 *
 * It does not need to be. The document never scrolls: the shell is a fixed `dvh`
 * flex column and only the transcript inside `ChatCore` scrolls. Sticky
 * positioning inside a scrolling document is the arrangement that breaks when a
 * software keyboard opens; this one cannot, because there is nothing to scroll the
 * composer out of.
 */
export function FullPageShell() {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    // h-dvh + overflow-hidden: the document never scrolls, only the transcript does.
    <div className="flex h-dvh flex-col overflow-hidden bg-surface text-ink">
      <header className="shrink-0 border-b border-border bg-surface">
        <div className="flex items-center gap-2 px-4 py-2">
          <ScaspaMark />

          <span className="flex-1" />

          {/* Sources open in a bottom sheet below lg, where there is no room to
              dock them. Hidden at lg because the panel is permanently visible
              there — two ways to reach the same panel is one too many. */}
          <span className="lg:hidden">
            <IconButton label="Show sources" variant="ghost" onClick={() => setSourcesOpen(true)}>
              <span aria-hidden="true">☰</span>
            </IconButton>
          </span>

          {/*
            "Talk to a person" is not a fallback tucked into a footer. Someone who
            has decided the assistant cannot help them has already spent patience
            they did not have, so the way out is on screen from the start.

            Full label from sm up, dialling icon below it. The accessible name says
            the same thing either way, so a screen-reader user gets the sentence
            regardless of viewport.
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
        <main id="main" className="min-w-0 flex-1">
          <ChatCore />
        </main>

        {/* Docked source panel — wide screens only. `lg` (1024px) rather than
            `md`, because at 768px the column steals width the conversation needs
            more than the sources do. */}
        <aside
          aria-label="Sources"
          className="hidden w-80 shrink-0 border-l border-border bg-surface-muted lg:block"
        >
          <SourcePanel />
        </aside>
      </div>

      {/* The same panel below lg, as a bottom sheet. Same component, so the two
          placements cannot drift apart. */}
      <div className="lg:hidden">
        <Sheet open={sourcesOpen} onClose={() => setSourcesOpen(false)} title="Sources">
          <SourcePanel headed={false} />
        </Sheet>
      </div>
    </div>
  );
}
