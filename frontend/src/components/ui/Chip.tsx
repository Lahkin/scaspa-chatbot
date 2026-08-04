import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  selected?: boolean;
  children: ReactNode;
}

/**
 * Family C — the filter and category chip. Handoff §1.2.
 *
 * ```
 * height: 28px
 * padding: 0 14px          (0 12px when a 12px check glyph leads)
 * border-radius: 999px
 * label: 500 13px/18px
 * ```
 *
 * ## Why it is taller than a status pill and shorter than a suggestion chip
 *
 * Three pill-shaped things appear in the same answer: a 26px outline status
 * pill, this at 28px, and a 34px suggestion chip. The heights are the whole
 * reason they cannot be confused — "chips are 28px and filled when selected, so
 * they never read as the 26px outline status pills that appear in the same
 * answers" (§3.3). A chip is pressable; a status pill is a fact. Making them
 * the same size makes one of them lie.
 *
 * ## 28px, and 44px on touch
 *
 * §7: "Touch targets are 44px minimum. Desktop icon buttons are 28–36px; at
 * ≤640px they grow to 44px." So the chip is drawn at its designed height and
 * grows below the structural threshold, rather than being 44px everywhere and
 * colliding with the suggestion chip at every width.
 *
 * Selection goes through `aria-pressed` **and** a leading check glyph, never
 * through colour alone — no badge in this product is colour-only.
 */
export function Chip({ selected = false, disabled = false, children, ...rest }: ChipProps) {
  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center rounded-pill text-label font-medium',
        'transition-colors duration-fast ease-out-soft',
        // 28px, and the 44px touch minimum below the structural threshold.
        'h-11 sm:h-7',
        // 14px of side padding, tightened to 12 when the check leads.
        selected ? 'gap-1.5 px-3' : 'px-3.5',
        selected
          ? // Filled, no border. Drawn as a transparent border rather than none
            // so the box is the same height as the unselected state and a row
            // of chips does not jitter as one is pressed.
            'border border-transparent bg-brand-500 text-ink-inverse hover:bg-brand-600 active:bg-brand-700'
          : 'border border-border bg-surface-3 text-ink-muted hover:bg-border hover:text-ink',
        /*
         * The disabled state, written as variants rather than as a ternary.
         *
         * Not a style preference: `tests/contrast.test.ts` proves that nothing
         * reaches the placeholder ink outside a disabled or placeholder
         * context, and it recognises that context by the `disabled:` prefix. A
         * ternary produces the identical CSS and reads to the guard as body
         * copy at 3.74:1.
         */
        'disabled:cursor-not-allowed disabled:border-surface-3 disabled:bg-surface-3',
        'disabled:text-ink-disabled disabled:hover:bg-surface-3'
      )}
    >
      {selected && !disabled ? <Icon name="check" size={12} /> : null}
      {children}
    </button>
  );
}
