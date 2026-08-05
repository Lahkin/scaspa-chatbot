/**
 * The interface languages this app ships.
 *
 * ## What a language choice here does, and what it deliberately does not do
 *
 * It translates **this application's own chrome** — navigation, buttons, the
 * settings page. It does **not** translate the assistant's answers, and it must
 * never look as though it might, for a reason that is a project rule rather than
 * a missing feature:
 *
 * - The knowledge base is English. `CLAUDE.md` rule 10 requires every money and
 *   time value in an answer to appear *verbatim* in a retrieved chunk, and rule 4
 *   forbids a citation the backend has not verified against that row. A
 *   translation layer between the chunk and the reader breaks both — "XCD 44.00"
 *   surviving translation is luck, not a guarantee.
 * - `voice/stt.py` pins `LANGUAGE_HINT = "en"`, so dictation is English too.
 *
 * So the selector is honest about its scope, `/settings` says so in words next to
 * the control, and the conversation column carries an explicit `lang="en"` — see
 * `FullPageShell`. Without that attribute a screen reader set to Spanish reads an
 * English answer with Spanish phonemes, which is worse than not translating the
 * chrome at all.
 *
 * ## Why these three
 *
 * St. Kitts is English-speaking, and the cruise and ferry traffic through Port
 * Zante and Basseterre is overwhelmingly North American and European. Spanish and
 * French are the two languages that buy the most comprehension per string
 * translated in this basin — French especially, given the ferry and yacht traffic
 * from the neighbouring French Antilles.
 *
 * Adding a fourth is a data change and nothing else: add the code here, add the
 * matching file under `strings/`, and the type checker will list every string the
 * new file still owes.
 */

export const LOCALE_CODES = ['en', 'es', 'fr'] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

export const DEFAULT_LOCALE: LocaleCode = 'en';

export interface LocaleDescriptor {
  code: LocaleCode;
  /**
   * The language's name *in that language*. This is the label the option wears.
   *
   * An endonym, not a translation: someone looking for Spanish is scanning for
   * the word "Español", and rendering it as "Spanish" while the interface is
   * still in English hides the option from the only person who needs it. Every
   * language list worth using does it this way.
   */
  endonym: string;
  /** The same name in English, for the `title` and the accessible description. */
  englishName: string;
  /**
   * Two letters shown in the swatch beside the name. Not a flag, on purpose:
   * a flag is a country and these are languages, and there is no flag that means
   * "Spanish" without also meaning "Spain" to everyone who does not live there.
   */
  short: string;
}

export const LOCALES: readonly LocaleDescriptor[] = [
  { code: 'en', endonym: 'English', englishName: 'English', short: 'EN' },
  { code: 'es', endonym: 'Español', englishName: 'Spanish', short: 'ES' },
  { code: 'fr', endonym: 'Français', englishName: 'French', short: 'FR' },
];

/** Narrow an unknown value — a stored preference, a URL param — to a locale. */
export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}

/**
 * The best supported match for the browser's language list, or English.
 *
 * Only the primary subtag is compared, so `es-MX`, `es-419` and `es` all resolve
 * to Spanish. Matching the full tag would leave a Mexican visitor on English
 * because the app does not ship an `es-MX` file, which is a worse answer than the
 * Spanish it does have.
 */
export function detectLocale(languages: readonly string[]): LocaleCode {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocaleCode(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
