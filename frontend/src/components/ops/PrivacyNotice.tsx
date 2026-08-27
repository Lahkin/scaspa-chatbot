import { Icon } from '@/components/ui/Icon';

/**
 * "Why Pilot asks for so little" — §6.4, refined by §21 of the navigation brief.
 *
 * ```
 * --surface-2; 1px solid --border; border-radius: 16px; padding: 24px; gap: 12px
 * 16px shield glyph --brand-300 + 600 16px/24px --text-1
 * body 400 14px/22px --text-2
 * ```
 *
 * ## Required, and the reason is in §6.4's last line
 *
 * > "**Required.** Without it, the absence of those fields reads as a broken
 * > form."
 *
 * A form with no name, no email address and no telephone number looks
 * unfinished unless it says why it is not. This is the one place on the screen
 * that explains the whole exchange: you get a reference, and you are the one who
 * makes contact.
 *
 * There is no dismiss control and no collapse. It is not a tip.
 *
 * ## "Pilot", not "we"
 *
 * §21 asks for the heading to name the product, and the change is not
 * cosmetic. "We" on a SCASPA-branded page reads as the Authority, and the
 * Authority *does* hold accounts — for berthing, for cargo, for payments. It is
 * Pilot that does not. Saying "we ask for so little" over a form on
 * scaspa.com invites a reader to conclude something untrue about the
 * organisation rather than something true about this assistant.
 *
 * ## The notice used to contradict the control beneath it
 *
 * It claimed the form "takes no name, no email address, no telephone number and
 * **no attachment**" — while `EnquiryForm` renders an "Attach this
 * conversation" checkbox directly below it whenever the session has a
 * conversation to attach.
 *
 * Both halves were written truthfully and separately: the notice describes a
 * form that asks nothing about the person, and the checkbox is an explicit,
 * opt-in, clearly-consequenced choice to send this session's questions. But a
 * reader who ticks a box the paragraph above says does not exist has been told
 * one of two contradictory things, and on a privacy notice that is the worst
 * possible place to be approximately right.
 *
 * The claim is now about what the form asks *about the person*, which is the
 * claim that was always the point, and the attachment is described honestly as
 * the one thing that sends anything more.
 *
 * ## And the second paragraph is conditional, for the same reason
 *
 * `EnquiryForm` renders the attach control **only when this session has a
 * conversation to attach**. Describing "the box below" unconditionally would
 * reintroduce the defect pointing the other way — a paragraph about a control
 * that is not on the screen, on the one panel where a reader is being asked to
 * take a claim about their privacy on trust.
 *
 * So the caller passes what it knows, and the paragraph appears with the box.
 */
export function PrivacyNotice({
  /** Whether `EnquiryForm` will render its attach control. */
  canAttachTranscript = false,
}: {
  canAttachTranscript?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-6">
      <div className="flex items-center gap-2.5">
        <Icon name="shield" size={16} className="shrink-0 text-brand-300" />
        <h3 className="text-section font-semibold text-ink">Why Pilot asks for so little</h3>
      </div>
      <p className="text-body text-ink-muted">
        Pilot does not require an account, login or personal profile to answer public SCASPA
        questions. This form takes no name, no email address and no telephone number, so nothing you
        send here is linked to a person. Quote the reference when you telephone.
      </p>
      {canAttachTranscript ? (
        <p className="text-body text-ink-muted">
          The only thing that sends more is the box below, if you tick it: it attaches this
          session&rsquo;s questions and answers so the department does not ask you to repeat them.
          Nothing else about you goes with it, because Pilot does not have it.
        </p>
      ) : null}
    </section>
  );
}
