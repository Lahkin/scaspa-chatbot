import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useStrings } from '@/features/i18n';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sidebar as a left-anchored drawer, below `lg`.
 *
 * ## Why this is not `Sheet`
 *
 * `Sheet` is the right primitive for the source panel and the About panel, and
 * it is reused for both. It is the wrong one here for two reasons that are not
 * cosmetic:
 *
 * 1. **It anchors to the bottom, then the right.** A navigation drawer that
 *    slides in from the right and sits over the conversation reads as a panel
 *    about the conversation, not as the navigation for the page.
 * 2. **It renders a `<h2>` title bar.** This drawer's first element is the
 *    lockup, and a "Navigation" heading above a logo is a label nobody needs.
 *
 * Everything `Sheet` gets right is reproduced here rather than skipped — focus
 * trap, Escape, focus restoration to the trigger, body scroll lock — because
 * those are the parts that are easy to omit and impossible to notice missing
 * unless you navigate by keyboard.
 *
 * Focus returns to **the hamburger that opened it**, passed in as a ref rather
 * than recovered from `document.activeElement`. Recovering it works right up
 * until the drawer is closed by something other than the user — a route change,
 * a send — at which point `activeElement` is whatever is focused now, and focus
 * lands somewhere arbitrary.
 */
export function SidebarDrawer({
  open,
  onClose,
  returnFocusTo,
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The hamburger. Focus goes back here on close. */
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  /** Matches the hamburger's `aria-controls`. */
  id: string;
  children: ReactNode;
}) {
  const t = useStrings();
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const trapFocus = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    // Captured on open, not read on close. The hamburger is what opened this,
    // and by cleanup time the ref could legitimately point elsewhere — a resize
    // past `lg` unmounts it. Capturing is also what the exhaustive-deps rule
    // asks for, and it is asking for the right thing.
    const trigger = returnFocusTo.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      trapFocus(event);
    };
    document.addEventListener('keydown', onKeyDown);

    // Into the panel, so the next Tab lands inside rather than behind it.
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, onClose, trapFocus, returnFocusTo]);

  if (!open) return null;

  return (
    // `lg:hidden` as well as the open check: if the viewport widens while the
    // drawer is open, the docked sidebar appears and this must not be a second
    // copy of it floating over the conversation.
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t.shell.closeNavigation}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />

      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={t.shell.navigation}
        className={cn(
          // `max-w-full` rather than a percentage: 260px already fits a 320px
          // screen, and this only has to stop the drawer forcing a sideways
          // scroll if the token ever grows.
          'absolute inset-y-0 left-0 flex w-sidebar max-w-full flex-col shadow-sheet',
          reduced ? '' : 'motion-safe:animate-in'
        )}
      >
        <div className="flex shrink-0 justify-end bg-surface-muted p-2">
          <IconButton label={t.shell.closeNavigation} onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
