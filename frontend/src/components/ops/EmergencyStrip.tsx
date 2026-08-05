import { Icon } from '@/components/ui/Icon';

/**
 * The emergency strip — spec board 19.
 *
 * ## Neutral, with exactly one red element
 *
 * "A neutral strip with one red element — the button that actually dials. A bar
 * that is red on every visit teaches people to look past it, and then it is not
 * there when it matters."
 *
 * That is the whole design. The strip is surface-3 like any other panel; the
 * only critical-coloured thing on it is the control that places the call. The
 * red is spent on the action, not on the announcement.
 *
 * ## And it is always present
 *
 * Not conditional on anything. A form that reaches someone during office hours
 * is the wrong channel for an emergency at any hour, so the alternative is
 * offered before the form rather than after it fails.
 */
export function EmergencyStrip({ href, display }: { href: string; display: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-input border border-border bg-surface-muted px-5 py-3.5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-critical-tint text-critical-text"
      >
        <Icon name="phone" size={16} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-medium text-ink">
          In an emergency, telephone the port at once — do not use this form
        </span>
        <span className="text-label text-ink-muted">
          Enquiries sent here are read during office hours only.
        </span>
      </div>

      {/*
       * The one red element, and it is a link rather than a button for the same
       * reason `TapToCall` is: `tel:` is a navigation, and a button loses the
       * long-press menu and "copy number".
       *
       * It carries the critical FILL with the dark ink — white on either red
       * step fails, and board 19 draws it exactly this way.
       */}
      <a
        href={href}
        className="inline-flex min-h-touch shrink-0 items-center gap-2.5 rounded-button bg-danger-fill px-4 text-body font-semibold text-ink-on-bright tabular hover:brightness-95 active:brightness-90"
      >
        <Icon name="phone" size={16} />
        {display}
      </a>
    </div>
  );
}
