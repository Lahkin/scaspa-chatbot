import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * Shown when `meta.grounded` is false.
 *
 * The backend has flagged that something in this answer — a citation marker, a
 * money value, a time — could not be traced back to a row that was actually
 * retrieved. The answer may still be entirely correct. But it has not been
 * *verified*, and this product's whole claim is that it only says what it can
 * show a source for.
 *
 * So the rule is about withdrawal, not warning: **all confidence styling is
 * suppressed.** No citation chips (`reconcile` marks every marker unverified when
 * grounded is false), no numbered sources implying a checked trail. A chip next to
 * an unverified sentence is the product asserting exactly the thing it could not
 * establish.
 *
 * Note this is the *opposite* of how `grounded: true` is treated. The contract is
 * explicit that `grounded: true` is not a correctness guarantee and must never be
 * shown as one — so there is no "verified ✓" badge anywhere. The signal is only
 * ever used to take confidence away, never to add it.
 */
export function UngroundedNotice() {
  return (
    <div className="mt-3 rounded-md border border-amber-text/30 bg-amber-surface p-3">
      <p className="text-small font-semibold text-amber-text">
        I could not fully verify this — please confirm with SCASPA
      </p>
      <p className="mt-1 text-caption text-ink-muted">
        Part of this answer could not be traced back to a verified SCASPA source. It may still be
        right, but please do not rely on it without checking.
      </p>
      <a
        href={SCASPA_TEL_HREF}
        className="mt-1 inline-flex min-h-touch items-center text-small font-medium text-blue-700 underline"
      >
        Call SCASPA on {SCASPA_TEL_TEXT}
      </a>
    </div>
  );
}
