/**
 * The four places an answer card may send someone — spec board 02.
 *
 * "One call to action per answer card. Four destinations exist and no others."
 *
 * A closed union rather than an `href: string`, so a fifth destination is a
 * type error rather than a link to a page nobody built. Kept in its own module
 * because a file exporting both a component and a constant defeats React fast
 * refresh, and these are genuinely data.
 */
export const DESTINATIONS = {
  vessels: { to: '/vessels', label: 'See all vessel movements' },
  flights: { to: '/flights', label: 'Check flight arrivals' },
  tariffs: { to: '/tariffs', label: 'Open the tariff table' },
  support: { to: '/support', label: 'Contact a department' },
} as const;

export type CardDestination = keyof typeof DESTINATIONS;

/** The four, in the order the no-answer card lists them. */
export const ALL_DESTINATIONS: readonly CardDestination[] = [
  'vessels',
  'flights',
  'tariffs',
  'support',
];
