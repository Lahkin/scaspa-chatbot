import type { FacilityId } from '@/lib/scaspa-facts';

/**
 * The four facilities, as navigation, with three starter questions each.
 *
 * ## These are questions, never answers
 *
 * Every string below is something a user might ask. Not one of them contains a
 * fee, a time or a rule — the assistant answers them from the knowledge base,
 * with a citation and a verified date, and that is the only place an answer is
 * allowed to come from. A starter question that embedded its own answer would
 * be the chrome quietly becoming a second source of truth; see
 * `lib/scaspa-facts.ts` and docs/decisions.md 0022.
 *
 * ## Why they are grouped by facility
 *
 * Because "the port" is four different places. A visitor asking about "the
 * port" may mean a cargo harbour, a cruise pier, a ferry terminal or an
 * airport, and the retrieval quality difference between a vague question and
 * one that names its facility is large. Grouping the openers this way teaches
 * the distinction without a paragraph explaining it.
 *
 * In its own module, away from any component, for the same reason as
 * `suggestions.ts`: a file exporting both components and constants breaks fast
 * refresh, and editing this list would drop the conversation being demonstrated.
 */

export interface FacilityNavItem {
  id: FacilityId;
  /** Matches `SCASPA_FACILITIES[].name`. */
  name: string;
  /** What sits under the name in the nav — the disambiguating hint. */
  subLabel: string;
  /** Exactly three. More turns a disclosure into a scroll. */
  questions: readonly [string, string, string];
}

export const FACILITY_NAV: readonly FacilityNavItem[] = [
  {
    id: 'harbour',
    name: 'Deep Water Harbour',
    subLabel: 'Cargo, containers, barrels',
    questions: [
      'Where do I collect a barrel shipped to St. Kitts?',
      'What documents do I need to clear cargo?',
      "What are the cargo port's opening hours?",
    ],
  },
  {
    id: 'zante',
    name: 'Port Zante',
    subLabel: 'Cruise terminal',
    questions: [
      'Where do cruise ships dock in St. Kitts?',
      "What's within walking distance of the cruise terminal?",
      'How long before departure should I be back on board?',
    ],
  },
  {
    id: 'ferry',
    name: 'Basseterre Ferry Terminal',
    subLabel: 'St. Kitts–Nevis crossing',
    questions: [
      'What time is the last ferry back from Nevis?',
      'Where do I buy a ferry ticket to Nevis?',
      'How long does the crossing to Nevis take?',
    ],
  },
  {
    id: 'airport',
    name: 'RLB International Airport',
    subLabel: 'Robert L. Bradshaw',
    questions: [
      'How do I get from the airport to Basseterre?',
      'What facilities are in the airport terminal?',
      'Where is the airport located?',
    ],
  },
] as const;
