import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/cn';

/**
 * The checkbox — spec board 00d, "Checkbox · read-only · department select".
 *
 * An 18px box at 5px radius, brand-500 when checked with a white tick, inside a
 * surface-3 panel with a bordered edge. Label and description are both part of
 * the control's target: the whole panel is the `<label>`, so a thumb landing
 * anywhere on it toggles.
 *
 * ## A real input, visually hidden — not a div with a click handler
 *
 * The native checkbox stays in the DOM and is what the label points at. It gets
 * `sr-only` rather than `display:none`, because a hidden input is not focusable
 * and would take the control out of the tab order entirely. Space still
 * toggles, the focus ring still lands, and the state is announced without any
 * `aria-checked` bookkeeping to get wrong.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** The consequence of ticking it. The spec's example is a whole sentence. */
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 rounded-input border border-border bg-surface-muted p-3.5',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-tiny',
          'transition-colors duration-fast ease-out-soft',
          checked ? 'bg-brand-500 text-ink-inverse' : 'border border-border bg-surface-1',
          // The ring follows the real input's focus, which is where focus is.
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus'
        )}
      >
        {checked ? <Icon name="check" size={12} /> : null}
      </span>

      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-label font-medium text-ink">{label}</span>
        {description ? <span className="text-label text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}
