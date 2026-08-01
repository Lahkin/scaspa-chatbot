import { useState } from 'react';
import { cn } from '@/lib/cn';
import { LOCALES, setLocale, useLocale, useStrings } from '@/features/i18n';

/**
 * The interface-language chooser.
 *
 * ## Radios, not a `<select>`
 *
 * Three options that change the page the instant they are chosen. A native
 * `<select>` on iOS opens a modal wheel and does not commit until "Done", so the
 * user picks a language, sees nothing happen, and picks it again. Radios apply on
 * touch, show all three at once, and let someone who cannot read the current
 * interface *find* their language by scanning rather than by opening a menu whose
 * trigger they cannot read.
 *
 * ## Why the input is `sr-only` and the card is styled instead
 *
 * A native radio cannot be given a 44px hit area or a card treatment without
 * `appearance: none`, at which point it is a custom control anyway — but with the
 * keyboard semantics thrown away. Hiding the real input keeps arrow-key roving,
 * the radiogroup role, form semantics and screen-reader announcements exactly as
 * the browser implements them, and moves only the *paint* onto the label.
 *
 * The one thing this pattern loses if done carelessly is the focus ring:
 * tokens.css puts `:focus-visible` on the `<input>`, which is now clipped to a
 * pixel, so a keyboard user would see nothing at all. `peer-focus-visible:` puts
 * an equivalent ring back on the visible card. **Remove that and the control
 * becomes keyboard-invisible** — CLAUDE.md rule 10.
 *
 * ## The choice applies immediately, and says so
 *
 * No Save button. There is nothing to validate and nothing to undo — the page
 * around the control is already in the new language, which is a better
 * confirmation than any toast. The `role="status"` line underneath exists for the
 * person who cannot see that happen.
 */
export function LanguagePicker() {
  const locale = useLocale();
  const t = useStrings();
  const [changed, setChanged] = useState(false);

  return (
    <div>
      <fieldset>
        <legend className="text-small font-semibold text-ops-ink">
          {t.settings.language.legend}
        </legend>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {LOCALES.map((option) => {
            const selected = option.code === locale;
            return (
              <label
                key={option.code}
                className="relative block cursor-pointer"
                /*
                 * The label and its contents are in the language they offer, so a
                 * screen reader pronounces "Français" as French rather than
                 * reading it through the current locale's phonemes. This is the
                 * one place in the app where mixed languages are unavoidable —
                 * a language list is inherently multilingual.
                 */
                lang={option.code}
              >
                <input
                  type="radio"
                  name="interface-language"
                  value={option.code}
                  checked={selected}
                  onChange={() => {
                    setLocale(option.code);
                    setChanged(true);
                  }}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'flex min-h-touch items-center gap-3 rounded-md border p-3',
                    'transition-colors duration-fast ease-out-soft',
                    // Restores what tokens.css put on the now-hidden input.
                    'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                    'peer-focus-visible:outline-focus',
                    selected
                      ? 'border-ops-navy bg-ops-navy text-ink-inverse'
                      : 'border-ops-outline-variant bg-ops-surface hover:bg-ops-surface-high'
                  )}
                >
                  {/*
                    Two letters, not a flag. A flag is a country and this is a
                    language: there is no flag meaning "Spanish" that does not
                    also mean "Spain" to everyone who does not live there, and
                    picking one for French in the Caribbean is worse still.
                  */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex size-8 shrink-0 items-center justify-center rounded-sm',
                      'text-caption font-semibold tabular',
                      selected
                        ? 'bg-neutral-0/15 text-ink-inverse'
                        : 'bg-ops-surface-high text-ops-ink-variant'
                    )}
                  >
                    {option.short}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium">{option.endonym}</span>
                    {/*
                      The English name, for the reader whose interface is
                      currently in a language they do not read and who is looking
                      for the word "Spanish". `lang="en"` because the label
                      around it is not English.
                    */}
                    <span
                      lang="en"
                      className={cn(
                        'block truncate text-caption',
                        selected ? 'text-on-navy-secondary' : 'text-ops-ink-variant'
                      )}
                    >
                      {option.englishName}
                    </span>
                  </span>

                  {/* Selection is carried by the fill and the radio's own state;
                      this is reinforcement for anyone who cannot separate the
                      two backgrounds. Never the only signal. */}
                  {selected ? (
                    <span aria-hidden="true" className="shrink-0 text-small">
                      ✓
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/*
        Announced, not just drawn. Someone using a screen reader gets no benefit
        from the interface repainting around them, so the confirmation is spoken.
        It appears only after a change — a page that loads already claiming
        "saved" is claiming something that did not happen.
      */}
      <p role="status" className="mt-3 min-h-5 text-small text-ops-ink-variant">
        {changed ? t.settings.language.saved : t.settings.language.storedNote}
      </p>
    </div>
  );
}
