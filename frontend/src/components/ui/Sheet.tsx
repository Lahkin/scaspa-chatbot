import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { IconButton } from './IconButton';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A bottom sheet on mobile, a side panel from about `sm` upward.
 *
 * One component rather than two, because they are the same thing: a dismissible
 * overlay owning focus. Only the transform and the edge it is anchored to differ,
 * and both are Tailwind breakpoints.
 *
 * Three things it has to get right, all of which are easy to skip:
 *
 * 1. **Focus is trapped while open** and restored to whatever opened it on close.
 *    Without restoration, a keyboard user is returned to the top of the document
 *    every time they close a panel.
 * 2. **Escape closes it**, and the backdrop is a real button so a screen reader
 *    is told it is dismissible rather than finding an inert `<div>`.
 * 3. **Body scroll is locked** while open, so the page behind does not scroll
 *    under a thumb dragging inside the sheet.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
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

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      trapFocus(event);
    };
    document.addEventListener('keydown', onKeyDown);

    // Move focus into the panel so the next Tab lands inside it.
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus();
    };
  }, [open, onClose, trapFocus]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute bg-surface shadow-sheet',
          // Mobile: bottom sheet. sm and up: right-hand side panel.
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg',
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-96 sm:rounded-t-none sm:rounded-l-lg',
          'flex flex-col',
          reduced ? '' : 'motion-safe:animate-in'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-h3 font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
