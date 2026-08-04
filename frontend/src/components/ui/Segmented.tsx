import { cn } from '@/lib/cn';

/**
 * The segmented control — spec board 00d, "Segmented · 2" and "Segmented · 4".
 *
 * A 3px inset track on surface-3 with a 1px border and a 12px radius; the
 * selected segment is a brand-500 fill at 9px radius and 32px tall. Two
 * segments and four are the same control, so the widths come from the content
 * rather than from a count.
 *
 * ## Two sizes, because the handoff draws two
 *
 * `md` is board 00d's control above. `sm` is the toolbar one — §5.1's density
 * toggle ("2-option segmented control in the toolbar, right-aligned, **26px
 * segments**") and §4.5's direction toggle ("segments 26px, `padding: 0 12px`,
 * `border-radius: 8px`"), which the exported spec draws with a 10px track:
 *
 * ```
 * track:   padding 3px; --surface-3; 1px solid --border; border-radius: 10px
 * segment: height 26px; padding 0 12px; border-radius: 8px; 500 12px/16px
 * ```
 *
 * A size rather than a second component: it is the same control, and the two
 * differ only where a toolbar's row height differs from a form's.
 *
 * ## Radio semantics, not buttons
 *
 * `role="radiogroup"` with `role="radio"` children, because that is what this
 * is: one of a small set, exactly one chosen, and the choice is visible. A row
 * of `<button>`s gives a screen-reader user no sense of how many options there
 * are or which is current, and arrow keys do nothing.
 *
 * Arrow keys move the selection, which is the radio pattern's own behaviour and
 * the reason the pattern is worth using. Tab enters and leaves the group once —
 * a four-segment control that costs four tabs to pass is a control that gets
 * skipped.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export type SegmentedSize = 'sm' | 'md';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Names the group. Never rendered — the segments are their own labels. */
  label: string;
  /** `md` is board 00d's 32px control; `sm` is the 26px toolbar one. */
  size?: SegmentedSize;
}) {
  const compact = size === 'sm';
  const index = options.findIndex((option) => option.value === value);

  function move(delta: number, from: HTMLElement) {
    if (options.length === 0) return;
    // Wraps, which is what a radio group does. A selection that stops dead at
    // the end makes the last option feel like a boundary rather than a choice.
    const nextIndex = (index + delta + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);

    /*
     * Focus has to follow the selection, or the keyboard user is stranded.
     *
     * With a roving tabindex the segment they were on drops to `tabIndex={-1}`
     * the moment the selection moves — so without this, focus sits on an
     * element no longer in the tab order, the next arrow press goes nowhere,
     * and Tab jumps somewhere unrelated.
     */
    const target = from.parentElement?.children[nextIndex];
    if (target instanceof HTMLElement) target.focus();
  }

  return (
    /*
     * The key handler lives on the RADIOS, not on the group.
     *
     * With a roving tabindex the group is never focused — the selected segment
     * is — so a handler up here would only ever fire by bubbling, and it makes
     * the container an interactive element that ARIA then expects to be
     * focusable. Putting it on the buttons is both the correct pattern and
     * where the event actually originates.
     */
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex border border-border bg-surface-muted p-[3px]',
        compact ? 'rounded-button' : 'rounded-input'
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            /*
             * Roving tabindex: only the selected segment is in the tab order, so
             * the group is one stop and the arrow keys do the rest.
             */
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(1, event.currentTarget);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(-1, event.currentTarget);
              }
            }}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap',
              /*
               * 26/8/12 in a toolbar, 32/9/16 in a form — §5.1 and §4.5 against
               * board 00d. Bracket pixels: 26 is not on the 4px spacing scale,
               * so `h-6.5` would emit no rule and the segment would be sized by
               * its text.
               *
               * `h-11` first, then the designed height from `sm` — the same
               * treatment `Button`, `Input` and `IconButton` already carry.
               * §7: "Touch targets are 44px minimum … at ≤640px they grow to
               * 44px", and a 26px segment is a target a thumb misses. It grew
               * neither before this nor at 32px; `npm run check:responsive`
               * names it at 320 and 390.
               */
              'h-11',
              compact
                ? 'rounded-ghost px-3 text-caption sm:h-[26px]'
                : 'rounded-segment px-4 text-label sm:h-8',
              'font-medium',
              'transition-colors duration-fast ease-out-soft',
              // One pairing per line, and `prettier-ignore` to keep it that way.
              // `tests/contrast.test.ts` reads a line at a time, so a collapsed
              // ternary makes it measure the selected branch's ink against the
              // unselected branch's fill — a pair that never renders together.
              // (Naming those two utilities in this comment would trip the same
              // scan, which reads comment lines as readily as code.)
              // prettier-ignore
              selected
                ? 'bg-brand-500 text-ink-inverse'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
