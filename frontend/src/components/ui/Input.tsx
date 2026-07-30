import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  label: string;
  /** Hide the label visually but keep it for screen readers. */
  labelHidden?: boolean;
  hint?: string;
  error?: string;
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
  numeric = false,
  disabled = false,
  ...rest
}: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={cn('block text-small font-medium text-ink', labelHidden && 'sr-only')}
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
          'block w-full rounded-md border bg-surface px-3 text-body text-ink',
          'min-h-touch',
          'transition-colors duration-fast ease-out-soft',
          'hover:border-blue-400',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle',
          error ? 'border-danger' : 'border-border-strong',
          numeric && 'tabular'
        )}
      />

      {hint ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
