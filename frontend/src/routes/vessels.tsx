import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Input } from '@/components/ui';
import { MetricTile } from '@/components/ops/MetricTile';
import { OpsListState, OpsPage } from '@/components/ops/OpsPage';
import { VesselCard } from '@/components/ops/VesselCard';
import { useVessels } from '@/features/ops/queries';

/**
 * Vessel arrivals — the design's `vessel_arrivals_expanded_view`.
 *
 * The heading says "Arrivals and berth occupancy", not "Real-time monitoring of
 * maritime traffic" as the mockup does. The data is whatever the configured feed
 * last said, its age is printed beside the heading, and with no feed configured
 * there is nothing here at all. Calling that "real-time" would be the screen
 * making a claim the system cannot keep.
 */
function VesselsRoute() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const query = useVessels(submitted ? { q: submitted } : {});

  const data = query.data;
  const vessels = data?.vessels ?? [];

  return (
    <OpsPage
      title="Vessel arrivals"
      intro="Arrivals and berth occupancy across SCASPA port facilities."
      source={data?.source}
      actions={
        <Button
          variant="secondary"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      }
    >
      <div className="flex gap-3 overflow-x-auto pb-1">
        <MetricTile
          label="Vessels at berth"
          value={data?.metrics.vessels_at_berth ?? null}
          suffix={data?.metrics.berth_capacity ? `/ ${data.metrics.berth_capacity} slots` : ''}
        />
        <MetricTile label="Arrivals next 24h" value={data?.metrics.arrivals_next_24h ?? null} />
        <MetricTile
          label="Daily cargo"
          value={data?.metrics.daily_cargo_teu ?? null}
          suffix="TEU"
        />
      </div>

      {/* `Input` and `Button` both omit `className` by design — the design system
          owns their appearance — so layout happens on wrappers around them. */}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
        }}
      >
        <div className="flex-1">
          <Input
            label="Search vessel or IMO"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Vessel name or IMO"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <OpsListState
        isLoading={query.isPending}
        error={query.error ?? null}
        isEmpty={vessels.length === 0}
        emptyTitle={
          submitted ? 'No vessels match that search' : 'No vessel movements are being reported'
        }
        emptyHint={
          submitted
            ? 'Try a different name or IMO number.'
            : 'Call SCASPA on 869-465-8121 / 2 / 3 to check an arrival.'
        }
        onRetry={() => void query.refetch()}
      />

      {vessels.length > 0 ? (
        <>
          <ul className="space-y-3">
            {vessels.map((vessel) => (
              <VesselCard key={vessel.id} vessel={vessel} />
            ))}
          </ul>
          <p className="text-caption text-ops-ink-variant">
            Showing {vessels.length} of {data?.total ?? vessels.length}
          </p>
        </>
      ) : null}
    </OpsPage>
  );
}

export const Route = createFileRoute('/vessels')({
  component: VesselsRoute,
  head: () => ({
    meta: [
      { title: 'Vessel arrivals — SCASPA Assistant' },
      {
        name: 'description',
        content: 'Vessel arrivals and berth occupancy across SCASPA port facilities.',
      },
    ],
  }),
});
