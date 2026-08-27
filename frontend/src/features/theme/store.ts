import { readPrefs, writePrefs } from '../i18n/prefs';
import { DEFAULT_THEME_CHOICE, resolveTheme, type ResolvedTheme, type ThemeChoice } from './choice';

/**
 * The current theme, as a module-level store.
 *
 * Deliberately the same shape as `features/i18n/store.ts` — module store, no
 * provider, `useSyncExternalStore` on top — because half the components in this
 * app are rendered in tests with a `QueryClientProvider` and nothing else. A
 * context here would make every one of those renders throw. One pattern to
 * learn, not two.
 *
 * ## The attribute is set twice, and that is not a mistake
 *
 * An inline script in `index.html` writes `data-theme` before first paint. This
 * module writes it again on load. The script exists because React cannot run
 * early enough to prevent a white flash on a dark phone; this module exists
 * because the script cannot subscribe to anything. Neither replaces the other,
 * and writing the same value twice costs nothing.
 *
 * ## Following the system means listening to it
 *
 * "System" is not resolved once at startup. Someone whose phone flips to dark at
 * sunset, or who toggles the OS setting while the tab is open, should see the
 * page follow — so the media query is subscribed to for as long as the choice is
 * `system`, and ignored the moment it is not. That listener is the only reason
 * this store has a lifecycle at all.
 */

function initialChoice(): ThemeChoice {
  return readPrefs()?.theme ?? DEFAULT_THEME_CHOICE;
}

let choice: ThemeChoice = initialChoice();
let resolved: ResolvedTheme = resolveTheme(choice);
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Put the resolved theme on the document.
 *
 * Always an explicit `light` or `dark`, never `system` and never absent. The
 * dark palette is a `:root[data-theme='dark']` block, so "no attribute" would
 * mean the light palette — which is a correct answer only by accident, and the
 * wrong one for anybody whose system asked for dark.
 */
function applyToDocument(next: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', next);
}

function darkQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(prefers-color-scheme: dark)');
}

function onSystemChange(): void {
  // Only meaningful while the reader is following the system. An explicit
  // choice outranks the operating system until it is explicitly withdrawn.
  if (choice !== 'system') return;
  const next = resolveTheme('system');
  if (next === resolved) return;
  resolved = next;
  applyToDocument(resolved);
  notify();
}

const query = darkQuery();
query?.addEventListener('change', onSystemChange);

applyToDocument(resolved);

export function getThemeChoice(): ThemeChoice {
  return choice;
}

export function getResolvedTheme(): ResolvedTheme {
  return resolved;
}

/**
 * The snapshot read before hydration.
 *
 * `system` and `light`, matching what a document with no `localStorage` would
 * produce. Claiming to know the device's stored preference here is how a
 * hydration mismatch is manufactured — the same reasoning as
 * `getLocaleServerSnapshot`.
 */
export function getThemeChoiceServerSnapshot(): ThemeChoice {
  return DEFAULT_THEME_CHOICE;
}

export function getResolvedThemeServerSnapshot(): ResolvedTheme {
  return 'light';
}

export function setThemeChoice(next: ThemeChoice): void {
  if (next === choice) return;
  choice = next;
  writePrefs({ theme: next });

  const nextResolved = resolveTheme(next);
  if (nextResolved !== resolved) {
    resolved = nextResolved;
    applyToDocument(resolved);
  }
  notify();
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Back to following the system.
 *
 * Backs the "reset this device" control on `/settings` alongside `resetLocale`.
 * Note this does NOT clear the storage key — `clearPrefs` owns that, and it
 * takes the language with it. This is the theme half, so that reset stays one
 * action with one meaning.
 *
 * Doubles as the test seam: the store outlives a component, so without this a
 * suite leaks a theme from one case into the next.
 */
export function resetTheme(): void {
  choice = DEFAULT_THEME_CHOICE;
  resolved = resolveTheme(choice);
  applyToDocument(resolved);
  notify();
}
