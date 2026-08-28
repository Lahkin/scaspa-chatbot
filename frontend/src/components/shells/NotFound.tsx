import { Link } from '@tanstack/react-router';
import { Icon } from '@/components/ui/Icon';
import { LogoLockup } from '@/components/brand/LogoLockup';
import { useStrings } from '@/features/i18n';

/**
 * The 404 — spec board 04, "Admin-gate wrapper".
 *
 * ## Drawn once because it ships once
 *
 * The board's whole point: *"An unauthenticated visitor to /admin/stats and a
 * visitor to /adnim get the same status code, the same markup and the same
 * copy. No lock icon, no 'sign in to continue', no softer wording — any
 * difference between the two confirms the address exists."*
 *
 * So there is exactly one of these, it takes no props, and there is no variant.
 * That is the security property, and a `variant="unauthorised"` added later
 * would quietly undo it.
 *
 * The three states the board names:
 *
 *   route present, authenticated    the screen renders in the ordinary shell
 *   route present, unauthenticated  THIS, and never a redirect to a sign-in —
 *                                   a redirect is itself a disclosure
 *   route absent                    THIS, because the route was never built
 *
 * ## And nothing links here
 *
 * There is no admin entry in the navigation, no keyboard shortcut and nothing
 * in search that returns it. The only way to an admin address is to type it.
 */
export function NotFound() {
  const t = useStrings();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border px-6">
        <LogoLockup size="compact" />
      </header>

      {/* `56px 24px 64px` — §2.8. The bottom is deeper than the top on purpose:
          the button is the last thing on the page and needs room under it, or
          it sits on the fold on a short viewport. */}
      <main className="flex flex-1 flex-col items-center gap-5 px-6 pt-14 pb-16 text-center">
        <h1 className="text-h1 font-semibold text-ink">{t.errors.notFoundTitle}</h1>
        <p className="max-w-90 text-body text-ink-muted">{t.errors.notFoundBody}</p>
        <Link
          to="/"
          // 40px, and the touch minimum below the 640px threshold — the same
          // pairing every other primary action uses.
          className="inline-flex h-11 items-center gap-2 rounded-button bg-brand-500 px-4.5 text-body font-medium text-ink-inverse hover:bg-brand-600 active:bg-brand-700 sm:h-10"
        >
          <Icon name="arrow-left" size={16} />
          {t.errors.backToAssistant}
        </Link>
      </main>
    </div>
  );
}
