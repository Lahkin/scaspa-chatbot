import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  label: string;
  /** Hide the label visually but keep it for screen readers. */
  labelHidden?: boolean;
  hint?: string;
  error?: string;
  /**
   * The character count, when the field has a published limit — board 00d.
   *
   * Passed as a pair rather than read off `maxLength`, because `maxLength`
   * hard-truncates: it silently eats the end of a pasted reference number and
   * gives no explanation. The cap is shown and enforced by a counter and a
   * disabled submit instead, exactly as the composer does it.
   */
  counter?: { value: number; max: number };
  /** Quantities and codes get tabular figures so columns line up. */
  numeric?: boolean;
}

/**
 * A labelled text input.
 *
 * `label` is required. A placeholder is not a label: it disappears the moment
 * someone types, and it is not announced as one.
 *
 * The error is wired through `aria-describedby` and `aria-invalid` rather than
 * just coloured red, because colour alone is not a message.
 */
export function Input({
  label,
  labelHidden = false,
  hint,
  error,
  counter,
  numeric = false,
  disabled = false,
  ...rest
}: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const atLimit = counter ? counter.value >= counter.max : false;

  return (
    /*
     * 8px between the label and the field — §1.4. It was 4px, which reads as
     * one block rather than as a label above a control.
     */
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={cn('block text-label font-medium text-ink', labelHidden && 'sr-only')}
      >
        {label}
      </label>

      <input
        {...rest}
        id={id}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          /*
           * §1.4: `background: --surface-3; border: 1px solid --border;
           * border-radius: 12px; height: 40px; padding: 0 12px`.
           *
           * Three of those were wrong. The ground was `--surface-2`, which is
           * the CARD colour — an input drawn in it disappears into the card it
           * sits on. The edge was `--text-3`, a full step brighter than the
           * hairline every other boundary uses. And the height was the 44px
           * touch minimum at every width, which made a field taller than the
           * 40px button beside it in every form on the product.
           */
          'block w-full rounded-input border border-border bg-surface-3 px-3 text-body text-ink',
          // 40px, and the touch minimum below the 640px threshold — §7.
          'h-11 sm:h-10',
          'transition-colors duration-fast ease-out-soft',
          // Focus adds the brand edge; the ring comes from the base layer.
          'focus:border-brand-500',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-disabled',
          // Three edges, in order of severity: an error, the cap, or ordinary.
          error ? 'border-danger' : atLimit ? 'border-caution' : '',
          numeric && 'tabular'
        )}
      />

      {/*
       * Hint and counter share a row — spec board 00d, "Text with counter".
       * The helper sits left, the count right, and at the limit BOTH turn
       * caution together so the state is not carried by the number alone.
       */}
      {hint || counter ? (
        <div className="flex justify-between gap-3">
          {hint ? (
            <p
              id={hintId}
              className={cn('text-caption', atLimit ? 'text-caution' : 'text-ink-muted')}
            >
              {atLimit ? `${counter!.max} characters is the maximum` : hint}
            </p>
          ) : (
            <span />
          )}
          {counter ? (
            <p
              className={cn(
                'shrink-0 text-caption font-medium tabular',
                atLimit ? 'text-caution' : 'text-ink-subtle'
              )}
            >
              {/*
               * Announced politely, and only near the limit. A count that reads
               * itself out on every keystroke makes the field unusable with a
               * screen reader; one that never does leaves the cap invisible.
               */}
              <span aria-live={atLimit ? 'polite' : 'off'}>
                {counter.value}/{counter.max}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
