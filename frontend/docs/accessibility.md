# Accessibility audit

Run 2026-07-30 against the current build. Re-runnable with `npm run check:a11y`,
which fails on any violation.

**Naming a known limitation is a strength. The gaps are in the last section and
they are real ones, not throat-clearing.**

---

## Automated: axe-core (WCAG 2.1 A and AA)

Every route, at 390 px and 1280 px.

| Route      | Mobile       | Desktop      |
| ---------- | ------------ | ------------ |
| `/`        | 0 violations | 0 violations |
| `/about`   | 0            | 0            |
| `/privacy` | 0            | 0            |
| `/chat`    | 0            | 0            |
| `/widget`  | 0            | 0            |

Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Ten route/viewport
combinations, zero violations.

## Automated: Lighthouse — ⚠️ DID NOT RUN

**Lighthouse was attempted and did not complete.** It hangs indefinitely in this
environment against both the preview server and the dev server, on every route,
and was killed after ten minutes with no output. That is an environment
limitation rather than a finding about the product, but it is a gap in this audit
and is recorded as one rather than quietly omitted.

What covers the same ground in the meantime:

- **Accessibility** — Lighthouse's accessibility category is a _subset_ of
  axe-core, which is what it runs internally. The axe run above is the stricter
  of the two, covers five routes at two viewports, and is wired into
  `npm run check:a11y` so it fails on any violation.
- **Performance** — measured directly instead, and with harder numbers than a
  score: `npm run check:slow` reports first content at 5.2 s (`/`) and 6.2 s
  (`/chat`) on emulated Slow 3G with **CLS 0.0000**, and `npm run check:budget`
  enforces 119.5 kB gzipped of initial JavaScript against a 200 kB ceiling.
- **Best practices / SEO** — per-route `<title>` and meta descriptions are
  asserted in `tests/accessibility.test.tsx`; no third-party requests and no
  console errors are asserted in `check:budget` and `check:browsers`.

**Still worth running on a machine where it works**, before presenting.

---

## What automated tools cannot check

These are the ones that matter, and four of them are asserted by
`scripts/a11y-check.mjs` so they cannot silently regress.

### Streaming does not re-announce the whole answer ✅

**The standard bug in this class of product.** Wrapping the transcript in
`aria-live="polite"` announces its _entire_ contents on every change, and a
streamed answer changes forty times a second — a screen-reader user hears the
answer restart from the beginning on every token and never reaches the end of a
sentence. It looks perfect in every visual test.

`AnswerAnnouncer` is a **separate** live region, outside the transcript, holding
only the newest **finished** answer. It is derived rather than stored, so it is
stable throughout generation.

**Measured:** the region's contents changed **once** across a full streamed
answer, at completion, carrying 304 characters. Not once per token.

### Focus management ✅ — and a defect this found

Activating a citation chip must move focus **into** the source panel. It did not:
the panel scrolled to the entry and focus stayed in the middle of the answer, so
the scroll happened for somebody else entirely.

The cause was a selector — `[data-kb-id]` matched the citation _chip_, which
carries the same attribute and comes first in the document, so the code
"focused" the element focus was already on and reported success. Now `li[data-kb-id]`.

- Chip activated → focus lands on the source entry. **Asserted.**
- Bottom sheet (mobile, widget) → focus is trapped inside and restored to the
  opener on close. Asserted since F002.
- Embedded widget → Escape closes it and focus returns to the launcher.
  Asserted in `check:browsers` across three engines.

### Keyboard-only navigation ✅

Walked without a mouse across `/`, `/chat` and the embedded widget:

- Skip link is the **first** focusable element and targets a real `#main`.
- Landing chips, composer, send, voice control, citation chips, source entries,
  the "view as table" toggle and the speaker controls are all reachable and
  operable.
- The **scrollable fee table** is a labelled `role="region"` with `tabindex="0"`,
  so arrow keys reach the overflowing columns. A scroll container that cannot be
  focused cannot be scrolled by keyboard, and automated checkers do flag it.
- Voice: Enter/Space toggles recording (native button behaviour, not
  re-implemented — re-implementing double-fires on some browsers), Escape
  cancels and discards, `aria-pressed` reflects the recording state.
- Escape closes the source sheet and the widget.

### `prefers-reduced-motion` ✅

**Zero** elements animating under `reduced` while an answer streams — measured,
not assumed. Gated twice: the CSS media query collapses durations, and JS
animations check `useReducedMotion`, because a transition with a 0.01 ms duration
is still a transition that fires and still runs its callbacks.

Covered: the agent-status pulse, the voice level meter, the spinners, the
smooth-scroll to the newest message, and the launcher's colour transition in
`embed.js`.

### Contrast ✅

`tests/contrast.test.ts` computes real WCAG relative luminance from the token
file itself and passes. It found three defects in the interim tokens when written
(F002) and the **tokens** were changed, not the thresholds.

`--amber-board` is a fill-and-dark-ground colour — 2.03:1 on white, 6.1:1 on navy
— and is used as text **only** on navy. Asserted twice: a source grep, and a
DOM test resolving the ancestor background.

### Colour is never the only signal ✅

Chart series carry three signals: colour, stroke pattern, and marker shape or SVG
fill pattern. One man in twelve has a colour-vision deficiency and the leave-behind
prints in black and white, where four translucent blues become four
indistinguishable greys.

### A chart is data, not an image ✅

`role="img"` with a description computed from the numbers — what it measures, over
what range, which way it goes — plus a data table rendered **twice**: visually
hidden always, and visibly behind a toggle. The hidden copy is unconditional,
because a chart's data must never be behind a button for someone who cannot see
the drawing.

---

## Outstanding

### 1. No screen reader has actually been used ⚠️

The live-region behaviour is verified by **observing DOM mutations**, which proves
the region changes once rather than per token. It does **not** prove how VoiceOver
or NVDA reads the result — announcement ordering, interruption behaviour, and how
the source panel is navigated by rotor are all unverified.

This is the largest gap in this document. It needs thirty minutes with VoiceOver
on macOS and NVDA on Windows.

### 2. No physical device ⚠️

Everything mobile is emulated. See `docs/decisions.md` F012 for the full list of
what that leaves untested; for accessibility specifically, VoiceOver on iOS
behaves differently from VoiceOver on macOS, particularly around live regions and
custom controls.

### 3. Voice controls are announced but not tested aurally ⚠️

The live region announces "Listening", "Processing" and the transcript state, and
`aria-pressed` reflects recording. Whether the sequence is _comprehensible_ when
heard — rather than merely present in the DOM — has not been checked.

### 4. The interim design tokens are not the designers' final ones ℹ️

The contrast test passes against the current interim palette. It is written to
read the token file directly, so it re-runs unchanged against the designers'
delivery — but that delivery has not happened, and the numbers here describe a
placeholder palette.

### 5. No user testing with a disabled participant ⚠️

Nothing here substitutes for that. The audit is a floor, not a ceiling.
