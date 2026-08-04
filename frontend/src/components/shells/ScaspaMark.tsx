import { LogoLockup } from '@/components/brand/LogoLockup';

/**
 * The compact lockup — 24px seal inside a 32px white plate.
 *
 * The handoff names three places for it: the widget header, the 404 header and
 * the mobile header. It is `LogoLockup` at its second size and nothing else;
 * this file survives as the name those three shells already import, and because
 * the switchboard number below has to live somewhere a component can reach
 * without pulling in the whole facts module.
 *
 * It used to draw its own plate, its own wordmark and a "Ports and travel,
 * St. Kitts" sub-line. The handoff's lockup is the seal and the string
 * `SCASPA Assistant`, full stop — no tagline, no second line — so the duplicate
 * implementation went rather than being kept in step by hand.
 */
export function ScaspaMark() {
  return <LogoLockup size="compact" />;
}

/**
 * SCASPA's switchboard. `tel:` with the full international form so it dials
 * correctly from a foreign handset, which is what a cruise passenger is holding.
 */
export const SCASPA_PHONE_HREF = 'tel:+18694658121';
