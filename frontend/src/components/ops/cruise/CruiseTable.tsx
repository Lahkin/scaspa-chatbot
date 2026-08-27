import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { OpsCell, OpsRow, OpsRowCard, OpsTable, type Density } from '@/components/ops/OpsTable';
import { formatCallDate } from '@/lib/portDate';
import type { CruiseCall } from '@/lib/types';

/**
 * The published cruise schedule as a table.
 *
 * Columns are the ones SCASPA publishes and no others — **Date · Time · Vessel ·
 * Cruise line · Pier · PAX · Capacity**. The endpoint behind this returns
 * captain, pilot, agent and ship-worker counts as well, and the backend drops
 * them before they reach a schema; nothing here would render them if they
 * arrived, but the absence of a column is the more durable guard.
 */
const COLUMNS = ['Date', 'Time', 'Vessel', 'Cruise line', 'Pier', 'PAX', 'Capacity'] as const;
const WIDTHS = [1.1, 1, 1.6, 1.3, 0.9, 0.7, 0.8] as const;

export function CruiseTable({
  calls,
  density,
  toolbar,
  footer,
}: {
  calls: readonly CruiseCall[];
  density: Density;
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <OpsTable
      caption="Published cruise calls: date, time in port, vessel, cruise line, pier, passengers and capacity"
      columns={COLUMNS}
      widths={WIDTHS}
      toolbar={toolbar}
      density={density}
      footer={footer}
      cards={calls.map((call) => (
        <OpsRowCard
          key={key(call)}
          title={
            <>
              {call.vessel}
              {call.inaugural ? <InauguralTag /> : null}
            </>
          }
          fields={[
            { label: 'Date', value: <DateCell call={call} /> },
            { label: 'Time in port', value: call.window || <NotPublished what="time in port" /> },
            {
              label: 'Cruise line',
              value: call.cruise_line || <NotPublished what="cruise line" />,
            },
            { label: 'Pier', value: call.pier || <NotPublished what="pier" /> },
            { label: 'PAX', value: <Count value={call.pax} what="passenger count" /> },
            { label: 'Capacity', value: <Count value={call.capacity} what="capacity" /> },
          ]}
        />
      ))}
    >
      {calls.map((call) => (
        <OpsRow key={key(call)} density={density}>
          {/*
            The vessel is the row's identifier and takes the `first` treatment,
            but it is the THIRD column — the schedule is read down the date. So
            the date cell is an ordinary `td` and the name still gets the scope
            and the weight, which is what `first` is actually for.
          */}
          <OpsCell>
            <DateCell call={call} />
          </OpsCell>
          <OpsCell numeric>{call.window || <NotPublished what="time in port" />}</OpsCell>
          <OpsCell first>
            {call.vessel}
            {call.inaugural ? <InauguralTag /> : null}
          </OpsCell>
          <OpsCell>{call.cruise_line || <NotPublished what="cruise line" />}</OpsCell>
          <OpsCell>{call.pier || <NotPublished what="pier" />}</OpsCell>
          <OpsCell numeric>
            <Count value={call.pax} what="passenger count" />
          </OpsCell>
          <OpsCell numeric>
            <Count value={call.capacity} what="capacity" />
          </OpsCell>
        </OpsRow>
      ))}
    </OpsTable>
  );
}

/**
 * Date and vessel together are the natural key — the backend's primary key on
 * the stored table, for the same reason: the published page carries no id of
 * its own, and two calls by one ship on one day would be a publishing error
 * rather than a case to model.
 */
function key(call: CruiseCall): string {
  return `${call.call_date}-${call.vessel}`;
}

/**
 * `2 Sep 2026`, with the published day name under it.
 *
 * The weekday comes from SCASPA's own `day` column rather than being computed
 * from the date. They will almost always agree; where they do not, the
 * Authority's table is the thing being reproduced, and a client that silently
 * corrected it would hide a publishing error instead of surfacing it.
 */
function DateCell({ call }: { call: CruiseCall }) {
  return (
    <span className="flex flex-col">
      <time dateTime={call.call_date} className="tabular">
        {formatCallDate(call.call_date)}
      </time>
      {call.day ? <span className="text-caption text-ink-subtle">{call.day}</span> : null}
    </span>
  );
}

/**
 * A number SCASPA has not published — **never a zero**.
 *
 * The published table writes an unknown passenger count as `0`; the parser turns
 * that into null precisely so this cell can say "not published" instead of
 * "nobody is on board". Rendering `?? 0` here would put the lie back one layer
 * further down than the last place anyone looked for it.
 */
function Count({ value, what }: { value: number | null; what: string }) {
  if (value === null) return <NotPublished what={what} />;
  return <>{value.toLocaleString('en-GB')}</>;
}

/**
 * The em dash, plus the reason, for a screen reader.
 *
 * Sighted readers get the dash and the column heading, which together are
 * enough. A screen-reader user hears "PAX, dash", which is indistinguishable
 * from a rendering fault, so the sentence is there for them.
 */
function NotPublished({ what }: { what: string }) {
  return (
    <span className="text-ink-subtle">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{what} not published</span>
    </span>
  );
}

/**
 * The inaugural flag, which SCASPA publishes and nothing else on this screen
 * carries.
 *
 * The `neutral` tone deliberately. It is a fact about the call — this ship's
 * first visit — not an operational status, and giving it a coloured tone would
 * put it into the vocabulary a reader scans for delays and berth changes. The
 * `srPrefix` is there because "Inaugural" beside a ship's name is ambiguous read
 * aloud in a way it is not when it is visibly a tag.
 */
function InauguralTag() {
  return (
    <span className="ml-2">
      <Badge srPrefix="First call by this vessel: ">Inaugural</Badge>
    </span>
  );
}
