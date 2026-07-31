import { cn } from '@/lib/cn';
import type { FlightStatus, VesselStatus } from '@/lib/types';

/**
 * The status pill on a vessel row or a flight row.
 *
 * **Colour is never the only signal.** Every chip renders its own words, and the
 * `srPrefix` says what the word means, because "Delayed" in red and "On time" in
 * green are the same chip to anyone who cannot separate the two — and this is a
 * transport board, where that distinction is the entire content.
 *
 * The fills come from the imported design system and the ink is the *matched*
 * ink for each fill, not the colour the design used for the text. #00AA58 on
 * white measures 3.05:1 and #2DBCFE measures 2.16:1; both fail AA. See the
 * operations block in `styles/tokens.css` and the pair assertions in
 * `tests/contrast.test.ts`.
 */

const VESSEL_LABELS: Record<VesselStatus, string> = {
  at_berth: 'At berth',
  en_route: 'En route',
  scheduled: 'Scheduled',
  departed: 'Departed',
  unknown: 'Unknown',
};

const FLIGHT_LABELS: Record<FlightStatus, string> = {
  on_time: 'On time',
  delayed: 'Delayed',
  landed: 'Landed',
  arrived: 'Arrived',
  boarding: 'Boarding',
  cancelled: 'Cancelled',
};

type Tone = 'active' | 'transit' | 'alert' | 'quiet';

const TONES: Record<Tone, string> = {
  active: 'bg-ops-active-fill text-ops-active-ink',
  transit: 'bg-ops-transit-fill text-ops-transit-ink',
  alert: 'bg-ops-alert-fill text-ops-alert-ink',
  quiet: 'bg-ops-surface-high text-ops-ink-variant',
};

const VESSEL_TONES: Record<VesselStatus, Tone> = {
  at_berth: 'active',
  en_route: 'transit',
  scheduled: 'quiet',
  departed: 'quiet',
  unknown: 'quiet',
};

const FLIGHT_TONES: Record<FlightStatus, Tone> = {
  on_time: 'active',
  boarding: 'transit',
  delayed: 'alert',
  cancelled: 'alert',
  landed: 'quiet',
  arrived: 'quiet',
};

export function VesselStatusChip({ status }: { status: VesselStatus }) {
  return (
    <Chip tone={VESSEL_TONES[status]} label={VESSEL_LABELS[status]} prefix="Vessel status: " />
  );
}

export function FlightStatusChip({ status }: { status: FlightStatus }) {
  return (
    <Chip tone={FLIGHT_TONES[status]} label={FLIGHT_LABELS[status]} prefix="Flight status: " />
  );
}

function Chip({ tone, label, prefix }: { tone: Tone; label: string; prefix: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5',
        'text-caption font-semibold whitespace-nowrap',
        TONES[tone]
      )}
    >
      {/* A dot as well as the fill. Two visual signals rather than one, and it
          survives a forced-colours mode that flattens the background. */}
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      <span className="sr-only">{prefix}</span>
      {label}
    </span>
  );
}
