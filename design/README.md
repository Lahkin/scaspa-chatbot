# Handoff: SCASPA Assistant — full UI system

Design status: **final**. No open decisions. Every value in this bundle is normative.

---

## 1. Overview

The SCASPA Assistant is the public-facing assistant for the **St. Christopher Air & Sea Ports Authority**, the statutory body operating the seaport and airport of St. Kitts and Nevis. Users are shipping agents, freight forwarders, airline handlers, customs brokers, cruise operators, ferry passengers and members of the public.

It answers questions about vessel movements, flight arrivals, port tariffs and departmental contacts, and it surfaces operational data (berth positions, gate assignments, advisories) through non-conversational screens.

### The one fact that shapes every screen

The product has **two data paths that must never look alike**.

| | Assistant path | Operations path |
|---|---|---|
| Endpoint | `/api/chat` | `/api/vessels`, `/api/flights`, `/api/ops/*`, `/api/tariffs` |
| Produced by | A language model | A non-LLM data feed |
| Can state a berth status? | **No** — it is forbidden from claiming it can see live operations | **Yes** — a feed said so |
| Carries citations | `[kb-xxx]` markers, backend-verified against a retrieved row | n/a |
| Carries `DataSource` | No | **Always** (`kind`, `label`, `as_of`, `notice`) |
| **Renders as** | **Flush prose on the surface. No card, no border, no meta strip.** | **A provenance card on a raised surface with a top meta strip.** |

**The meta strip is the tell.** If a block has one, a feed produced it. If it has none, a model wrote it. This is the single most important rule in the implementation and it is not negotiable for layout convenience.

`notice` is schema-enforced non-empty whenever `kind` is `fixture` or `unavailable`. A table of vessel arrivals is believed on sight, and nothing in the rows themselves tells a reader whether it is a live feed or sample data — so provenance is not decoration in this product, it is the feature.

---

## 2. About the design files

The files in this bundle are **design references created in HTML**. They are prototypes showing intended look and behaviour — **they are not production code to copy directly.**

Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, or whatever is already in place) using its established patterns, component primitives and libraries. If no environment exists yet, choose the most appropriate framework for the project and implement the designs there.

The prototype uses inline styles throughout because of how it was authored. **Do not reproduce that.** Use the target codebase's normal styling approach — CSS modules, Tailwind, styled-components, design tokens, whatever is idiomatic there. `tokens.css` in this bundle gives you every value as a custom property to seed that work.

## 3. Fidelity

**High-fidelity.** Colours, typography, spacing, radii, states and copy are final. Recreate the UI pixel-perfectly. Every hex value, every px measurement and every string in this document is the shipping value.

Two things are deliberately *not* pixel-locked:
- The ambient gradient bloom behind the app frame appears on the **cover frame of the spec board only**. It does not exist in the product. Do not build it.
- The dashed outlines and small annotation captions on the boards are documentation, not UI. They do not ship.

---

## 4. What is in this bundle

```
design_handoff_scaspa_assistant/
├── README.md                      ← you are here: overview, tokens, global rules, requirements
├── tokens.css                     ← every design value as a CSS custom property
├── 01-foundations.md              ← seal, badge system (45 variants), buttons (6), inputs (9)
├── 02-shell-and-navigation.md     ← app shell, embedded widget, nav, pagination, breadcrumb, admin gate
├── 03-chat.md                     ← composer, turns, streaming, trace, citations, refusals, errors, voice controls in chat
├── 04-structured-blocks.md        ← charts, chart data table, arrivals/flights/calculator/ticket cards
├── 05-operations.md               ← Vessels, Flights, Tariffs
├── 06-support-console-voice.md    ← Support, Console/Health/Admin, Voice
├── 07-feedback-and-states.md      ← error envelopes, rate limits, notices, empty & loading states, announcer
├── 08-blocked-and-forbidden.md    ← the 7 blocked components and the do-not-build list
├── assets/
│   └── scaspa-seal.png            ← the official seal, dark blue line art on transparency
├── screenshots/                   ← 27 PNGs, one per board (see index at the end of this file)
└── design-source/
    ├── SCASPA Assistant Component Spec.dc.html
    └── SCASPA Assistant Component Spec (standalone).html   ← opens offline, no dependencies
```

Open the standalone HTML in a browser while you work. It is the authoritative rendering; where this document and the file disagree, the file wins and you should raise it.

---

## 5. Design tokens

All values below are final. `tokens.css` contains the same set as custom properties.

### 5.1 Brand

Primary brand colour is **`#383A97`**, taken from the seal. It sits at roughly 2:1 against the dark canvas, so it is **only ever used as a fill with white on top**. Never as text or an icon on a dark surface.

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `brand-700` | `#22245E` | 14.2:1 with white | Pressed state on filled controls |
| `brand-600` | `#2C2E7A` | 11.7:1 with white | Hover state on filled controls |
| `brand-500` | `#383A97` | 9.5:1 with white · 2.1:1 on canvas | Primary fill, active nav, send button |
| `brand-400` | `#5457BE` | 6.0:1 with white · 3.3:1 on canvas | Secondary fill on dark, chart series 1 |
| `brand-300` | `#7A7CD6` | 5.4:1 on canvas · 4.7:1 on surface-2 | Accent text and icons on dark |
| `brand-200` | `#A5A7E6` | 8.7:1 on canvas | Links, focus ring, citation markers |
| `brand-100` | `#E5E5F7` | 11.4:1 against brand-700 | Tint fill on light surfaces, link hover on dark |

### 5.2 Surfaces (dark)

Depth comes from surface lightness alone. **There are no drop shadows anywhere inside the app.** The only `box-shadow` permitted is the focus ring.

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#0A0B14` | Page, behind the app frame |
| `surface-1` | `#10121F` | Main content column |
| `surface-2` | `#171A2B` | Sidebar, provenance cards, table header |
| `surface-3` | `#1E2137` | Composer, inputs, menus, table row hover, meta strip |
| `border` | `#262A42` | 1px hairlines and dividers; also the pressed fill on ghost controls |

### 5.3 Text

| Token | Hex | Contrast on surface-2 | Use |
|---|---|---|---|
| `text-1` | `#F2F3F8` | 15.4:1 | Headings, primary body, table values |
| `text-2` | `#A3A8C0` | 7.3:1 | Labels, metadata, column headers, secondary body |
| `text-3` | `#6E7490` | 3.7:1 | **Placeholders and disabled only** — never body copy |

### 5.4 Semantic

| Token | Hex | Meaning |
|---|---|---|
| `positive` | `#3BA776` | At berth · on time · ok · settled |
| `caution` | `#D9A23B` | Delayed · sample data · estimated · needs attention |
| `critical` | `#D9564B` | Cancelled · error · unpriced · over threshold |
| `info` | `#3B9BD9` | Live feed · en route · boarding · AIS |
| `neutral` | `#6E7490` | Unknown · not reported · closed · **unavailable** |
| `critical-text` | `#E4736A` | **Derived.** See below. |

**Two derivations you must implement exactly:**

1. **`critical-text` `#E4736A`.** The enum colour `#D9564B` measures 4.4:1 against `surface-2` and fails the 4.5:1 text bar. Any *text* rendered in critical on surface-2 or surface-3 uses `#E4736A` (5.7:1). `#D9564B` remains correct for dots, borders, fills and the emergency call button, where the 3:1 non-text bar applies.
2. **`neutral` is a dot colour, not a text colour.** `#6E7490` on surface-2 is 3.7:1. Wherever a neutral badge carries a label, the label is `text-2` `#A3A8C0` and only the dot is `#6E7490`.

**`unavailable` is neutral, not critical.** A feed that was never connected is a known state, not a failure. Reserve critical for things that actually broke. Copy for this state is "No feed connected", never "Error".

### 5.5 Contrast requirement

Every pairing must clear **4.5:1 for text** and **3:1 for icons and borders**. Where a semantic colour fills a badge, tint it to **12% opacity** and keep the dot and label at full strength:

```
rgba(59,167,118,0.12)   /* positive 12%  */
rgba(217,162,59,0.12)   /* caution 12%   */
rgba(217,86,75,0.12)    /* critical 12%  */
rgba(59,155,217,0.12)   /* info 12%      */
rgba(56,58,151,0.22)    /* brand 22% — informational panel fill */
rgba(56,58,151,0.32)    /* brand 32% — user chat bubble fill    */
rgba(56,58,151,0.35)    /* brand 35% — selected ghost control   */
```

Border tints on outline status pills use the same hue at **45%**: `rgba(59,167,118,0.45)` and so on. Notice-panel borders use **30–35%**.

### 5.6 Type

One neutral geometric sans throughout — **Inter**, weights 400/500/600. No display face; this is an operational tool.

| Role | Size / line-height | Weight | Notes |
|---|---|---|---|
| Board H1 | 40 / 48 | 600 | Spec board only, `letter-spacing: -0.02em` |
| Greeting | 30 / 38 | 600 | `letter-spacing: -0.01em`; **24 / 32 at 390px** |
| Screen title | 20 / 28 | 600 | |
| Section heading | 16 / 24 | 600 | |
| Body | 14 / 22 | 400 | |
| Table cell | 13 / 20 | 400 | Values 500 in the first column |
| Label | 13 / 18 | 500 | |
| Caption | 12 / 16 | 500 | |
| Sidebar / column label | 11 / 16 | 600 | `text-transform: uppercase`, `letter-spacing: 0.06em` |
| Provenance badge label | 11 / 16 | 600 | `text-transform: uppercase`, `letter-spacing: 0.04em` |

**Tabular figures are mandatory** on every number: times, tonnage, rates, coordinates, totals, pagination readouts, latency, counts, references, countdowns. `font-variant-numeric: tabular-nums`.

Monospace is used in exactly two places: raw `[kb-014]` markers during streaming, and the models/config panels on the admin screen. Use the platform mono stack.

### 5.7 Radius

| Value | Applies to |
|---|---|
| `16px` | Panels, provenance cards, chat bubbles |
| `12px` | Composer, inputs, inline notice panels |
| `10px` | Chips-as-buttons, buttons, nav rows, icon buttons |
| `9px` | Segmented-control inner segments (inside a 12px track with 3px padding) |
| `8px` | Ghost icon buttons, small avatars |
| `6px` | Chart bar tops (`6px 6px 0 0`), inline citation markers, small tag chips |
| `5px` | Skeleton bars, checkbox |
| `3px` | Legend swatches |
| `999px` | Status pills, filter chips, provenance badges, the send button |

### 5.8 Spacing

4px grid throughout. Common values: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 56, 64.

### 5.9 Icons

Outline only, no fills. Drawn on a 24×24 viewBox with `stroke-width: 2`, `stroke-linecap: round`, `stroke-linejoin: round`, `fill: none`, `stroke: currentColor`. Rendered at:

| Size | Context |
|---|---|
| `12px` | Inside badges and pills |
| `14px` | Inside suggestion chips, inline metadata rows |
| `16px` | Dense rows, table cells, buttons, notice panels |
| `18px` | Sidebar nav, page-level controls |
| `20–24px` | Empty-state illustrations |

The prototype ships a 40-glyph sprite sheet (`<symbol>` + `<use>`). Substitute your codebase's icon set, matching the stroke weight and the outline-only rule. Glyph identities used: search, panel-collapse, chevron left/right/down, arrow left/right/up, arrow-to-line (landed), attach, mic, waveform, play, pause, copy, edit, thumb, refresh, ship, plane, receipt, headset, sparkle, filter, clock, alert-triangle, info, check, x, phone, pin, kebab, user, chart, anchor, gate, megaphone, plus, tool, table, file, shield, map, dollar, lightning.

---

## 6. Global rules

These apply on every board. They are correctness requirements, not style preferences.

1. **`null` is never `0`.** A metric with no reported value renders `—` or "not reported". A feed that does not report berth occupancy must never read as an empty port. A null speed is never "0 knots". A null heading draws no arrow at all.
2. **ETA and ATA are visually distinct.** ETA is italic, `text-3`, prefixed `~`. ATA is upright, `text-1`, weight 500. One is a prediction, one is a record; that distinction is the entire point of having two fields.
3. **Fixture and unavailable notices render as prominently as the data they sit above, and are not dismissible.** No close control, no "don't show again", no collapse.
4. **The quote disclaimer is never collapsed, truncated or hidden behind a tooltip.** It is the single most important string on the tariff screen.
5. **The chart caption is mandatory and never truncated.** It states whether figures are official or illustrative.
6. **An empty advisory list is not an all-clear.** Copy says "No notice has been published to this assistant", never "conditions are normal". This is the one empty state drawn in caution rather than neutral, because a quiet screen read as safety has physical consequences.
7. **No sign-in, session, account or current-user affordance anywhere.** The backend has no accounts and never knows who is asking. The sidebar's bottom row is a demonstration profile carrying an always-true `is_demo` literal, precisely so it cannot quietly become a real identity.
8. **The admin gate returns a bare 404, never a 401.** One 404 does double duty for "unauthenticated" and "mistyped URL" — byte for byte identical. No lock icon, no "sign in to continue", no redirect to a login page. A redirect is itself a disclosure.
9. **Assistant prose never summarises the card beneath it.** The answer will literally say "I cannot see live movements" with a vessel board sitting below it. That is correct. The layout must not imply the prose describes the rows: 24px separation, prose never inside the card, card states its own source.
10. **`tracked_clients` is a count of hashed rate-limit keys.** Never label it users, visitors or IPs.
11. **A `$0.00` spend total may mean "unpriced", not "free".** Prices default to zero until configured. An unconfigured category renders `—` plus "no price configured".
12. **Voice transcripts land in the composer, editable, never auto-sent.** The user must be able to correct a misheard terminal name before asking.
13. **No badge is colour-only.** Every badge carries a glyph or its text label at legible size. The five vessel statuses must remain distinguishable in greyscale — there is a greyscale proof strip on board 00c.

---

## 7. Accessibility

Non-negotiable, and specified per component in the chapters.

- **Status is never conveyed by colour alone.** Dot shape (solid / hollow), container (solid / dashed), glyph and label all carry meaning. `landed` and `arrived` separate on glyph and label, never hue.
- **Visible keyboard focus on every interactive element**, using `brand-200`:
  ```css
  box-shadow: 0 0 0 2px <the element's own background>, 0 0 0 4px #A5A7E6;
  ```
  The 2px inner ring is the surface colour, so the outer ring reads cleanly on any of the four surfaces. Use `:focus-visible`, not `:focus`.
- **Touch targets are 44px minimum.** Desktop icon buttons are 28–36px; at ≤640px they grow to 44px. The tap-to-call control is 44px at every breakpoint.
- **The chart data table is a real equivalent, not a fallback.** Always in the DOM, same figures, same mandatory caption. Do not hide it behind a toggle that defaults to off.
- **Live regions.** A polite region announces "answering", then the settled answer once — never token by token. Errors, rate limits and source-kind changes are assertive.
- **Reduced motion.** Under `prefers-reduced-motion: reduce` the streaming cursor, skeleton pulse and button spinner hold still and the announcer carries the state instead. No layout shift.
- **Semantics.** Tables are real `<table>` elements. Status pills are text, not ARIA-labelled colour swatches. The tool trace is a `<details>`-equivalent disclosure. The breadcrumb is a `<nav>` with an ordered list and `aria-current="page"` on the last crumb.

---

## 8. Responsive behaviour

Two designed breakpoints: **1440px** (desktop shell) and **390px** (mobile). One structural threshold at **640px**.

| Above 640px | At or below 640px |
|---|---|
| Fixed 240px sidebar | Sidebar collapses behind the panel-collapse control in the header |
| Tables render as tables | **Every table row becomes a card**: title top-left, status pill top-right, remaining fields as a 2-column label/value grid |
| Numbered pagination | Range readout centred above two 44px full-width arrow buttons labelled "Previous" and "Next" |
| Breadcrumb with chevron separators | Single back control labelled with the parent — `← Tariffs`, never a bare arrow |
| Greeting 30/38 | Greeting 24/32 |
| Icon buttons 28–36px | Icon buttons 44px |
| Content well capped at 720px | Full width minus 16px gutters |

The embedded-widget variant is a third layout, not a breakpoint: 380–560px wide, 480px minimum height, no sidebar, no nav, source-kind badge relocated into the widget header. Full spec in `02-shell-and-navigation.md`.

---

## 9. Implementation requirements

1. **Model `DataSource` as a required field on every operations response type.** Do not make it optional. Every component that renders an operations payload takes it as a prop and renders the meta strip from it. There is no code path that renders operations data without one.
2. **Make the provenance card a single shared component.** Meta strip, mandatory notice, body slot, optional footer link. Every operations block on every screen is an instance of it. This is what stops the rule eroding over time.
3. **Make assistant prose structurally incapable of receiving a card.** Prose renders into a container with no border, no background and no meta strip slot. If a future ticket asks to "put the answer in a card", it should require changing this component, not just passing a prop.
4. **Badge families are three separate components,** not one component with a `variant` prop. `ProvenanceBadge`, `StatusPill`, `FilterChip`. They differ in shape, height, case and weight precisely so they cannot be confused in a row that contains all three.
5. **Never derive a count from the visible rows.** Totals and active counters come from the server. A client-side recount drops to zero under a filter and lies.
6. **Never format a null as a number.** Write a single `renderValue` helper that maps `null`/`undefined` to the em-dash treatment and use it for every numeric cell. Do not let `?? 0` into the codebase.
7. **Do not strip citation markers mid-stream.** A chunk boundary can fall inside `[kb-014]`. Markers render raw during streaming and are reconciled to numbered chips only when the stream settles.
8. **Rate-limit countdowns come from the `Retry-After` header only.** There is no remaining-quota figure anywhere in the product; the backend computes `Decision.remaining` and drops it.
9. **The 404 is one component rendered from one template.** Do not branch its copy, status code or markup on why it was reached.
10. **The seal is always on a white circular plate.** 32px seal inside a 40px plate; 24px inside 32px in compact contexts. Never recolour, outline, crop or knock it out to white. It is dark blue line art on transparency and will vanish on a dark surface without the plate.
11. **Ship the four card footer destinations as a closed enum** — `/vessels`, `/flights`, `/tariffs`, `/support`. Labels are actions, not route names: "See all vessel movements", "Check flight arrivals", "Open the tariff table", "Contact a department".
12. **Guard the seven blocked components behind the fields they wait on** (`08-blocked-and-forbidden.md`). Build them; do not enable them. Each has a named field; when the field lands, the component ships unchanged.

### Definition of done

- [ ] No operations payload renders anywhere without a meta strip.
- [ ] No assistant prose renders inside a bordered container.
- [ ] Every number uses tabular figures.
- [ ] Every null renders as `—` or "not reported"; grep the codebase for `?? 0` and `|| 0` on display paths.
- [ ] Fixture and unavailable notices have no dismiss control.
- [ ] The quote disclaimer and chart caption are present and uncollapsed in every variant.
- [ ] The advisory empty state says "no notice was published", not "all clear".
- [ ] No sign-in, account or current-user string exists in the codebase.
- [ ] `/admin/stats` unauthenticated and `/adnim` return identical bytes.
- [ ] Every interactive element shows the brand-200 focus ring on `:focus-visible`.
- [ ] All 45 badge variants are distinguishable in greyscale.
- [ ] Touch targets are 44px at ≤640px.
- [ ] `prefers-reduced-motion` stills the cursor, skeleton and spinner.

---

## 10. Voice for interface copy

Plain and operational. **British and Caribbean spelling** — authorised, enquiry, tonnage, harbour. **Sentence case throughout**, including buttons and headings.

- Say what the system holds and what it does not.
- Never apologise. Never hedge with "I think" or "it seems".
- An empty state names the next action.
- An error names what happened and what to do about it, and quotes the real limit it hit — "That recording is 26.4 MB. The limit is 20 MB", not "File too large".
- Name things by what the user controls, never by how the system is built — "sample data", not "fixture kind"; "no feed connected", not "source unavailable"; "records searched", not "index size".
- Times are 24-hour with the zone: `06:40 AST`. Dates are `1 August 2026` in prose, `1 Aug 2026` in dense rows.
- Currency is `XCD 9,288.00` in totals, bare `9,288.00` in line items under an XCD-labelled total.
- Telephone numbers render `869 465 8121` in UI and `+1 869 465 8121` in contact cards. The escalation block lists `869 465 8121 / 8122 / 8123`.
- Postal address: `P.O. Box 963, Bird Rock, Basseterre, St Kitts`.

---

## 11. Assets

| Asset | Source | Notes |
|---|---|---|
| `assets/scaspa-seal.png` | Supplied by the Authority | Dark blue circular line art on a transparent background. Always plated. Never modified. |
| Inter | Google Fonts, weights 400/500/600/700 | Substitute the codebase's existing neutral geometric sans if one is already standard. |
| Icons | 40-glyph outline sprite in the prototype | Substitute your icon library; match stroke weight and outline-only rule. |

---

## 12. Screenshot index

All at 1× against the shipping dark surface. `screenshots/`

| File | Board |
|---|---|
| `00-cover-app-shell-1440.png` | App shell at 1440px (the bloom is board-only) |
| `01-embedded-widget.png` | Embedded widget variant |
| `02-foundations-tokens-type-seal.png` | Colour tokens with contrast ratios, type scale, seal at both sizes, radii |
| `03-provenance-principle.png` | The two data paths side by side |
| `04-badge-families.png` | Three families, all ~45 variants, greyscale proof |
| `05-buttons-and-inputs.png` | 6 button types × 5 states, 9 input types |
| `06-pagination.png` | 5 pagination states, interactive states, mobile stack |
| `07-card-footer-link.png` | 4 destinations × 4 states |
| `08-breadcrumb-and-back.png` | 2-step, 3-step, mobile collapse, crumb states |
| `09-admin-gate.png` | 3 gate states, the shared 404 |
| `10-assistant-answer-card.png` | Answer card, chart, table, trace, grounding, no-answer, 429 |
| `11-data-source-status-card.png` | Sidebar status card, 3 kinds |
| `12-status-chips.png` | Vessel and flight enumerations, anatomy |
| `13-contact-card-and-tariff-quote.png` | Contact card collapse, complete and unpriced quotes |
| `14-spend-receipt-ops-header.png` | Spend summary, enquiry receipt, ops list headers |
| `15-composer-states.png` | 8 composer states, category chips, suggested questions |
| `16-turns-streaming-trace.png` | Turns, injection neutralisation, streaming, agent trace, citations |
| `17-refusals-and-errors.png` | 5 refusals, escalation block, 8 error envelopes, speak button, diagnostics |
| `18-structured-blocks.png` | 3 chart types, data table, arrivals/flights/calculator/ticket cards |
| `19-vessels-and-flights.png` | Source banners, metric tiles, table, ETA/ATA, advisories, empty/loading/429 |
| `20-tariffs.png` | Tariff table, two calculators, quote variants |
| `21-support.png` | Emergency strip, location cards, contact rows, privacy notice, transcript checkbox |
| `22-console-and-health.png` | Map, gates, advisories, profile, health, index, admin, spend |
| `23-voice.png` | Record, transcription, playback |
| `24-feedback-matrix.png` | Rate limits, mandatory notices, empty states, loading states, announcer |
| `25-responsive-390.png` | Three mobile screens at 390px |
| `26-out-of-scope.png` | Deliberately not designed |
