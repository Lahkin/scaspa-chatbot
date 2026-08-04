import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Icon, Segmented } from '@/components/ui';
import { AirlineAvatar } from '@/components/ops/AirlineAvatar';
import { ProvenanceCard } from '@/components/ops/ProvenanceCard';
import { VesselStatusChip, FlightStatusChip } from '@/components/ops/StatusChip';
import { CardFooterLink } from './CardFooterLink';
import type { AssistantCard, SourceKind } from '@/lib/types';

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
      /*
       * §4.4. Meta strip, mandatory notice, **at most three rows**, a count row
       * and the footer link. The three-row cap is the handoff's: a chat turn is
       * not a table, and a card that scrolls has become one.
       */
      return (
        <ProvenanceCard
          source={card.source}
          label={card.title}
          className="mt-3"
          footer={<CardFooterLink to="vessels" />}
        >
          {card.vessels.length === 0 ? (
            <EmptyBoard kind={card.source.kind} noun="vessel movements" />
          ) : (
            <>
              <ul>
                {card.vessels.slice(0, MAX_CARD_ROWS).map((vessel) => (
                  <li
                    key={vessel.id}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-label leading-5 font-medium text-ink">
                        {vessel.name}
                      </p>
                      {/*
                        `Berth 2 · 06:40` — §4.4, berth first.
                        The ETA/ATA distinction survives into the compact row: a
                        predicted time is prefixed `~`, because a prediction read
                        as a record is how someone drives to a port for a ship
                        that has not arrived.
                      */}
                      <p className="truncate text-caption font-medium text-ink-muted tabular">
                        {[
                          vessel.berth,
                          vessel.ata
                            ? formatTime(vessel.ata)
                            : vessel.eta
                              ? `~${formatTime(vessel.eta)}`
                              : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <VesselStatusChip status={vessel.status} size="sm" />
                  </li>
                ))}
              </ul>
              <CountRow shown={Math.min(card.vessels.length, MAX_CARD_ROWS)} total={card.total} />
            </>
          )}
        </ProvenanceCard>
      );

    case 'flight_schedules':
      return <FlightCardBlock card={card} />;

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

/** "Maximum 3 rows" — §4.4. A card that scrolls has become a table. */
const MAX_CARD_ROWS = 3;

/**
 * `Showing 3 of 12` — §4.4.
 *
 * `total` comes from the server and is never `rows.length`: implementation
 * requirement #5, "a client-side recount drops to zero under a filter and lies".
 */
function CountRow({ shown, total }: { shown: number; total: number }) {
  return (
    <p className="border-b border-border px-4 py-2.5 text-caption font-medium text-ink-muted tabular">
      Showing {shown} of {total}
    </p>
  );
}

/**
 * The flight card — §4.5.
 *
 * Same shape as the vessel card plus a direction toggle in its own bordered
 * row. The toggle is local state: the card carries one direction's rows, and
 * flipping it is a request the assistant cannot make from inside a settled
 * answer — so it navigates rather than pretending to re-fetch.
 */
function FlightCardBlock({ card }: { card: Extract<AssistantCard, { kind: 'flight_schedules' }> }) {
  const [direction, setDirection] = useState<'arrivals' | 'departures'>('arrivals');

  return (
    <ProvenanceCard
      source={card.source}
      label={card.title}
      className="mt-3"
      footer={<CardFooterLink to="flights" />}
    >
      {/* Its own row with a bottom hairline — §4.5. 26px segments. */}
      <div className="border-b border-border px-4 py-2.5">
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'arrivals', label: 'Arrivals' },
            { value: 'departures', label: 'Departures' },
          ]}
        />
      </div>

      {card.flights.length === 0 ? (
        <EmptyBoard kind={card.source.kind} noun="flights" />
      ) : (
        <>
          <ul>
            {card.flights.slice(0, MAX_CARD_ROWS).map((flight) => (
              <li
                key={flight.id}
                className="flex items-center gap-2.5 border-b border-border px-4 py-2.5"
              >
                <AirlineAvatar code={flight.airline_code} airline={flight.airline} />
                <div className="min-w-0 flex-1">
                  {/* `LI 631 · Antigua` */}
                  <p className="truncate text-label leading-5 font-medium text-ink tabular">
                    {flight.flight_no}
                    {flight.port ? ` · ${flight.port}` : ''}
                  </p>
                  {/*
                    `Due 15:20 · Gate 4`, or `Due 16:05 · gate not reported`.
                    **Never "TBD"** — it sounds like the Authority has decided
                    and is withholding.
                  */}
                  <p className="truncate text-caption font-medium text-ink-muted tabular">
                    Due {formatTime(flight.estimated_time ?? flight.scheduled_time)}
                    {flight.gate ? ` · Gate ${flight.gate}` : ' · gate not reported'}
                  </p>
                </div>
                <FlightStatusChip status={flight.status} size="sm" />
              </li>
            ))}
          </ul>
          <CountRow shown={Math.min(card.flights.length, MAX_CARD_ROWS)} total={card.total} />
        </>
      )}
    </ProvenanceCard>
  );
}

/**
 * An empty board — spec board 16, "total: 0 — card still renders".
 *
 * ## The card is kept so the meta strip is kept
 *
 * "Dropping the block would silently lose the statement about where the
 * emptiness came from." An answer that says "here is the board" with no board
 * at all is worse than an empty one, because the reader cannot tell whether the
 * feed said nothing or the interface failed.
 *
 * ## And there are two different emptinesses
 *
 * A feed that answered with no rows is a fact about today. A feed that is not
 * connected is a fact about the service, and it is the production default. They
 * take different words, and telling someone "nothing recorded for today" when
 * no feed exists would be a claim about the day that nothing supports.
 */
function EmptyBoard({ kind, noun }: { kind: SourceKind; noun: string }) {
  const disconnected = kind === 'unavailable';

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
      <p className="text-small font-medium text-ink">
        {disconnected ? `No ${noun} feed is connected` : `No ${noun} recorded for today`}
      </p>
      <p className="text-caption text-ink-muted">
        {disconnected
          ? 'This assistant has no source for those records at the moment.'
          : 'The record returned nothing for this date. It is not a fault.'}
      </p>
    </div>
  );
}

/**
 * The calculator card — §4.6.
 *
 * > "**Carries no figures at all — not even a prefilled quantity.** … Two empty
 * > 36px fields showing placeholders only — 'Container size', 'Number of units'.
 * > Primary 38px button: 'Open the calculator'. A prefilled quantity would read
 * > as a quote the Authority had made."
 *
 * This used to be a working calculator: a segmented 20ft/40ft control, a units
 * field **defaulting to 1**, a storage-days field, and an inline total. Every
 * one of those is a figure the assistant chose, sitting inside an answer the
 * assistant wrote — which is the reading the whole card is shaped to prevent.
 *
 * The fields here are inert placeholders. They are not inputs: an empty box a
 * user can type into, that then does nothing, is worse than a picture of one.
 * The button is the only control, and it goes to the real calculator.
 */
function InlineCalculator({
  card,
}: {
  card: Extract<AssistantCard, { kind: 'tariff_calculator' }>;
}) {
  return (
    <PlainCard glyph="receipt" title={card.title}>
      <p className="text-label leading-5 text-ink-muted">
        Open the calculator and enter your own figures. Nothing here is prefilled.
      </p>

      {/* Placeholders, drawn and inert — see the note above. */}
      <div aria-hidden="true" className="flex flex-col gap-2">
        {['Container size', 'Number of units'].map((placeholder) => (
          <p
            key={placeholder}
            className="flex h-9 items-center rounded-input border border-border bg-surface-muted px-3 text-body text-ink-muted"
          >
            {placeholder}
          </p>
        ))}
      </div>

      <Link
        to="/tariffs"
        className="inline-flex h-11 items-center justify-center rounded-button bg-brand-500 px-4.5 text-body font-medium text-ink-inverse hover:bg-brand-600 active:bg-brand-700 sm:h-[38px]"
      >
        Open the calculator
      </Link>
    </PlainCard>
  );
}

/**
 * The two cards that carry no operations payload — §4.6 and §4.7.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px
 * 16px glyph --brand-300 + 600 16/24 --text-1 title
 * ```
 *
 * **Deliberately not a `ProvenanceCard`.** The calculator and the ticket form
 * carry no `DataSource` because no feed produced them: the calculator arrives
 * empty and the user drives it, and the ticket's subject is model-written and
 * presented as a draft. Giving either a meta strip would be a provenance claim
 * about figures that do not exist yet — the exact confusion §4.1's strip is
 * there to prevent.
 */
function PlainCard({
  glyph,
  title,
  children,
}: {
  glyph: 'receipt' | 'headset';
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="mt-3 flex flex-col gap-3.5 rounded-panel border border-border bg-surface px-5 py-4.5"
    >
      <h3 className="flex items-center gap-2 text-section font-semibold text-ink">
        <Icon name={glyph} size={16} className="text-brand-300" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The support ticket card — §4.7.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px
 * 16px headset glyph --brand-300 + 600 16/24 --text-1 "Send this to a department"
 * label 500 12/16 --text-3: "Subject — drafted for you, edit before sending"
 * field 36px, --surface-3, 1px solid --brand-500, editable on arrival
 * secondary 38px button, 1px solid --border: "Continue to the form"
 * ```
 *
 * ## The subject is a draft, never a value to confirm
 *
 * "The subject is model-written. It is presented as a draft the user edits,
 * never as a fixed value they merely confirm." The field carries the brand-500
 * edge — the focused treatment — for exactly that reason: it is the one thing
 * on the card asking to be changed.
 *
 * This used to be the whole enquiry form, submitting inline and rendering its
 * own receipt. §4.7 gives this card one field and one button that leaves: the
 * form has a department select, a 4000-character details field and a transcript
 * checkbox whose consequence line is load-bearing (§6.5), and none of that fits
 * — or belongs — inside a chat turn.
 */
function InlineTicket({ card }: { card: Extract<AssistantCard, { kind: 'support_ticket' }> }) {
  const [subject, setSubject] = useState(card.subject);
  const id = 'ticket-subject';

  return (
    <PlainCard glyph="headset" title={card.title}>
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-caption font-medium text-ink-muted">
          Subject — drafted for you, edit before sending
        </label>
        <input
          id={id}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="h-11 rounded-input border border-brand-500 bg-surface-muted px-3 text-body text-ink caret-brand-200 sm:h-9"
        />
      </div>

      <Link
        to="/support"
        search={{ subject }}
        className="inline-flex h-11 items-center justify-center rounded-button border border-border px-4.5 text-body font-medium text-ink hover:bg-surface-muted sm:h-[38px]"
      >
        Continue to the form
      </Link>
    </PlainCard>
  );
}

/**
 * `06:40` — a bare 24-hour clock for a dense row.
 *
 * The meta strip carries the zone (`as of 06:10 AST`); a row does not, because
 * §4.4 writes it `Berth 2 · 06:40` and repeating AST on every line is noise in
 * a card where every time is in the same zone. §10 fixes the 24-hour form.
 *
 * Em dash for a null — never a guess and never "now", per global rule 1.
 */
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';
  return CLOCK.format(when);
}
