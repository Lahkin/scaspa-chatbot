import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from './locales';

/**
 * The one preferences key, in `localStorage`.
 *
 * ## This is a deliberate amendment to `frontend/CLAUDE.md` rule 5, not a leak
 *
 * The rule used to read "never write to localStorage, sessionStorage or
 * IndexedDB; only `conversation_id` may go to sessionStorage". It now permits
 * exactly one more thing — **non-message UI preferences** — and the rule file
 * says so. The distinction the rule is actually protecting is *message content*,
 * and that has not moved an inch: no question, no answer, no half-typed draft.
 * `draft.ts` still refuses storage entirely for precisely that reason.
 *
 * The alternative was a language that resets on every visit. That is the trade
 * the collapsed sidebar makes and it is tolerable there, because re-collapsing a
 * rail is one click on a control that is permanently on screen. Re-finding a
 * language selector three screens deep, in an interface you cannot read, is not
 * the same cost — it is the cost of the feature not existing.
 *
 * ## Why `localStorage` and not `sessionStorage`
 *
 * The opposite of the reasoning behind `conversation_id`, and for the same
 * reason. That id is `sessionStorage` so a shared cruise-terminal kiosk does not
 * hand the next person the last person's conversation. A language is not a
 * confidence — the next person at the kiosk seeing Spanish learns nothing about
 * anyone, and a returning visitor on their own phone should not have to choose
 * twice. There is a `Reset` on `/settings` for the kiosk case.
 *
 * ## Every read is defensive
 *
 * The value is attacker-controllable in the sense that anything in `localStorage`
 * is: a different app on the same origin, a console, an extension. So it is
 * parsed, narrowed to a known locale code, and otherwise discarded — the same
 * shape as `readConversationId`'s UUID test. A stored `"<script>"` produces
 * English, never a render.
 */

const STORAGE_KEY = 'scaspa.prefs';

export interface Prefs {
  locale: LocaleCode;
}

export const DEFAULT_PREFS: Prefs = { locale: DEFAULT_LOCALE };

function storage(): Storage | null {
  try {
    // Absent server-side, and it throws outright in Safari private mode. A
    // preference is a convenience; failing to read one must never stop the app
    // rendering.
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The stored preferences, with anything unrecognised dropped.
 *
 * Returns `null` for "nothing stored", which the store needs in order to tell an
 * explicit choice of English apart from never having chosen — the first gets
 * respected, the second falls through to the browser's own language.
 */
export function readPrefs(): Prefs | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const locale = (parsed as Record<string, unknown>)['locale'];
    return isLocaleCode(locale) ? { locale } : null;
  } catch {
    // Malformed JSON, a quota error, a locked-down kiosk. English is a correct
    // answer to all of them.
    return null;
  }
}

export function writePrefs(prefs: Prefs): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // The choice still applies to this page; it just will not survive a reload.
  }
}

/** The kiosk exit, offered on `/settings`. */
export function clearPrefs(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do and nothing worth saying.
  }
}
