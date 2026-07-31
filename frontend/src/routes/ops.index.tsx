import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * `/ops` has no dashboard of its own, so it lands on the first section.
 *
 * The design's breadcrumb reads "Dashboard › Vessel Arrivals", implying a
 * landing page above it. There is nothing to put on one: a dashboard summarises
 * across sources, and the two sources here are already summarised by the stat
 * tiles on their own screens. An overview that only re-displayed those tiles
 * would be a click between the user and the data.
 *
 * A redirect rather than a stub, so `/ops` is never a dead end — and the
 * breadcrumb says "Console" instead of "Dashboard", because it does not link
 * anywhere and should not look as though it does.
 */
export const Route = createFileRoute('/ops/')({
  beforeLoad: () => {
    throw redirect({ to: '/ops/vessels' });
  },
});
