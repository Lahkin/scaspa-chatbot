import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import logoUrl from '@/assets/scaspa-logo.png';

/**
 * The Authority's header — seal, name, navigation, language, accessibility.
 *
 * ## This is SCASPA's header, not Pilot's
 *
 * The seal and the words "ST. CHRISTOPHER AIR & SEA PORTS AUTHORITY" say who
 * owns the service. Pilot's own identity appears below it, inside the page,
 * where the product begins. Two brands, one screen, never merged — see
 * `PilotBrand` and decisions.md 0035.
 *
 * The seal is the supplied asset used verbatim, on its white plate. It is dark
 * blue line art on transparency, so without the plate it does not dim on a navy
 * ground, it disappears.
 *
 * ## "EN" is a link, and that is a deliberate departure
 *
 * The mock-up draws a dropdown. This is a link to the language section of
 * `/settings`, for two reasons that both come from this codebase rather than
 * from taste.
 *
 * `LanguagePicker` exists and is radios rather than a `<select>`, because on iOS
 * a native select opens a modal wheel that does not commit until "Done" — so a
 * reader picks a language, sees nothing happen, and picks it again. Rebuilding
 * that control in miniature in a header would either repeat the bug or duplicate
 * a solved problem in a second place.
 *
 * And two controls writing the same preference is how they drift. One control,
 * signposted from here.
 *
 * ## The accessibility button goes somewhere real
 *
 * `/settings#accessibility` explains what the product already honours from the
 * operating system — contrast, motion, text size — rather than offering
 * switches that would each need somewhere to remember themselves. An icon that
 * opens a page of genuine information is worth more than one that opens a panel
 * of toggles duplicating the OS.
 */

const NAV = [
  { to: '/chat', label: 'Pilot' },
  { to: '/about', label: 'About Pilot' },
  { to: '/support', label: 'Contact' },
] as const;

export function ScaspaInstitutionalHeader() {
  return (
    <nav
      aria-label="Main"
      className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5 sm:gap-6"
    >
      <Link
        to="/"
        className="flex min-h-touch shrink-0 items-center gap-2.5 rounded-sm"
        aria-label="SCASPA — St. Christopher Air and Sea Ports Authority, home"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-0">
          <img src={logoUrl} alt="" width={32} height={32} className="size-8" />
        </span>
        <span className="min-w-0">
          <span className="block text-h3 leading-none font-bold tracking-tight text-ink">
            SCASPA
          </span>
          {/*
            The full legal name, and the one place it is spelled out on a public
            page. Hidden below `sm` because at 375px it either wraps to three
            lines or truncates mid-word, and a truncated statutory name reads as
            a layout fault. The link's aria-label carries it at every width.
          */}
          <span
            aria-hidden="true"
            className="mt-0.5 hidden text-micro leading-tight tracking-eyebrow text-ink-subtle uppercase sm:block"
          >
            St. Christopher
            <br />
            Air &amp; Sea Ports Authority
          </span>
        </span>
      </Link>

      <span className="flex-1" />

      <ul className="flex items-center gap-1 sm:gap-3">
        {NAV.map(({ to, label }) => (
          <li key={to}>
            <Link
              to={to}
              className={cn(
                'inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm px-2',
                'text-small font-medium text-ink-muted transition-colors duration-fast',
                'hover:text-ink'
              )}
              activeProps={{
                className: 'text-brand-300 underline decoration-2 underline-offset-8',
              }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          to="/settings"
          hash="language"
          className="inline-flex min-h-touch items-center gap-1 rounded-button border border-border px-2.5 text-small font-medium text-ink-muted hover:text-ink"
        >
          EN
          <Icon name="chevron-down" size={14} aria-hidden="true" />
        </Link>
        <Link
          to="/settings"
          hash="accessibility"
          aria-label="Accessibility"
          className="inline-flex size-touch-min items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
        >
          <Icon name="user" size={18} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
