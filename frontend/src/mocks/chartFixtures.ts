/**
 * Charts shaped like the real subjects. **Dev and test only.**
 *
 * Every figure is deliberately fake — repeated digits, round numbers — per
 * CLAUDE.md rule 5, and every caption says so. A plausible-looking cruise
 * passenger count is one that ends up quoted in a slide and then to a journalist.
 *
 * The shapes are real, though, because that is what breaks a chart on a phone:
 * twelve months of labels, seven container sizes, four years of two series.
 */

import type { ChartSpec } from '@/lib/types';

const ILLUSTRATIVE = 'Illustrative sample figures, not official SCASPA statistics.';

/** Twelve points: the case that makes month labels collide at 390px. */
export const CHART_CRUISE_PASSENGERS: ChartSpec = {
  type: 'line',
  title: 'Cruise passengers by month',
  x_label: 'Month',
  y_label: 'passengers',
  series: [
    {
      name: 'Cruise passengers',
      points: [
        { x: 'January', y: 11100 },
        { x: 'February', y: 22200 },
        { x: 'March', y: 33300 },
        { x: 'April', y: 22200 },
        { x: 'May', y: 11100 },
        { x: 'June', y: 4400 },
        { x: 'July', y: 3300 },
        { x: 'August', y: 2200 },
        { x: 'September', y: 1100 },
        { x: 'October', y: 5500 },
        { x: 'November', y: 16600 },
        { x: 'December', y: 27700 },
      ],
    },
  ],
  caption: ILLUSTRATIVE,
  source: 'kb-014',
};

/** Two series over four years — the case that needs the legend and two patterns. */
export const CHART_VESSEL_CALLS: ChartSpec = {
  type: 'bar',
  title: 'Vessel calls per year',
  x_label: 'Year',
  y_label: 'calls',
  series: [
    {
      name: 'Cruise',
      points: [
        { x: '2022', y: 220 },
        { x: '2023', y: 330 },
        { x: '2024', y: 440 },
        { x: '2025', y: 550 },
      ],
    },
    {
      name: 'Cargo',
      points: [
        { x: '2022', y: 110 },
        { x: '2023', y: 110 },
        { x: '2024', y: 220 },
        { x: '2025', y: 220 },
      ],
    },
  ],
  caption: ILLUSTRATIVE,
  source: 'kb-008',
};

export const CHART_CARGO_TONNAGE: ChartSpec = {
  type: 'area',
  title: 'Cargo tonnage over time',
  x_label: 'Quarter',
  y_label: 'tonnes',
  series: [
    {
      name: 'Containerised',
      points: [
        { x: '2024 Q1', y: 111000 },
        { x: '2024 Q2', y: 122000 },
        { x: '2024 Q3', y: 133000 },
        { x: '2024 Q4', y: 144000 },
        { x: '2025 Q1', y: 155000 },
        { x: '2025 Q2', y: 166000 },
      ],
    },
  ],
  caption: ILLUSTRATIVE,
  source: 'kb-004',
};

export const CHART_FLIGHTS: ChartSpec = {
  type: 'line',
  title: 'Flights per month through R.L. Bradshaw International',
  x_label: 'Month',
  y_label: 'flights',
  series: [
    {
      name: 'Scheduled',
      points: [
        { x: 'January', y: 440 },
        { x: 'February', y: 460 },
        { x: 'March', y: 480 },
        { x: 'April', y: 420 },
        { x: 'May', y: 380 },
        { x: 'June', y: 360 },
      ],
    },
    {
      name: 'Charter',
      points: [
        { x: 'January', y: 110 },
        { x: 'February', y: 120 },
        { x: 'March', y: 130 },
        { x: 'April', y: 90 },
        { x: 'May', y: 70 },
        { x: 'June', y: 60 },
      ],
    },
  ],
  caption: ILLUSTRATIVE,
  source: 'kb-011',
};

/**
 * Seven categories — one past the threshold, so this is the chart that flips to a
 * horizontal layout on a phone.
 */
export const CHART_TARIFF_COMPARISON: ChartSpec = {
  type: 'bar',
  title: 'Handling charge by container size',
  x_label: 'Container size',
  y_label: 'XCD',
  series: [
    {
      name: 'Handling charge',
      points: [
        { x: '10ft dry', y: 222 },
        { x: '20ft dry', y: 444 },
        { x: '40ft dry', y: 888 },
        { x: '40ft high cube', y: 999 },
        { x: '20ft reefer', y: 666 },
        { x: '40ft reefer', y: 1111 },
        { x: 'Flat rack', y: 777 },
      ],
    },
  ],
  caption: ILLUSTRATIVE,
  source: 'kb-004',
};

export const ALL_CHART_FIXTURES: { label: string; spec: ChartSpec }[] = [
  { label: 'Cruise passengers by month (line, 12 points)', spec: CHART_CRUISE_PASSENGERS },
  { label: 'Vessel calls per year (bar, 2 series)', spec: CHART_VESSEL_CALLS },
  { label: 'Cargo tonnage over time (area)', spec: CHART_CARGO_TONNAGE },
  { label: 'Flights per month (line, 2 series)', spec: CHART_FLIGHTS },
  { label: 'Tariff by container size (bar, 7 categories)', spec: CHART_TARIFF_COMPARISON },
];
