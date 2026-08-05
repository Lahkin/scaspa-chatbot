import { Icon } from './Icon';
import { cn } from '@/lib/cn';

/**
 * The "Tap to call" control — spec board 00d.
 *
 * 44px tall, 16px side padding, a phone glyph and the number in tabular
 * figures, brand-200 on a bordered ground.
 *
 * ## It is never disabled, and the spec says so in the disabled column
 *
 * Where every other control in the matrix has a disabled state, this one has a
 * sentence: **"Never disabled — the number is always dialable."**
 *
 * That is not a styling note. Every failure in this product ends by offering
 * the telephone: a refusal, a 503, an empty feed, a rate limit. If the phone
 * control could be disabled it would be disabled in exactly the states where it
 * is the only thing left that works. So there is no `disabled` prop to pass.
 *
 * ## An anchor, not a button
 *
 * `tel:` is a navigation. A button with an onClick that sets `location.href`
 * loses the long-press menu, "copy number", and the middle-click — and on a
 * desktop with no dialer it does nothing at all rather than offering the number
 * as text the user can read and write down.
 */
export function TapToCall({
  href,
  display,
  label,
  className,
}: {
  /** `tel:+1869...` — the dialable form, digits only. */
  href: string;
  /** The readable form, spaced for a human to copy. */
  display: string;
  /** Overrides the accessible name, e.g. "Marine Operations — call SCASPA". */
  label?: string;
  className?: string | undefined;
}) {
  return (
    <a
      href={href}
      {...(label ? { 'aria-label': label } : {})}
      className={cn(
        'inline-flex min-h-touch items-center gap-2.5 rounded-button px-4',
        'border border-border text-brand-200',
        'text-body font-medium tabular',
        'transition-colors duration-fast ease-out-soft',
        'hover:border-brand-500 hover:bg-surface-muted hover:text-brand-100',
        'active:border-border active:bg-border active:text-brand-300',
        className
      )}
    >
      <Icon name="phone" size={16} />
      {display}
    </a>
  );
}
