import type { Ref, TextareaHTMLAttributes } from 'react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'id' | 'rows'
> {
  label: string;
  labelHidden?: boolean;
  hint?: string;
  error?: string;
  /** Rows to start at. */
  minRows?: number;
  /** Grows to this many rows, then scrolls. */
  maxRows?: number;
  /**
   * Forwarded to the underlying `<textarea>`.
   *
   * The component keeps its own ref for the auto-grow measurement, so this is
   * merged with it rather than replacing it — a caller that needs to focus the
   * field must not silently break the height calculation. React 19 takes `ref`
   * as an ordinary prop, so no `forwardRef` is needed.
   */
  ref?: Ref<HTMLTextAreaElement> | undefined;
}

const LINE_HEIGHT_PX = 24; // --text-body--line-height
const VERTICAL_PADDING_PX = 20;

/**
 * An auto-growing textarea with a hard cap.
 *
 * The cap matters more than the growth. On a phone, an unbounded textarea pushes
 * the send button off screen as someone types a long question — so it grows to
 * `maxRows` and then scrolls internally, keeping the send button reachable with a
 * thumb.
 *
 * Height is set from `scrollHeight` on every change rather than tracked in state:
 * the value can also change from outside (a cleared composer, a transcript
 * dropped in from voice), and only reacting to keystrokes would miss those.
 */
export function Textarea({
  label,
  labelHidden = false,
  hint,
  error,
  minRows = 1,
  maxRows = 6,
  disabled = false,
  value,
  ref: forwardedRef,
  ...rest
}: TextareaProps) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const min = minRows * LINE_HEIGHT_PX + VERTICAL_PADDING_PX;
    const max = maxRows * LINE_HEIGHT_PX + VERTICAL_PADDING_PX;
    // Reset first, or scrollHeight only ever reports the current (grown) height
    // and the field can never shrink back.
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, min), max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, minRows, maxRows]);

  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={cn('block text-small font-medium text-ink', labelHidden && 'sr-only')}
      >
        {label}
      </label>

      <textarea
        {...rest}
        ref={(node) => {
          ref.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        id={id}
        value={value}
        disabled={disabled}
        rows={minRows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'block w-full resize-none rounded-md border bg-surface px-3 py-[10px]',
          'text-body leading-6 text-ink',
          'transition-colors duration-fast ease-out-soft',
          'hover:border-blue-400',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle',
          error ? 'border-danger' : 'border-border-strong'
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
