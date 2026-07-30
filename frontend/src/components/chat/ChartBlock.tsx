import { Suspense, lazy, useState } from 'react';
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
  const [showTable, setShowTable] = useState(false);

  // The flag exists so charts can be switched off from the deploy dashboard
  // without a code change. The data table is still rendered, because the numbers
  // are the substance and the drawing is the presentation.
  if (!config.features.charts) {
    return (
      <figure className="my-3">
        <div className="overflow-x-auto rounded-md border border-border">
          <ChartDataTable spec={spec} />
        </div>
        <ChartCaption spec={spec} />
      </figure>
    );
  }

  return (
    <figure className="my-3">
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
        Always present for a screen reader, whatever the toggle says. A chart is
        data; the data must never be behind a button for someone who cannot see
        the drawing.
      */}
      <div className="sr-only">
        <ChartDataTable spec={spec} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
          className="inline-flex min-h-touch items-center gap-1 rounded-sm text-caption font-medium text-blue-700 underline"
        >
          <span aria-hidden="true">{showTable ? '▾' : '▸'}</span>
          {showTable ? 'Hide the table' : 'View as table'}
        </button>
      </div>

      {showTable && (
        <div className="mt-1 overflow-x-auto rounded-md border border-border" aria-hidden="true">
          {/* aria-hidden because the sr-only copy above already exposes it —
              without this a screen reader reads the same table twice. */}
          <ChartDataTable spec={spec} />
        </div>
      )}

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
    <figcaption className="mt-2 space-y-1">
      <p className="text-small text-ink-muted">{spec.caption}</p>
      <p className="flex flex-wrap items-center gap-1 text-caption text-ink-subtle">
        <span>Every figure comes from</span>
        {/* The source as a live chip: it links into the source panel, so the row
            behind the chart is one tap away rather than a code to go and find. */}
        <CitationChip kbId={spec.source} />
        <span className="sr-only">{spec.source}</span>
      </p>
    </figcaption>
  );
}
