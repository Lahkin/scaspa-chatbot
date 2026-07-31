import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, Input } from '@/components/ui';
import { QuoteResult } from '@/components/ops/QuoteResult';
import { SourceNotice } from '@/components/ops/SourceNotice';
import { VesselStatusChip, FlightStatusChip } from '@/components/ops/StatusChip';
import { useSupportTicket, useTariffQuote } from '@/features/ops/queries';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';
import type { AssistantCard } from '@/lib/types';

/**
 * The card the assistant attached, rendered inside the thread.
 *
 * ## What the assistant did and did not contribute
 *
 * It named a kind. That is all. Every row below came from the operational feed
 * after the answer was written, and the `source` notice travels with it — so a
 * card can show "EN ROUTE" in the same answer where the prose says "I cannot see
 * live movements", and both are true.
 *
 * The two interactive cards carry no figures at all: the calculator arrives
 * empty and the user drives it, and the ticket form arrives with a subject the
 * user edits. Neither shows a number the assistant chose.
 *
 * ## Why not `grounded`-gated like the chart
 *
 * `ChartBlock` renders only when `grounded` is true, because a chart's figures
 * come from cited rows and an ungrounded answer means those citations failed.
 * A card's provenance is its own `DataSource`, unrelated to the prose's
 * citations — so gating it on `grounded` would withhold the *more* trustworthy
 * of the two when a sentence above it went wrong.
 */
export function CardBlock({ card }: { card: AssistantCard }) {
  switch (card.kind) {
    case 'vessel_arrivals':
      return (
        <CardShell title={card.title} href={card.href} more={card.total} noun="arrivals">
          <SourceNotice source={card.source} className="mb-3" />
          {card.vessels.length === 0 ? (
            <EmptyRow>No vessel movements are being reported.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {card.vessels.map((vessel) => (
                <li key={vessel.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium text-ink">{vessel.name}</p>
                    <p className="text-caption text-ink-subtle">
                      {/* The ETA/ATA distinction survives into the compact row.
                          A prediction read as a record is how someone drives to
                          a port for a ship that has not arrived. */}
                      {vessel.ata ? 'Arrived' : 'Estimated'} {formatStamp(vessel.ata ?? vessel.eta)}
                      {vessel.berth ? ` · ${vessel.berth}` : ''}
                    </p>
                  </div>
                  <VesselStatusChip status={vessel.status} />
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      );

    case 'flight_schedules':
      return (
        <CardShell title={card.title} href={card.href} more={card.total} noun="flights">
          <SourceNotice source={card.source} className="mb-3" />
          {card.flights.length === 0 ? (
            <EmptyRow>No flights are being reported.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {card.flights.map((flight) => (
                <li key={flight.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium text-ink tabular">
                      {flight.flight_no}
                    </p>
                    <p className="truncate text-caption text-ink-subtle">
                      {flight.port}
                      {flight.port_code ? ` (${flight.port_code})` : ''} ·{' '}
                      {formatTime(flight.estimated_time ?? flight.scheduled_time)}
                      {flight.gate ? ` · ${flight.gate}` : ''}
                    </p>
                  </div>
                  <FlightStatusChip status={flight.status} />
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      );

    case 'tariff_calculator':
      return <InlineCalculator card={card} />;

    case 'support_ticket':
      return <InlineTicket card={card} />;

    default:
      // An unknown kind cannot happen — zod drops it at the boundary — but a
      // `switch` on a union that a backend may extend needs somewhere to land
      // that is not a crash inside a rendered answer.
      return null;
  }
}

/** Header, body, footer link. The anatomy every card in the design shares. */
function CardShell({
  title,
  href,
  more,
  noun,
  children,
}: {
  title: string;
  href?: string | undefined;
  /** Total in the feed. The footer appears only when there is more to see. */
  more?: number | undefined;
  noun?: string | undefined;
  children: ReactNode;
}) {
  const remaining = (more ?? 0) - 0;

  return (
    <section
      aria-label={title}
      className="mt-3 rounded-md border border-border bg-surface-muted p-3"
    >
      <h3 className="mb-2 text-small font-semibold text-ink">{title}</h3>
      {children}
      {href && remaining > 0 ? (
        <p className="mt-2 border-t border-border pt-2">
          <Link
            to={href}
            className="inline-flex min-h-touch items-center text-caption font-medium text-blue-700 underline"
          >
            See all {remaining} {noun}
            <span aria-hidden="true"> ›</span>
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-2 text-caption text-ink-muted">{children}</p>;
}

/**
 * The calculator, in the thread.
 *
 * Arrives empty and stays empty until the user enters quantities. The total
 * comes back from the same endpoint the full page uses and renders through the
 * same `QuoteResult`, so the mandatory disclaimer cannot be lost by being in a
 * different place.
 */
function InlineCalculator({
  card,
}: {
  card: Extract<AssistantCard, { kind: 'tariff_calculator' }>;
}) {
  const [units, setUnits] = useState(1);
  const [storageDays, setStorageDays] = useState(0);
  const [size, setSize] = useState<'20ft' | '40ft'>('20ft');
  const quote = useTariffQuote();

  return (
    <CardShell title={card.title} href={card.href} more={1} noun="published rates">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          quote.mutate({
            category: 'cargo',
            container_size: size,
            units,
            storage_days: storageDays,
          });
        }}
      >
        <fieldset>
          <legend className="text-caption font-medium text-ink">Container size</legend>
          <div className="mt-1 flex gap-2">
            {(['20ft', '40ft'] as const).map((value) => (
              <label
                key={value}
                className="inline-flex min-h-touch min-w-touch cursor-pointer items-center justify-center gap-2 rounded-sm border border-border-strong px-3 text-caption text-ink"
              >
                <input
                  type="radio"
                  name={`size-${card.category}`}
                  checked={size === value}
                  onChange={() => setSize(value)}
                />
                {value}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Containers"
            type="number"
            min={0}
            max={10000}
            numeric
            value={units}
            onChange={(event) => setUnits(Number(event.target.value) || 0)}
          />
          <Input
            label="Days in storage"
            type="number"
            min={0}
            max={365}
            numeric
            value={storageDays}
            onChange={(event) => setStorageDays(Number(event.target.value) || 0)}
          />
        </div>

        <Button type="submit" size="sm" loading={quote.isPending}>
          Calculate
        </Button>
      </form>

      {quote.error ? (
        <p role="alert" className="mt-3 text-caption text-danger">
          {quote.error.message}
        </p>
      ) : null}

      {quote.data ? (
        <div className="mt-3">
          <QuoteResult quote={quote.data} />
        </div>
      ) : null}
    </CardShell>
  );
}

/**
 * The escalation form, in the thread.
 *
 * No name, no email, no attachment — the endpoint accepts none of them, and the
 * form says so before it is filled in rather than after it is sent. The receipt
 * always renders `next_step`, because nobody will make contact first.
 */
function InlineTicket({ card }: { card: Extract<AssistantCard, { kind: 'support_ticket' }> }) {
  const [subject, setSubject] = useState(card.subject);
  const [details, setDetails] = useState('');
  const ticket = useSupportTicket();

  if (ticket.data) {
    return (
      <CardShell title="Ticket raised">
        <p role="status" className="text-small font-semibold text-ink">
          Reference {ticket.data.reference}
        </p>
        <p className="mt-1 text-caption text-ink-muted">
          {ticket.data.department} · {ticket.data.expected_response}
        </p>
        <p className="mt-2 text-caption text-ink">{ticket.data.next_step}</p>
      </CardShell>
    );
  }

  return (
    <CardShell title={card.title}>
      <p className="mb-2 text-caption text-ink-muted">
        No name, email or phone number is collected. You will get a reference to quote —{' '}
        <strong>nobody will contact you first</strong>. To speak to someone now, call{' '}
        <a href={SCASPA_TEL_HREF} className="font-medium text-blue-700 underline">
          {SCASPA_TEL_TEXT}
        </a>
        .
      </p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          ticket.mutate({
            department: card.department,
            subject: subject.trim(),
            details: details.trim(),
          });
        }}
      >
        <Input
          label="Subject"
          value={subject}
          maxLength={200}
          onChange={(event) => setSubject(event.target.value)}
        />
        <Input
          label="Details"
          value={details}
          maxLength={4000}
          onChange={(event) => setDetails(event.target.value)}
        />
        {ticket.error ? (
          <p role="alert" className="text-caption text-danger">
            {ticket.error.message}
          </p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          loading={ticket.isPending}
          disabled={!subject.trim() || !details.trim()}
        >
          Send ticket
        </Button>
      </form>
    </CardShell>
  );
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';
  return when.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';
  return when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
