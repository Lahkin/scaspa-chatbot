import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'onNavy' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /**
   * What a screen reader is told while loading, e.g. "Asking". Announced only —
   * it does not replace the visible label. Defaults to "Working".
   */
  loadingLabel?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

/**
 * All six states, not just the happy path: default, hover, focus-visible,
 * active, disabled, loading.
 *
 * Two decisions worth knowing:
 *
 * 1. **Loading keeps the button in the layout at the same size.** Swapping the
 *    label for a spinner — or for a different word — reflows the row and moves
 *    whatever is next to it under the user's thumb. The visible label never
 *    changes; the spinner joins it and the wait is announced separately. With
 *    several buttons on screen, "Asking" also loses which action is pending,
 *    where "Ask SCASPA" still says.
 * 2. **Loading sets `aria-busy` and `disabled`.** A double-submit while a stream
 *    is opening is the single easiest way to send two questions by accident.
 */
const VARIANTS: Record<Variant, string> = {
  primary: cn(
    'bg-blue-600 text-ink-inverse',
    'hover:bg-blue-700',
    'active:bg-blue-800',
    'disabled:bg-neutral-200 disabled:text-ink-subtle'
  ),
  /*
   * `primary`, on a navy ground.
   *
   * Same fill — the brand blue is the point of a primary action and the hero is
   * the surface that most needs to look like SCASPA. What changes is the edge:
   * `--color-brand` against navy measures 1.91:1, so the button's shape simply
   * is not there, and only its label says a control exists. WCAG 1.4.11 asks
   * 3:1 of the visual information that identifies a component, so the boundary
   * is drawn in `on-navy-secondary` at 8.46:1.
   *
   * A variant rather than a className, because `Button` deliberately does not
   * take one — a primitive that can be restyled from outside stops being one.
   */
  onNavy: cn(
    'bg-brand text-on-navy-primary border border-on-navy-secondary',
    'hover:bg-blue-700',
    'active:bg-blue-800',
    'disabled:bg-transparent disabled:text-on-navy-muted disabled:border-on-navy-muted'
  ),
  secondary: cn(
    'bg-surface text-blue-700 border border-border-strong',
    'hover:bg-blue-50 hover:border-blue-600',
    'active:bg-blue-100',
    'disabled:bg-surface disabled:text-ink-subtle disabled:border-border'
  ),
  ghost: cn(
    'bg-transparent text-blue-700',
    'hover:bg-blue-50',
    'active:bg-blue-100',
    'disabled:text-ink-subtle disabled:bg-transparent'
  ),
  danger: cn(
    'bg-danger text-ink-inverse',
    'hover:brightness-90',
    'active:brightness-75',
    'disabled:bg-neutral-200 disabled:text-ink-subtle disabled:brightness-100'
  ),
};

// Every size clears the 44px minimum touch target. The user is standing up,
// one-handed, possibly on a moving ferry.
const SIZES: Record<Size, string> = {
  sm: 'min-h-touch px-3 text-small gap-2',
  md: 'min-h-touch px-4 text-body gap-2',
  lg: 'min-h-12 px-6 text-lead gap-3',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  fullWidth = false,
  disabled = false,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        'transition-colors duration-fast ease-out-soft',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full'
      )}
    >
      {loading ? <Spinner size="sm" label={null} /> : null}
      <span>{children}</span>
      {/* The wait is announced once, politely, rather than on every re-render. */}
      {loading ? (
        <span aria-live="polite" className="sr-only">
          {loadingLabel ?? 'Working'}
        </span>
      ) : null}
    </button>
  );
}
