import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { SourceKind, VesselPositionSource, Volatility } from '@/lib/types';

/**
 * The provenance badge family — spec board 00c.
 *
 * ── THE LOUDEST TREATMENT IN THE SYSTEM, ON PURPOSE ──────────────────────────
 *
 * "Filled, icon-led, 11px uppercase. The loudest treatment in the system —
 * provenance outranks operational status, because a wrong status is a mistake
 * and a wrong source is a lie."
 *
 * That sentence is the whole design of this component. A `StatusChip` is a
 * tinted outline pill in sentence case and must stay quieter than this; the two
 * appear in the same row constantly and a reader has to be able to tell at a
 * glance which one is making a claim about where the numbers came from.
 *
 * ── ONE INK ACROSS THE FAMILY ────────────────────────────────────────────────
 *
 * Every saturated fill carries the same near-black ink. That single ink is most
 * of what makes these read as one family rather than as assorted coloured pills
 * — see the derivation note on `--color-absent` in tokens.css, where the spec's
 * own "no feed" fill had to be lifted to keep it.
 *
 * There used to be one exception. On the dark palette the caution fill was a
 * bright amber, white measured 2.29:1 on it, and the ink there was brand-700.
 * The two-theme palette removed the exception rather than doubling it: the
 * light theme's caution is a DARK amber, on which brand-700 is 2.82:1 — so the
 * ink that works is the one every other fill already uses.
 *
 * `--color-ink-on-bright` is the canvas, which means it is near-white on the
 * light ground and near-black on the dark one. That is precisely the behaviour
 * a saturated fill needs, in both directions, and it is why the family can now
 * be one ink with no exception at all. Asserted in tests/contrast.test.ts.
 */

interface Treatment {
  label: string;
  icon?: IconName;
  className: string;
}

/**
 * A saturated fill with the family ink.
 *
 * `--color-ink-on-bright`, not `--color-ink-inverse`. The two are different
 * tokens on purpose: "inverse" is the WHITE that goes on a dark brand fill, and
 * these fills are bright enough that white fails on every one of them.
 */
const FILL = {
  live: 'bg-live text-ink-on-bright',
  positive: 'bg-positive text-ink-on-bright',
  caution: 'bg-caution text-ink-on-bright',
  critical: 'bg-critical text-ink-on-bright',
  absent: 'bg-absent text-ink-on-bright',
  /*
   * Pilot's own hue, and the only badge that wears it.
   *
   * ALL CITED is a claim about VERIFICATION, not about operations. Green in
   * this product means berthed, on time, settled — an operational state — and
   * borrowing it here put a verification result into the status vocabulary,
   * where a reader scanning a screen could reasonably read it as another piece
   * of live information.
   *
   * The ink is `--color-ink-on-aqua`, not `--color-ink-on-bright`: aqua is
   * bright in BOTH themes, so its ink is dark in both, where ink-on-bright is
   * the canvas and therefore near-white on the light ground. The approved
   * mock-up draws this badge as white on aqua at 2.71:1; the hue is kept and
   * the ink is the one that passes. decisions.md 0034.
   */
  aqua: 'bg-aqua text-ink-on-aqua',
  /*
   * ── THIS FILL WAS THE FAMILY'S ONE UNCHECKED EXCEPTION ────────────────────
   *
   * It carried `--color-on-navy-primary`, which is the ink for text ON THE NAVY
   * — a dark ground. Here it is white-ish text on a mid-blue fill, and it
   * measures **2.97:1 on the dark palette and 2.93:1 on the light one**. The
   * badge is 11px semibold, so AA asks 4.5:1, and it failed in both themes.
   *
   * It survived because `tests/contrast.test.ts` enumerated the fills it
   * checked and this one was not among them, and because the two badges wearing
   * it — Operator and Calculated — are rarely on screen. PUBLISHED is not rare:
   * it is on the cruise schedule every time anybody opens it.
   *
   * `--color-ink-on-bright` is the family ink and it is the one that passes:
   * 5.86:1 dark, 4.95:1 light. The exception is removed rather than special-
   * cased, which is what the note at the top of this file says the family is
   * for. Asserted now in tests/contrast.test.ts alongside the others.
   */
  brand: 'bg-brand-400 text-ink-on-bright',
  /** Unfilled — the quiet surface with muted ink. The quietest of the family. */
  quiet: 'bg-surface-muted text-ink-muted',
  /** Outlined and dashed — a value that is not recorded rather than one that is. */
  dashed: 'border border-dashed border-ink-subtle text-ink-muted',
} as const;

/**
 * `source.kind`, the badge that matters most.
 *
 * Rendered on every operations block. `unavailable` is the PRODUCTION DEFAULT —
 * SCASPA has published no feed — so "Live data unavailable" is the badge most
 * users will actually see, and it is a statement about the world rather than
 * a fault in the product.
 *
 * ── FIVE VARIANTS, FOUR OF WHICH THE WIRE CAN PRODUCE ───────────────────────
 *
 * The handoff's Family A draws `none` and `unavailable` as two badges: `none` is
 * the neutral fill with an x reading NO FEED, `unavailable` the divider fill
 * with an info glyph reading NOT CONNECTED. `SourceKind` on the wire is
 * `live | published | fixture | unavailable` and has no `none`, so that one is
 * drawn and unreachable — the same treatment as every other blocked component in
 * `08-blocked-and-forbidden.md`. It is typed here rather than on `SourceKind`
 * so that adding it cannot make a schema accept a value the backend never sends.
 *
 * `published` was the most recent addition and it came from the wire, not from
 * the handoff: the cruise schedule is real SCASPA data on a six-hour snapshot,
 * and the board had no badge that was neither a live feed nor a warning.
 *
 * Which of the two `unavailable` takes is settled by the rest of the handoff
 * rather than by the badge table: §5.7 draws the empty vessels table with "the
 * NO FEED provenance badge" and §6.7 puts the same badge above the position
 * map, and both of those states are `unavailable`. So `unavailable` is NO FEED,
 * and NOT CONNECTED is the one waiting on a value.
 */
type SourceBadgeValue = SourceKind | 'none';

const SOURCE_KIND: Record<SourceBadgeValue, Treatment> = {
  live: { label: 'Live feed', icon: 'lightning', className: FILL.live },
  /*
   * ── "PUBLISHED", AND DELIBERATELY NOT GREEN ─────────────────────────────
   *
   * Official SCASPA information, fetched at a stated time. It wears the brand
   * fill rather than `FILL.live` or `FILL.positive` for two separate reasons.
   *
   * Not live, because the whole point of the fourth kind is that a six-hourly
   * snapshot is not a feed, and two badges a shade apart would collapse that
   * distinction on the one screen where it matters.
   *
   * Not positive, because green in this product means berthed, on time,
   * settled — an operational state. Provenance is not an operational state, and
   * borrowing the hue would put "where this came from" into the vocabulary a
   * reader scans for "what is happening".
   *
   * The badge says PUBLISHED and the stamp beside it says CHECKED <when>. Both
   * halves are required: without the second this is a badge claiming authority
   * with no date on it, which is the failure `as_of` is mandatory to prevent.
   */
  published: { label: 'Published', icon: 'file', className: FILL.brand },
  fixture: { label: 'Sample data', icon: 'alert', className: FILL.caution },
  /*
   * "Live data unavailable", not "No feed".
   *
   * "Feed" is our word for our plumbing. A traveller does not know whether
   * SCASPA publishes a feed, and "NO FEED" in a badge reads as a fault in the
   * thing they are looking at rather than as a description of what is and is not
   * connected. This says what is actually true from the reader's side: the live
   * data is not available. The panel underneath then says why, and what Pilot
   * will not do about it.
   */
  unavailable: { label: 'Live data unavailable', icon: 'x', className: FILL.absent },
  none: { label: 'Not connected', icon: 'info', className: FILL.quiet },
};

/**
 * `reported_by` — "must be distinguishable on a map".
 *
 * An AIS fix and a typed-in position are different kinds of fact, and the
 * console draws them as different marker shapes as well as different badges.
 */
const REPORTED_BY: Record<VesselPositionSource, Treatment> = {
  ais: { label: 'AIS', icon: 'lightning', className: FILL.live },
  manual: { label: 'Operator', icon: 'headset', className: FILL.brand },
  estimated: {
    label: 'Estimated',
    icon: 'chart',
    className: 'border border-dashed border-caution text-caution',
  },
};

/**
 * How fast the fact goes stale.
 *
 * ── NULL IS NOT LOW, AND THIS COMPONENT NEVER SEES THE DIFFERENCE ────────────
 *
 * `volatilityOf()` resolves an absent value to `medium` before it reaches here,
 * per the handoff: "`volatility: null` renders as the cautious case — 'changes
 * often' — never as static or low. It carries the extra ring so a reviewer can
 * see the fallback fired." `defaulted` draws that ring.
 *
 * `static` is the fifth variant and the wire has no value for it — the same
 * arrangement as `none` above. Drawn so that a schedule which never changes
 * has a badge waiting for it rather than a redesign.
 */
type VolatilityBadgeValue = Volatility | 'static';

const VOLATILITY: Record<VolatilityBadgeValue, Treatment> = {
  static: { label: 'Static', className: FILL.quiet },
  low: { label: 'Rarely changes', className: FILL.positive },
  medium: { label: 'Changes often', className: FILL.caution },
  high: { label: 'Check before use', className: FILL.critical },
};

/** Whether the prose's every claim traced back to a retrieved row. */
const GROUNDING = {
  all: { label: 'All cited', icon: 'check', className: FILL.aqua },
  partial: { label: 'Partly cited', icon: 'alert', className: FILL.caution },
  none: { label: 'No source', icon: 'x', className: FILL.critical },
  unchecked: { label: 'Not checked', icon: 'info', className: FILL.quiet },
} as const;

export type ProvenanceBadgeProps =
  | { kind: 'source'; value: SourceBadgeValue }
  | { kind: 'reported-by'; value: VesselPositionSource }
  | { kind: 'volatility'; value: VolatilityBadgeValue; defaulted?: boolean }
  | { kind: 'grounding'; value: keyof typeof GROUNDING }
  /** The tariff total, which is arithmetic rather than a published figure. */
  | { kind: 'calculated' }
  /**
   * The operator profile, whose `is_demo` is a required literal `true`.
   *
   * `short` is the sidebar's bottom row: the same badge at 18px on the small
   * radius, reading DEMO. It is short because the row beside it is 216px wide
   * and already carries two lines of text, not because the claim is smaller.
   */
  | { kind: 'demo'; short?: boolean }
  /** A researcher's verification date, or the absence of one. */
  | { kind: 'checked'; date: string | null };

export function ProvenanceBadge(props: ProvenanceBadgeProps) {
  const treatment = resolve(props);
  const defaulted = props.kind === 'volatility' && props.defaulted === true;
  const short = props.kind === 'demo' && props.short === true;

  return (
    <span
      className={cn(
        // 22px, exactly as the spec draws it. A bracket value rather than a
        // spacing step because this scale is enumerated (--spacing-0..16) and
        // `h-5.5` would compile to nothing at all — the silent failure the
        // token file's header keeps warning about.
        'inline-flex items-center gap-1.5',
        // The short form is the sidebar's DEMO tag: 18px on the small radius,
        // 6px of side padding. Everything else is the family's 22px pill.
        short ? 'h-[18px] rounded-tiny px-1.5' : 'h-[22px] rounded-pill px-2',
        'text-micro font-semibold tracking-badge uppercase',
        treatment.className,
        // The ring the spec draws on a defaulted volatility. Two rings so the
        // badge keeps its own edge against the halo on any surface.
        defaulted && 'ring-1 ring-caution ring-offset-2 ring-offset-surface'
      )}
    >
      {treatment.icon ? <Icon name={treatment.icon} size={12} /> : null}
      {treatment.label}
      {defaulted ? (
        // The badge says "changes often"; only this says the backend never
        // actually reported that. Without it the caution reads as a measurement.
        <span className="sr-only"> — not reported, so the cautious value is shown</span>
      ) : null}
    </span>
  );
}

function resolve(props: ProvenanceBadgeProps): Treatment {
  switch (props.kind) {
    case 'source':
      return SOURCE_KIND[props.value];
    case 'reported-by':
      return REPORTED_BY[props.value];
    case 'volatility':
      return VOLATILITY[props.value];
    case 'grounding':
      return GROUNDING[props.value];
    case 'calculated':
      return { label: 'Calculated', icon: 'chart', className: FILL.brand };
    case 'demo':
      return { label: props.short ? 'Demo' : 'Demo only', className: FILL.caution };
    case 'checked':
      return props.date
        ? { label: `Checked ${props.date}`, className: FILL.quiet }
        : // Not an em dash and not a blank. The absence of a check date is
          // itself the fact worth stating.
          { label: 'No check date', className: FILL.dashed };
  }
}
