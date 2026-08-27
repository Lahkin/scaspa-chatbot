import { useState } from 'react';
import { cn } from '@/lib/cn';
import { setThemeChoice, useThemeChoice, type ThemeChoice } from '@/features/theme';
import { useStrings } from '@/features/i18n';

/**
 * Light, dark, or whatever the device says.
 *
 * ## The same radio-card pattern as `LanguagePicker`, deliberately
 *
 * Radios rather than a `<select>`, the real input `sr-only`, the paint on the
 * label, and `peer-focus-visible:` putting back the focus ring that clipping the
 * input took away. All of that reasoning is written out once, in
 * `LanguagePicker`, and it applies here unchanged — two controls on one screen
 * that behave differently is a worse outcome than a little repetition.
 *
 * ## "System" is an option, not the absence of one
 *
 * It is also the default, and it has to be selectable: someone who picks Dark in
 * the morning needs a way back to "follow my phone" that is not "clear all my
 * settings". That is why `ThemeChoice` has three values while the document
 * attribute only ever has two — see `features/theme/choice.ts`.
 *
 * ## No Save button, and no preview
 *
 * The page repaints under the control as it is chosen, which is a better
 * confirmation than any toast could be. The `role="status"` line underneath is
 * for the reader who cannot see that happen.
 */

/*
 * No icon chip, unlike LanguagePicker's two-letter one.
 *
 * That chip works there because a language HAS a two-letter code. A theme does
 * not, and the obvious glyphs — a sun, a moon, a laptop — are not in the spec's
 * sprite. `iconPaths.ts` is transcribed from that sprite verbatim, on the stated
 * grounds that anything redrawn by eye looks close at 16px and wrong at 20px, so
 * inventing three glyphs to fill a decorative slot would be the one thing that
 * file exists to prevent. The label and its hint carry the meaning perfectly
 * well, and the page repainting carries the rest.
 */
const OPTIONS: readonly ThemeChoice[] = ['light', 'dark', 'system'];

export function ThemePicker() {
  const choice = useThemeChoice();
  const t = useStrings();
  const [changed, setChanged] = useState(false);

  return (
    <div>
      <fieldset>
        <legend className="text-small font-semibold text-ops-ink">
          {t.settings.appearance.legend}
        </legend>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const selected = option === choice;
            const copy = t.settings.appearance.options[option];
            return (
              <label key={option} className="relative block cursor-pointer">
                <input
                  type="radio"
                  name="interface-theme"
                  value={option}
                  checked={selected}
                  onChange={() => {
                    setThemeChoice(option);
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
                    Flat on purpose. LanguagePicker can afford another wrapper
                    because its two-letter chip puts text within two elements of
                    the <label>; with the chip gone, one more <span> here pushes
                    every word past what jsx-a11y/label-has-associated-control
                    accepts, and the rule is right — a label whose text is buried
                    is a label some assistive technology will not read out.
                  */}
                  <span className="min-w-0 flex-1 truncate text-small font-medium">
                    {copy.label}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-caption',
                      selected ? 'text-on-navy-secondary' : 'text-ops-ink-variant'
                    )}
                  >
                    {copy.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/*
        Announced, not shown-and-hoped. The visual confirmation is the page
        itself changing colour, which a screen-reader user does not receive.
      */}
      <p role="status" className="mt-3 min-h-5 text-caption text-ops-ink-variant">
        {changed ? t.settings.appearance.saved : ''}
      </p>

      <p className="mt-1 text-caption text-ops-ink-variant">{t.settings.appearance.storedNote}</p>
    </div>
  );
}
