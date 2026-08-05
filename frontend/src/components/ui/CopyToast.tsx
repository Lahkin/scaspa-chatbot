import { Icon } from '@/components/ui/Icon';

/**
 * "Copied to the clipboard" — §7.6.
 *
 * ```
 * padding: 12px 16px; border-radius: 12px; --surface-3; 1px solid --border; gap: 10px
 * 20px --positive-fill tile, border-radius 6px, with a 12px check --positive
 * 500 13px/18px --text-1
 * ```
 *
 * ## It confirms the one action in this product with no visible result
 *
 * Every other control changes something on screen. A copy changes the clipboard,
 * which is invisible — so without this the reader presses the button, sees the
 * page do nothing, and presses it again. §7.6 pairs it with the originating
 * control's own **Copied** state: "the originating ghost icon button
 * simultaneously enters its Copied state", so the confirmation is both where the
 * hand is and where the eye is.
 *
 * ## Announced once, politely
 *
 * `role="status"` rather than `alert`: a copy is something the reader asked for,
 * not an interruption. It reads once and is gone — a toast that announces
 * assertively over whatever a screen reader was in the middle of is worse than
 * no toast at all.
 *
 * The caller owns the timer. This draws; it does not decide how long a
 * confirmation lives, because that belongs with the control that fired it.
 */
export function CopyToast({ label = 'Copied to the clipboard' }: { label?: string }) {
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2.5 rounded-input border border-border bg-surface-muted px-4 py-3 text-label font-medium text-ink"
    >
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-small bg-positive-tint text-positive"
      >
        <Icon name="check" size={12} />
      </span>
      {label}
    </p>
  );
}
