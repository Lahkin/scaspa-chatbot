import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Input, Textarea } from '@/components/ui';
import { OpsPage } from '@/components/ops/OpsPage';
import { useSupportDirectory, useSupportTicket } from '@/features/ops/queries';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * Contact SCASPA, and raise a ticket — the design's `contact_support`.
 *
 * ## Why this form has no name or email field
 *
 * The design collects a full name, an email address and an attachment. None of
 * them are here, and the backend would refuse them anyway: `docs/privacy.md`
 * says nothing in this service can link a conversation to a person, and a ticket
 * carrying an email address makes that untrue.
 *
 * So the exchange is inverted — describe the problem, get a reference, quote it
 * when you contact SCASPA. **The form says so before it is filled in, not after
 * it is submitted.** Someone who needs a reply by email should know that here,
 * while they can still pick up a phone, rather than after they have typed three
 * paragraphs expecting one.
 */
function SupportRoute() {
  const directory = useSupportDirectory();
  const ticket = useSupportTicket();

  const [department, setDepartment] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');

  const departments = directory.data?.departments ?? [];
  const chosen = department || departments[0] || 'Something else';

  return (
    <OpsPage
      title="Contact support"
      intro="Reach SCASPA staff directly, or leave a note for the desk."
      source={directory.data?.source}
    >
      {directory.data?.emergency ? (
        <p
          role="note"
          className="rounded-md border border-ops-alert-ink/30 bg-ops-alert-fill p-3 text-small text-ops-alert-ink"
        >
          {directory.data.emergency}
        </p>
      ) : null}

      <section aria-labelledby="directory-heading">
        <h2 id="directory-heading" className="text-h3 font-semibold text-ops-ink">
          Published contact routes
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {(directory.data?.locations ?? []).map((location) => (
            <li
              key={location.name}
              className="rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
            >
              <p className="text-small font-semibold text-ops-ink">{location.name}</p>
              {location.address ? (
                <p className="mt-1 text-caption text-ops-ink-variant">{location.address}</p>
              ) : null}
              <ul className="mt-2 space-y-1">
                {location.contacts.map((contact) => (
                  <li key={`${contact.kind}-${contact.value}`} className="text-small">
                    <span className="text-ops-ink-variant">{contact.label}: </span>
                    {contact.kind === 'phone' ? (
                      <a href={SCASPA_TEL_HREF} className="font-medium text-ops-sky underline">
                        {contact.value}
                      </a>
                    ) : (
                      <span className="text-ops-ink">{contact.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ticket-heading">
        <h2 id="ticket-heading" className="text-h3 font-semibold text-ops-ink">
          Leave a note for the desk
        </h2>

        {/* Stated up front, deliberately. Discovering this on the receipt is
            discovering it too late to do anything about it. */}
        <p className="mt-2 max-w-measure rounded-md border border-ops-outline-variant bg-ops-surface-low p-3 text-small text-ops-ink-variant">
          This form asks for no name, email or phone number, because this assistant does not collect
          them. You will get a reference number to quote —{' '}
          <strong>nobody will contact you first</strong>. If you need a reply, call{' '}
          <a href={SCASPA_TEL_HREF} className="font-medium text-ops-sky underline">
            {SCASPA_TEL_TEXT}
          </a>
          .
        </p>

        {ticket.data ? (
          <div
            role="status"
            className="mt-4 rounded-lg border border-ops-outline-variant bg-ops-surface p-4"
          >
            <p className="text-body font-semibold text-ops-ink">
              Reference {ticket.data.reference}
            </p>
            <dl className="mt-2 space-y-1 text-small">
              <div className="flex gap-2">
                <dt className="text-ops-ink-variant">Department</dt>
                <dd className="text-ops-ink">{ticket.data.department}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ops-ink-variant">Expected response</dt>
                <dd className="text-ops-ink">{ticket.data.expected_response}</dd>
              </div>
            </dl>
            {/* Mandatory. A receipt without it reads as "we'll be in touch". */}
            <p className="mt-3 text-small text-ops-ink">{ticket.data.next_step}</p>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => ticket.reset()}>
                Leave another note
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="mt-4 max-w-measure space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              ticket.mutate({
                department: chosen,
                subject: subject.trim(),
                details: details.trim(),
              });
            }}
          >
            <div className="space-y-1">
              <label
                htmlFor="ticket-department"
                className="block text-small font-medium text-ops-ink"
              >
                Department
              </label>
              <select
                id="ticket-department"
                value={chosen}
                onChange={(event) => setDepartment(event.target.value)}
                className="block min-h-touch w-full rounded-md border border-ops-outline bg-ops-surface px-3 text-body text-ops-ink"
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
              maxLength={200}
              required
              onChange={(event) => setSubject(event.target.value)}
            />

            {/* `rows` is omitted from Textarea's props on purpose — it
                auto-grows — so the height is not set here. */}
            <Textarea
              label="Details"
              value={details}
              maxLength={4000}
              required
              onChange={(event) => setDetails(event.target.value)}
            />

            {ticket.error ? (
              <p role="alert" className="text-small text-ops-alert-ink">
                {ticket.error.message}
              </p>
            ) : null}

            <Button
              type="submit"
              loading={ticket.isPending}
              disabled={!subject.trim() || !details.trim()}
            >
              Send note
            </Button>
          </form>
        )}
      </section>
    </OpsPage>
  );
}

export const Route = createFileRoute('/support')({
  component: SupportRoute,
  head: () => ({
    meta: [
      { title: 'Contact support — SCASPA Assistant' },
      { name: 'description', content: 'Published SCASPA contact routes, and the support desk.' },
    ],
  }),
});
