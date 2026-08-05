import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/cn';

/**
 * The expand/collapse control — spec board 00d, "Expand / collapse".
 *
 * 32px tall, 12px side padding, a chevron that rotates when open, and a label
 * that is a figure ("3 tools used") so it carries tabular figures.
 *
 * ## Collapsed on arrival, every time
 *
 * The spec is explicit for the tool trace this wraps: "Collapsed on arrival
 * every time; it is evidence, not part of the answer." So `defaultOpen` exists
 * but the default is closed, and nothing remembers the last state — a
 * disclosure that reopens itself has decided the evidence is the answer.
 *
 * ## Disabled says what is absent, not nothing
 *
 * With no content there is no control: the spec's disabled state reads "No
 * tools ran" rather than showing an inert chevron. An empty expander invites a
 * click that does nothing.
 */
export function Disclosure({
  label,
  emptyLabel,
  children,
  defaultOpen = false,
}: {
  /** The summary line. Usually a count and a duration. */
  label: ReactNode;
  /** Shown instead of the control when there is nothing to reveal. */
  emptyLabel?: string;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (!children) {
    return (
      <span className="inline-flex h-8 items-center gap-2 rounded-button px-3 text-label font-medium text-ink-subtle">
        <Icon name="chevron-down" size={16} />
        {emptyLabel ?? 'Nothing to show'}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-panel border border-border bg-surface',
        !open && 'border-transparent bg-transparent'
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-3 px-5 py-3.5 text-left',
          'text-label font-medium tabular',
          'transition-colors duration-fast ease-out-soft',
          open
            ? 'border-b border-border bg-surface-muted text-ink'
            : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
        )}
      >
        <Icon name="tool" size={16} className={open ? 'text-brand-300' : 'text-ink-subtle'} />
        <span className="flex-1">{label}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={cn(
            'text-ink-muted transition-transform duration-fast ease-out-soft',
            open && 'rotate-180'
          )}
        />
      </button>

      {/*
       * Unmounted rather than hidden when closed.
       *
       * `hidden` would leave the rows in the accessibility tree's reading order
       * for some assistive technology and in the DOM for a find-in-page, which
       * makes "collapsed" a visual claim rather than a real one.
       */}
      {open ? <div id={panelId}>{children}</div> : null}
    </div>
  );
}
