import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}

/**
 * A hover/focus hint.
 *
 * Deliberately limited, and the limitation is the important part: **a tooltip is
 * never the only place information lives.** It is unreachable by touch, which is
 * how most of these users browse, so anything essential belongs in visible text
 * or in an aria-label. This exists for supplementary detail only.
 *
 * It opens on focus as well as hover, so a keyboard user can reach it, and closes
 * on Escape.
 *
 * Escape is handled on the document rather than with `onKeyDown` on the wrapper.
 * Two reasons, and the second is the real one: a wrapper carrying key handlers is
 * a non-native interactive element (jsx-a11y flags it, correctly), and a keydown
 * bound to the wrapper only fires while focus is still inside it — so Escape did
 * nothing the moment focus moved on and left the tooltip open.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2',
          'rounded-sm bg-neutral-900 px-2 py-1 text-caption text-ink-inverse shadow-popover',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        )}
      >
        {content}
      </span>
    </span>
  );
}
