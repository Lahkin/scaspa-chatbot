/**
 * Mock operational data. **Dev and test only.**
 *
 * These mirror `backend/app/ops/fixtures.py` **value for value** — the same
 * vessel names, the same `ZZ`/`QQ`/`XX` codes, the same `WHF-40`-style tariff
 * codes and the same amounts. A mock that is prettier than the real fixture is a
 * mock that hides a rendering bug until the day someone points the app at a real
 * backend, and CI has no backend, so every test in this repository runs against
 * this file.
 *
 * Written to the same contract, `docs/decisions.md` 0032: realistic in every
 * field that shapes a layout, synthetic in every field a reader could write down
 * and act on.
 *
 * ## The one deliberate divergence: timestamps
 *
 * The backend computes times relative to the current hour so the board is never
 * stale-looking. **These are fixed ISO instants**, because a test asserting on a
 * moving clock is a test that fails at midnight. The *shape* is mirrored —
 * varied minutes, both ETA and ATA where the backend has both, nulls where the
 * backend has nulls — and only the anchor differs.
 */

import type {
  CruiseCall,
  DataSource,
  GuideTopic,
  Flight,
  GateAssignment,
  MarineAdvisory,
  OperatorProfile,
  SupportDirectory,
  TariffRow,
  VesselArrival,
  VesselPosition,
} from '@/lib/types';

/** Matches the backend's `FIXTURE_NOTICE` — the banner the UI must render. */
export const FIXTURE_SOURCE: DataSource = {
  kind: 'fixture',
  label: 'Sample data (development fixture)',
  as_of: '2026-07-30T12:00:00Z',
  notice:
    'SAMPLE DATA — not real SCASPA operational information. Every vessel, flight, ' +
    'agent and figure on this screen is invented for development. Do not use it to ' +
    'plan anything.',
};

/** What the UI gets when no feed is configured, which is the production default. */
export const UNAVAILABLE_SOURCE: DataSource = {
  kind: 'unavailable',
  label: 'No operational feed configured',
  as_of: null,
  notice:
    'Live operational data is not connected. SCASPA has not published a feed to this ' +
    'assistant, so nothing is shown rather than something guessed. Call SCASPA on ' +
    '869-465-8121 / 2 / 3 for current arrivals.',
};

/**
 * Eleven movements across three facilities — the backend's set exactly.
 *
 * All five `VesselStatus` values including `departed` and `unknown`, all four
 * ETA/ATA combinations, and one movement the feed declines to place.
 */
export const MOCK_VESSELS: VesselArrival[] = [
  {
    id: 'fx-vessel-1',
    name: 'MV SAMPLE CARRIER',
    imo: 'IMO 0000001',
    vessel_type: 'Container',
    agent: 'Placeholder Shipping Ltd.',
    berth: 'Berth 1',
    facility: 'deep_water_harbour',
    status: 'at_berth',
    eta: '2026-07-30T05:15:00Z',
    ata: '2026-07-30T06:42:00Z',
  },
  {
    id: 'fx-vessel-2',
    name: 'MV SAMPLE TRADER',
    imo: 'IMO 0000002',
    vessel_type: 'Tanker',
    agent: 'Placeholder Marine Services',
    berth: 'Berth 2',
    facility: 'deep_water_harbour',
    status: 'at_berth',
    // Arrived unannounced — no ETA was ever filed.
    eta: null,
    ata: '2026-07-30T02:05:00Z',
  },
  {
    id: 'fx-vessel-3',
    name: 'MV SAMPLE MERIDIAN',
    imo: 'IMO 0000003',
    vessel_type: 'Container',
    agent: 'Placeholder Shipping Ltd.',
    berth: 'Berth 3',
    facility: 'deep_water_harbour',
    status: 'en_route',
    eta: '2026-07-30T12:20:00Z',
    ata: null,
  },
  {
    id: 'fx-vessel-4',
    name: 'MV SAMPLE PROVIDER',
    imo: 'IMO 0000004',
    vessel_type: 'General cargo',
    agent: 'Placeholder Marine Services',
    berth: 'Berth 4',
    facility: 'deep_water_harbour',
    status: 'scheduled',
    eta: '2026-07-31T04:45:00Z',
    ata: null,
  },
  {
    // `departed` — settled and closed, so it takes no status hue.
    id: 'fx-vessel-5',
    name: 'MV SAMPLE ENDEAVOUR',
    imo: 'IMO 0000005',
    vessel_type: 'Container',
    agent: 'Placeholder Shipping Ltd.',
    berth: 'Berth 1',
    facility: 'deep_water_harbour',
    status: 'departed',
    eta: '2026-07-29T05:30:00Z',
    ata: '2026-07-29T06:55:00Z',
  },
  {
    id: 'fx-vessel-6',
    name: 'MV SAMPLE VOYAGER',
    imo: 'IMO 0000006',
    vessel_type: 'Cruise',
    agent: 'Placeholder Cruise Agency',
    berth: 'Pier 1',
    facility: 'port_zante',
    status: 'at_berth',
    eta: '2026-07-30T03:00:00Z',
    ata: '2026-07-30T03:12:00Z',
  },
  {
    id: 'fx-vessel-7',
    name: 'MV SAMPLE HORIZON',
    imo: 'IMO 0000007',
    vessel_type: 'Cruise',
    agent: 'Placeholder Cruise Agency',
    berth: 'Pier 2',
    facility: 'port_zante',
    status: 'en_route',
    eta: '2026-07-30T11:35:00Z',
    ata: null,
  },
  {
    id: 'fx-vessel-8',
    name: 'MV SAMPLE AURORA',
    imo: 'IMO 0000008',
    vessel_type: 'Cruise',
    agent: 'Placeholder Cruise Agency',
    berth: 'Pier 1',
    facility: 'port_zante',
    status: 'scheduled',
    eta: '2026-07-31T11:10:00Z',
    ata: null,
  },
  {
    id: 'fx-vessel-9',
    name: 'MV SAMPLE CROSSING',
    imo: 'IMO 0000009',
    vessel_type: 'Passenger ferry',
    agent: 'Placeholder Ferry Services',
    berth: 'Ferry berth 1',
    facility: 'basseterre_ferry_terminal',
    status: 'at_berth',
    eta: null,
    ata: '2026-07-30T08:25:00Z',
  },
  {
    id: 'fx-vessel-10',
    name: 'MV SAMPLE PASSAGE',
    imo: 'IMO 0000010',
    vessel_type: 'Passenger ferry',
    agent: 'Placeholder Ferry Services',
    berth: 'Ferry berth 2',
    facility: 'basseterre_ferry_terminal',
    status: 'en_route',
    eta: '2026-07-30T10:50:00Z',
    ata: null,
  },
  {
    // `unknown`, no facility, no berth, neither time. Every absence at once —
    // the row that proves the table renders what it was not told.
    id: 'fx-vessel-11',
    name: 'MV SAMPLE LEEWARD',
    imo: 'IMO 0000011',
    vessel_type: 'General cargo',
    agent: 'Placeholder Marine Services',
    berth: '',
    facility: null,
    status: 'unknown',
    eta: null,
    ata: null,
  },
];

/** Twelve movements at RLB — seven arrivals, five departures, all six statuses. */
export const MOCK_FLIGHTS: Flight[] = [
  {
    id: 'fx-flight-1',
    flight_no: 'ZZ 1111',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Sampleton',
    port_code: 'XXX',
    gate: 'Gate 1',
    status: 'landed',
    scheduled_time: '2026-07-30T07:05:00Z',
    estimated_time: null,
  },
  {
    // `arrived` — differs from `landed` by glyph and label, never by hue.
    id: 'fx-flight-2',
    flight_no: 'QQ 2222',
    airline: 'Sample Air',
    airline_code: 'QQ',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Exampleton',
    port_code: 'XYZ',
    gate: 'Gate 2',
    status: 'arrived',
    scheduled_time: '2026-07-30T07:40:00Z',
    estimated_time: null,
  },
  {
    // Both times, so the struck-through original renders beside the revision.
    id: 'fx-flight-3',
    flight_no: 'ZZ 3333',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Nowhere City',
    port_code: 'ZZZ',
    gate: 'Gate 4',
    status: 'delayed',
    scheduled_time: '2026-07-30T10:15:00Z',
    estimated_time: '2026-07-30T11:30:00Z',
  },
  {
    // Null gate — "not reported", never "TBD".
    id: 'fx-flight-4',
    flight_no: 'XX 4444',
    airline: 'Example Airlines',
    airline_code: 'XX',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Placeholder Bay',
    port_code: 'PBY',
    gate: null,
    status: 'on_time',
    scheduled_time: '2026-07-30T11:50:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-5',
    flight_no: 'QQ 5555',
    airline: 'Sample Air',
    airline_code: 'QQ',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Sampleton',
    port_code: 'XXX',
    gate: 'Gate 3',
    status: 'on_time',
    scheduled_time: '2026-07-30T13:10:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-6',
    flight_no: 'ZZ 6666',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Exampleton',
    port_code: 'XYZ',
    gate: null,
    status: 'cancelled',
    scheduled_time: '2026-07-30T14:25:00Z',
    estimated_time: null,
  },
  {
    // No airline code — the dashed avatar with a plane glyph. Never invented
    // initials.
    id: 'fx-flight-7',
    flight_no: 'SP 7777',
    airline: 'Placeholder Charter',
    airline_code: '',
    direction: 'arrival',
    facility: 'rlb_airport',
    port: 'Nowhere City',
    port_code: 'ZZZ',
    gate: null,
    status: 'on_time',
    scheduled_time: '2026-07-30T16:45:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-8',
    flight_no: 'ZZ 1112',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    direction: 'departure',
    facility: 'rlb_airport',
    port: 'Sampleton',
    port_code: 'XXX',
    gate: 'Gate 1',
    status: 'boarding',
    scheduled_time: '2026-07-30T09:55:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-9',
    flight_no: 'QQ 2223',
    airline: 'Sample Air',
    airline_code: 'QQ',
    direction: 'departure',
    facility: 'rlb_airport',
    port: 'Exampleton',
    port_code: 'XYZ',
    gate: 'Gate 2',
    status: 'delayed',
    scheduled_time: '2026-07-30T10:30:00Z',
    estimated_time: '2026-07-30T12:05:00Z',
  },
  {
    id: 'fx-flight-10',
    flight_no: 'XX 4445',
    airline: 'Example Airlines',
    airline_code: 'XX',
    direction: 'departure',
    facility: 'rlb_airport',
    port: 'Placeholder Bay',
    port_code: 'PBY',
    gate: 'Gate 5',
    status: 'on_time',
    scheduled_time: '2026-07-30T12:40:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-11',
    flight_no: 'ZZ 3334',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    direction: 'departure',
    facility: 'rlb_airport',
    port: 'Nowhere City',
    port_code: 'ZZZ',
    gate: 'Gate 6',
    status: 'on_time',
    scheduled_time: '2026-07-30T15:20:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-12',
    flight_no: 'QQ 5556',
    airline: 'Sample Air',
    airline_code: 'QQ',
    direction: 'departure',
    facility: 'rlb_airport',
    port: 'Sampleton',
    port_code: 'XXX',
    gate: null,
    status: 'on_time',
    scheduled_time: '2026-07-30T18:00:00Z',
    estimated_time: null,
  },
];

/**
 * The published schedule — thirty rows across all six categories.
 *
 * Codes are the design's convention and are **load-bearing**: the calculator
 * looks rates up by code, so these and `backend/app/ops/tariffs.py`'s constants
 * are one change. `TON-GT` is three decimals on purpose — §5.9 requires a rate
 * "rendered exactly as published, no rounding".
 */
export const MOCK_TARIFFS: TariffRow[] = [
  // Cargo
  tariff('WHF-20', 'Wharfage — 20 ft container', 'per container', 22.22, 'cargo'),
  tariff('WHF-40', 'Wharfage — 40 ft container', 'per container', 44.44, 'cargo'),
  tariff('WHF-BB', 'Wharfage — break-bulk cargo', 'per tonne', 3.33, 'cargo'),
  tariff('HND-C', 'Container handling', 'per container', 33.33, 'cargo'),
  tariff('HND-BB', 'Break-bulk handling', 'per tonne', 5.55, 'cargo'),
  tariff('REF-C', 'Reefer connection', 'per container per day', 11.11, 'cargo'),
  tariff('HAZ-C', 'Hazardous cargo surcharge', 'per container', 55.55, 'cargo'),
  // Vessel dues
  tariff('DCK-FT', 'Dockage — commercial vessel', 'per ft per 24h', 1.11, 'vessel_dues'),
  tariff('DCK-CR', 'Dockage — cruise vessel', 'per ft per 24h', 2.22, 'vessel_dues'),
  tariff('PIL-E', 'Pilotage — inward', 'per entry', 111.11, 'vessel_dues'),
  tariff('PIL-D', 'Pilotage — outward', 'per departure', 111.11, 'vessel_dues'),
  tariff('TON-GT', 'Tonnage dues', 'per gross tonne', 0.444, 'vessel_dues'),
  tariff('HBR-C', 'Harbour dues', 'per call', 44.44, 'vessel_dues'),
  tariff('TUG-H', 'Tug assistance', 'per hour', 222.22, 'vessel_dues'),
  // Storage
  tariff('STO-D', 'Container storage', 'per container per day', 5.55, 'storage'),
  tariff('STO-DX', 'Container storage — beyond free period', 'per container per day', 8.88, 'storage'), // prettier-ignore
  tariff('STO-BB', 'Break-bulk storage', 'per tonne per day', 2.22, 'storage'),
  tariff('STO-V', 'Vehicle storage', 'per vehicle per day', 6.66, 'storage'),
  tariff('STO-RF', 'Reefer storage', 'per container per day', 9.99, 'storage'),
  // Passenger
  tariff('PAX-H', 'Passenger head tax — cruise', 'per passenger', 11.11, 'passenger', 'port_zante'),
  tariff('PAX-D', 'Departure charge — cruise', 'per passenger', 7.77, 'passenger', 'port_zante'),
  tariff('PAX-F', 'Passenger charge — ferry terminal', 'per passenger', 3.33, 'passenger', 'basseterre_ferry_terminal'), // prettier-ignore
  tariff('PAX-P', 'Port facility charge', 'per passenger', 2.22, 'passenger'),
  // Security
  tariff('SEC-C', 'ISPS security charge — vessel', 'per call', 88.88, 'security'),
  tariff('SEC-P', 'ISPS security charge — passenger', 'per passenger', 1.11, 'security'),
  tariff('SEC-S', 'Container security screening', 'per container', 6.66, 'security'),
  // Aviation — RLB only
  tariff('LDG-T', 'Aircraft landing charge', 'per tonne', 9.99, 'aviation', 'rlb_airport'),
  tariff('PKG-A', 'Aircraft parking', 'per hour', 22.22, 'aviation', 'rlb_airport'),
  tariff('PAX-A', 'Passenger service charge', 'per passenger', 44.44, 'aviation', 'rlb_airport'),
  tariff('SEC-A', 'Aviation security charge', 'per passenger', 5.55, 'aviation', 'rlb_airport'),
];

/** One row, so thirty of them stay readable. Mirrors the backend's `_rate`. */
function tariff(
  code: string,
  service: string,
  basis: string,
  amount: number,
  category: TariffRow['category'],
  facility: TariffRow['facility'] = null
): TariffRow {
  return { code, service, basis, amount, currency: 'XCD', category, facility, kb_id: null, as_of: '2026-01-01' }; // prettier-ignore
}

/** Byte-for-byte the sentence the backend sends. Diverging would hide a copy bug. */
export const MOCK_DISCLAIMER =
  'Estimate only. Each rate above is a published SCASPA tariff, but the total is ' +
  'calculated by this tool from the details you entered — it is not an invoice, ' +
  'not an official customs assessment, and not a valuation. Charges depend on ' +
  'measurements, exemptions and classifications that are confirmed by SCASPA on ' +
  'invoicing. Do not rely on this figure: confirm it with SCASPA on 869-465-8121 / 2 / 3.';

/**
 * Five locations and seven departments — the backend's set exactly.
 *
 * Four of the five have **no address**, which is the case §6.2 requires the card
 * to collapse rather than pad with an em dash. All five share the switchboard,
 * which is the truth: no per-facility number is published anywhere this project
 * can verify.
 */
export const MOCK_DIRECTORY: SupportDirectory = {
  source: FIXTURE_SOURCE,
  locations: [
    {
      name: 'SCASPA — Authority headquarters',
      address: 'P.O. Box 963, Bird Rock, Basseterre, St. Kitts',
      status: '',
      contacts: [
        { label: 'Telephone', value: '869-465-8121 / 2 / 3', kind: 'phone' },
        { label: 'Post', value: 'P.O. Box 963, Bird Rock, Basseterre, St. Kitts', kind: 'post' },
      ],
    },
    {
      name: 'R.L. Bradshaw International Airport',
      address: '',
      status: '',
      contacts: [{ label: 'Via SCASPA', value: '869-465-8121 / 2 / 3', kind: 'phone' }],
    },
    {
      name: 'Deep Water Harbour',
      address: '',
      status: '',
      contacts: [{ label: 'Via SCASPA', value: '869-465-8121 / 2 / 3', kind: 'phone' }],
    },
    {
      name: 'Basseterre Ferry Terminal',
      address: '',
      status: '',
      contacts: [{ label: 'Via SCASPA', value: '869-465-8121 / 2 / 3', kind: 'phone' }],
    },
    {
      name: 'Port Zante cruise terminal',
      address: '',
      status: '',
      contacts: [{ label: 'Via SCASPA', value: '869-465-8121 / 2 / 3', kind: 'phone' }],
    },
  ],
  emergency:
    'In an emergency, call the local emergency services. This assistant is not monitored and ' +
    'cannot raise an alarm. For urgent port matters call SCASPA on 869-465-8121 / 2 / 3.',
  departments: [
    'Port operations',
    'Cargo and customs paperwork',
    'Cruise and passenger services',
    'Ferry services',
    'Airport services',
    'Tariffs and billing',
    'Something else',
  ],
  request_id: 'mock-directory',
};

// ── Assistant cards ──────────────────────────────────────────────────────────
//
// The populated shapes the backend sends on the `card` field and the `card` SSE
// event. Same values as the panels above, because they come from the same feed —
// a card fixture that disagreed with the panel fixture would hide a real bug.

import type { AssistantCard } from '@/lib/types';

export const CARD_VESSELS: AssistantCard = {
  kind: 'vessel_arrivals',
  title: 'Vessel arrivals',
  source: FIXTURE_SOURCE,
  // The card shows the first three; `total` is the whole feed, which is what
  // makes §4.4's "Showing 3 of 12" row true.
  vessels: MOCK_VESSELS.slice(0, 3),
  total: MOCK_VESSELS.length,
  href: '/vessels',
};

/** The production default: a feed that is not connected. Still renders. */
export const CARD_VESSELS_EMPTY: AssistantCard = {
  kind: 'vessel_arrivals',
  title: 'Vessel arrivals',
  source: UNAVAILABLE_SOURCE,
  vessels: [],
  total: 0,
  href: '/vessels',
};

export const CARD_FLIGHTS: AssistantCard = {
  kind: 'flight_schedules',
  title: 'Arrivals',
  source: FIXTURE_SOURCE,
  flights: MOCK_FLIGHTS.filter((flight) => flight.direction === 'arrival').slice(0, 3),
  total: MOCK_FLIGHTS.filter((flight) => flight.direction === 'arrival').length,
  href: '/flights',
};

export const CARD_TARIFF: AssistantCard = {
  kind: 'tariff_calculator',
  title: 'Estimate port charges',
  category: 'cargo',
  href: '/tariffs',
};

export const CARD_TICKET: AssistantCard = {
  kind: 'support_ticket',
  title: 'Raise a support ticket',
  department: 'Port operations',
  subject: 'Query about container storage rates',
  href: '/support',
};

/*
 * The panels that had no feed until the design import asked for them.
 *
 * Same rule as everything above: mirrors `backend/app/ops/fixtures.py` value for
 * value. The positions sit in a neat synthetic arc out at sea rather than on a
 * plausible approach to Basseterre, and the marine notice names `Placeholder
 * Port` and says "sample" in its own headline — see the long note on
 * `sample_marine_advisories`, which explains why that one is the blandest string
 * in either file.
 */
export const MOCK_POSITIONS: VesselPosition[] = [
  {
    id: 'fx-vessel-3',
    name: 'MV SAMPLE MERIDIAN',
    latitude: 17.1,
    longitude: -62.9,
    heading_degrees: 111,
    speed_knots: 11.1,
    reported_by: 'ais',
    reported_at: '2026-07-30T11:48:00Z',
  },
  {
    id: 'fx-vessel-7',
    name: 'MV SAMPLE HORIZON',
    latitude: 17.2,
    longitude: -62.8,
    heading_degrees: 222,
    speed_knots: 2.2,
    reported_by: 'ais',
    reported_at: '2026-07-30T11:36:00Z',
  },
  {
    id: 'fx-vessel-1',
    name: 'MV SAMPLE CARRIER',
    latitude: 17.3,
    longitude: -62.7,
    heading_degrees: 333,
    // Berthed, so no speed. Null rather than 0 — the panel must not print
    // "0.0 kn" for "not reported".
    speed_knots: null,
    reported_by: 'manual',
    reported_at: '2026-07-30T11:05:00Z',
  },
  {
    id: 'fx-vessel-10',
    name: 'MV SAMPLE PASSAGE',
    latitude: 17.25,
    longitude: -62.75,
    // Null heading draws no arrow at all — a marker pointing somewhere it was
    // never told to point is a fabricated bearing.
    heading_degrees: null,
    speed_knots: 8.8,
    reported_by: 'estimated',
    reported_at: '2026-07-30T09:40:00Z',
  },
];

/** Eight stands — §6.8's "2 active of 8" shape. Four active: occupied + boarding. */
export const MOCK_GATES: GateAssignment[] = [
  {
    gate: '1',
    status: 'occupied',
    flight_number: 'ZZ 1111',
    airline: 'Placeholder Airways',
    facility: 'rlb_airport',
    scheduled_at: '2026-07-30T07:05:00Z',
  },
  {
    gate: '2',
    status: 'occupied',
    flight_number: 'QQ 2222',
    airline: 'Sample Air',
    facility: 'rlb_airport',
    scheduled_at: '2026-07-30T07:40:00Z',
  },
  {
    gate: '3',
    status: 'boarding',
    flight_number: 'ZZ 1112',
    airline: 'Placeholder Airways',
    facility: 'rlb_airport',
    scheduled_at: '2026-07-30T09:55:00Z',
  },
  {
    gate: '4',
    status: 'boarding',
    flight_number: 'QQ 2223',
    airline: 'Sample Air',
    facility: 'rlb_airport',
    scheduled_at: '2026-07-30T10:30:00Z',
  },
  { gate: '5', status: 'free', flight_number: null, airline: '', facility: 'rlb_airport', scheduled_at: null }, // prettier-ignore
  { gate: '6', status: 'free', flight_number: null, airline: '', facility: 'rlb_airport', scheduled_at: null }, // prettier-ignore
  { gate: '7', status: 'free', flight_number: null, airline: '', facility: 'rlb_airport', scheduled_at: null }, // prettier-ignore
  {
    gate: '8',
    status: 'closed',
    flight_number: null,
    airline: 'Placeholder Airways',
    facility: 'rlb_airport',
    scheduled_at: null,
  },
];

export const MOCK_MARINE_ADVISORIES: MarineAdvisory[] = [
  {
    id: 'ma-0001',
    port: 'Placeholder Port',
    headline: 'Sample advisory — not a real notice to mariners',
    detail: 'Placeholder text for the advisory panel.',
    severity: 'low',
    issued_at: '2026-07-30T09:45:00Z',
  },
];

/** The demo identity card. Not a user — there is no sign-in to have one. */
export const MOCK_OPERATOR_PROFILE: OperatorProfile = {
  is_demo: true,
  display_name: 'Sample Agent A. Sample',
  division: 'Placeholder Division',
  agent_id: 'SAMPLE-0000-X',
  jurisdiction: 'Placeholder Port',
  role: 'Placeholder Role',
  last_sync: '2026-07-30T11:52:00Z',
  active: true,
  verified: true,
  notice:
    'DEMO ONLY — there is no sign-in. This assistant has no accounts and never knows who is asking. Every detail on this card is invented for design review.',
};

// ── The published cruise schedule ────────────────────────────────────────────
//
// `GET /api/cruise-schedule` is the one operational surface with a REAL source
// behind it in production: Watchtower fetches SCASPA's own endpoint every six
// hours. So this is the only mock in the file whose `source.kind` is
// `published`, and the only one that therefore carries no sample-data banner
// and no hatch.
//
// That combination — authoritative chrome around invented rows — is exactly
// what CLAUDE.md rule 5 is about, so the rule is applied harder here than
// anywhere else in this file. Every operational field is realistic, because the
// layout has to be checked against the shape it will really have: `PORTZANTE`
// is a real pier code and `07:00 - 18:00` is a real published window. Every
// field a reader could write down and act on is unmistakably synthetic — the
// vessel names and the cruise lines say SAMPLE and PLACEHOLDER, and no real
// ship or line appears anywhere below.

/**
 * What the published schedule looks like once Watchtower has fetched it.
 *
 * `as_of` is stamped by the handler at request time rather than fixed here:
 * this is the one source whose whole claim is "here is when we last looked",
 * and a fixed instant would render as "checked 30 Jul 2026" forever.
 */
export const PUBLISHED_CRUISE_LABEL = 'Official SCASPA cruise schedule';

/**
 * Six calls at fixed **offsets from today**, not at fixed dates.
 *
 * The rest of this file pins ISO instants so that tests do not fail at
 * midnight, and that is right for a board whose rows are timestamps. It is
 * wrong here: this screen asks the server for *today*, *tomorrow* and *this
 * week*, so a fixture pinned to July 2026 would answer every one of those
 * questions with an empty table and the empty state would be the only thing
 * anybody ever saw.
 *
 * The offsets are what the tests assert on — "the call two days out is absent
 * from Today and present in This week" — which is a fact about the filter
 * rather than about the calendar.
 */
export const MOCK_CRUISE_OFFSETS: readonly (Omit<CruiseCall, 'call_date' | 'day'> & {
  dayOffset: number;
})[] = [
  {
    dayOffset: 0,
    window: '07:00 - 18:00',
    vessel: 'SAMPLE VOYAGER',
    cruise_line: 'Placeholder Cruise Line',
    pier: 'PORTZANTE',
    inaugural: false,
    pax: 1840,
    capacity: 2100,
  },
  {
    // Two ships on one day: the summary tile counts CALLS, not days, and a
    // fixture with one call a day could never catch it counting the wrong one.
    dayOffset: 0,
    window: '08:00 - 17:00',
    vessel: 'SAMPLE MERIDIAN',
    cruise_line: 'Placeholder Ocean Lines',
    pier: 'PR1E',
    inaugural: false,
    // Unknown, which the published table writes as 0. Rendering it as "0
    // passengers" would state something SCASPA did not.
    pax: null,
    capacity: 930,
  },
  {
    dayOffset: 1,
    window: '06:30 - 16:00',
    vessel: 'SAMPLE ENDEAVOUR',
    cruise_line: 'Placeholder Cruise Line',
    pier: 'PORTZANTE',
    // The inaugural flag, which has no other way of being seen.
    inaugural: true,
    pax: 2650,
    capacity: 2650,
  },
  {
    dayOffset: 3,
    window: '07:00 - 19:00',
    vessel: 'SAMPLE HORIZON',
    cruise_line: 'Placeholder Ocean Lines',
    pier: 'PORTZANTE',
    inaugural: false,
    pax: 1200,
    capacity: 1400,
  },
  {
    dayOffset: 5,
    window: '09:00 - 18:00',
    vessel: 'SAMPLE PROVIDER',
    cruise_line: 'Placeholder Cruise Line',
    pier: 'PR1E',
    inaugural: false,
    pax: 640,
    // Capacity not published for this call.
    capacity: null,
  },
  {
    // Outside the seven-day window on purpose: without it "This week" and "All
    // upcoming" would render identically and neither control would be tested.
    dayOffset: 12,
    window: '07:30 - 17:30',
    vessel: 'SAMPLE TRADER',
    cruise_line: 'Placeholder Ocean Lines',
    pier: 'PORTZANTE',
    inaugural: false,
    pax: null,
    capacity: 1100,
  },
];

// ── Published answers, as `GET /api/guide` returns them ──────────────────────
//
// Shaped like the real payload and worded like a fixture. The real endpoint
// serves the researchers' verified rows, so a mock that paraphrased a genuine
// SCASPA answer would be inventing knowledge-base content — the one thing
// CLAUDE.md rule 5 forbids outright, and the more dangerous for looking
// plausible.
//
// So the questions are shaped like real questions (the layout has to be checked
// against the shape it will really have) and every answer says, in as many
// words, that it is placeholder text.

export const MOCK_GUIDE_TOPICS: GuideTopic[] = [
  {
    name: 'facilities',
    entries: [
      {
        id: 'kb-901',
        question: 'What facilities are available at the airport?',
        answer:
          'PLACEHOLDER — this is mock text, not a SCASPA answer. The real endpoint serves the ' +
          "researchers' verified export. Nothing here describes the actual airport.",
        source_url: 'https://www.scaspa.com/airport-about.html',
        as_of: '2026-07-31',
        volatility: 'low',
      },
      {
        id: 'kb-902',
        question: 'Is there a duty-free shop?',
        answer: 'PLACEHOLDER — mock text. See kb-901.',
        source_url: 'https://www.scaspa.com/airport-about.html',
        // Deliberately much older than the others, so the per-answer date is
        // visibly doing work rather than printing the same value everywhere.
        as_of: '2024-05-09',
        volatility: 'medium',
      },
    ],
  },
  {
    name: 'parking',
    entries: [
      {
        id: 'kb-903',
        question: 'Where can I park at the airport?',
        answer: 'PLACEHOLDER — mock text. See kb-901.',
        source_url: 'https://www.scaspa.com/airport-about.html',
        as_of: '2026-07-31',
        // The cautious end of the scale, so the badge that matters most on a
        // page of published answers is rendered by at least one fixture.
        volatility: 'high',
      },
    ],
  },
];

/**
 * Cargo answers, same contract as `MOCK_GUIDE_TOPICS`.
 *
 * Kept separate so a test can assert the two categories return different sets —
 * a `category` parameter the handler ignored would otherwise look identical to
 * one it honoured.
 */
export const MOCK_CARGO_TOPICS: GuideTopic[] = [
  {
    name: 'customs',
    entries: [
      {
        id: 'kb-910',
        question: 'How do I clear cargo through customs?',
        answer:
          'PLACEHOLDER — this is mock text, not a SCASPA answer. The real endpoint serves the ' +
          "researchers' verified export.",
        source_url: 'https://www.scaspa.com/cargo.html',
        as_of: '2026-07-31',
        volatility: 'medium',
      },
    ],
  },
  {
    name: 'tariffs',
    entries: [
      {
        id: 'kb-911',
        question: 'What are the port charges for cargo?',
        answer: 'PLACEHOLDER — mock text. See kb-910.',
        source_url: 'https://www.scaspa.com/cargo.html',
        as_of: '2026-07-31',
        // Money moves, and this is the badge that says so.
        volatility: 'high',
      },
    ],
  },
];
