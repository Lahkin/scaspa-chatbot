import { Icon } from '@/components/ui/Icon';

/**
 * "Why we ask for so little" — §6.4.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 24px; gap: 12px
 * 16px shield glyph --brand-300 + 600 16px/24px --text-1
 * body 400 14px/22px --text-2
 * ```
 *
 * ## Required, and the reason is in the section's last line
 *
 * > "**Required.** Without it, the absence of those fields reads as a broken
 * > form."
 *
 * A form with no name, no email, no telephone number and no attachment looks
 * unfinished unless it says why it is not. The copy is the handoff's, verbatim,
 * and it is the one place on the screen that explains the whole exchange: you
 * get a reference, and you are the one who makes contact.
 *
 * There is no dismiss control and no collapse. It is not a tip.
 */
export function PrivacyNotice() {
  return (
    <section className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-6">
      <div className="flex items-center gap-2.5">
        <Icon name="shield" size={16} className="shrink-0 text-brand-300" />
        <h3 className="text-section font-semibold text-ink">Why we ask for so little</h3>
      </div>
      <p className="text-body text-ink-muted">
        This form takes no name, no email address, no telephone number and no attachment. The
        Authority does not hold an account for you, and nothing you send here is linked to a person.
        Quote the reference when you telephone.
      </p>
    </section>
  );
}
