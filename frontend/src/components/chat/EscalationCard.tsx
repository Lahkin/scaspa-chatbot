import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { RefusalCategory } from '@/lib/types';
import { EscalationBlock } from './EscalationBlock';

/**
 * A boundary refusal — spec board 15, cards 1 and 2.
 *
 * ## Five refusals that must not look alike
 *
 * The board's whole premise. All five arrive as `refusal: true`, and a single
 * treatment for all of them tells a user that the assistant broke — when in
 * fact one of them is a designed boundary, one is a gap in coverage, one is a
 * step limit they can work around, and one is a correction that already
 * happened.
 *
 * Each gets its own glyph and its own heading. Only the safety refusal gets a
 * coloured edge, because it is the only one where acting on a wrong answer has
 * physical consequences.
 *
 * ## The boundary was designed, not discovered
 *
 * These refusals are not errors and are deliberately not styled as ones. A
 * demo that renders "I cannot advise on berthing" in a red error panel teaches
 * the room that the system breaks when pushed; rendering it calmly says the
 * opposite.
 */

interface Treatment {
  icon: IconName;
  iconClass: string;
  /** Only the safety refusal carries a coloured edge. */
  border: string;
  heading: string;
  body: string;
}

const TREATMENTS: Record<NonNullable<RefusalCategory>, Treatment> = {
  vessel_or_aircraft_operations: {
    icon: 'shield',
    iconClass: 'text-critical-text',
    border: 'border-critical/35',
    heading: 'This assistant cannot advise on operations',
    body:
      'Berthing, pilotage, manoeuvring and aircraft handling are decided by duty officers ' +
      'with live information this assistant does not have. Telephone Marine Operations.',
  },
  personal_record: {
    icon: 'user',
    iconClass: 'text-brand-300',
    border: 'border-border',
    heading: 'We do not hold records about people',
    body:
      'This assistant holds published information only — schedules, tariffs and departmental ' +
      'contacts. It cannot look up a person, a consignment owner or a staff member.',
  },
};

const FALLBACK: Treatment = {
  icon: 'shield',
  iconClass: 'text-brand-300',
  border: 'border-border',
  heading: 'That is outside what this assistant can help with',
  body:
    'Questions about customs, immigration, tax or legal matters, about a specific shipment, ' +
    'booking or payment, or about vessel and aircraft operations need to go to SCASPA staff ' +
    'directly — they can see the details of your case.',
};

export function EscalationCard({
  category,
  /** The backend's own refusal text, used when no category arrived. */
  answer,
}: {
  category?: RefusalCategory | undefined;
  answer?: string | undefined;
}) {
  const treatment = (category ? TREATMENTS[category] : undefined) ?? FALLBACK;

  /*
   * The backend's first paragraph wins over our fallback prose when there is no
   * category, because it is the approved copy for whatever gate actually fired.
   * With a category, the specific line above is better than the generic one the
   * backend sends for all of them.
   */
  const body = category ? treatment.body : (answer?.split('\n\n')[0] ?? treatment.body);

  return (
    <section
      aria-labelledby="refusal-heading"
      data-refusal-category={category ?? 'unspecified'}
      className={cn('flex flex-col gap-4 rounded-panel border bg-surface p-5', treatment.border)}
    >
      <div className="flex flex-col gap-3">
        <h3
          id="refusal-heading"
          className="flex items-center gap-2.5 text-section font-semibold text-ink"
        >
          <Icon name={treatment.icon} size={16} className={treatment.iconClass} />
          {treatment.heading}
        </h3>
        <p className="text-body text-ink-muted">{body}</p>
      </div>

      {/* Identical wherever it appears. A refusal that ends without a way
          forward is a dead end. */}
      <EscalationBlock />
    </section>
  );
}
