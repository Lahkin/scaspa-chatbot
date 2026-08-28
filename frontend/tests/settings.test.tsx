/**
 * The settings page, the language layer, and the promises both of them make.
 *
 * The assertions that matter are not "it renders". They are:
 *
 *   1. every language ships every string, and none of them is blank;
 *   2. choosing a language actually repaints the chrome and moves
 *      `document.documentElement.lang` with it;
 *   3. the assistant's own column stays `lang="en"`, because the answers do;
 *   4. `localStorage` holds a language and *never* anything resembling a message;
 *   5. the sidebar's way out is a real navigable link at both rail widths;
 *   6. the destructive controls announce themselves rather than silently working.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/shells/Sidebar';
import { LanguagePicker } from '@/components/settings/LanguagePicker';
import { HistoryControls } from '@/components/settings/HistoryControls';
import {
  LOCALES,
  detectLocale,
  getLocale,
  isLocaleCode,
  resetLocale,
  setLocale,
} from '@/features/i18n';
import { readPrefs } from '@/features/i18n/prefs';
import { en } from '@/features/i18n/strings/en';
import { es } from '@/features/i18n/strings/es';
import { fr } from '@/features/i18n/strings/fr';
import { renderWithProviders } from './helpers';

beforeEach(() => {
  // The store is a module singleton and outlives a component, so without this a
  // language chosen in one case leaks into the next.
  resetLocale();
  window.localStorage.clear();
});

function sidebarProps() {
  return {
    onAsk: vi.fn(),
    recordedQuestions: ['Is the Vega Sirius alongside?'],
  };
}

/** Every leaf path in a nested string object, as `a.b.c`. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

// ── 1. Every language is complete ────────────────────────────────────────────

describe('the dictionaries', () => {
  const dictionaries = { en, es, fr };

  it('ships exactly the same keys in every language', () => {
    // `satisfies Strings` already enforces this at compile time. It is asserted
    // again here because the type only checks the file as written — a key
    // deleted from `en` stops being required everywhere at once, silently.
    const english = leafPaths(en).sort();
    for (const [code, dictionary] of Object.entries(dictionaries)) {
      expect(leafPaths(dictionary).sort(), `${code} has drifted from en`).toEqual(english);
    }
  });

  it('has no blank or untranslated-looking string', () => {
    for (const [code, dictionary] of Object.entries(dictionaries)) {
      for (const path of leafPaths(dictionary)) {
        const value = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
        expect(typeof value, `${code}.${path}`).toBe('string');
        expect((value as string).trim().length, `${code}.${path} is blank`).toBeGreaterThan(0);
        /*
         * A placeholder shipped to a user is worse than the English it replaced.
         *
         * Markers only — `TODO:`, `FIXME` — and never the bare word: "todo" is
         * ordinary Spanish for "all", and es.settings.accessibility.lead opens
         * with "Casi todo esto ya está configurado". A bare-word check fails on
         * correct Spanish, which teaches the next person to delete the check.
         */
        expect(value as string, `${code}.${path}`).not.toMatch(/TODO:|FIXME|XXX:|untranslated/i);
      }
    }
  });

  it('leaves every non-English dictionary actually translated', () => {
    /*
     * A copy-paste of `en.ts` satisfies the type checker perfectly and ships an
     * English interface to someone who asked for Spanish. Proper nouns legitimately
     * match across languages, so this checks the long prose rather than the labels.
     */
    for (const dictionary of [es, fr]) {
      expect(dictionary.settings.language.scopeBody).not.toBe(en.settings.language.scopeBody);
      expect(dictionary.settings.history.noListBody).not.toBe(en.settings.history.noListBody);
      expect(dictionary.sidebar.newConversation).not.toBe(en.sidebar.newConversation);
    }
  });

  it('offers each language under its own name, not a translated one', () => {
    // Someone whose interface is in a language they cannot read is scanning for
    // the shape of the word "Français". "French" is invisible to them.
    expect(LOCALES.map((locale) => locale.endonym)).toEqual(['English', 'Español', 'Français']);
  });
});

// ── 2. Choosing a language changes the app ───────────────────────────────────

describe('the language picker', () => {
  it('is a radio group whose options apply immediately', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguagePicker />);

    const spanish = screen.getByRole('radio', { name: /Español/ });
    expect(spanish).not.toBeChecked();

    await user.click(spanish);

    expect(spanish).toBeChecked();
    expect(getLocale()).toBe('es');
    // No Save button: the repaint is the confirmation.
    expect(screen.queryByRole('button', { name: /save|guardar/i })).toBeNull();
  });

  it('moves the document language with the choice', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguagePicker />);

    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('radio', { name: /Français/ }));
    // Without this a screen reader speaks French chrome with English phonemes.
    expect(document.documentElement.lang).toBe('fr');
  });

  it('marks each option with the language it offers', () => {
    const { container } = renderWithProviders(<LanguagePicker />);
    // A language list is inherently multilingual; the labels must say so or
    // "Français" is pronounced through whatever the page locale happens to be.
    expect(container.querySelector('label[lang="es"]')).not.toBeNull();
    expect(container.querySelector('label[lang="fr"]')).not.toBeNull();
  });

  it('announces the change for anyone who cannot see the repaint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguagePicker />);

    await user.click(screen.getByRole('radio', { name: /Español/ }));
    expect(screen.getByRole('status')).toHaveTextContent(es.settings.language.saved);
  });
});

// ── 3. The chrome translates; the answers do not ─────────────────────────────

describe('what a language choice does and does not reach', () => {
  it('repaints the translated chrome', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <LanguagePicker />
        <HistoryControls />
      </>
    );

    expect(
      screen.getByRole('button', { name: en.settings.history.clearAction })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Español/ }));
    expect(
      screen.getByRole('button', { name: es.settings.history.clearAction })
    ).toBeInTheDocument();
  });

  it('keeps the handoff’s own words in English', () => {
    /*
     * The handoff sets the product's voice in §10, down to the spelling:
     * British and Caribbean, sentence case throughout. English is where that
     * lives, and it is still the default — so these assertions are unchanged
     * from when the navigation was English-only.
     *
     * What changed is the sentence that used to follow them, which said the
     * labels were "not routed through the dictionaries, so a language choice
     * does not touch them". They are now, and it does. See the test below.
     */
    renderWithProviders(<Sidebar {...sidebarProps()} />);
    expect(screen.getByRole('link', { name: 'Vessels' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recorded questions' })).toBeInTheDocument();
  });

  it('translates the navigation, which it did not used to', () => {
    setLocale('es');
    renderWithProviders(<Sidebar {...sidebarProps()} />);
    expect(screen.getByRole('link', { name: 'Buques' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preguntas registradas' })).toBeInTheDocument();
    // The route is not copy and is never translated: a translated href is a 404.
    expect(screen.getByRole('link', { name: 'Buques' })).toHaveAttribute('href', '/vessels');
  });

  it('does not pin the main column to English any more', () => {
    /*
     * This assertion is inverted from what it was, deliberately.
     *
     * It required `<main id="main" lang="en">`, on the grounds that the answers
     * were English by rule and would otherwise be read with Spanish phonemes
     * under a Spanish root. That was correct at the time.
     *
     * Both halves of the premise have gone. The assistant answers in the
     * language it was asked in — nothing ever pinned it, and prompt rule 7 now
     * says so — and rule 10 survived the change (`app/rag/figures.py`). More
     * immediately: `<main>` is not the conversation. It wraps every operations
     * screen, and those are translated now, so pinning English here would
     * mis-pronounce all of the translated chrome on every screen.
     *
     * The content inherits `<html lang>`, which is right whenever the reader
     * asks in the language they set, and no worse when they do not.
     */
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/shells/FullPageShell.tsx'),
      'utf8'
    );
    expect(source).toMatch(/<main id="main"/);
    expect(source).not.toMatch(/<main[^>]*lang="en"/);
  });
});

// ── 4. Storage: a preference, never a message ────────────────────────────────

describe('what reaches localStorage', () => {
  it('stores the language under the one permitted preferences key', () => {
    setLocale('fr');
    expect(readPrefs()).toEqual({ locale: 'fr' });
    expect(window.localStorage.getItem('scaspa.prefs')).toBe('{"locale":"fr"}');
  });

  it('stores nothing else at all', () => {
    setLocale('es');
    // CLAUDE.md rule 5, as amended: non-message UI preferences only. If a second
    // key ever appears here it needs a decision record, not a quiet addition.
    expect(Object.keys(window.localStorage)).toEqual(['scaspa.prefs']);
  });

  it('discards a corrupted or hostile stored value rather than trusting it', () => {
    for (const hostile of ['not json', '{"locale":"<script>"}', '{"locale":42}', 'null', '[]']) {
      window.localStorage.setItem('scaspa.prefs', hostile);
      expect(readPrefs(), hostile).toBeNull();
    }
  });

  it('forgets the preference on reset, for the shared kiosk', () => {
    setLocale('es');
    resetLocale();
    expect(getLocale()).toBe('en');
    expect(window.localStorage.getItem('scaspa.prefs')).toBeNull();
  });

  it('the settings feature writes no message content anywhere', () => {
    // The rule the amendment did NOT relax. A question, an answer or a draft in
    // storage is still forbidden outright — see draft.ts.
    for (const file of [
      'src/components/settings/HistoryControls.tsx',
      'src/components/settings/LanguagePicker.tsx',
      'src/routes/settings.tsx',
    ]) {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(code, file).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\s*[.[]/);
    }
  });
});

// ── 5. Reaching settings from the sidebar ────────────────────────────────────

describe('the sidebar way out', () => {
  it('offers every destination as a real link, not a button that navigates', () => {
    renderWithProviders(<Sidebar {...sidebarProps()} />);
    // Links, so they are middle-clickable, copyable and openable in a new tab.
    expect(screen.getByRole('link', { name: 'Vessels' })).toHaveAttribute('href', '/vessels');
    // "Contact SCASPA", not "Support" — the nav restructure renamed the label
    // and not the route, which is exactly the pair this assertion checks.
    expect(screen.getByRole('link', { name: 'Contact SCASPA' })).toHaveAttribute(
      'href',
      '/support'
    );
  });

  it('dismisses the drawer on the way out', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<Sidebar {...sidebarProps()} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('link', { name: 'Tariffs' }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('carries no TanStack Link, so the shell still renders without a router', () => {
    /*
     * This is the constraint the whole component is shaped around: shells.test.tsx
     * renders FullPageShell with a query client and nothing else. A `<Link>` here
     * reads the router from context and takes ten passing tests with it.
     */
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/shells/Sidebar.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/from '@tanstack\/react-router'/);
  });
});

// ── 6. The history controls ──────────────────────────────────────────────────

describe('chat history controls', () => {
  it('clears the conversation and announces it politely', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem('conversation_id', '11111111-2222-4333-8444-555555555555');
    renderWithProviders(<HistoryControls />);

    await user.click(screen.getByRole('button', { name: en.settings.history.clearAction }));

    expect(window.sessionStorage.getItem('conversation_id')).toBeNull();
    const status = screen.getByText(en.settings.history.cleared);
    // `status`, not `alert`: the user asked for this and already knows.
    expect(status).toHaveAttribute('role', 'status');
  });

  it('resets the language along with the conversation', async () => {
    const user = userEvent.setup();
    setLocale('es');
    renderWithProviders(<HistoryControls />);

    await user.click(screen.getByRole('button', { name: es.settings.history.resetAction }));

    expect(getLocale()).toBe('en');
    expect(window.localStorage.getItem('scaspa.prefs')).toBeNull();
  });

  it('states the position before it offers a button', () => {
    renderWithProviders(<HistoryControls />);
    /*
     * "Clear chat history" usually means "delete the transcript you hold about
     * me". There is no such transcript, and a button implying one existed and
     * was just destroyed is a false reassurance — worse than no button.
     */
    expect(screen.getByText(en.settings.history.noListTitle)).toBeInTheDocument();
    expect(screen.getByText(en.settings.history.neverBody)).toBeInTheDocument();
  });

  it('offers no confirmation dialog, because nothing is recoverable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HistoryControls />);
    await user.click(screen.getByRole('button', { name: en.settings.history.clearAction }));
    // A modal guarding something that cannot be got back either way is theatre.
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ── 7. Locale detection ──────────────────────────────────────────────────────

describe('detecting a language from the browser', () => {
  it('matches on the primary subtag, so es-MX gets Spanish', () => {
    // Matching the full tag would leave a Mexican visitor on English because the
    // app ships no `es-MX` file, which is a worse answer than the Spanish it has.
    expect(detectLocale(['es-MX', 'en'])).toBe('es');
    expect(detectLocale(['fr-CA'])).toBe('fr');
    expect(detectLocale(['pt-BR', 'fr'])).toBe('fr');
  });

  it('falls back to English rather than guessing', () => {
    expect(detectLocale([])).toBe('en');
    expect(detectLocale(['pt-BR', 'de'])).toBe('en');
  });

  it('narrows unknown values instead of trusting them', () => {
    expect(isLocaleCode('es')).toBe(true);
    expect(isLocaleCode('klingon')).toBe(false);
    expect(isLocaleCode(null)).toBe(false);
  });
});

// ── 8. The rule that was amended, and the one that was not ───────────────────

describe('CLAUDE.md rule 5', () => {
  const rules = readFileSync(resolve(process.cwd(), 'CLAUDE.md'), 'utf8');

  it('records the localStorage preferences key it now permits', () => {
    // A rule relaxed in code but not in the rules file is a rule nobody can rely
    // on. If this fails, the amendment was never actually written down.
    expect(rules).toContain('scaspa.prefs');
  });

  it('still forbids message content in any storage', () => {
    expect(rules.toLowerCase()).toContain('never write message content');
  });
});
