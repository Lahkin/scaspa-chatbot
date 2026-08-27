/**
 * What a reader may choose, and what the document ends up wearing.
 *
 * Two types, deliberately, because they are not the same question:
 *
 *   ThemeChoice   what the reader asked for — including "system", which is a
 *                 real answer and the default one.
 *   ResolvedTheme what `<html data-theme>` actually carries. Never "system":
 *                 the attribute has to name a palette, so "system" is asked of
 *                 the media query and turned into one of the other two.
 *
 * Collapsing them into one type is the bug this file exists to prevent. It
 * reads fine right up until "system" reaches the attribute, at which point the
 * dark block stops matching and the page is light on a dark phone with no error
 * anywhere to explain it.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';

const CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

/**
 * Narrow anything to a choice, or reject it.
 *
 * Same shape as `isLocaleCode` and for the same reason: this value comes back
 * out of `localStorage`, which anything on the origin can write. A stored
 * `"<script>"` produces the system default, never an attribute.
 */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value);
}

/** What the operating system is asking for right now. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The choice, turned into a palette the attribute can name. */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}
