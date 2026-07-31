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

import type { DataSource, Flight, SupportDirectory, TariffRow, VesselArrival } from '@/lib/types';

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
    kb_id: null,
    as_of: '2026-01-01',
  },
  {
    code: 'SMP-001',
    service: 'Sample dockage — commercial',
    basis: 'per ft per 24h',
    amount: 1.11,
    currency: 'XCD',
    category: 'maritime',
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
