import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

/**
 * Two of the handoff's six button types live here, and they are not the same
 * control — §1.3.
 *
 * | Variant     | Box            | Border | Default ink | Where                     |
 * | ----------- | -------------- | ------ | ----------- | ------------------------- |
 * | `bordered`  | 36px, r10      | yes    | `--text-2`  | page-level and toolbars   |
 * | `ghost`     | 28px, r8       | no     | `--text-3`  | the message-action row    |
 *
 * Both grow to 44px at ≤640px, per §7 — and the ghost's glyph grows from 16 to
 * 18 with it, because at 44px a 16px glyph floats in the middle of a target
 * that looks empty.
 *
 * `primary`, `danger` and `onNavy` are not handoff types; they are this
 * codebase's own filled icon buttons and keep the bordered geometry.
 */
type Variant = 'bordered' | 'ghost' | 'primary' | 'onNavy' | 'danger';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** Required. An icon button with no label is unusable with a screen reader. */
  label: string;
  variant?: Variant;
  loading?: boolean;
  /**
   * The ghost row's two extra states — §1.3.
   *
   * `copied` is the positive tint with a tick, held for a moment after a copy.
   * `selected` is the thumb that has been pressed. Both are states of the
   * control rather than separate variants, because the control is the same one
   * and only its fill changes.
   */
  state?: 'default' | 'copied' | 'selected';
  children: ReactNode;
  /**
   * A ref to the underlying button.
   *
   * Needed so a drawer can restore focus to the exact control that opened it.
   * React 19 passes `ref` as an ordinary prop to a function component, so no
   * `forwardRef` wrapper is required; it just has to be typed and spread, which
   * `...rest` already does.
   */
  ref?: Ref<HTMLButtonElement>;
}

/** Geometry. The handoff's two boxes, plus the touch minimum below `sm`. */
const BOXES: Record<Variant, string> = {
  bordered: 'size-11 sm:size-9 rounded-button',
  ghost: 'size-11 sm:size-7 rounded-ghost',
  primary: 'size-11 sm:size-9 rounded-button',
  onNavy: 'size-11 sm:size-9 rounded-button',
  danger: 'size-11 sm:size-9 rounded-button',
};

const VARIANTS: Record<Variant, string> = {
  bordered: cn(
    'border border-border bg-transparent text-ink-muted',
    'hover:bg-surface-3 hover:text-ink',
    'active:bg-border active:text-ink',
    'disabled:border-surface-3 disabled:bg-transparent disabled:text-ink-disabled'
  ),
  ghost: cn(
    // text-3 at rest is deliberate here and allowed: this is an idle affordance
    // beside an answer, and it lifts to text-1 the moment it is hovered or
    // focused. The 3:1 non-text bar is what applies to a glyph.
    'bg-transparent text-ink-disabled',
    'hover:bg-surface-3 hover:text-ink',
    'active:bg-border active:text-ink',
    'disabled:text-ink-disabled'
  ),
  primary: cn(
    'bg-brand-500 text-ink-inverse hover:bg-brand-600 active:bg-brand-700',
    'disabled:border disabled:border-border disabled:bg-surface-muted disabled:text-ink-disabled'
  ),
  onNavy: cn(
    'bg-transparent text-on-navy-primary hover:bg-neutral-0/10 active:bg-neutral-0/20',
    'disabled:text-on-navy-muted'
  ),
  danger: cn(
    'bg-danger-fill text-ink-on-bright hover:brightness-90 active:brightness-75',
    'disabled:bg-neutral-200 disabled:text-ink-disabled'
  ),
};

/** The two extra fills the ghost row carries. Applied after the variant. */
const STATES = {
  default: '',
  copied: 'bg-positive-tint text-positive hover:bg-positive-tint hover:text-positive',
  selected: 'bg-brand-tint text-brand-200 hover:bg-brand-tint hover:text-brand-200',
} as const;

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
  state = 'default',
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
      // `selected` is a real toggle state, so it is announced rather than left
      // to the fill — no control in this product is colour-only.
      aria-pressed={state === 'selected' ? true : undefined}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-colors duration-fast ease-out-soft disabled:cursor-not-allowed',
        BOXES[variant],
        VARIANTS[variant],
        STATES[state]
      )}
    >
      {loading ? <Spinner size="sm" label={null} /> : children}
    </button>
  );
}
