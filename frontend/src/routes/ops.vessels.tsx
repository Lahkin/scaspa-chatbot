import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Input } from '@/components/ui';
import { ConsoleShell } from '@/components/ops/console/ConsoleShell';
import { DataTable, Td, Th, Tr } from '@/components/ops/console/DataTable';
import { Pagination } from '@/components/ops/console/Pagination';
import { ActivityPanel } from '@/components/ops/console/SidePanels';
import { MarineAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { PositionMap } from '@/components/ops/PositionMap';
import { HealthPanel } from '@/components/ops/HealthPanel';
import { IndexStatusPanel } from '@/components/ops/IndexStatusPanel';
import { useHealth } from '@/features/chat/queries';
import { config as appConfig } from '@/lib/config';
import { MetricRow, MetricTile } from '@/components/ops/MetricTile';
import { OpsListState } from '@/components/ops/OpsPage';
import { SourceAge, SourceNotice } from '@/components/ops/SourceNotice';
import { VesselStatusChip } from '@/components/ops/StatusChip';
import { ActualTime, EstimatedTime } from '@/components/ops/TimeCell';
import { useMarineAdvisories, useVesselPositions, useVessels } from '@/features/ops/queries';
import { useNow } from '@/lib/hooks/useNow';

const PAGE_SIZE = 10;
const COLUMNS = ['Vessel', 'IMO', 'Type', 'Agent', 'Berth', 'ETA', 'ATA', 'Status'] as const;

/**
 * `/ops/vessels` — the design's `vessel_arrivals` desktop screen.
 *
 * The mobile `/vessels` route shows the same data as cards; this shows it as a
 * table with the operations panels beside it. Both read the same endpoint and
 * both render the same `SourceNotice`, because the honesty requirement does not
 * change with the viewport.
 *
 * The heading is "Arrivals and berth occupancy", not the mockup's "Real-time
 * monitoring of maritime traffic". Whether it is real-time depends entirely on
 * a feed that may not be connected, and the `SourceAge` line beside the heading
 * is where that question is actually answered.
 */
function OpsVesselsRoute() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [offset, setOffset] = useState(0);
  // Ticks, so "12 minutes ago" in the activity panel does not stay "12 minutes
  // ago" for as long as the tab is open.
  const now = useNow();
  // Separate requests: a screen that draws no map should not wait on one,
  // and a future real AIS integration may be slow without slowing the table.
  const positions = useVesselPositions();
  const marine = useMarineAdvisories();
  const health = useHealth();

  const query = useVessels({
    limit: PAGE_SIZE,
    offset,
    ...(submitted ? { q: submitted } : {}),
  });

  const data = query.data;
  const vessels = data?.vessels ?? [];

  return (
    <ConsoleShell
      breadcrumb={['Console', 'Vessel arrivals']}
      title="Vessel arrivals"
      intro="Arrivals and berth occupancy across SCASPA port facilities."
      actions={
        <Button
          variant="secondary"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      }
      aside={
        <>
          <ActivityPanel vessels={vessels} source={data?.source} now={now} />
          {/*
            §6.7 and §6.9, from `ops/` rather than `console/SidePanels`.
            Both existed twice: the console kept its own pre-handoff versions —
            a heading and a paragraph for positions, and a marine panel whose
            empty state was a different sentence in a neutral fill. §6.9's empty
            state is the one place in the product where a wrong sentence has
            physical consequences, so there is one of it now.
          */}
          {positions.data ? (
            <PositionMap positions={positions.data.positions} source={positions.data.source} />
          ) : null}
          <MarineAdvisoryPanel
            advisories={marine.data?.advisories ?? []}
            total={marine.data?.total ?? 0}
          />
          {/* §6.11 and §6.12 — the health and index panels have no other home. */}
          <HealthPanel health={health} voiceEnabled={appConfig.features.voice} />
          {health ? <IndexStatusPanel index={health.index} /> : null}
        </>
      }
    >
      {data?.source ? (
        <>
          <SourceAge source={data.source} />
          <SourceNotice source={data.source} />
        </>
      ) : null}

      <MetricRow>
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
      </MetricRow>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
          // Back to the first page: staying on page 3 of a new result set shows
          // an empty table for a search that matched plenty.
          setOffset(0);
        }}
      >
        <div className="flex-1">
          <Input
            label="Search vessel name or IMO"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Vessel name or IMO"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <OpsListState
        // §7.5's one skeleton, with the headings that keep the shape stable.
        columns={COLUMNS}
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
          <DataTable
            caption="Vessel arrivals: name, IMO, type, agent, arrival time and status"
            head={
              <>
                <Th>Vessel</Th>
                <Th>IMO</Th>
                <Th>Type</Th>
                <Th>Agent</Th>
                <Th>Berth</Th>
                {/*
                  ── TWO COLUMNS, AND THEY WERE ONE ────────────────────────────
                  This was a single "Arrival" column printing whichever of the
                  two existed, with `Actual` / `Estimated` in a caption beneath.
                  Global rule 2 and §5.4 both refuse it: "One is a prediction,
                  one is a record. **That distinction is the entire point of
                  having two fields.**" A caption under a figure is read after
                  the figure has been believed, and it is the first thing lost
                  when a column is narrow.
                */}
                <Th>ETA</Th>
                <Th>ATA</Th>
                <Th>Status</Th>
              </>
            }
          >
            {vessels.map((vessel, index) => {
              return (
                <Tr key={vessel.id} index={index}>
                  <Td>
                    <span className="font-medium">{vessel.name}</span>
                  </Td>
                  <Td muted nowrap>
                    {vessel.imo ?? '—'}
                  </Td>
                  <Td muted>{vessel.vessel_type || '—'}</Td>
                  <Td muted>{vessel.agent || '—'}</Td>
                  <Td muted nowrap>
                    {vessel.berth || '—'}
                  </Td>
                  {/*
                    §5.4's cells, from the one place that draws them: the tilde,
                    the italic and the weight carry the difference at once, so it
                    survives greyscale and a screen reader.
                  */}
                  <Td nowrap>
                    <EstimatedTime value={vessel.eta} />
                  </Td>
                  <Td nowrap>
                    <ActualTime value={vessel.ata} />
                  </Td>
                  <Td nowrap>
                    <VesselStatusChip status={vessel.status} />
                  </Td>
                </Tr>
              );
            })}
          </DataTable>

          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={data?.total ?? vessels.length}
            onOffsetChange={setOffset}
            noun="arrivals"
          />
        </>
      ) : null}
    </ConsoleShell>
  );
}

export const Route = createFileRoute('/ops/vessels')({
  component: OpsVesselsRoute,
  head: () => ({
    meta: [
      { title: 'Vessel arrivals — SCASPA operations' },
      {
        name: 'description',
        content: 'Vessel arrivals and berth occupancy across SCASPA port facilities.',
      },
    ],
  }),
});
