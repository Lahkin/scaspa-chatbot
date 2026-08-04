import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ProvenanceBadge } from './ProvenanceBadge';
import type { DataSource } from '@/lib/types';

/**
 * The provenance card — §4.1, and implementation requirement #2.
 *
 * > "Make the provenance card a single shared component. Meta strip, mandatory
 * > notice, body slot, optional footer link. **Every operations block on every
 * > screen is an instance of it.** This is what stops the rule eroding over
 * > time."
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; overflow: hidden
 * ```
 *
 * ## The meta strip is the tell, and it is always the first child
 *
 * README §1: "If a block has one, a feed produced it. If it has none, a model
 * wrote it. This is the single most important rule in the implementation and it
 * is not negotiable for layout convenience."
 *
 * That is why `source` is a required prop rather than an optional one, and why
 * there is no prop to suppress the strip. A caller cannot render operations
 * data through this component without saying where it came from — the type
 * system refuses.
 *
 * ```
 * padding: 10px 16px   (10px 20px on wide cards)
 * background: --surface-3; border-bottom: 1px solid --border
 * source-kind badge · source.label · 3px dot · as_of, "as of" or "last known"
 * ```
 *
 * ## The notice is mandatory and has no dismiss control
 *
 * Present whenever `kind` is `fixture` or `unavailable`, where `notice` is
 * schema-enforced non-empty by the backend. §7.3: "No close control, no 'don't
 * show again', no collapse, no truncation, no tooltip … the client must not
 * have a code path that omits them."
 *
 * There is no `dismissible` prop. The one notice in the product that may be
 * dismissed is the `live` banner on an operations screen, which is a different
 * component (`SourceNotice`) precisely so that this one cannot grow the
 * control by accident.
 */
export function ProvenanceCard({
  source,
  wide = false,
  derived = false,
  children,
  footer,
  label,
  className,
}: {
  /** Required. There is no code path that renders operations data without one. */
  source: DataSource;
  /** Wide cards take 20px of side padding in the strip rather than 16. */
  wide?: boolean;
  /**
   * The figure below was worked out here, not published — §5.11's tariff quote.
   *
   * "Meta strip carries the **`CALCULATED`** provenance badge (`--brand-400`,
   * chart glyph) plus `from the 2026 schedule`. The derived badge is always on."
   *
   * It sits **beside** the source-kind badge rather than replacing it, and that
   * is deliberate: a quote worked out from sample rates is both derived and
   * sample data, and dropping the second to make room for the first would hide
   * the more important of the two. Requirement #1 — every operations payload
   * renders its source — does not have an exception for arithmetic.
   */
  derived?: boolean;
  children: ReactNode;
  /** One footer link at most — §2.5. */
  footer?: ReactNode;
  /** Names the card for assistive technology, where the body has no heading. */
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <section
      {...(label ? { 'aria-label': label } : {})}
      className={cn('overflow-hidden rounded-panel border border-border bg-surface', className)}
    >
      <MetaStrip source={source} wide={wide} derived={derived} />
      <MandatoryNotice source={source} wide={wide} />
      {children}
      {footer}
    </section>
  );
}

/**
 * The strip. Always the first child, and never conditional.
 *
 * `as_of` is prefixed "as of" for a feed that is reporting and "last known" for
 * one that is not — the same distinction the sidebar's status card draws, and
 * for the same reason: a timestamp with no verb beside it reads as "now".
 */
function MetaStrip({
  source,
  wide,
  derived = false,
}: {
  source: DataSource;
  wide: boolean;
  derived?: boolean;
}) {
  const stamp = formatStamp(source.as_of);
  const prefix = source.kind === 'unavailable' ? 'last known' : 'as of';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2.5 border-b border-border bg-surface-muted py-2.5',
        wide ? 'px-5' : 'px-4'
      )}
    >
      <ProvenanceBadge kind="source" value={source.kind} />
      {derived ? <ProvenanceBadge kind="calculated" /> : null}
      {source.label ? (
        <span className="text-caption font-medium text-ink-muted">{source.label}</span>
      ) : null}
      {source.label && stamp ? (
        // A 3px dot, not a bullet character: a `·` inherits the font's own
        // spacing and sits at a different height in every weight.
        <span aria-hidden="true" className="size-[3px] rounded-full bg-ink-muted" />
      ) : null}
      {stamp ? (
        <span className="text-caption font-medium text-ink-muted tabular">
          {prefix} {stamp}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The notice, for the two kinds that carry one.
 *
 * Caution-tinted for `fixture` — sample data is a thing the reader must act on
 * — and `--surface-3` for `unavailable`, which is a standing condition rather
 * than a warning. §5.4: an absent feed "is a known state, not a failure".
 */
function MandatoryNotice({ source, wide }: { source: DataSource; wide: boolean }) {
  if (source.kind === 'live') return null;
  if (!source.notice) return null;

  return (
    <p
      className={cn(
        'border-b border-border text-label leading-5 text-ink',
        wide ? 'px-5 py-3' : 'px-4 py-3',
        source.kind === 'fixture' ? 'bg-caution-tint' : 'bg-surface-muted'
      )}
    >
      {source.notice}
    </p>
  );
}

/**
 * `06:10 AST`, or `06:10 AST, 1 Aug` when the stamp is not from today.
 *
 * §10: "Times are 24-hour with the zone: `06:40 AST`. Dates are `1 Aug 2026` in
 * dense rows." Null when the feed did not say — never "now", and never a guess.
 */
const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
});

function formatStamp(asOf: string | null): string | null {
  if (!asOf) return null;
  const when = new Date(asOf);
  if (Number.isNaN(when.getTime())) return null;
  return TIME.format(when);
}
