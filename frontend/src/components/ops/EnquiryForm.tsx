import { useId, useState } from 'react';
import { Button, Checkbox, Input, Textarea } from '@/components/ui';
import type { SupportTicketRequest } from '@/lib/types';

/**
 * The enquiry form — §6.5.
 *
 * | Department | Select, 7 options (§1.4)                                  |
 * | Subject    | Text with counter, **1–200**, prefilled, editable          |
 * | Details    | Textarea, **1–4000**                                       |
 * | Transcript | Checkbox with consequence text                             |
 *
 * ## "No name, email, telephone or attachment field. Ever."
 *
 * The section says it in bold and the backend agrees: `SupportTicketRequest`
 * accepts a department, a subject, the details and an optional transcript, and
 * nothing else. `docs/privacy.md` states that nothing in this service can link a
 * conversation to a person, and a ticket carrying an email address would make
 * that false — quietly.
 *
 * §6.4's notice sits beside this form and explains the absence, because a form
 * with four missing fields and no explanation reads as broken rather than as
 * careful.
 *
 * ## The subject is a draft, not a value to confirm
 *
 * §4.7 gives the assistant's ticket card one field — "Subject — drafted for you,
 * edit before sending" — and it arrives here through `initialSubject`. It is
 * model-written text about the user's own question, so it is presented as
 * something to edit rather than something to accept.
 */
const SUBJECT_MAX = 200;
const DETAILS_MAX = 4000;

export function EnquiryForm({
  departments,
  initialSubject = '',
  pending = false,
  error,
  canAttachTranscript,
  onSubmit,
}: {
  /** The published list, from the directory. Never a client-side taxonomy. */
  departments: readonly string[];
  initialSubject?: string;
  pending?: boolean;
  error?: string | undefined;
  /**
   * Whether there is a conversation to attach at all.
   *
   * The checkbox is offered only when this session has one: a tick that would
   * attach nothing is the same lie as a tick that means "we tried".
   */
  canAttachTranscript: boolean;
  onSubmit: (request: Omit<SupportTicketRequest, 'conversation_id'>) => void;
}) {
  const [department, setDepartment] = useState('');
  const [subject, setSubject] = useState(initialSubject);
  const [details, setDetails] = useState('');
  const [transcript, setTranscript] = useState(false);
  const departmentId = useId();

  const chosen = department || departments[0] || '';
  const ready = subject.trim().length > 0 && details.trim().length > 0 && chosen.length > 0;

  return (
    <form
      aria-label="Send an enquiry"
      className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          department: chosen,
          subject: subject.trim(),
          details: details.trim(),
          include_transcript: transcript,
        });
      }}
    >
      <h3 className="text-section font-semibold text-ink">Send an enquiry</h3>

      <div className="flex flex-col gap-2">
        <label htmlFor={departmentId} className="text-label font-medium text-ink">
          Department
        </label>
        <select
          id={departmentId}
          value={chosen}
          onChange={(event) => setDepartment(event.target.value)}
          className="h-11 rounded-input border border-border bg-surface-muted px-3 text-body text-ink sm:h-10"
        >
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Subject"
        value={subject}
        maxLength={SUBJECT_MAX}
        counter={{ value: subject.length, max: SUBJECT_MAX }}
        required
        onChange={(event) => setSubject(event.target.value)}
      />

      <Textarea
        label="Details"
        value={details}
        maxLength={DETAILS_MAX}
        counter={{ value: details.length, max: DETAILS_MAX }}
        minRows={4}
        required
        onChange={(event) => setDetails(event.target.value)}
      />

      {/*
       * §1.4's eighth input: the consequence line states what actually happens,
       * rather than restating the label. The wording is the handoff's own
       * example, because it is exactly right — the department reads everything,
       * and that is the thing worth knowing before ticking.
       */}
      {canAttachTranscript ? (
        <Checkbox
          checked={transcript}
          onChange={setTranscript}
          label="Attach this conversation"
          description="The department will be able to read every question and answer in this session."
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-label leading-5 text-critical-text">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="submit" loading={pending} loadingLabel="Sending" disabled={!ready}>
          Send enquiry
        </Button>
      </div>
    </form>
  );
}
