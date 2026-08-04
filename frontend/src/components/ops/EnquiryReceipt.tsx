import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { TapToCall } from '@/components/ui/TapToCall';
import { CopyToast } from '@/components/ui/CopyToast';
import { cn } from '@/lib/cn';
import { TranscriptState } from './TranscriptState';
import type { SupportTicketResponse } from '@/lib/types';

/**
 * The enquiry receipt — spec board 11.
 *
 * ## The reference is the whole component
 *
 * "Quote this reference when you telephone the department. It cannot be looked
 * up online, so write it down or copy it now."
 *
 * The exchange is inverted on purpose: the form takes no name, no email and no
 * telephone number, so nobody will make contact first. The reference is what
 * the user carries to the conversation THEY start. It is set at 30/38 with
 * tabular figures — large enough to read off a screen and copy onto paper.
 *
 * ## No status tracker, and the absence is deliberate
 *
 * "No status tracker, no 'check my ticket' field, no progress steps. Nothing
 * behind this screen can answer 'where is my enquiry now', so nothing on it
 * offers to."
 *
 * ## `next_step` is always rendered
 *
 * The API contract is explicit: *"Always render `next_step`. Nobody will make
 * contact first, and a receipt that omits that reads as 'we'll be in touch'."*
 */
export function EnquiryReceipt({
  receipt,
  /** The department's number, from the directory. */
  phone,
  sentAt,
  /** What the user ticked. The transcript block renders only when they did. */
  transcriptRequested = false,
}: {
  receipt: SupportTicketResponse;
  phone?: { href: string; display: string } | undefined;
  sentAt: Date;
  transcriptRequested?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(receipt.reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright. The reference is on screen in
      // full, so a failed copy costs nothing — and a thrown error here would
      // replace a working receipt with an error boundary.
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-positive-tint text-positive">
          <Icon name="check" size={18} />
        </span>
        <h3 className="text-section font-semibold text-ink">Enquiry received</h3>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-input border border-border bg-surface-muted px-5 py-4.5">
        <div className="flex flex-col gap-1">
          <span className="text-micro font-semibold tracking-eyebrow text-ink-subtle uppercase">
            Your reference
          </span>
          <span className="text-h1 font-semibold tracking-[0.02em] text-ink tabular max-sm:text-h2">
            {receipt.reference}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy the reference ${receipt.reference}`}
          className={cn(
            // 36px, and 44px at ≤640px — §6.6, and §7's minimum. It was 36 at
            // every width, which is the one size a thumb cannot rely on.
            'flex size-11 shrink-0 items-center justify-center rounded-button border border-border sm:size-9',
            'transition-colors duration-fast ease-out-soft',
            copied
              ? 'bg-positive-tint text-positive'
              : 'text-ink-muted hover:bg-surface hover:text-ink'
          )}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
      </div>

      {/*
        §7.6's toast, at the same moment as the button's own Copied state.
        A copy is the one action in this product with no visible result — the
        clipboard is invisible — so without it the reader presses the button,
        sees nothing happen, and presses it again. It was an `sr-only`
        announcement, which said so to one reader in three.
      */}
      {copied ? <CopyToast label="Reference copied to the clipboard" /> : null}

      <p className="text-body text-ink-muted">{receipt.next_step}</p>

      <dl className="flex flex-col gap-3 border-t border-border pt-4">
        <Row label="Department" value={receipt.department} />
        {phone ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-label text-ink-muted">Telephone</dt>
            <dd>
              <TapToCall href={phone.href} display={phone.display} />
            </dd>
          </div>
        ) : null}
        <Row label="Expected response" value={receipt.expected_response} />
        <Row
          label="Sent"
          value={STAMP.format(sentAt)}
          // The timestamp is a figure and lines up with the rest.
          tabular
        />
      </dl>

      {/*
       * What the SERVER did with the transcript — §6.5's two renderings, not a
       * "Conversation attached: Yes/No" row. The distinction the section draws
       * is between a tick that means "we tried" and one that means "it is
       * attached", and only a drawn box can carry it.
       */}
      <TranscriptState requested={transcriptRequested} attached={receipt.transcript_included} />
    </section>
  );
}

/**
 * `14:32 AST, 1 Aug 2026` — §10, and the third time this correction has been
 * made in this codebase.
 *
 * This was `sentAt.toLocaleString()`, which on a US-configured browser renders
 * `8/1/2026, 2:32:00 PM` — a 12-hour clock with no zone, on a receipt whose
 * whole job is to be quoted down a telephone. The same defect was found in the
 * source banner (F018), in the ETA/ATA cells (F019) and here.
 */
const STAMP = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function Row({
  label,
  value,
  tabular = false,
  tone,
}: {
  label: string;
  value: string;
  tabular?: boolean;
  tone?: 'caution' | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-label text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'text-label font-medium',
          tone === 'caution' ? 'text-caution' : 'text-ink',
          tabular && 'tabular'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
