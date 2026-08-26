/**
 * A recorded conversation, replayed from a local fixture with **no network at
 * all**.
 *
 * If the venue wifi dies mid-presentation the presenter switches to
 * `/dev/rehearsal` and keeps going. Composure beats perfection, and having a
 * rehearsed second option is what produces composure — a presenter who knows the
 * fallback exists does not panic when the first bar disappears.
 *
 * Every figure is the same obviously-fake placeholder used everywhere else, and
 * the page says plainly that it is a recording. It is a demonstration of the
 * interface, not a claim that the assistant answered while offline.
 */

import type { Message } from '@/features/chat/types';
import { CITATION_FARES, CITATION_SCHEDULE } from '@/mocks/fixtures';
import { CHART_CRUISE_PASSENGERS } from '@/mocks/chartFixtures';

const AT = (minutes: number) => new Date(2026, 3, 1, 14, 30 + minutes, 0);

/**
 * Four exchanges, chosen to cover the four things worth showing: a cited answer,
 * a fee table, a chart, and the refusal — which is the most impressive moment in
 * the demo and the one most teams never think to show.
 */
export const REHEARSED_MESSAGES: Message[] = [
  { id: 'r-u1', role: 'user', text: 'What time is the last ferry back from Nevis?', at: AT(0) },
  {
    id: 'r-a1',
    role: 'assistant',
    text:
      'The last placeholder sailing back from Nevis on a weekday is 18:00 [kb-008]. ' +
      'The one-way adult fare is XCD 44.44 [kb-014]. That information was verified on ' +
      '2026-04-01, so please confirm with SCASPA before you travel.',
    at: AT(0),
    streaming: false,
    grounded: true,
    refusal: false,
    citations: [CITATION_SCHEDULE, CITATION_FARES],
    chart: null,
    activity: [
      {
        id: 'search_scaspa_knowledge-0',
        name: 'search_scaspa_knowledge',
        summary: 'Searching SCASPA knowledge base — ferry schedule',
        ms: 148,
        done: true,
      },
    ],
  },

  { id: 'r-u2', role: 'user', text: 'How much is a 40-foot container?', at: AT(1) },
  {
    id: 'r-a2',
    role: 'assistant',
    text:
      'Here are the placeholder container handling charges at the Deep Water Harbour ' +
      '[kb-014].\n\n' +
      '| Service | Unit | Charge (XCD) |\n' +
      '| --- | --- | --- |\n' +
      '| Container handling, 20ft | Per container | 444.44 |\n' +
      '| Container handling, 40ft | Per container | 888.88 |\n' +
      '| Storage after free period | Per day | 22.22 |\n\n' +
      'These were verified on 2026-04-01. Confirm with SCASPA before you budget against ' +
      'them [kb-008].',
    at: AT(1),
    streaming: false,
    grounded: true,
    refusal: false,
    citations: [CITATION_FARES, CITATION_SCHEDULE],
    chart: null,
    activity: [
      {
        id: 'search_scaspa_knowledge-0',
        name: 'search_scaspa_knowledge',
        summary: 'Searching SCASPA knowledge base — container tariff',
        ms: 162,
        done: true,
      },
    ],
  },

  { id: 'r-u3', role: 'user', text: 'When do cruise ships arrive at Port Zante?', at: AT(2) },
  {
    id: 'r-a3',
    role: 'assistant',
    text:
      'Cruise arrivals at Port Zante peak between January and March [kb-014]. The chart ' +
      'below shows the placeholder monthly pattern.',
    at: AT(2),
    streaming: false,
    grounded: true,
    refusal: false,
    citations: [CITATION_FARES],
    chart: CHART_CRUISE_PASSENGERS,
    activity: [
      {
        id: 'make_chart-0',
        name: 'make_chart',
        summary: 'Building a chart — cruise passengers by month',
        ms: 41,
        done: true,
      },
    ],
  },

  { id: 'r-u4', role: 'user', text: 'Where is my container?', at: AT(3) },
  {
    id: 'r-a4',
    role: 'assistant',
    text:
      'That is not something I can advise on. Questions about customs, immigration, tax ' +
      'or legal matters, about a specific shipment, booking or payment, or about vessel, ' +
      'aircraft or vehicle operations need to go to SCASPA staff directly — they can see ' +
      'the details of your case, and I cannot.',
    at: AT(3),
    streaming: false,
    grounded: false,
    refusal: true,
    refusal_category: 'personal_record',
    citations: [],
    chart: null,
    activity: [],
  },
];
