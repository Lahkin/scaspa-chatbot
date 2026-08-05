import { Link } from '@tanstack/react-router';
import { Icon } from '@/components/ui/Icon';

/**
 * Breadcrumb and back — spec board 03.
 *
 * "Two depths exist. Nothing in the product nests deeper than three."
 *
 * ## The current page is not a link
 *
 * It is rendered as plain text at full strength with no hover, because a link
 * to where you already are is a control that does nothing — and on a receipt
 * screen, a crumb that looks clickable invites a click that loses the
 * reference.
 *
 * ## Mobile collapses to ONE control, always labelled with its parent
 *
 * "The mobile control is always labelled with the parent it returns to. A bare
 * arrow gives no clue where it lands, and on a receipt screen that matters."
 *
 * So the collapse is not "hide the middle crumbs" — it is a different control:
 * a single labelled back button pointing at the immediate parent, with the page
 * title below it.
 */
export interface Crumb {
  label: string;
  /** Omitted on the current page, which is not a link. */
  to?: string;
}

export function Breadcrumb({ trail, title }: { trail: Crumb[]; title: string }) {
  // The parent is the last crumb that is actually a link — what "back" means.
  const parent = [...trail].reverse().find((crumb) => crumb.to);

  return (
    <div className="flex flex-col gap-3.5">
      {/* ── Below 640px: one labelled control ───────────────────────────── */}
      {parent?.to ? (
        <Link
          to={parent.to}
          className="inline-flex h-9 items-center gap-2 self-start rounded-button border border-border pr-3 pl-2 text-label font-medium text-brand-200 hover:text-brand-100 sm:hidden"
        >
          <Icon name="arrow-left" size={16} />
          {parent.label}
        </Link>
      ) : null}

      {/* ── 640px and up: the full trail ─────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="hidden sm:block">
        <ol className="flex flex-wrap items-center gap-2">
          {trail.map((crumb, index) => (
            <li key={crumb.label} className="flex items-center gap-2">
              {index > 0 ? (
                <Icon name="chevron-right" size={14} className="text-ink-subtle" />
              ) : null}
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="text-label font-medium text-brand-200 hover:text-brand-100 hover:underline hover:underline-offset-[3px] active:text-brand-300"
                >
                  {crumb.label}
                </Link>
              ) : (
                // Current page: not a link, no hover, full strength.
                <span aria-current="page" className="text-label font-medium text-ink">
                  {crumb.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="text-h3 font-semibold text-ink">{title}</h1>
    </div>
  );
}
