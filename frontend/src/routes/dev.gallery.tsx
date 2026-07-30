import { createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { config } from '@/lib/config';

/**
 * The component gallery, dev only — and *actually* dev only.
 *
 * The route file is a stub on purpose. Everything it renders lives in
 * `src/dev/Gallery.tsx` behind a `lazy(() => import(...))` guarded by
 * `import.meta.env.DEV`, which is a build-time literal — so in a production build
 * the ternary folds to a component that renders nothing, Rollup never follows the
 * import, and no gallery chunk is emitted at all.
 *
 * The earlier arrangement imported the gallery directly and relied on `beforeLoad`
 * throwing `notFound()` in production. That still 404s, but it emitted a ~19KB
 * chunk that was deployed and, once the gallery gained a mock-scenario picker,
 * that chunk contained mock strings. `tests/mocks-not-in-production.test.ts`
 * caught it. Keeping the route file itself means the route tree and the typecheck
 * stay stable, which is what made the obvious alternative
 * (`routeFileIgnorePattern` per mode) unworkable: `npm run build` typechecks
 * before it generates the tree.
 */
const Gallery = import.meta.env.DEV ? lazy(() => import('@/dev/Gallery')) : null;

function GalleryRoute() {
  if (!Gallery) return null;
  return (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  );
}

export const Route = createFileRoute('/dev/gallery')({
  // Belt and braces: the chunk is not built in production, and the route refuses
  // to match there either.
  beforeLoad: () => {
    if (!config.isDev) throw notFound();
  },
  component: GalleryRoute,
});
