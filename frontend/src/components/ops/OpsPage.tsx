import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SourceAge, SourceNotice } from './SourceNotice';
import type { DataSource } from '@/lib/types';

/**
 * The shell every operations screen shares: 56px navy bar, back affordance,
 * heading, source notice, then content.
 *
 * Built once because the design's four expanded views differ only in their
 * content — and because the source notice must appear on all of them, which is
 * far more reliable when it is the shell's job than when it is each page's.
 */
export function OpsPage({
  title,
  intro,
  source,
  children,
  actions,
  backLabel = 'Assistant',
}: {
  title: string;
  intro?: string | undefined;
  source?: DataSource | undefined;
  children: ReactNode;
  actions?: ReactNode;
  /**
   * The word beside the back arrow.
   *
   * A prop, defaulting to English, rather than this component reading the
   * locale itself. Only `/settings` is translated; the other pages built on this
   * shell — vessels, flights, tariffs, support, profile — are still English
   * throughout, and a lone Spanish "Asistente" at the top of an otherwise
   * English page is worse than an honest English one. The page that claims a
   * translation passes it; the pages that do not, do not.
   */
  backLabel?: string;
}) {
  return (
    <div className="min-h-dvh bg-ops-surface">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 bg-ops-navy px-4 text-ink-inverse">
        <Link
          to="/chat"
          className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm -ml-2 px-2 text-small font-medium"
        >
          <span aria-hidden="true">←</span>
          <span className="ml-1">{backLabel}</span>
        </Link>
        <h1 className="truncate text-body font-semibold">{title}</h1>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {intro ? (
              <p className="max-w-measure text-small text-ops-ink-variant">{intro}</p>
            ) : null}
            {source ? (
              <p className="mt-1">
                <SourceAge source={source} />
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
        </div>

        {source ? <SourceNotice source={source} className="mt-4" /> : null}

        <div className="mt-5 space-y-5">{children}</div>
      </main>
    </div>
  );
}
