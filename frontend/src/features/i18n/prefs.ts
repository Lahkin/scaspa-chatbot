import { DEFAULT_THEME_CHOICE, isThemeChoice, type ThemeChoice } from '../theme/choice';
import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from './locales';

/**
 * The one preferences key, in `localStorage`. It holds the language and the
 * theme — two fields, still one key, deliberately.
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
  theme: ThemeChoice;
}

export const DEFAULT_PREFS: Prefs = { locale: DEFAULT_LOCALE, theme: DEFAULT_THEME_CHOICE };

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
export function readPrefs(): Partial<Prefs> | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    const locale = record['locale'];
    const theme = record['theme'];

    /*
     * Each field is narrowed on its own, and a field that fails narrowing is
     * dropped without taking the other one with it.
     *
     * That is the whole reason this returns a Partial. The key holds two
     * unrelated preferences now, and the first version of this function
     * returned `null` the moment `locale` was unrecognised — which would have
     * thrown away a perfectly good stored theme because someone had once
     * hand-edited a language code in a console.
     */
    const prefs: Partial<Prefs> = {};
    if (isLocaleCode(locale)) prefs.locale = locale;
    if (isThemeChoice(theme)) prefs.theme = theme;

    // Still null when nothing survived narrowing. "Stored, but every field was
    // junk" and "never stored" mean the same thing to every caller, and the
    // callers already distinguish "chose English" from "never chose" by whether
    // this is null — an empty object would quietly answer "chose" to that.
    return Object.keys(prefs).length > 0 ? prefs : null;
  } catch {
    // Malformed JSON, a quota error, a locked-down kiosk. The defaults are a
    // correct answer to all of them.
    return null;
  }
}

/**
 * Merge a preference into the stored key, leaving the others alone.
 *
 * A patch, not a write: `writePrefs({ locale })` used to replace the whole
 * object, so with two preferences in one key, choosing a language would have
 * silently forgotten the theme — the exact failure that makes people distrust a
 * settings screen, and one that only shows up on the NEXT visit.
 */
export function writePrefs(patch: Partial<Prefs>): void {
  try {
    const merged = { ...(readPrefs() ?? {}), ...patch };
    storage()?.setItem(STORAGE_KEY, JSON.stringify(merged));
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
