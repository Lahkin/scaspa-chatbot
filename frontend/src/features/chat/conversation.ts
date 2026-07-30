/**
 * The `conversation_id` lifecycle.
 *
 * ### What it is, and what it is not
 *
 * A random UUID minted by the server on the first request. It is **not a login**
 * and not a credential: there is no account behind it, it grants nothing, and
 * anyone holding it learns nothing about who typed. It exists so a follow-up
 * question can be matched to the exchange before it.
 *
 * ### Why this is the one thing allowed in sessionStorage
 *
 * CLAUDE.md rule 5 permits exactly this key and nothing else. Message content
 * never touches the device — not the questions, not the answers, not a half-typed
 * draft. The id is stored so a reload does not silently start a new conversation
 * mid-exchange; it is `sessionStorage` rather than `localStorage` so closing the
 * tab ends it, which matters on a shared cruise-terminal kiosk.
 *
 * ### Always overwrite with what the server returns
 *
 * The server-side TTL is 60 minutes, and history is best-effort anyway — with more
 * than one worker a request may land on a process that has never seen the
 * conversation. So every response's `conversation_id` is written back
 * unconditionally and the client never assumes the id it sent is the id it now
 * has.
 *
 * ⚠️ **Measured against the real backend:** it does `payload.conversation_id or
 * store.new_id()` — it *adopts* any id you send and only mints one when none
 * arrives, rather than replacing an expired id with a fresh one. The rule above
 * is therefore currently a no-op, and it stays because it is the behaviour that
 * survives the backend changing its mind. Recorded in docs/decisions.md F007.
 */

const STORAGE_KEY = 'conversation_id';

/** A UUID and nothing else, so a corrupted or hostile value cannot be echoed back. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function storage(): Storage | null {
  try {
    // Absent in a non-browser context, and it throws outright in Safari private
    // mode. A conversation id is a convenience; failing to read one must never
    // stop someone asking a question.
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readConversationId(): string | null {
  try {
    const value = storage()?.getItem(STORAGE_KEY) ?? null;
    return value && UUID.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeConversationId(id: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (id === null) store.removeItem(STORAGE_KEY);
    else if (UUID.test(id)) store.setItem(STORAGE_KEY, id);
  } catch {
    // Quota, private mode, a locked-down kiosk. Not worth telling anyone about:
    // the conversation still works, it just will not survive a reload.
  }
}

export function clearConversationId(): void {
  writeConversationId(null);
}
