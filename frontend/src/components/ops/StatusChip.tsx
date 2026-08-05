import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { AdvisorySeverity, FlightStatus, GateStatus, VesselStatus } from '@/lib/types';

/**
 * The operational status pill — spec board 07, anatomy and full enumerations.
 *
 * ── ANATOMY (board 07) ───────────────────────────────────────────────────────
 *
 *   26px tall · 12px side padding · full pill
 *   7px dot · 7px gap · 12/16 medium label
 *   fill at 12% · dot and label at full strength
 *
 * The compact size — 24px with a 6px dot — is what sits in a table row, where
 * these appear by the hundred.
 *
 * ── DELIBERATELY QUIETER THAN A PROVENANCE BADGE ─────────────────────────────
 *
 * Board 00c sets the hierarchy: provenance is filled, icon-led and 11px
 * uppercase; operational status is a tinted pill in sentence case. "Provenance
 * outranks operational status, because a wrong status is a mistake and a wrong
 * source is a lie." These must never compete for the same attention.
 *
 * ── COLOUR IS NEVER THE ONLY SIGNAL ──────────────────────────────────────────
 *
 * Three separations the spec draws explicitly, each verified in its greyscale
 * check:
 *
 *   landed vs arrived   Both are positive and both are green. They separate on
 *                       GLYPH — wheels-down against a tick — and on label.
 *   not reported        A dashed container and a HOLLOW dot, so it reads as
 *                       absent rather than as a value. It is not zero, not
 *                       empty and not stationary.
 *   cancelled           The label is raised to --color-critical-text; the enum
 *                       hue is 4.42:1 and may only draw the dot and the border.
 */

type Tone = 'positive' | 'caution' | 'critical' | 'live' | 'settled' | 'absent';

/**
 * The six treatments.
 *
 * `settled` is a fact rather than an alert — "Departed" and "Scheduled" are
 * closed and unremarkable, and the spec gives them no status hue at all.
 * `absent` is the record having no value, which is a different thing again.
 */
/*
 * ── BOARD 07 IS INCONSISTENT WITH FAMILY B; BOARD 00c IS CANONICAL ──────────
 *
 * §1.2 Family B writes the pill as:
 *
 *     border: 1px solid <hue at 45%>   — or 1px solid --border for neutral
 *     background: transparent          — or the 12% tint where noted
 *
 * Board 07 draws its chips FILLED and borderless, and its anatomy panel says
 * "fill at 12%" with no qualifier. Before following either, the exported source
 * was checked for whether board 07 defines a **different component or a special
 * state**. It does not, on four counts:
 *
 * 1. **Same component, not a distinct one.** Both boards' chips are
 *    `inline-flex; gap:7px; height:26px; padding:0 12px; border-radius:999px`
 *    wrapping a 7px dot and a `500 12px/16px` label. Identical markup; only the
 *    container's fill and edge differ. Board 07 introduces no new element,
 *    no modifier and no second geometry.
 * 2. **Same surface.** Both boards' panels are `#171A2B`. Nothing about the
 *    ground it sits on could justify a different treatment.
 * 3. **No label, note or metadata declares a special state.** Board 07's
 *    subtitle is "The full enumerations, including the values today's fixtures
 *    never produce" — a claim about COVERAGE, not about treatment — and its two
 *    section headings are "Anatomy" and "Why unknown is drawn, not guessed".
 *    Nothing says "shown filled", "in context", "on a light surface" or
 *    "alternative".
 * 4. **It is a subset of what board 00c already draws.** 00c's "Operational
 *    family — 5 enums" renders all twenty variants (Vessel 5, Flight 6, Gate 4,
 *    Severity 3, Health 2). Board 07 re-draws nine of them with explanatory
 *    captions. It adds explanation, not treatment.
 *
 * And it diverges on **three unrelated axes plus a label**, which is what drift
 * looks like rather than a designed variant: hued chips filled instead of
 * outlined; `departed`/`scheduled` gaining a `#1E2137` fill; the absent chip
 * dashed in `--border` instead of `--text-3`; and the vessel `unknown` chip
 * labelled "Unknown" where §1.2, §5.4 and board 00c all say "not reported".
 *
 * Finally, §5.12 — board 07's own prose — opens "**Full spec in
 * `01-foundations.md` §1.2.** Anatomy, for the record" and restores the
 * qualifier the panel dropped: "fill at 12% **(where used)**".
 *
 * **Conclusion: board 07 is inconsistent with the canonical family, not a
 * variant of it.** Family B is implemented from §1.2 and board 00c —
 * transparent ground, 45% edge — and nothing here was changed to accommodate
 * board 07. The 12% fill appears only where the handoff notes it: `urgent`, and
 * the "Not priced" line in a tariff quote, which `QuoteResult` draws.
 */
const TONES: Record<Tone, string> = {
  positive: 'border border-positive-edge text-positive',
  caution: 'border border-caution-edge text-caution',
  // The border and the dot are the enum hue; the LABEL is the lifted tint. See
  // the note above and the assertions in tests/contrast.test.ts.
  critical: 'border border-critical-edge text-critical-text',
  live: 'border border-live-edge text-live',
  /*
   * Transparent, like every other variant. It carried `bg-surface-muted`, which
   * is board 07's `#1E2137` rather than board 00c's — 00c draws `departed`,
   * `scheduled` and `closed` as `1px solid #262A42` with nothing behind them,
   * and §1.2's background line notes a tint on `urgent` alone.
   */
  settled: 'border border-border text-ink-muted',
  /*
   * `1px dashed --text-3` — §1.2, and `#6E7490` on board 00c. It was
   * `border-ink-subtle`, which resolves to text-2 and is a step brighter than
   * the handoff draws; board 07 goes the other way and dashes it in `--border`.
   * Neither is canonical. text-3 is 3.74:1 on surface-2, so the 3:1 bar that
   * governs a non-text boundary is still cleared.
   *
   * A dashed outline with nothing behind it is how "the record has no status"
   * is drawn; a fill would make an absence look like a value.
   */
  absent: 'border border-dashed border-text-3 text-ink-muted',
};

/** The dot, in the enum hue at full strength. Hollow for an absent value. */
const DOTS: Record<Tone, string> = {
  positive: 'bg-positive',
  caution: 'bg-caution',
  critical: 'bg-critical',
  live: 'bg-live',
  settled: 'bg-neutral-status',
  // Hollow, `1.5px solid --text-3` — §1.2, and `#6E7490` on board 00c.
  absent: 'border-[1.5px] border-text-3',
};

/** The 12% tint, for the one variant that carries one. See `Variant.filled`. */
const FILLS: Record<Tone, string> = {
  positive: 'bg-positive-tint',
  caution: 'bg-caution-tint',
  critical: 'bg-critical-tint',
  live: 'bg-live-tint',
  settled: 'bg-surface-muted',
  absent: '',
};

interface Variant {
  label: string;
  tone: Tone;
  /** Replaces the dot. Only where the spec separates two same-hue states. */
  icon?: IconName;
  /**
   * The 12% tint behind the outline.
   *
   * **One variant in the whole enumeration has it** — `urgent`, where the fill
   * is the difference between an advisory a reader scrolls past and one they
   * stop at. Everything else is transparent, or the family stops being quieter
   * than a provenance badge.
   */
  filled?: boolean;
}

/*
 * The five vessel statuses.
 *
 * `scheduled` is drawn as "Expected" in caution, not in neutral: board 07 says
 * "the arrival is estimated, not confirmed", and an estimated time shown as
 * settled fact is the failure this whole product is arranged against.
 */
const VESSEL: Record<VesselStatus, Variant> = {
  at_berth: { label: 'Alongside', tone: 'positive' },
  en_route: { label: 'En route', tone: 'live' },
  scheduled: { label: 'Expected', tone: 'caution' },
  departed: { label: 'Departed', tone: 'settled' },
  unknown: { label: 'Not reported', tone: 'absent' },
};

const FLIGHT: Record<FlightStatus, Variant> = {
  /*
   * "Filed and unremarkable. No hue until something changes." — board 07, which
   * labels this chip **Scheduled**. It read "On time", which is a different
   * claim: "on time" says someone has checked against the clock, and "scheduled"
   * says only that the flight is on the list. The wire value is `on_time`; the
   * label the handoff draws is the quieter and more honest of the two.
   */
  on_time: { label: 'Scheduled', tone: 'settled' },
  boarding: { label: 'Boarding', tone: 'live' },
  landed: { label: 'Landed', tone: 'positive', icon: 'wheels-down' },
  arrived: { label: 'Arrived', tone: 'positive', icon: 'check' },
  delayed: { label: 'Delayed', tone: 'caution' },
  cancelled: { label: 'Cancelled', tone: 'critical', icon: 'x' },
};

const GATE: Record<GateStatus, Variant> = {
  occupied: { label: 'Open', tone: 'positive' },
  boarding: { label: 'Boarding', tone: 'live' },
  closed: { label: 'Closed', tone: 'settled' },
  free: { label: 'Unassigned', tone: 'absent' },
};

const SEVERITY: Record<AdvisorySeverity, Variant> = {
  low: { label: 'Notice', tone: 'live', icon: 'info' },
  moderate: { label: 'Warning', tone: 'caution', icon: 'alert' },
  high: { label: 'Urgent', tone: 'critical', icon: 'alert', filled: true },
};

export type StatusChipSize = 'sm' | 'md';

export function VesselStatusChip({
  status,
  size,
}: {
  status: VesselStatus;
  size?: StatusChipSize;
}) {
  return <Chip variant={VESSEL[status]} prefix="Vessel status: " size={size} />;
}

export function FlightStatusChip({
  status,
  size,
}: {
  status: FlightStatus;
  size?: StatusChipSize;
}) {
  return <Chip variant={FLIGHT[status]} prefix="Flight status: " size={size} />;
}

export function GateStatusChip({ status, size }: { status: GateStatus; size?: StatusChipSize }) {
  return <Chip variant={GATE[status]} prefix="Gate status: " size={size} />;
}

export function SeverityChip({
  severity,
  size,
}: {
  severity: AdvisorySeverity;
  size?: StatusChipSize | undefined;
}) {
  return <Chip variant={SEVERITY[severity]} prefix="Severity: " size={size} />;
}

function Chip({
  variant,
  prefix,
  size = 'md',
}: {
  variant: Variant;
  prefix: string;
  size?: StatusChipSize | undefined;
}) {
  const { label, tone, icon, filled } = variant;
  const compact = size === 'sm';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill whitespace-nowrap',
        'text-caption font-medium tabular',
        // 26/7/7 standalone, 24/6/6 in a table row — board 07 anatomy.
        // Bracket pixels: the spacing scale here is enumerated, so `h-6.5`
        // would emit no rule and the chip would be sized by its text.
        compact ? 'h-[24px] gap-1.5 px-2.5' : 'h-[26px] gap-[7px] px-3',
        TONES[tone],
        filled && FILLS[tone]
      )}
    >
      {icon ? (
        <Icon name={icon} size={12} />
      ) : (
        <span
          aria-hidden="true"
          className={cn('rounded-full', compact ? 'size-1.5' : 'size-[7px]', DOTS[tone])}
        />
      )}
      {/* The chip renders its own word, always. The prefix only says which
          KIND of status it is, which the visual context supplies for a sighted
          reader and nothing supplies otherwise. */}
      <span className="sr-only">{prefix}</span>
      {label}
    </span>
  );
}
