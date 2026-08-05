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
  bare = false,
  counter,
  ref: forwardedRef,
  ...rest
}: TextareaProps & {
  /**
   * The cap, shown and enforced — §1.4 type 2's `0/4000`.
   *
   * Passed as a pair rather than read off `maxLength`, exactly like `Input`'s:
   * `maxLength` silently refuses the next keystroke and explains nothing.
   */
  counter?: { value: number; max: number };
  /**
   * Drop the field's own box.
   *
   * The composer is a single bordered container holding a field, a control row
   * and a counter — §3.2 — so the field inside it must not draw a second
   * border, a second background or its own padding. Everything else about it
   * (the auto-grow, the cap, the label wiring) is unchanged, which is the whole
   * reason this is a flag rather than a second component.
   */
  bare?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const atLimit = counter ? counter.value >= counter.max : false;

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
          'block w-full resize-none text-body leading-6 text-ink',
          'transition-colors duration-fast ease-out-soft',
          bare
            ? // Inside the composer's own box. No border, no ground, no padding
              // — and no focus edge either, because the container carries it.
              'bg-transparent p-0 outline-none disabled:cursor-not-allowed disabled:text-ink-disabled'
            : cn(
                /*
                 * §1.4 type 2: `height: 88px` minimum, `padding: 10px 12px`, and
                 * the shared input treatment — surface-3 on a border hairline at
                 * a 12px radius. Same three corrections as `Input`: the ground
                 * was the card colour, the edge a step too bright, and the hover
                 * border is not a state the handoff draws at all.
                 */
                'min-h-[88px] rounded-input border border-border bg-surface-3',
                'px-3 py-[10px]',
                'focus:border-brand-500',
                'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-disabled',
                // Three edges, in order of severity: an error, the cap, or
                // ordinary — the same ladder `Input` climbs.
                error ? 'border-danger' : atLimit ? 'border-caution' : ''
              )
        )}
      />

      {/*
       * §1.4 type 2 draws the counter bottom-right — `0/4000`. Same row and
       * same treatment as `Input`'s, so a form carrying both fields does not
       * show the cap two ways: at the limit the helper and the count turn
       * caution together, and the count is announced politely only there.
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
