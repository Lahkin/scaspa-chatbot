import { useId, useState, type ReactNode } from 'react';
import { Button, Icon, Segmented } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { TariffQuoteRequest } from '@/lib/types';

/**
 * Step 2 — two calculators, deliberately unlike each other. §5.10.
 *
 * > "**Two visually distinct forms.** A user must never fill in the wrong one by
 * > muscle memory."
 *
 * |                | Maritime charges                       | Cargo charges                     |
 * | -------------- | -------------------------------------- | --------------------------------- |
 * | Surface        | `--surface-2`                          | `--surface-3`                     |
 * | Icon tile      | 28px, `rgba(56,58,151,0.35)`, ship     | 28px, `--border`, receipt         |
 * | Inner field bg | `--surface-3`                          | `--surface-2`                     |
 *
 * The surfaces swap all the way down, including the field backgrounds, so the
 * two forms do not read as one form with two halves. That is the whole point of
 * the section: a shipping agent pricing a vessel call and a forwarder pricing a
 * container are different people entering different quantities, and a wrong
 * figure here is one somebody quotes to a customer.
 *
 * ## Neither form carries a rate
 *
 * Every price comes from the published table above; these collect **quantities
 * only**. There is no field that would let a user enter a rate, and no currency
 * selector — see `CurrencyLabel`.
 */

/** 0–2000 ft, 0–365 days, 0–10,000 units — the wire's own limits, and §5.10's. */
const LENGTH_MAX = 2000;

/**
 * The vessel types the published schedule distinguishes — **not a list this
 * component chose**.
 *
 * It carries two dockage rates that differ only by type, `DCK-FT` (commercial)
 * and `DCK-CR` (cruise), and `build_quote` picks between them by this value.
 * The wire values mirror `DOCKAGE_BY_VESSEL_TYPE` in `app/ops/tariffs.py`; a
 * third entry belongs here only once a third dockage row is published.
 */
const VESSEL_TYPES = [
  { value: 'commercial', label: 'Commercial vessel' },
  { value: 'cruise', label: 'Cruise vessel' },
] as const;

type VesselType = (typeof VESSEL_TYPES)[number]['value'];
const DAYS_MAX = 365;
const UNITS_MAX = 10_000;

export function MaritimeCalculator({
  onSubmit,
  pending = false,
}: {
  onSubmit: (request: TariffQuoteRequest) => void;
  pending?: boolean;
}) {
  const [length, setLength] = useState('');
  const [stay, setStay] = useState('');
  const [vesselType, setVesselType] = useState<VesselType>('commercial');
  const typeId = useId();

  return (
    <CalculatorCard
      tone="maritime"
      icon="ship"
      title="Maritime charges"
      onSubmit={() =>
        onSubmit({
          // `vessel_dues` on the wire — the discriminator `build_quote`
          // branches on. `tone` above is a *styling* value for §5.10's two
          // surfaces and is deliberately not the same thing.
          category: 'vessel_dues',
          vessel_type: vesselType,
          length_ft: toNumber(length),
          stay_days: toNumber(stay),
        })
      }
      pending={pending}
    >
      <Field label="Vessel type" htmlFor={typeId}>
        {/*
         * UNBLOCKED. It was disabled, and the reason it was disabled has gone.
         *
         * §5.10 draws this select; `build_quote` did not read `vessel_type`, and
         * there was no published list of types to offer — so the control was
         * drawn inert, because an enabled select that changed no figure would be
         * the product implying a rule it does not apply.
         *
         * The schedule now settles both halves itself. It publishes **two
         * dockage rates that differ only by vessel type** — `DCK-FT` for a
         * commercial vessel and `DCK-CR` for a cruise vessel — so the rate does
         * vary, and the options below are the set the table distinguishes rather
         * than a set invented here. That is the whole list: adding a third
         * option means adding a third published dockage row first.
         */}
        <select
          id={typeId}
          value={vesselType}
          onChange={(event) => setVesselType(event.target.value as VesselType)}
          aria-describedby={`${typeId}-note`}
          className="h-11 w-full rounded-input border border-border bg-surface-muted px-3 text-label text-ink sm:h-9.5"
        >
          {VESSEL_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span id={`${typeId}-note`} className="text-caption font-medium text-ink-muted">
          The schedule publishes a different dockage rate for each.
        </span>
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <NumberField
          label="Length"
          unit="ft"
          max={LENGTH_MAX}
          hint="0–2000"
          value={length}
          onChange={setLength}
          tone="maritime"
        />
        <NumberField
          label="Stay"
          unit="days"
          max={DAYS_MAX}
          hint="0–365"
          value={stay}
          onChange={setStay}
          tone="maritime"
        />
      </div>
    </CalculatorCard>
  );
}

export function CargoCalculator({
  onSubmit,
  pending = false,
}: {
  onSubmit: (request: TariffQuoteRequest) => void;
  pending?: boolean;
}) {
  const [size, setSize] = useState<'20ft' | '40ft'>('20ft');
  const [units, setUnits] = useState('');
  const [storage, setStorage] = useState('');

  return (
    <CalculatorCard
      tone="cargo"
      icon="receipt"
      title="Cargo charges"
      onSubmit={() =>
        onSubmit({
          category: 'cargo',
          container_size: size,
          units: toNumber(units),
          storage_days: toNumber(storage),
        })
      }
      pending={pending}
    >
      <Field label="Container size">
        {/* `self-start`: the track hugs its two segments — `align-self:
            flex-start` on the board. A flex column stretches its children by
            default, which turned a 115px control into a full-width one. */}
        <span className="self-start">
          <Segmented
            label="Container size"
            value={size}
            onChange={setSize}
            options={[
              { value: '20ft', label: '20ft' },
              { value: '40ft', label: '40ft' },
            ]}
          />
        </span>
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <NumberField
          label="Units"
          unit="containers"
          max={UNITS_MAX}
          hint="0–10,000"
          value={units}
          onChange={setUnits}
          tone="cargo"
        />
        <NumberField
          label="Storage"
          unit="days"
          max={DAYS_MAX}
          hint="0–365"
          value={storage}
          onChange={setStorage}
          tone="cargo"
        />
      </div>

      <CurrencyLabel />
    </CalculatorCard>
  );
}

/**
 * The shared shell. The tone is the only thing that differs, and it differs
 * everywhere at once.
 */
function CalculatorCard({
  tone,
  icon,
  title,
  onSubmit,
  pending,
  children,
}: {
  tone: Tone;
  icon: 'ship' | 'receipt';
  title: string;
  onSubmit: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      aria-label={title}
      className={cn(
        'flex flex-col gap-4 rounded-panel border border-border px-6 py-5',
        tone === 'maritime' ? 'bg-surface' : 'bg-surface-muted'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-7 items-center justify-center rounded-ghost',
            // One pairing per line: `tests/contrast.test.ts` reads a line at a
            // time and would otherwise measure the two halves of a ternary
            // against each other and report a pair that never renders.
            // `prettier-ignore`, because `prettier --write` collapses this back
            // onto one line and the comment above stops being true.
            // prettier-ignore
            tone === 'maritime'
              ? 'bg-brand-tint text-brand-200'
              : 'bg-border text-brand-300'
          )}
        >
          <Icon name={icon} size={16} />
        </span>
        <h3 className="text-section font-semibold text-ink">{title}</h3>
      </div>

      <div className="flex flex-col gap-2.5">{children}</div>

      <div>
        <Button type="submit" loading={pending} loadingLabel="Working it out">
          Work out the charge
        </Button>
      </div>
    </form>
  );
}

type Tone = 'maritime' | 'cargo';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-label font-medium text-ink">
          {label}
        </label>
      ) : (
        <span className="text-label font-medium text-ink">{label}</span>
      )}
      {children}
    </div>
  );
}

/**
 * A quantity, with its unit and its published range.
 *
 * The range is inside the field rather than beside it because §5.10 draws it
 * there, and it is `500 12/16 --text-3` — a hint, not a label. `min` and `max`
 * mirror the wire's own validation, so a figure the API would reject is refused
 * by the control before it is sent.
 *
 * Empty, never zero. A prefilled quantity reads as a quote the Authority has
 * already made; §4.6 says so of the inline card, and the same is true of a form
 * that opens with `1` in it.
 */
function NumberField({
  label,
  unit,
  max,
  hint,
  value,
  onChange,
  tone,
}: {
  label: string;
  unit: string;
  max: number;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  tone: Tone;
}) {
  const id = useId();

  return (
    <Field label={label} htmlFor={id}>
      <div
        className={cn(
          'flex h-11 items-center gap-2 rounded-input border border-border px-3 focus-within:border-brand-500 sm:h-9.5',
          // The inner field takes the OTHER card's surface — §5.10's swap.
          tone === 'maritime' ? 'bg-surface-muted' : 'bg-surface'
        )}
      >
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={value}
          placeholder={unit}
          onChange={(event) => onChange(event.target.value)}
          className="h-full w-full min-w-0 bg-transparent text-label text-ink tabular outline-none placeholder:text-ink-disabled"
        />
        <span
          aria-hidden="true"
          className="shrink-0 text-caption font-medium text-ink-muted tabular"
        >
          {hint}
        </span>
      </div>
    </Field>
  );
}

/**
 * **Currency is a fixed label, not a select** — §5.10 and §1.4's ninth input.
 *
 * ```
 * height: 32px; padding: 0 12px; --canvas; 1px dashed --border; border-radius: 10px
 * ```
 *
 * Not focusable, not a select, no chevron. The backend refuses anything but XCD
 * — `TariffQuoteRequest` validates it — because converting a published fee
 * applies a rate of exchange nobody published, with more authority than a
 * sentence. The inline note says that in the user's terms rather than leaving
 * them to discover it by trying.
 */
function CurrencyLabel() {
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1">
      <span className="text-label font-medium text-ink">Currency</span>
      <span className="flex h-8 items-center rounded-button border border-dashed border-border bg-canvas px-3 text-label font-medium text-ink-muted tabular">
        XCD
      </span>
      <span className="text-caption font-medium text-ink-muted">
        A label, not a selector — the schedule is published in XCD only
      </span>
    </div>
  );
}

/** `''` → null, so an untouched field is absent rather than zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
