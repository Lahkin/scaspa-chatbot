import { createFileRoute } from '@tanstack/react-router';
import { OpsPage } from '@/components/ops/OpsPage';
import {
  SettingRow,
  SettingsLinkRow,
  SettingsSection,
} from '@/components/settings/SettingsSection';
import { LanguagePicker } from '@/components/settings/LanguagePicker';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { HistoryControls } from '@/components/settings/HistoryControls';
import { getLocale, stringsFor, useStrings } from '@/features/i18n';
import { SCASPA_TEL_HREF, SCASPA_TEL_TEXT } from '@/features/chat/contact';

/**
 * Settings — reached from the bottom of the navigation sidebar.
 *
 * ## Six sections, and why each says what it says
 *
 * The brief asked for a language selector, accessibility options, chat-history
 * controls, help and support, and an about panel. All five are here. Two of them
 * answer differently from how a settings page usually would, and the difference
 * is the point rather than a shortfall:
 *
 * 1. **Language changes the interface, not the answers.** The knowledge base is
 *    English and `CLAUDE.md` rule 10 requires every money and time value in an
 *    answer to appear verbatim in the retrieved chunk. A translation layer
 *    between the chunk and the reader cannot promise that, so the assistant keeps
 *    replying in English and the section says so in a panel the eye lands on
 *    before it reaches the radios — not in a footnote underneath them.
 * 2. **Accessibility mostly has no switches.** Contrast, motion and text size are
 *    read from the operating system, where the user sets them once for
 *    everything. A per-site switch would need somewhere to live, would apply to
 *    this site alone, and would have to be found again on every other. The
 *    section explains that rather than leaving a reader hunting for controls that
 *    are deliberately absent.
 *
 * ## What did change to build this
 *
 * `frontend/CLAUDE.md` rule 5 previously permitted exactly one stored value —
 * `conversation_id` in `sessionStorage`. A language that resets every visit is
 * not a language selector, so the rule now also permits **non-message UI
 * preferences** in `localStorage` under `scaspa.prefs`. Message content is still
 * forbidden everywhere, which is what the rule was protecting: `draft.ts` still
 * refuses storage outright for a half-typed question. Recorded in
 * docs/decisions.md.
 *
 * ## The identity card is still not here
 *
 * `/profile` renders a demo operator card from a fixture feed and carries the
 * guardrails for it. This page owns the controls with side effects, and those two
 * jobs stay apart — two screens writing the same storage key is how they drift.
 */
function SettingsRoute() {
  const t = useStrings();

  const sections = [
    { id: 'appearance', label: t.settings.appearance.heading },
    { id: 'language', label: t.settings.language.heading },
    { id: 'accessibility', label: t.settings.accessibility.heading },
    { id: 'history', label: t.settings.history.heading },
    { id: 'support', label: t.settings.support.heading },
    { id: 'about', label: t.settings.about.heading },
  ];

  return (
    <OpsPage
      title={t.settings.title}
      intro={t.settings.intro}
      backLabel={t.settings.backToAssistant}
    >
      {/*
        Quick jump. Six sections is well past the point where a phone user
        should have to thumb through all of them to reach "clear my history".

        Plain `<a href="#id">` rather than a router link: this is movement within
        the document, so the browser's own anchor handling — including its
        focus move to the target section — is exactly right, and a router
        navigation would replace it with a scroll that leaves focus behind.
      */}
      <nav aria-label={t.settings.onThisPage} className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="inline-flex min-h-touch items-center rounded-full border border-ops-outline-variant bg-ops-surface px-3 text-small font-medium text-ops-ink hover:bg-ops-surface-high"
          >
            {section.label}
          </a>
        ))}
      </nav>

      {/* ── 1. Appearance ───────────────────────────────────────────────────── */}
      <SettingsSection
        id="appearance"
        icon="◐"
        title={t.settings.appearance.heading}
        lead={t.settings.appearance.lead}
      >
        <ThemePicker />
      </SettingsSection>

      {/* ── 2. Language ─────────────────────────────────────────────────────── */}
      <SettingsSection
        id="language"
        icon="🌐"
        title={t.settings.language.heading}
        lead={t.settings.language.lead}
      >
        {/*
          Above the radios, deliberately.

          Someone who picks Spanish and then discovers the answers are English
          has been misled by the control, however carefully the caveat is worded
          underneath it. Putting the scope first means nobody chooses without
          having passed it — the same ordering rule as the demo notice on the
          profile card.
        */}
        <div
          role="note"
          className="rounded-md border border-amber-text bg-amber-surface p-3 text-small text-ops-ink"
        >
          <p className="font-semibold">{t.settings.language.scopeTitle}</p>
          <p className="mt-1 max-w-measure">{t.settings.language.scopeBody}</p>
        </div>

        <LanguagePicker />
      </SettingsSection>

      {/* ── 3. Accessibility ────────────────────────────────────────────────── */}
      <SettingsSection
        id="accessibility"
        icon="♿"
        title={t.settings.accessibility.heading}
        lead={t.settings.accessibility.lead}
      >
        <SettingRow
          title={t.settings.accessibility.contrastTitle}
          body={t.settings.accessibility.contrastBody}
          badge={t.settings.accessibility.followsDevice}
        />
        <SettingRow
          title={t.settings.accessibility.motionTitle}
          body={t.settings.accessibility.motionBody}
          badge={t.settings.accessibility.followsDevice}
        />
        <SettingRow
          title={t.settings.accessibility.textTitle}
          body={t.settings.accessibility.textBody}
          badge={t.settings.accessibility.followsDevice}
        />
        <SettingRow
          title={t.settings.accessibility.keyboardTitle}
          body={t.settings.accessibility.keyboardBody}
          badge={t.settings.accessibility.builtIn}
        />

        <p className="max-w-measure text-small text-ops-ink-variant">
          <strong className="font-semibold text-ops-ink">
            {t.settings.accessibility.whyNoSwitchTitle}.
          </strong>{' '}
          {t.settings.accessibility.whyNoSwitchBody}
        </p>
      </SettingsSection>

      {/* ── 4. Chat history ─────────────────────────────────────────────────── */}
      <SettingsSection
        id="history"
        icon="🗒"
        title={t.settings.history.heading}
        lead={t.settings.history.lead}
      >
        <HistoryControls />
      </SettingsSection>

      {/* ── 5. Help and support ─────────────────────────────────────────────── */}
      <SettingsSection
        id="support"
        icon="🛟"
        title={t.settings.support.heading}
        lead={t.settings.support.lead}
      >
        {/*
          The phone number is a row rather than a link card because it is not a
          navigation — it dials. Same reasoning as the sidebar footer: the way
          out is the most legible thing in the section.
        */}
        <SettingRow title={t.settings.support.callTitle} body={t.settings.support.callBody}>
          <a
            href={SCASPA_TEL_HREF}
            className="inline-flex min-h-touch items-center rounded-md bg-ops-navy px-4 text-small font-semibold text-ink-inverse tabular"
          >
            {SCASPA_TEL_TEXT}
          </a>
        </SettingRow>

        <SettingsLinkRow
          to="/support"
          title={t.settings.support.ticketTitle}
          body={t.settings.support.ticketBody}
          action={t.settings.support.ticketAction}
        />

        <SettingsLinkRow
          to="/privacy"
          title={t.settings.support.privacyTitle}
          body={t.settings.support.privacyBody}
          action={t.settings.support.privacyAction}
        />

        <div className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-3">
          <h3 className="text-small font-semibold text-ops-ink">{t.settings.support.tipsTitle}</h3>
          <ul className="mt-2 space-y-2">
            {[t.settings.support.tip1, t.settings.support.tip2, t.settings.support.tip3].map(
              (tip) => (
                <li key={tip} className="flex gap-2 text-small text-ops-ink-variant">
                  <span aria-hidden="true" className="shrink-0 text-ops-sky">
                    →
                  </span>
                  <span className="max-w-measure">{tip}</span>
                </li>
              )
            )}
          </ul>
        </div>
      </SettingsSection>

      {/* ── 6. About the assistant ──────────────────────────────────────────── */}
      <SettingsSection
        id="about"
        icon="⚓"
        title={t.settings.about.heading}
        lead={t.settings.about.lead}
      >
        <SettingRow title={t.settings.about.whatTitle} body={t.settings.about.whatBody} />

        <div className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-3">
          <h3 className="text-small font-semibold text-ops-ink">{t.settings.about.rulesTitle}</h3>
          <ul className="mt-2 space-y-2">
            {[
              t.settings.about.rule1,
              t.settings.about.rule2,
              t.settings.about.rule3,
              t.settings.about.rule4,
            ].map((rule) => (
              <li key={rule} className="flex gap-2 text-small text-ops-ink-variant">
                <span aria-hidden="true" className="shrink-0 text-ops-sky">
                  ✓
                </span>
                <span className="max-w-measure">{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <SettingsLinkRow
          to="/about-scaspa"
          title={t.settings.about.orgTitle}
          body={t.settings.about.orgBody}
          action={t.settings.about.orgAction}
        />
      </SettingsSection>
    </OpsPage>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
  /*
   * The tab title follows the interface language too.
   *
   * `head()` runs outside React, so it reads the store directly rather than
   * through the hook. It is evaluated on navigation, which means a language
   * changed while already sitting on this page leaves the old title until the
   * next navigation — a genuinely trivial staleness, and the alternative is
   * writing to `document.title` from an effect and fighting `<HeadContent />`
   * over which of them owns it.
   */
  head: () => {
    const t = stringsFor(getLocale());
    return {
      meta: [
        { title: `${t.settings.title} — Pilot` },
        { name: 'description', content: t.settings.intro },
      ],
    };
  },
});
