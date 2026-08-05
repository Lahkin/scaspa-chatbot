import { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui';
import { config } from '@/lib/config';
import type { ChartSpec } from '@/lib/types';
import { describeChart } from '@/features/chat/chartLayout';
import { CitationChip } from './CitationChip';
import { ChartDataTable } from './ChartDataTable';

/**
 * A chart from the backend's `ChartSpec`.
 *
 * **The model never draws a chart.** It describes one; the backend validates every
 * figure in the specification against the text of the knowledge-base row it cites
 * and refuses to emit a chart it could not check. This component renders what
 * survived that — it does not compute, aggregate or infer anything.
 *
 * ### Recharts is lazy, and that is not a micro-optimisation
 *
 * Recharts is around 400kB. Most conversations never render a chart, and the
 * audience is on metered roaming data in a terminal building. Loading it for
 * someone asking what time the ferry leaves is a real cost charged to a real
 * person. So `ChartCanvas` — the only module that imports Recharts — is behind
 * `React.lazy`, and a skeleton of the right height holds the space so nothing
 * shifts when it arrives.
 */
const ChartCanvas = lazy(() =>
  import('./ChartCanvas').then((module) => ({ default: module.ChartCanvas }))
);

interface ChartBlockProps {
  spec: ChartSpec;
  /** Index of a series to draw in the accent colour. */
  highlighted?: number | null;
}

export function ChartBlock({ spec, highlighted = null }: ChartBlockProps) {
  // The flag exists so charts can be switched off from the deploy dashboard
  // without a code change. The data table is still rendered, because the numbers
  // are the substance and the drawing is the presentation.
  if (!config.features.charts) {
    return (
      <figure className="my-3 overflow-hidden rounded-panel border border-border bg-surface">
        <ChartDataTable spec={spec} />
        <ChartCaption spec={spec} />
      </figure>
    );
  }

  return (
    <figure className="my-3 overflow-hidden rounded-panel border border-border bg-surface">
      {/*
        ── THE META STRIP IS BLOCKED, AND IT IS NOT FABRICATED ────────────────
        §4 opens: "Every block in this chapter is an operations payload, so
        every one carries a meta strip", and the board draws this card with a
        SAMPLE DATA strip reading `Vessel calls fixture · as of 06:10 AST`.

        `ChartSpec` carries `source: string` — a single `kb-xxx` citation — and
        **no `DataSource`**. A citation is not a provenance record: it has no
        kind, no label, no `as_of` and no notice. Composing one here would be
        inventing the exact claim the strip exists to make truthfully.

        **Waiting on:** `source: DataSource` on `ChartSpec`. When it lands this
        figure becomes a `ProvenanceCard` and nothing else changes.
      */}
      <div className="px-5 pt-4">
        <h3 className="text-section font-semibold text-ink">{spec.title}</h3>
      </div>
      {/*
        role="img" with a computed description. A screen-reader user given only
        "chart" has been told nothing; this says what it measures, over what range
        and which way it goes — the summary a sighted reader gets for free from
        the shape. The exact figures are in the table below.
      */}
      <div role="img" aria-label={describeChart(spec)}>
        <Suspense
          fallback={
            // The same height as the chart, so nothing shifts when Recharts lands.
            <div className="h-chart w-full sm:h-chart-lg" data-testid="chart-skeleton">
              <Skeleton lines={1} />
              <span className="sr-only">Loading chart</span>
            </div>
          }
        >
          <ChartCanvas spec={spec} highlighted={highlighted} />
        </Suspense>
      </div>

      {/*
        ── THE TABLE IS A REAL EQUIVALENT, NOT A FALLBACK ─────────────────────
        §4.3 and §7.7, and this violated both of them at once. It used to render
        the table THREE times: an `sr-only` copy, a toggle defaulting to closed,
        and an `aria-hidden` visible copy behind it.

        "The chart data table is a real equivalent, not a fallback. Always in the
        DOM, same figures, same mandatory caption. **Do not hide it behind a
        toggle that defaults to off.**" And §7.7: "do not `aria-hidden` the chart
        and duplicate it, and do not hide the table behind a toggle."

        One table, visible, always. A sighted reader who cannot judge a shallow
        slope on a projector gets the figures without hunting for a control, and
        nobody hears the same numbers twice.
      */}
      <ChartDataTable spec={spec} />

      <ChartCaption spec={spec} />
    </figure>
  );
}

/**
 * The caption, and it is mandatory.
 *
 * The backend refuses to emit a chart without one and it states whether the
 * figures are official or illustrative. **It is never truncated and never
 * collapsed behind a toggle**: a chart is believed more readily than a sentence,
 * so a chart of port figures whose provenance is hidden is precisely the artefact
 * that ends up in somebody's budget a year later.
 *
 * `text-small`, not `text-caption` — legible at arm's length on a phone, which
 * caption-sized grey text is not.
 */
function ChartCaption({ spec }: { spec: ChartSpec }) {
  return (
    /*
     * The last child of the card, always rendered — §4.2:
     *
     *   padding: 12px 20px; border-top: 1px solid --border;
     *   background: --caution-fill; text: 400 13/20 --text-1
     *
     * Caution-tinted because it is the one thing on the block that states
     * whether the numbers are official. It was a muted line under the figure,
     * which reads as a footnote — and a footnote is the first thing skipped.
     */
    <figcaption className="border-t border-border bg-caution-tint px-5 py-3 text-label leading-5 text-ink">
      {spec.caption}{' '}
      {/* The source as a live chip: the row behind the chart is one tap away
          rather than a code to go and find. */}
      <CitationChip kbId={spec.source} />
      {/* Announced even when the chip resolves to nothing — a chart with no
          readable source is the artefact that ends up in somebody's budget. */}
      <span className="sr-only">{spec.source}</span>
    </figcaption>
  );
}
