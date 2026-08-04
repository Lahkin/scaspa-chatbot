/**
 * Mock operational data. **Dev and test only.**
 *
 * These deliberately mirror `backend/app/ops/fixtures.py` value for value — the
 * same `MV SAMPLE …` names, the same `ZZ` airline code, the same `SMP-` tariff
 * codes. A mock that is prettier than the real fixture is a mock that hides a
 * rendering bug until the day someone points the app at a real backend.
 *
 * Everything here is obviously fake for the same reason it is on the backend:
 * CLAUDE.md rule 5. An arrivals board is believed on sight, and the more
 * convincing it looks the more completely the question of where the data came
 * from stops being asked.
 */

import type {
  DataSource,
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

export const MOCK_VESSELS: VesselArrival[] = [
  {
    id: 'fx-vessel-1',
    name: 'MV SAMPLE CARRIER',
    imo: 'IMO 0000001',
    vessel_type: 'Container',
    agent: 'Placeholder Shipping Ltd.',
    berth: 'Berth 1',
    // Null, mirroring the backend fixture exactly: the field landed in M2, the
    // values land in M4. Inferring a facility from "Berth 1" here is the
    // guess the field exists to stop.
    facility: null,
    status: 'at_berth',
    eta: null,
    ata: '2026-07-30T09:00:00Z',
  },
  {
    id: 'fx-vessel-2',
    name: 'MV SAMPLE VOYAGER',
    imo: 'IMO 0000002',
    vessel_type: 'Cruise',
    agent: 'Placeholder Cruise Agency',
    berth: 'Pier 1',
    facility: null,
    status: 'en_route',
    eta: '2026-07-30T16:30:00Z',
    ata: null,
  },
  {
    id: 'fx-vessel-3',
    name: 'MV SAMPLE TRADER',
    imo: 'IMO 0000003',
    vessel_type: 'Tanker',
    agent: 'Placeholder Marine Services',
    berth: 'Berth 2',
    facility: null,
    status: 'scheduled',
    eta: '2026-07-31T14:00:00Z',
    ata: null,
  },
];

export const MOCK_FLIGHTS: Flight[] = [
  {
    id: 'fx-flight-1',
    flight_no: 'ZZ 1111',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    facility: 'rlb_airport',
    direction: 'arrival',
    port: 'Sampleton',
    port_code: 'XXX',
    gate: 'G-01',
    status: 'on_time',
    scheduled_time: '2026-07-30T14:00:00Z',
    estimated_time: null,
  },
  {
    // The delay case: both times present, so the struck-through original and the
    // revised time can both be rendered.
    id: 'fx-flight-2',
    flight_no: 'ZZ 2222',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    facility: 'rlb_airport',
    direction: 'arrival',
    port: 'Exampleton',
    port_code: 'XYZ',
    gate: 'G-02',
    status: 'delayed',
    scheduled_time: '2026-07-30T15:00:00Z',
    estimated_time: '2026-07-30T16:15:00Z',
  },
  {
    // No gate assigned — the null case the card has to render as an em dash.
    id: 'fx-flight-3',
    flight_no: 'ZZ 3333',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    facility: 'rlb_airport',
    direction: 'arrival',
    port: 'Nowhere City',
    port_code: 'ZZZ',
    gate: null,
    status: 'landed',
    scheduled_time: '2026-07-30T10:30:00Z',
    estimated_time: null,
  },
  {
    id: 'fx-flight-4',
    flight_no: 'ZZ 4444',
    airline: 'Placeholder Airways',
    airline_code: 'ZZ',
    facility: 'rlb_airport',
    direction: 'departure',
    port: 'Sampleton',
    port_code: 'XXX',
    gate: 'G-03',
    status: 'boarding',
    scheduled_time: '2026-07-30T13:00:00Z',
    estimated_time: null,
  },
];

export const MOCK_TARIFFS: TariffRow[] = [
  {
    code: 'SMP-010',
    service: 'Sample wharfage — 20 ft container',
    basis: 'per container',
    amount: 22.22,
    currency: 'XCD',
    category: 'cargo',
    facility: null,
    kb_id: null,
    as_of: '2026-01-01',
  },
  {
    code: 'SMP-011',
    service: 'Sample wharfage — 40 ft container',
    basis: 'per container',
    amount: 44.44,
    currency: 'XCD',
    category: 'cargo',
    facility: null,
    kb_id: null,
    as_of: '2026-01-01',
  },
  {
    code: 'SMP-012',
    service: 'Sample container handling',
    basis: 'per container',
    amount: 33.33,
    currency: 'XCD',
    category: 'cargo',
    facility: null,
    kb_id: null,
    as_of: '2026-01-01',
  },
  {
    code: 'SMP-013',
    service: 'Sample container storage',
    basis: 'per container per day',
    amount: 5.55,
    currency: 'XCD',
    category: 'cargo',
    facility: null,
    kb_id: null,
    as_of: '2026-01-01',
  },
  {
    code: 'SMP-001',
    service: 'Sample dockage — commercial',
    basis: 'per ft per 24h',
    amount: 1.11,
    currency: 'XCD',
    category: 'vessel_dues',
    facility: null,
    kb_id: null,
    as_of: '2026-01-01',
  },
];

/** Byte-for-byte the sentence the backend sends. Diverging would hide a copy bug. */
export const MOCK_DISCLAIMER =
  'Estimate only. Each rate above is a published SCASPA tariff, but the total is ' +
  'calculated by this tool from the details you entered — it is not an invoice, ' +
  'not an official customs assessment, and not a valuation. Charges depend on ' +
  'measurements, exemptions and classifications that are confirmed by SCASPA on ' +
  'invoicing. Do not rely on this figure: confirm it with SCASPA on 869-465-8121 / 2 / 3.';

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
  ],
  emergency:
    'In an emergency, call the local emergency services. This assistant is not monitored and ' +
    'cannot raise an alarm. For urgent port matters call SCASPA on 869-465-8121 / 2 / 3.',
  departments: ['Port operations', 'Tariffs and billing', 'Something else'],
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
  vessels: MOCK_VESSELS,
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
  flights: MOCK_FLIGHTS.filter((flight) => flight.direction === 'arrival'),
  total: 3,
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
 * Same rule as everything above: mirrors `backend/app/ops/fixtures.py` value
 * for value. The positions sit in a neat synthetic line out at sea, the gates
 * are Z-prefixed like the ZZ airline code, and the marine notice names
 * `Placeholder Port` and says "sample" in its own headline — see the long note
 * on `sample_marine_advisories`, which explains why that one is blander than
 * the rest of the file put together.
 */
export const MOCK_POSITIONS: VesselPosition[] = [
  {
    id: 'fx-vessel-1',
    name: 'MV SAMPLE CARRIER',
    latitude: 17.1,
    longitude: -62.9,
    heading_degrees: 111,
    speed_knots: 11.1,
    reported_by: 'ais',
    reported_at: '2026-04-01T09:00:00Z',
  },
  {
    id: 'fx-vessel-3',
    name: 'MV SAMPLE TRADER',
    latitude: 17.3,
    longitude: -62.7,
    heading_degrees: 333,
    // Null, not 0 — the panel must not print "0.0 kn" for "not reported".
    speed_knots: null,
    reported_by: 'manual',
    reported_at: '2026-04-01T08:00:00Z',
  },
];

export const MOCK_GATES: GateAssignment[] = [
  {
    gate: 'Z1',
    status: 'occupied',
    flight_number: 'ZZ111',
    airline: 'Placeholder Air',
    scheduled_at: '2026-04-01T10:00:00Z',
    facility: null,
  },
  {
    gate: 'Z2',
    status: 'boarding',
    flight_number: 'ZZ222',
    airline: 'Placeholder Air',
    scheduled_at: '2026-04-01T11:00:00Z',
    facility: null,
  },
  {
    gate: 'Z3',
    status: 'free',
    flight_number: null,
    airline: '',
    scheduled_at: null,
    facility: null,
  },
  {
    gate: 'Z4',
    status: 'closed',
    flight_number: null,
    airline: '',
    scheduled_at: null,
    facility: null,
  },
];

export const MOCK_MARINE_ADVISORIES: MarineAdvisory[] = [
  {
    id: 'ma-0001',
    port: 'Placeholder Port',
    headline: 'Sample advisory — not a real notice to mariners',
    detail: 'Placeholder text for the advisory panel.',
    severity: 'low',
    issued_at: '2026-04-01T07:00:00Z',
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
  last_sync: '2026-04-01T08:42:00Z',
  active: true,
  verified: true,
  notice:
    'DEMO ONLY — there is no sign-in. This assistant has no accounts and never knows who is asking. Every detail on this card is invented for design review.',
};
