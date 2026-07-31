import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Required. An icon button with no label is unusable with a screen reader. */
  label: string;
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
  /**
   * A ref to the underlying button.
   *
   * Needed so a drawer can restore focus to the exact control that opened it —
   * recovering it from `document.activeElement` works until the drawer is
   * closed by something other than the user, at which point focus lands
   * somewhere arbitrary. React 19 passes `ref` as an ordinary prop to a function
   * component, so no `forwardRef` wrapper is required; it just has to be typed
   * and spread, which `...rest` already does.
   */
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-blue-600 text-ink-inverse hover:bg-blue-700 active:bg-blue-800 disabled:bg-neutral-200 disabled:text-ink-subtle',
  secondary:
    'bg-surface text-blue-700 border border-border-strong hover:bg-blue-50 active:bg-blue-100 disabled:text-ink-subtle disabled:border-border',
  ghost:
    'bg-transparent text-ink-muted hover:bg-neutral-100 active:bg-neutral-200 disabled:text-ink-subtle',
  danger:
    'bg-danger text-ink-inverse hover:brightness-90 active:brightness-75 disabled:bg-neutral-200 disabled:text-ink-subtle',
};

/**
 * An icon-only button.
 *
 * `label` is required rather than optional, because the failure mode of an
 * unlabelled icon button is silent: it looks fine and is invisible to a screen
 * reader. Making it a required prop turns that into a type error.
 */
export function IconButton({
  label,
  variant = 'ghost',
  loading = false,
  disabled = false,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-label={label}
      aria-busy={loading || undefined}
      title={label}
      className={cn(
        // size-touch-min on both axes: the hit area is the requirement, even
        // when the glyph inside is 20px.
        'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
        'transition-colors duration-fast ease-out-soft disabled:cursor-not-allowed',
        VARIANTS[variant]
      )}
    >
      {loading ? <Spinner size="sm" label={null} /> : children}
    </button>
  );
}
