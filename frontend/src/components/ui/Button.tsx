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
/*
 * ── THE STATE COLOURS ARE THE BRAND RAMP, NAMED DIRECTLY ────────────────────
 *
 * Spec board 00d draws every type across five states, and the primary run is
 * brand-500 → 600 hover → 700 pressed. These used to be written as `blue-600`,
 * `blue-700`, `blue-800`, which was fine while the ramp was a single ordered
 * scale of blues.
 *
 * It is not one any more. `--color-blue-700` was a LINK TEXT colour and now
 * resolves to brand-200 — so `hover:bg-blue-700` painted a primary button
 * near-white on hover, a state no test renders and no screenshot caught. The
 * ramp aliases stay for compatibility; anything picking a state colour names
 * the brand step it actually means.
 */
const VARIANTS: Record<Variant, string> = {
  primary: cn(
    'bg-brand-500 text-ink-inverse',
    'hover:bg-brand-600',
    'active:bg-brand-700',
    // Spec: surface-3 with a border and placeholder ink, not a grey fill. A
    // disabled control still has to read as a control.
    'disabled:border disabled:border-border disabled:bg-surface-muted disabled:text-ink-disabled'
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
    'bg-brand-500 text-on-navy-primary border border-on-navy-secondary',
    'hover:bg-brand-600',
    'active:bg-brand-700',
    'disabled:bg-transparent disabled:text-on-navy-muted disabled:border-on-navy-muted'
  ),
  /* The spec's "Retry" type: a bordered button carrying text-1, hovering to
   * surface-3 and pressing to the divider fill. */
  secondary: cn(
    'bg-transparent text-ink border border-border',
    'hover:bg-surface-muted',
    'active:bg-border',
    'disabled:border-border disabled:bg-surface-muted disabled:text-ink-disabled'
  ),
  ghost: cn(
    'bg-transparent text-brand-200',
    'hover:bg-surface-muted hover:text-brand-100',
    'active:bg-border active:text-brand-300',
    'disabled:bg-transparent disabled:text-ink-disabled'
  ),
  danger: cn(
    // The fill is the enum hue and the ink is dark: white on either red step
    // fails (2.60:1 / 3.60:1). Board 19's emergency button is drawn the same way.
    'bg-danger-fill text-ink-on-bright',
    'hover:brightness-90',
    'active:brightness-75',
    'disabled:bg-neutral-200 disabled:text-ink-disabled disabled:brightness-100'
  ),
};

/*
 * ── 40px, GROWING TO 44 ON TOUCH ────────────────────────────────────────────
 *
 * §1.3 draws the primary action at `height: 40px; padding: 0 18px`. §7 requires
 * 44px touch targets and puts the threshold at 640px — "desktop icon buttons
 * are 28–36px; at ≤640px they grow to 44px".
 *
 * So every size is 44px up to `sm` and its designed height above it, rather
 * than 44px everywhere. Drawn at 44 on a desktop the primary button is visibly
 * taller than the 40px composer controls and the 40px retry beside it, and the
 * row stops lining up.
 *
 * `px-4.5` is 18px. The 38px variant is the in-card button §4.6 and §4.7 ask
 * for — "Primary 38px button: Open the calculator".
 */
const SIZES: Record<Size, string> = {
  sm: 'h-11 sm:h-[38px] px-4.5 text-body gap-2',
  md: 'h-11 sm:h-10 px-4.5 text-body gap-2',
  lg: 'h-12 px-6 text-lead gap-3',
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
        /*
         * `rounded-button`, not `rounded-md`.
         *
         * `--radius-md` aliases `--radius-input`, which is 12px — the composer
         * and input radius. Every button in the product was drawn two pixels
         * rounder than the 10px the handoff gives it, which is invisible on one
         * control and obvious in a row where a 10px chip sits beside a 12px
         * button.
         */
        'inline-flex items-center justify-center rounded-button font-medium',
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
