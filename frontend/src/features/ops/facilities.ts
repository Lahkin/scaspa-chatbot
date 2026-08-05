import type { Facility } from '@/lib/types';

/**
 * The facility filter's options — one list, used by `/vessels` and `/flights`.
 *
 * Shared rather than declared twice on purpose. Two copies of a list like this
 * drift the moment a fifth facility is added, and the drift is invisible because
 * each screen looks right on its own — which is exactly the defect T-16 merged
 * away one component over, and the one board 22 exists to prevent.
 *
 * ## The labels are the published names, not prettified keys
 *
 * `deep_water_harbour` renders as "Deep Water Harbour" because that is what
 * SCASPA calls it, not because the underscore was replaced with a space. The
 * airport is "R. L. Bradshaw" in a control this narrow and
 * "Robert L. Bradshaw International Airport" in prose — the abbreviation is the
 * design's own, from §6.2's location list.
 *
 * ## Nevis is deliberately absent
 *
 * Vance W. Amory and Charlestown Port are in the design's location list and are
 * **not** in the wire's `Facility` union, so they cannot appear here. That is a
 * scoping decision rather than an oversight — see `docs/found-during-build.md`,
 * the day-of talking points. Adding them is one line in the backend enum plus
 * fixture rows; this list follows the union and needs no separate edit.
 */
export const FACILITY_FILTERS: readonly { value: Facility | 'all'; label: string }[] = [
  { value: 'all', label: 'All facilities' },
  { value: 'deep_water_harbour', label: 'Deep Water Harbour' },
  { value: 'port_zante', label: 'Port Zante' },
  { value: 'basseterre_ferry_terminal', label: 'Basseterre Ferry Terminal' },
  { value: 'rlb_airport', label: 'R. L. Bradshaw' },
];

/**
 * `'all'` means "send nothing", not "send all".
 *
 * The API treats an absent `facility` as unfiltered; a literal `facility=all`
 * would match no row, because no row's facility is the string "all". Every
 * caller needs this conversion, so it lives beside the list rather than being
 * re-derived at each call site.
 */
export function facilityParam(value: Facility | 'all'): Facility | undefined {
  return value === 'all' ? undefined : value;
}
