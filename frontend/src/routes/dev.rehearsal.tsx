import { createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { config } from '@/lib/config';

/**
 * The demo failure drill — `/dev/rehearsal`.
 *
 * A stub for the same reason as the gallery: everything it renders is behind a
 * `lazy(() => import(...))` guarded by `import.meta.env.DEV`, which is a
 * build-time literal, so the production build emits no chunk for it at all.
 *
 * Documented in `docs/runbook.md` and in `scripts/preflight-frontend.md`.
 */
const Rehearsal = import.meta.env.DEV ? lazy(() => import('@/dev/Rehearsal')) : null;

function RehearsalRoute() {
  if (!Rehearsal) return null;
  return (
    <Suspense fallback={null}>
      <Rehearsal />
    </Suspense>
  );
}

export const Route = createFileRoute('/dev/rehearsal')({
  beforeLoad: () => {
    if (!config.isDev) throw notFound();
  },
  component: RehearsalRoute,
});
