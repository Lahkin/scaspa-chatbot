import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { OpsShell } from '@/components/shells/OpsShell';
import { ContactCard } from '@/components/ops/ContactCard';
import { EmergencyStrip } from '@/components/ops/EmergencyStrip';
import { EnquiryForm } from '@/components/ops/EnquiryForm';
import { EnquiryReceipt } from '@/components/ops/EnquiryReceipt';
import { PrivacyNotice } from '@/components/ops/PrivacyNotice';
import { TableError } from '@/components/ops/TableStates';
import { useSupportDirectory, useSupportTicket } from '@/features/ops/queries';
import { readConversationId } from '@/features/chat/conversation';
import { SCASPA_PHONE_LINES } from '@/features/chat/contact';
import type { SupportTicketRequest } from '@/lib/types';

/**
 * Support — §6.1 to §6.6.
 *
 * ## The form asks for nothing about the person, and that has to be explained
 *
 * Board 19's own subtitle. There is no name, email, telephone or attachment
 * field — the backend accepts none of them, `docs/privacy.md` says nothing here
 * can link a conversation to a person, and a ticket carrying an email address
 * would make that false. So the exchange is inverted: describe the problem, get
 * a reference, quote it when **you** make contact. §6.4's notice says so beside
 * the form rather than after it is submitted.
 *
 * ## What this screen used to be
 *
 * The pre-handoff design in the legacy `ops-*` palette: the emergency notice as
 * a red paragraph, locations as unstyled list items, no privacy notice, no
 * transcript control, and a receipt that was a heading and two rows. Every
 * component §6.1–6.6 asks for existed in the codebase and **none of them was on
 * this screen** — `EmergencyStrip`, `ContactCard`, `ContactPointRow` and
 * `EnquiryReceipt` had no caller outside their own tests.
 */
function SupportRoute() {
  const directory = useSupportDirectory();
  const ticket = useSupportTicket();
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [transcriptRequested, setTranscriptRequested] = useState(false);

  const data = directory.data;
  /*
   * A transcript can only be attached when this session has a conversation to
   * attach. Read once at submit rather than held in state: it is written by the
   * chat route in `sessionStorage`, and a value captured on mount would be
   * stale for someone who asked a question and then came here.
   */
  const conversationId = readConversationId();

  const send = (request: Omit<SupportTicketRequest, 'conversation_id'>) => {
    setTranscriptRequested(request.include_transcript === true);
    setSentAt(new Date());
    ticket.mutate({
      ...request,
      ...(request.include_transcript ? { conversation_id: conversationId } : {}),
    });
  };

  return (
    /*
     * ── NO SAMPLE-DATA HATCH ON THIS SCREEN, AND THAT IS THE POINT ──────────
     *
     * `GET /api/support/directory` carries the same `DataSource` as every other
     * operations response, so under `OPS_DATA_SOURCE=fixture` it reports
     * `kind: "fixture"` and 0032's hatch would render here too.
     *
     * It must not. **The contact details on this screen are real.**
     * `contact_locations()` lives on the base `OpsSource` rather than the
     * fixture one, precisely so support never goes dark — the switchboard
     * number and the postal address are the published ones, the same pair that
     * ends every error message in the product.
     *
     * Hatching them would say the Authority's own telephone number is sample
     * data, on the screen someone reaches when everything else has told them to
     * call. That is a worse lie than the one the hatch exists to prevent.
     */
    <OpsShell
      title="Contact SCASPA"
      intro="Published contact routes, and a way to leave an enquiry for a department."
    >
      {/*
        §6.1 — always present, and never conditional on anything. A form that
        reaches someone during office hours is the wrong channel for an
        emergency at any hour, so the alternative is offered before the form
        rather than after it fails.
      */}
      <EmergencyStrip href={SCASPA_PHONE_LINES[0].href} display={SCASPA_PHONE_LINES[0].text} />

      {directory.error ? (
        <TableError error={directory.error} onRetry={() => void directory.refetch()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        {/* ── §6.2 — the published locations ─────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.locations ?? []).map((location) => (
            <ContactCard key={location.name} location={location} />
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {/* ── §6.4 — required, and not a tip ───────────────────────────── */}
          <PrivacyNotice />

          {/* ── §6.5 / §6.6 — the form, then the receipt in its place ─────── */}
          {ticket.data && sentAt ? (
            <EnquiryReceipt
              receipt={ticket.data}
              sentAt={sentAt}
              transcriptRequested={transcriptRequested}
              phone={{
                href: SCASPA_PHONE_LINES[0].href,
                display: SCASPA_PHONE_LINES[0].text,
              }}
            />
          ) : (
            <EnquiryForm
              departments={data?.departments ?? []}
              pending={ticket.isPending}
              error={ticket.error?.message}
              canAttachTranscript={conversationId !== null}
              onSubmit={send}
            />
          )}
        </div>
      </div>
    </OpsShell>
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
