import { DEFAULT_LOCALE, detectLocale, type LocaleCode } from './locales';
import { clearPrefs, readPrefs, writePrefs } from './prefs';

/**
 * The current interface language, as a module-level store.
 *
 * ## Why a module store and not a React context
 *
 * `Sidebar` and `FullPageShell` are rendered in `shells.test.tsx` and
 * `sidebar.test.tsx` with a `QueryClientProvider` and nothing else. A context
 * would make every one of those renders throw — or, worse, silently fall back to
 * a default and hide the fact that the provider was never mounted in the app
 * either. `draft.ts` already solved this exact problem the same way, and matching
 * it means one pattern to learn rather than two.
 *
 * The consequence worth knowing: **there is no provider to forget.** Any
 * component may call `useStrings()` and it works, in a test, in the gallery, and
 * inside the widget shell.
 *
 * ## `document.documentElement.lang` moves with it
 *
 * A screen reader picks its voice and its pronunciation rules from that
 * attribute. Leaving it at `en` while the buttons say "Configuración" makes a
 * Spanish interface read aloud in an English accent, which is close to unusable
 * and is invisible to anyone testing with their eyes.
 *
 * `FullPageShell` used to mark `<main>` as `lang="en"` for the opposite reason —
 * the answers were English and would be mispronounced under a Spanish root. That
 * attribute is gone: the assistant answers in the language it was asked in, and
 * `<main>` wraps the operations screens too, so pinning English there would
 * mispronounce all of the translated chrome on every screen. This attribute is
 * now the only one, and it is the right one.
 */

function initial(): LocaleCode {
  const stored = readPrefs();
  if (stored?.locale) return stored.locale;

  /*
   * Nothing stored: follow the browser rather than assuming English.
   *
   * `readPrefs` returns null for "never chosen" rather than a default, which is
   * what makes this possible — a visitor whose phone is set to Spanish gets
   * Spanish on their first visit, and a visitor who explicitly chose English
   * keeps English even on a Spanish phone. Collapsing the two into one default
   * would lose the second case.
   */
  return typeof navigator === 'undefined'
    ? DEFAULT_LOCALE
    : detectLocale(navigator.languages ?? []);
}

let locale: LocaleCode = initial();
const listeners = new Set<() => void>();

/** Keep the document in step with the store, including on first load. */
function applyToDocument(next: LocaleCode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = next;
}

applyToDocument(locale);

export function getLocale(): LocaleCode {
  return locale;
}

/**
 * The snapshot `useSyncExternalStore` reads before hydration.
 *
 * English, deliberately: the server — and the pre-hydration HTML — cannot know
 * what is in this device's `localStorage`, and claiming otherwise is how a
 * hydration mismatch is manufactured.
 */
export function getLocaleServerSnapshot(): LocaleCode {
  return DEFAULT_LOCALE;
}

export function setLocale(next: LocaleCode): void {
  if (next === locale) return;
  locale = next;
  writePrefs({ locale: next });
  applyToDocument(next);
  for (const listener of listeners) listener();
}

export function subscribeToLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Forget the stored preference and go back to English.
 *
 * Backs the "reset this device" control on `/settings`, which exists for the
 * shared kiosk. Note it does **not** re-detect from `navigator`: someone who has
 * just asked to be forgotten on a public tablet should land somewhere
 * predictable, not somewhere inferred from a browser setting they did not set.
 *
 * Doubles as the test seam. The store outlives a component, so without this a
 * suite leaks a language from one case into the next.
 */
export function resetLocale(): void {
  clearPrefs();
  locale = DEFAULT_LOCALE;
  applyToDocument(locale);
  for (const listener of listeners) listener();
}
