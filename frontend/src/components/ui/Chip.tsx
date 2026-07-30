import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  selected?: boolean;
  children: ReactNode;
}

/**
 * A tappable suggestion or filter.
 *
 * Rendered as a real `<button>` so it is keyboard reachable and announced as
 * pressable. Selection state goes through `aria-pressed` rather than colour
 * alone.
 *
 * Chips are the main way someone starts a conversation without typing — which on
 * a phone, one-handed, in a hurry, is most people. They clear 44px vertically
 * even though they look small.
 */
export function Chip({ selected = false, disabled = false, children, ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-touch items-center rounded-lg border px-4 text-small',
        'transition-colors duration-fast ease-out-soft',
        'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-ink-subtle',
        selected
          ? 'border-blue-600 bg-blue-600 text-ink-inverse hover:bg-blue-700 active:bg-blue-800'
          : 'border-border-strong bg-surface text-ink hover:bg-blue-50 hover:border-blue-400 active:bg-blue-100'
      )}
    >
      {children}
    </button>
  );
}
