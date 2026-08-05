# 02 — Shell and navigation

Screenshots: `00-cover-app-shell-1440.png`, `01-embedded-widget.png`, `06-pagination.png`, `07-card-footer-link.png`, `08-breadcrumb-and-back.png`, `09-admin-gate.png`, `11-data-source-status-card.png`, `14-spend-receipt-ops-header.png`

---

## 2.1 App shell — 1440 × 900

Two columns: a fixed 240px sidebar and a fluid main column. Frame `border-radius: 20px`, `1px solid --border`, `overflow: hidden`. **No drop shadow.** The ambient gradient bloom in the cover screenshot is spec-board framing only and does not ship.

### Sidebar — 240px

`background: --surface-2; border-right: 1px solid --border; padding: 16px 12px 12px; display: flex; flex-direction: column`

Top to bottom:

**1. Brand lockup** — `padding: 0 2px 16px; gap: 8px`
40px white plate + 32px seal · wordmark `600 15px/20px --text-1`, `nowrap`, `flex: 1` · panel-collapse button `24px × 28px`, `border-radius: 8px`, 18px glyph `--text-3`.

**2. Search field** — `height: 36px; padding: 0 10px; background: --surface-3; border: 1px solid --border; border-radius: 12px; gap: 8px`. 16px glyph + placeholder "Search", both `--text-3`.

**3. Nav groups.** Group label `600 11px/16px uppercase 0.06em --text-3`, `padding: 20px 8px 8px`. Rows `height: 34px; padding: 0 10px; border-radius: 10px; gap: 10px`, 18px icon, label `500 13px/18px`.

| Group | Items |
|---|---|
| Assistant | Chat (sparkle) |
| Operations | Vessels (ship) · Flights (plane) · Tariffs (receipt) · Support (headset) |
| Conditional | Console (chart) · Admin (tool) |

Row states: default `--text-2` on transparent · hover `--surface-3` + `--text-1` · **active `--brand-500` fill with `#FFFFFF` icon and label** · focus ring.

**Console and Admin are conditionally present.** When a route is not built, no entry appears — no disabled row, no lock, nothing. The dashed "Admin — absent unless built" row on the board is documentation of that absence, not a shipping state.

A count may appear right-aligned in a row at `600 11px/16px --caution` tabular (advisories).

**4. Recorded questions.** Label as above. Rows `height: 32px; padding: 0 10px; border-radius: 10px`, `400 13px/18px --text-2`, single line with ellipsis. The list is `flex: 1; min-height: 0; overflow: hidden; position: relative` with a bottom fade:

```css
position: absolute; left: 0; right: 0; bottom: 0; height: 72px;
background: linear-gradient(to bottom, rgba(23,26,43,0) 0%, #171A2B 82%);
pointer-events: none;
```

**Clicking a recorded question re-asks it. It does not restore a conversation.** History is recorded but never fed back into the prompt, so follow-ups will not resolve pronouns. Nothing in this list may imply otherwise — no "continue", no thread affordance, no message count.

**5. Data source status card** — see §2.2.

**6. Bottom row** — `margin-top: 12px; padding-top: 12px; border-top: 1px solid --border; gap: 10px`
28px circle `--surface-3` + `1px solid --border` + 16px anchor glyph `--brand-300` · two lines, `500 13px/18px --text-1` ("Basseterre operator") and `500 11px/14px --text-3` ("Demonstration profile") · trailing `DEMO` badge, 18px tall, `padding: 0 6px`, `--r-tiny`, `--caution-fill`, `600 11px/16px --caution`.

**This is not a user row.** No name, no organisation, no avatar image, no menu, no sign-out. It renders the demo `OperatorProfile` object. In production `profile: null` and **the row is not rendered at all** — no placeholder, no silhouette, no "sign in".

### Main column

**Header row** — `height: 60px; padding: 0 28px; border-bottom: 1px solid --border; gap: 16px`
Screen title `600 20px/28px --text-1`, `flex: 1`. Right-aligned secondary actions: optional advisory pill (`height: 32px; padding: 0 12px; border-radius: 10px; --caution-fill; 1px solid rgba(217,162,59,0.3)`; 16px glyph + `500 13px/18px --caution`), then 32px icon buttons.

**Content well** — centred, `max-width: 720px`, `padding: 0 28px`. The empty state pads `132px` from the header.

**Empty state** — greeting `600 30px/38px --text-1`, `letter-spacing: -0.01em`:

> What do you need from the port today?

Sub-line `400 14px/22px --text-2`:

> Ask one thing at a time. Every answer stands alone — this assistant does not carry anything over from your last question.

**That second sentence is required.** Each turn stands alone; the copy must set that expectation before the user forms the wrong one.

**Composer** — `--surface-3`, `1px solid --border`, `border-radius: 12px`, `padding: 16px 16px 12px`, `gap: 16px`. Row two: 32px attach button (bordered) · inline mode toggles (32px pills, selected = `1px solid --brand-500` + `rgba(56,58,151,0.35)` + `--text-1` with a 14px `--brand-200` glyph; unselected = `1px solid --border` + `--text-2`) · spacer · 32px mic button (no border) · **34px circular send button, `--brand-500`, white 16px up-arrow**.

**Suggestion chips** — two wrapping rows beneath the composer, `gap: 8px` within and between. Spec in `01-foundations.md` §1.2.

Row 1: Vessels in port · Arrivals today · Quote a container · Berth positions
Row 2: Port advisories · Gate assignments · Contact a department · Cruise call times

---

## 2.2 Data source status card

Sidebar position, `216px` wide (240px sidebar minus 12px padding each side). `padding: 12px; background: --surface-3; border: 1px solid --border; border-radius: 12px; gap: 6px`.

Line 1: 8px dot + `500 13px/18px --text-1`. Line 2: `500 12px/16px --text-2`, tabular where it carries a time.

| Kind | Dot | Title | Second line |
|---|---|---|---|
| `fixture` | `--caution` solid | Sample data — not live | Figures come from the test fixture. Do not quote them to a customer. |
| `live` | `--info` solid | Live data | Refreshed 14:32 AST |
| `unavailable` / `none` | **hollow — `1.5px solid --neutral`** | No feed connected | Last known 06:10 AST, 1 Aug |

**Expect fixture and unavailable in practice.** `live` is in the type but unreachable — see `08-blocked-and-forbidden.md`.

The card never says "everything is fine". `live` simply states when it last refreshed and lets the user judge the time. `unavailable` keeps the last-known timestamp rather than hiding it: an agent needs to know whether the stale figure is an hour old or a day old.

In the embedded widget the sidebar is gone, so the source-kind **provenance badge** moves into the widget header instead. In the 390px shell it becomes a compact pill in the bottom bar: `padding: 4px 10px; border-radius: 999px; --surface-3; 1px solid --border`, 7px dot + `500 12px/16px --text-2`.

---

## 2.3 Embedded widget

A third layout, not a breakpoint. Dropped into the Authority's own pages.

```
width:  380–560px          (content well shrinks from 720 to fill)
height: 480px minimum      (composer pinned, answers scroll)
frame:  --surface-1, 1px solid --border, border-radius: 16px, overflow: hidden
header: 52px, padding 0 16px, border-bottom 1px solid --border
```

Header: 32px plate + 24px seal · wordmark `600 15px/20px`, `flex: 1` · **source-kind provenance badge, right-aligned**.

Body: greeting drops to `600 20px/28px`, sub-line to `400 13px/20px`. Suggestion chips shrink to 32px. Composer sits in a `border-top` footer, `padding: 12px 16px`, with a 12px-radius field and a 32px send button.

| Dropped | Kept, without exception |
|---|---|
| Sidebar, primary nav, recorded questions, screen title row, secondary actions | The seal on its plate · the source-kind badge · every provenance card and meta strip · every mandatory notice · the escalation block on refusals |

Tables become row cards below 640px, as on mobile. **Embedding is not a reason to lose the one thing that says whether the figures are real.**

---

## 2.4 Pagination

Driven by `total`, `limit`, `offset`. **The readout always states the range, never a bare page number.**

Container: `padding: 14px 20px; border-top: 1px solid --border`, readout left, controls right.
Readout: `500 13px/18px --text-2` tabular — `Showing 1–25 of 100`.
Arrows: `32px × 32px; border-radius: 10px; 1px solid --border`, 16px chevron.
Page numbers: `min-width: 32px; height: 32px; padding: 0 10px; border-radius: 10px`, `500 13px/18px` tabular.
Ellipsis: same box, `--text-3`, non-interactive.

### Five states

| State | Condition | Behaviour |
|---|---|---|
| First page | `offset === 0` | Previous disabled, next enabled, page 1 current |
| Middle page | both sides available | Both arrows enabled, current page marked |
| Last page | `offset + limit >= total` | Next disabled; elide with `…` when there are more than 4 pages |
| Single page | `total <= limit` | **Collapses to the range readout alone. No arrows, no numbers.** |
| Zero results | `total === 0` | **No control at all**, and the table is replaced by the empty state below |

### Interactive states

| | Arrow | Page number |
|---|---|---|
| Default | `1px solid --border`, icon `--text-2` | `--text-2`, no background |
| Hover | `--surface-3`, icon `--text-1` | `--surface-3`, `--text-1` |
| Focus-visible | ring | ring |
| Pressed | `--border` background | `--brand-700` background, `#FFFFFF` |
| Disabled | `1px solid --surface-3`, icon `--text-3` | n/a |
| Current | n/a | `--brand-500` background, `#FFFFFF` |

**Disabled arrows keep their place in the row.** The control must not reflow as the user pages.

### Zero-results empty state

Replaces the table entirely. `--surface-2`, `1px solid --border`, `border-radius: 16px`, `padding: 36px 32px`, `gap: 20px`, left-aligned.

44px `--surface-3` tile with a 20px filter glyph `--brand-300` · heading `600 16px/24px --text-1` "No vessel movements match these filters" · body `400 14px/22px --text-2`, max 420px · **the active filters named as removable chips** (28px, `padding: 0 6px 0 12px`, label + 18px x button) · primary "Clear filters" button with a 16px refresh glyph.

An empty table with a "Showing 0–0 of 0" readout reads as a fault. Name the filters and the one action that resolves it.

### Mobile — 390px

`--surface-2` card, `padding: 16px`, `gap: 12px`. Range readout **centred above** two full-width 44px buttons, `gap: 8px`, `border-radius: 10px`, `1px solid --border`, each labelled ("Previous", "Next") with its arrow. Numbered pages drop below 640px.

**Applies to:** Vessels, Flights, Tariffs. **Never** on positions, gates or advisories — those return the complete set and accept no `limit`/`offset` (see §2.7).

---

## 2.5 Card footer link

The single call to action in the footer of an answer card. **Exactly four destinations, no others.**

```
border-top: 1px solid --border
height: 48–52px
display: flex; align-items: center; justify-content: space-between
label: 500 14px/22px --brand-200
trailing chevron: 16px --brand-200
```

| Route | Label |
|---|---|
| `/vessels` | See all vessel movements |
| `/flights` | Check flight arrivals |
| `/tariffs` | Open the tariff table |
| `/support` | Contact a department |

Labels are actions the user recognises, never route names. Ship as a closed enum.

| State | Treatment |
|---|---|
| Default | `--brand-200` |
| Hover | `--surface-3` background, `border-radius: 0 0 10px 10px`, `--brand-100`, underline at 3px offset, chevron `translateX(3px)` |
| Focus-visible | 10px radius + ring, `--brand-100` |
| Pressed | `--border` background, `--brand-300`, chevron stays nudged |

The "not in our data" refusal card is **the only** card that carries all four destinations, stacked as four 46px rows each with its own `border-top`. It is a statement about coverage, so it offers the whole of what is covered.

---

## 2.6 Breadcrumb and back

Two depths only. Nothing in the product nests deeper than three.

**Desktop** — `gap: 8px`, crumbs `500 13px/18px`, separators 14px chevron `--text-3`.
Links `--brand-200`; **last crumb is `--text-1`, non-interactive, no hover, `aria-current="page"`**.

- 2-step: `Tariffs › Quote`
- 3-step: `Contact directory › Enquiry form › Receipt`

The screen title sits 14px below the trail at `600 20px/28px`.

**Crumb states:** default `--brand-200` · hover `--brand-100` + underline 3px offset · focus-visible `--brand-100` + 6px-radius ring on a `2px 4px` inset · pressed `--brand-300` · current `--text-1`, inert.

**Mobile — 390px.** Collapses to a single back control **labelled with the parent**:
`height: 36px; padding: 0 12px 0 8px; border-radius: 10px; 1px solid --border; gap: 8px`, 16px left-arrow + `500 13px/18px --brand-200`.

- 2-step → `← Tariffs`
- 3-step → `← Enquiry form`

**Never a bare arrow.** On a receipt screen, a user needs to know where the control lands before they press it.

---

## 2.7 Ops list header

For positions, gates and advisories. These return the complete set with a total and **take no paging parameters**, so there is no pagination control — a total count plus a client-side filter field instead.

```
--surface-2, 1px solid --border, border-radius: 16px, padding: 20px 24px
title: 600 16px/24px --text-1
count: 500 13px/18px --text-2, tabular
filter: 220px × 36px, --surface-3, 1px solid --border, border-radius: 12px, 16px filter glyph
```

| State | Count reads | Filter field |
|---|---|---|
| Unfiltered | `12 in total` | placeholder "Filter positions" |
| Focused | unchanged | `1px solid --brand-500` + ring, glyph `--brand-200`, caret visible |
| Filtered | `2 of 3 shown` **plus a removable chip** showing the term — `"pilot"` with an x | value `--text-1`, glyph `--brand-200` |

The count changes to "n of total shown" the moment a filter is typed. Filtering is client-side; the total always comes from the server.

---

## 2.8 Admin-gate wrapper

Three states. The distinction between the second and third must be **invisible from outside**.

| State | Route | Auth | Renders |
|---|---|---|---|
| A | present | authenticated | The admin stats screen, in the ordinary shell |
| B | present | unauthenticated | **The ordinary 404** |
| C | absent | n/a | **The ordinary 404** (and no entry point anywhere) |

### State A — admin stats

Ordinary shell. Header 52px with the title "Assistant statistics" and a `500 12px/16px --text-3` range label. Three metric tiles in a 3-column grid: `--surface-2`, `1px solid --border`, `border-radius: 12px`, `padding: 16px`, label `500 12px/16px --text-2`, value `600 20px/28px --text-1` tabular.

Questions answered `1,284` · Median response `2.4s` · Answers with no match `96`

Below, a single row: **Search index — `v4.2.0 · built 28 Jul 2026`**. That version string is the *only* visible trace of the offline scripts. Nothing about the screen is styled as a privileged area.

### States B and C — the shared 404

**Drawn once because it ships once.** One component, one template, one status code.

```
header: 52px, 32px plate + 24px seal + wordmark
body:   padding 56px 24px 64px, centred, gap 20px
title:  600 30px/38px --text-1   "Page not found"
copy:   400 14px/22px --text-2, max 360px
button: 40px primary, 16px left-arrow, "Back to the assistant"
```

> We could not find that page. Check the address, or go back and ask the assistant.

An unauthenticated visitor to `/admin/stats` and a visitor to `/adnim` get **the same status code, the same markup and the same copy**. No lock icon. No "sign in to continue". No softer wording. No redirect to a login page — a redirect is itself a disclosure. **Any difference between the two confirms the address exists.**

State C additionally means the route is not built: no nav item, no link, no keyboard shortcut, and nothing in the sidebar search returns it.
