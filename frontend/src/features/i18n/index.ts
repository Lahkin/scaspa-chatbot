import { useSyncExternalStore } from 'react';
import { getLocale, getLocaleServerSnapshot, subscribeToLocale } from './store';
import type { Strings } from './strings/en';
import { en } from './strings/en';
import { es } from './strings/es';
import { fr } from './strings/fr';
import type { LocaleCode } from './locales';

/**
 * The public face of the i18n layer: two hooks and a dictionary lookup.
 *
 * Usage is deliberately unremarkable —
 *
 * ```tsx
 * const t = useStrings();
 * return <button>{t.sidebar.newConversation}</button>;
 * ```
 *
 * — a plain property access on a typed object. No `t('sidebar.newConversation')`
 * string key, because a typo in a string key is found by a user and a typo in a
 * property access is found by `tsc`. The whole reason the dictionaries are nested
 * objects rather than flat key maps is to get that one guarantee.
 */

const DICTIONARIES: Record<LocaleCode, Strings> = { en, es, fr };

/** The active locale code. For anything that needs the code rather than a string. */
export function useLocale(): LocaleCode {
  return useSyncExternalStore(subscribeToLocale, getLocale, getLocaleServerSnapshot);
}

/** The strings for the active locale. Re-renders the caller when it changes. */
export function useStrings(): Strings {
  return DICTIONARIES[useLocale()];
}

/** Non-reactive lookup, for the rare caller outside a component. */
export function stringsFor(code: LocaleCode): Strings {
  return DICTIONARIES[code];
}

export { DEFAULT_LOCALE, LOCALES, LOCALE_CODES, detectLocale, isLocaleCode } from './locales';
export type { LocaleCode, LocaleDescriptor } from './locales';
export { getLocale, resetLocale, setLocale, subscribeToLocale } from './store';
export { clearPrefs, readPrefs } from './prefs';
export type { Strings };
