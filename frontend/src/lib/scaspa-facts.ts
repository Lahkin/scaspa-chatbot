/**
 * The only SCASPA facts this frontend is allowed to hardcode.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  HARD RULE — LOW-VOLATILITY FACTS ONLY
 *
 *  Permitted: what the organisation is, when it formed, what the four
 *  facilities are, the published telephone numbers and postal address.
 *
 *  Forbidden, without exception:
 *    · fees, fares, tariffs, charges, rates
 *    · schedules, sailing times, flight times
 *    · opening hours
 *    · statistics of any kind — passenger counts, tonnage, berth numbers
 *
 *  Every one of those comes from the assistant, where it arrives with a source
 *  and a verified date attached, and where a stale figure is visibly stale.
 *  A number typed into this file has neither: it drifts silently, it cannot be
 *  corrected by a researcher updating a spreadsheet, and it makes the product a
 *  second source of truth about itself. The whole system exists to have exactly
 *  one. `tests/scaspa-facts.test.ts` enforces this — it fails on a currency
 *  symbol, a clock time or a bare figure appearing anywhere in this module.
 *
 *  See docs/decisions.md 0022 for the boundary and why chrome is allowed to
 *  duplicate anything at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The switchboard, international form so it dials from a foreign handset. */
export const SCASPA_PHONE_LINES = [
  { label: 'Switchboard', display: '869-465-8121', href: 'tel:+18694658121' },
  { label: 'Line 2', display: '869-465-8122', href: 'tel:+18694658122' },
  { label: 'Line 3', display: '869-465-8123', href: 'tel:+18694658123' },
] as const;

export const SCASPA_POSTAL_ADDRESS = [
  'P.O. Box 963',
  'Bird Rock',
  'Basseterre',
  'St. Kitts',
] as const;

/**
 * The public website.
 *
 * `pay.scaspa.com` is a live payment portal and is never linked, referenced or
 * framed anywhere in this application — CLAUDE.md rule 9, and an ESLint rule
 * enforces it rather than leaving it to memory.
 */
export const SCASPA_WEBSITE = 'https://www.scaspa.com';

/**
 * ⚠️ PENDING CLIENT ITEM — the public email address.
 *
 * scaspa.com obfuscates it against scrapers, so it cannot be read off the site,
 * and guessing a plausible `info@` would be inventing a contact route that may
 * bounce. Someone who emailed it and waited three days for an answer that was
 * never going to come is worse off than someone who was told to phone.
 *
 * Left as null on purpose. `AboutScaspa` renders the phone routes and omits the
 * email row entirely while this is null — it does not render an empty slot or a
 * "coming soon". Set the string here when the client supplies it; nothing else
 * needs to change.
 */
export const SCASPA_EMAIL: string | null = null;

/** What the organisation is. No figures, by the rule above. */
export const SCASPA_IDENTITY = {
  fullName: 'St. Christopher Air & Sea Ports Authority',
  shortName: 'SCASPA',
  /**
   * A statutory body — created by legislation rather than incorporated — which
   * is why it is "the Authority" and not a company.
   */
  what: 'the statutory authority that runs the seaports and the airport of St. Kitts and Nevis.',
  formedYear: 1993,
} as const;

/**
 * The 1993 merger.
 *
 * Two predecessor bodies, both named here as they were then, because someone
 * holding older paperwork or an old bookmark is looking for those names and
 * needs to know they are the same organisation now.
 */
export const SCASPA_FORMATION = {
  year: 1993,
  seaportPredecessor: 'St. Christopher & Nevis Ports Authority',
  airportPredecessor: 'Golden Rock Airport',
  summary:
    'SCASPA was formed in 1993 by merging the seaport authority then operating as the ' +
    'St. Christopher & Nevis Ports Authority with the airport then known as Golden Rock ' +
    'Airport, bringing the islands’ sea and air gateways under one authority.',
} as const;

export interface FacilityFact {
  id: FacilityId;
  name: string;
  /** One plain line. What it is — never when it opens or what it costs. */
  line: string;
}

export type FacilityId = 'harbour' | 'zante' | 'ferry' | 'airport';

/**
 * The four facilities.
 *
 * This list is the reason the sidebar exists: someone asking about "the port"
 * could mean any of four different places, and the assistant answers better
 * when the question already names one.
 */
export const SCASPA_FACILITIES: readonly FacilityFact[] = [
  {
    id: 'harbour',
    name: 'Deep Water Harbour',
    line: 'The commercial cargo port at Bird Rock, handling containers, barrels and freight.',
  },
  {
    id: 'zante',
    name: 'Port Zante',
    line: 'The cruise terminal at Basseterre, where cruise ships berth.',
  },
  {
    id: 'ferry',
    name: 'Basseterre Ferry Terminal',
    line: 'The passenger terminal for the crossing between St. Kitts and Nevis.',
  },
  {
    id: 'airport',
    name: 'Robert L. Bradshaw International Airport',
    line: 'The islands’ international airport, north-east of Basseterre.',
  },
] as const;
