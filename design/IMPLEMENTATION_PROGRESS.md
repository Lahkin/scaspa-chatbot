# Implementation progress — SCASPA Assistant design handoff

**Purpose.** A handover for a fresh session. Everything needed to continue is
here; nothing depends on conversation history.

**Last updated:** after **milestone M1** of `docs/implementation-plan.md` — see
§10, which is the record of that milestone and the only part of this document
written against a running build rather than against the handoff.

**Boards.** Every board, 00 through 22 — **27 of them**, not 23: §2 enumerates
`00`, `00a`–`00d` and `01`–`22`, and §9's heading said 23 for most of this
project's life. Corrected during M1's reconciliation pass.

**Every board is implemented or verified against the handoff, with two
exceptions that are deliberate rather than partial:** §6.13's admin gate is not
built (§4.10, a security decision), and six boards carry ⚠️ in §2 because they
hold a backend-blocked row. The earlier claim that "nothing is partially
implemented" overstated that; what is not built is not built *deliberately*, and
each item is recorded in §4 (specification conflicts) or §5 (backend-blocked)
with the exact dependency or decision it waits on.

> **Read §3 board 17 and §7 before the next board.** The re-verification found
> eight deviations that every component test passed through, because nothing in
> the suite had ever rendered `/vessels` or `/flights`. Components were correct;
> the screens that compose them were not. Any board that ships a *screen* should
> now get a route-level test as well as component tests.

---

## 1. How to work on this

The rules the work has followed, and which the next session should keep:

1. **The handoff is the source of truth for behaviour, layout, spacing,
   typography, tokens, interaction and accessibility.** The screenshots and the
   exported HTML are the visual reference used to verify it.
2. **Verify, never assume.** A component existing is not evidence it is correct.
   Several components that "existed" were the pre-handoff design wearing new
   token names.
3. **Do not infer, redesign, simplify or improve.** Where the handoff draws
   something, draw that.
4. **On an internal inconsistency: stop, gather evidence, document, recommend,
   then implement.** Do not resolve by preference or by majority count. See §4.
5. **Do not invent a value the backend does not send.** Build the component,
   gate it on the named field, and record it in §5.
6. Keep build, typecheck, lint, accessibility and tests green at every step.

### Canonical sources

| Source | Path |
| --- | --- |
| Handoff chapters | `design/*.md` |
| Tokens | `design/tokens.css` |
| Screenshots (27) | `design/screenshots/` |
| **Exported spec (authoritative rendering)** | `design/design-source/SCASPA Assistant Component Spec.dc.html` |
| Seal asset | `design/assets/scaspa-seal.png` |

`README.md` §4: *"Open the standalone HTML in a browser while you work. It is the
authoritative rendering; where this document and the file disagree, the file wins
and you should raise it."* — but see §4.1 below, where that rule needed care.

**Extracting from the exported HTML.** It is one 438 kB `<x-dc>` template with
inline styles. To read a board:

```python
import re
s = open("design/design-source/SCASPA Assistant Component Spec.dc.html", encoding="utf-8").read()
m = re.search(r'<x-dc(?:\s[^>]*)?>', s); close = s.rfind("</x-dc>")
tpl = s[m.end():close]
# boards are marked by a bare number node, e.g. >07< … >08<
i = tpl.find('>07<'); j = tpl.find('>08<', i)
print(re.sub(r'<[^>]+>', ' ', tpl[i:j]))
```

### Board numbering

The spec board numbers (00, 00a–00d, 01–22) are **not** the screenshot filenames.
Mapping: `00-cover`→shell, `01`→00a, `02`→00, `03`→00b, `04`→00c, `05`→00d,
`06`→01, `07`→02, `08`→03, `09`→04, `10`→05, `11`→06, `12`→07, `13`→08/09,
`14`→10/11/12, `15`→13, `16`→14, `17`→15, `18`→16, `19`→17, `20`→18, `21`→19,
`22`→20, `23`→21, `24`→22, `25`→responsive, `26`→out of scope.

---

## 2. Board status

| Board | Title | Status | Handoff section |
| --- | --- | --- | --- |
| 00 | Foundations | ✅ Complete | §1.1, §5.6–5.9 |
| 00a | Embedded widget | ✅ Complete | §2.3 |
| 00b | Two data paths | ✅ Complete | README §1, §3.1 |
| 00c | Badge families | ✅ Complete | §1.2 |
| 00d | Buttons and inputs | ✅ Complete | §1.3, §1.4 |
| 01 | Pagination | ✅ Complete | §2.4 |
| 02 | Card footer link | ✅ Complete | §2.5 |
| 03 | Breadcrumb and back | ✅ Complete | §2.6 |
| 04 | Admin gate / 404 | ✅ Complete | §2.8 |
| 05 | Assistant answer card | ✅ Complete | §3.9, §3.12–3.14 |
| 06 | Data source status card | ✅ Complete | §2.2 |
| 07 | Status chips | ✅ Complete — inconsistency documented (§4.1) | §1.2, §5.12 |
| 08 | Contact card | ✅ Complete | §6.2 |
| 09 | Tariff quote | ✅ Complete | §5.11 |
| 10 | Spend summary | ✅ Complete | §6.14 |
| 11 | Enquiry receipt | ✅ Complete | §6.6 |
| 12 | Ops list header | ✅ Complete | §2.7 |
| 13 | Composer, 8 states | ✅ Complete | §3.2–3.4 |
| 14 | Turns, streaming, trace | ✅ Complete | §3.1, §3.5–3.8 |
| 15 | Refusals, errors, speak, diagnostics | ⚠️ Complete, one backend-blocked row | §3.9–3.14 |
| 16 | Structured blocks | ⚠️ Complete, meta strip backend-blocked | §4.1–4.7 |
| 17 | Vessels and Flights | ⚠️ Complete and re-verified; five backend-blocked | §5.1–5.8 |
| 18 | Tariffs, two steps | ⚠️ Complete, three backend-blocked | §5.9–5.11 |
| 19 | Support | ⚠️ Complete; two data items recorded | §6.1–6.6 |
| 20 | Console, health, admin | ⚠️ §6.7–6.12 complete; **§6.13 not built — conflict, see §4.10** | §6.7–6.13 |
| 21 | Voice | ⚠️ §6.15–6.17 complete; cache states and §6.18 unplaced | §6.15–6.18 |
| 22 | Feedback matrix | ✅ Complete — a verification pass; three duplicate treatments found | `07-feedback-and-states.md` |

Also outstanding: the **390px responsive board** (screenshot 25) and a sweep of
`08-blocked-and-forbidden.md` Part 3's grep checklist.

---

## 3. Resolved deviations, by board

Full reasoning for each lives in `frontend/docs/decisions.md`, records
**F013–F024**. Summarised here.

### Board 00 — Foundations
- Radius scale had 4 of its 9 values. Added 9/8/6/5/3px. A 9px segment inside a
  12px track with 3px padding is the only pairing whose curves stay concentric.
- `--text-wordmark` (15/20), `--tracking-eyebrow/badge/tight`, structural heights.
- **Seal:** `LogoLockup` refused to draw the badge below 32px. The handoff's
  smallest pairing **is** 24-inside-32 and is required — "never use it without
  the plate at any size". Two pairings, now an enum. Tagline prop removed.
- **Four glyphs drew their frame twice** (`panel`, `copy`, `microphone`,
  `headset`) — a square-cornered path under a rounded rect. Map pin lost its hole.
- Eleven sprite glyphs added (attach, edit, thumb, table, file, waveform, play,
  pause, map, dollar, plus).

### Board 00a — Embedded widget
- Frame was `surface-2` with no border or radius → `surface-1`, 1px hairline,
  16px radius. It is the main content column inside a host page, not a card.
- Header drew its divider **twice** (`border-b` plus a separate 1px div).
- Greeting/sub-line/chips now shrink per §2.3 via `ChatCore`'s `variant="widget"`.
- Secondary actions dropped except **close** — `public/embed.js` sets
  `launcher.style.display = 'none'` while open, so without it a pointer user has
  no way out. Documented deviation.

### Board 00b — Two data paths
- User bubble was fixed at 76%; §3.1 widens to 82% with a neutralisation note.
- Turn spacing 16px → 24px.
- **Per-turn timestamp removed.** Not drawn on boards 05 or 14, and a clock beside
  every turn is the strongest hint that the transcript is a thread being kept.

### Board 00c — Badge families
- `border-caution-edge` **compiled to no CSS** — no `*-edge` token existed, so
  every pill drew its border in `currentColor`. Added as measured solid
  composites over surface-2.
- Family C (`Chip`) was 44px, 16px radius, 14px label → 28px/999px/13px with a
  leading check when selected.
- `ProvenanceBadge` gained the two variants the wire cannot reach (`none` →
  NOT CONNECTED, `static`) and the 18px `DEMO` short form.

### Board 00d — Buttons and inputs
- **`rounded-md` aliases `--radius-input` (12px)**, so every button in the
  product was 2px rounder than §1.3's 10px.
- `min-h-touch` at every width made inputs and buttons taller than the 40/36/28
  the handoff draws. Now `h-11 sm:h-<designed>` — the 44px minimum belongs at
  ≤640px, which is what §7 says.
- `IconButton` collapsed two distinct handoff types into one; split into
  `bordered` (36px, r10, hairline) and `ghost` (28px, r8, none), plus the ghost
  row's `copied` and `selected` states.
- `Input`/`Textarea` were on `--surface-2` (the **card** colour) with a
  `--text-3` edge. Now `--surface-3` on `--border`, 40px, 8px label gap.

### Board 01 — Pagination
Verified conformant. Readout trimmed to §2.4's exact `Showing 1–25 of 100`; the
noun moved to the accessible label only.

### Board 02 — Card footer link
Hover and pressed had ink but **no fill** — a 400px target whose hit area was
invisible until the cursor crossed the words. Added fill + bottom-corner radius;
chevron now stays nudged while pressed.

### Board 03 — Breadcrumb
**Verified conformant, no changes.** Geometry, states, non-linked current crumb
with `aria-current`, and the parent-labelled mobile control all matched.

### Board 04 — Admin gate / 404
Bottom padding 56 → 64px; button 44 → 40px (touch-growing). One template, no
branching on why it was reached — verified.

### Board 05 / 15 — Answer card, refusals, errors, speak, diagnostics
- **Diagnostics panel did not exist.** Built to §3.14.
- **Speak button was three emoji** (🔊 ⏸ ■) — no icon rule can govern an emoji.
  All seven states of §3.13 now draw sprite glyphs, including **voice off**,
  which used to render nothing.
- **404 carried the 500 copy** — "Something went wrong… that is our problem" —
  which §3.11 forbids by name. Now "Page not found", byte-identical to
  `NotFound`'s own wording (§2.8 ships one 404).
- **422 was generic**; §3.11 requires it to name the limit. Now names 1,000.
- **400 had no copy** and fell through to `INTERNAL`. Added `BAD_REQUEST` as a
  client-side kind alongside `OFFLINE` (`ErrorCode` is the wire contract and has
  no 400).

### Board 06 — Data source card
**`unavailable` was a solid red dot reading "Data unavailable".** §5.4: *"a feed
that was never connected is a known state, not a failure … copy is 'No feed
connected', never 'Error'."* It is also the **production default**, so it was a
permanent alarm — which is how a warning stops being read. Now a hollow neutral
ring. Timestamp format corrected to 24-hour with the zone.

### Board 07 — Status chips
See §4.1. Two of our own variants had drifted toward board 07 and were corrected:
`settled` carried a `--surface-3` ground it should not have, and the absent
chip's dash was `ink-subtle` (text-2) rather than `--text-3`.
Flight `on_time` label "On time" → **"Scheduled"** (board 00c and §5.5).

### Board 08 — Contact card
Padding 24/20 → 18/20, gap 12. Postal lines now preserve line breaks. **Footer
link removed** — §2.5 gives it to an *answer* card, and this one pointed at
`/support`, the screen it is already on.

### Board 09 — Tariff quote
Total label "Estimated total" → **"Total"**. §5.11 changes it to "Total so far"
*only* when `unpriced` is present; a second qualifier makes that change one word
among two rather than the whole signal.

### Board 10 — Spend summary
**Verified conformant, no changes.** Three categories, `—` + "no price
configured", one-hue ramp, non-link legend rows, permanent caveat.

### Board 11 — Enquiry receipt
Eyebrow tracking token swap; reference drops to 24/32 at 390px.

### Board 12 — Ops list header
Filter field 44px → 36px (touch-growing). Count/chip behaviour verified.

### Board 13 — Composer
- **It was a field plus a button, not §3.2's single box.** The send control read
  as belonging to the page rather than to the question. Now one container whose
  **edge carries states 2–4** (brand → caution → critical).
- Send is a **34px circle, blocked never hidden** — the board's first line.
- Counter appeared at 900 characters; §3.2 draws `42/1000` in the ordinary typing
  state. A counter that appears at 900 arrives as a warning to someone who never
  knew a cap existed.
- Added state 6's "Answering…" placeholder and Stop pill, state 3/4 helpers, the
  attach button, and the countdown-on-send for state 7.
- Removed the permanent "Enter to send, Shift + Enter" caption — §3.2 enumerates
  the control row exhaustively.
- Placeholder corrected to §3.2's string.

### Board 14 — Turns, streaming, citations
- **No streaming cursor existed.** A stream that paused mid-answer looked
  identical to one that had finished. 8×16 `--brand-200`, gated on reduced motion.
- Citation chip was a 20px circle at 12px → 18px, 5px radius, `600 11/16` — a
  round chip at citation size reads as a status dot.
- **`SourceEntry` was a different design**: an escalating amber panel with a
  phone number. §3.7's chip is title + volatility badge + verified-date badge +
  snippet + meta line. All four null cases now handled explicitly.
- Source list: one header with §3.7's three count treatments, replacing a
  two-section split.
- **§3.8 grounding indicator built** and wired from the same reconciliation pass
  that numbers the chips, so badge and chips cannot disagree.
- **§3.5 replace handler built.** The `replace` event was already on the wire and
  the reducer was *discarding* the draft — the exact thing §3.5 forbids ("do not
  silently swap the text"). Now struck through with the caution line, cleared on
  `done`. Struck text is `aria-hidden`: reading a discarded draft aloud would
  announce the figures the backend just refused to stand behind.

### Board 16 — Structured blocks
- **`ProvenanceCard` built** — implementation requirement #2. `source` is
  required with no way to suppress the strip; the type system refuses.
- **Chart data table broke §4.3 and §7.7 simultaneously** — rendered three times
  (sr-only, closed toggle, `aria-hidden` visible copy). Now one, visible, always.
- **Calculator card carried figures** — a units field defaulting to **1**. §4.6:
  "carries no figures at all — not even a prefilled quantity". Now inert
  placeholders and a link to the real calculator.
- **Ticket card was the entire enquiry form.** §4.7 gives it one subject field
  and a way out.
- Added the 3-row cap, `Showing 3 of 12`, the flight direction toggle, §4.5 row
  copy, and moved the chart caption to the card's foot in caution-fill.

### Board 17 — Vessels and Flights
- **`/vessels` had no table at all** — a `<ul>` of cards at every width, with no
  column headings. §5.1 requires real `<table>` semantics; §5.8 puts cards below
  640px only.
- Built `OpsTable` / `OpsRow` / `OpsCell` / `OpsRowCard` carrying §5.1's
  primitives once. Both table and cards render; **CSS chooses**, because a width
  read in JS is wrong on first paint, after a rotation, and in print.
- Added the status filter, density toggle, pagination, and all four §5.7 states.
- Metric tiles rebuilt to §5.3 (were 24px on a 12px radius with an eyebrow label
  in the legacy `ops-*` palette). Second line now §5.3's own "not reported".
- `VesselCard` / `FlightCard` **deleted** — orphaned by the rebuild. A dead
  component with passing tests reads as covered.
- `AirlineAvatar` extracted and shared; `SourceNotice` stamp corrected to
  24-hour with the zone.

### Board 17, second pass — the screens, not the components

Full reasoning in `frontend/docs/decisions.md` record **F019**. Every one of
these passed the component suite, because the suite never rendered a screen.

- **The source banner rendered twice** on both screens — `OpsPage`'s and the
  route's, stacked. §5.2 draws one.
- **The status filter was applied client-side to the current page** while the
  readout kept saying `Showing 1–25 of 100`. `GET /api/vessels?status=` exists
  and counts `total` after filtering; the route's comment claiming otherwise was
  wrong, and the mock ignored the parameter too.
- **A 429 rendered as "No movements match these filters."** `vessels` is `[]` on
  any failure, so every error fell into the filtered-out panel. §5.7's rate-limit
  card existed with no caller. One `TableError` now splits 429 from §7.1's shared
  envelope, and the countdown **re-enables at zero** per §1.3 — and shows no
  countdown at all when `Retry-After` is absent.
- **The flights tiles were not §5.3's three.** `total_flights` was rendered under
  "Arrivals today" and relabelled "Departures today" on the toggle; it counts both
  directions, so it read 4 arrivals where the feed holds 3. Now Arrivals today ·
  Departures today · Delayed, all three em-dashed and blocked.
- **§5.6's advisory panel had no caller at all** — the dead-component state that
  got `VesselCard` deleted. Now on the flights screen, with the caution fill
  gated on attribution the wire does not carry.
- **`TimeCell` still wrote the browser's own clock** — `06:40 AM` on a US
  browser, in the cells §5.4 is about. Same defect F018 fixed one file away.
  `SourceAge` was the third instance.
- Density segments 32px → **26px** (§5.1); vessels columns given §5.4's
  `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr`; `MetricRow` takes the tile count so three
  tiles do not sit in a four-column grid; the skeleton honours the density
  (§7.5's "rows keep their real height").
- The flights no-feed state said "Telephone **Marine Operations**" — §5.7's
  vessel copy, on an arrivals board. The department is a prop now.

### Board 18 — Tariffs, two steps

Full reasoning in `frontend/docs/decisions.md` record **F020**. `/tariffs` was
the pre-handoff screen throughout — a navy-headed zebra table, one cargo
calculator and a quote drawn as a four-column spreadsheet, all in the legacy
`ops-*` palette.

- **A verification date printed a day early for every reader in AST.**
  `TariffRow.as_of` is a plain date, and a date-only string parses as **UTC
  midnight** — so formatting it in the reader's zone moved it back a day
  anywhere west of Greenwich. `2026-01-01` rendered `Checked 31 Dec 2025` in the
  zone this port is in. The formatter is pinned to UTC; `DataSource.as_of`, a
  real instant, is deliberately not.
- **The table had no meta strip at all.** It is a `ProvenanceCard` now, which
  also gives it the mandatory sample-data notice. `OpsTable` gained `bare` so
  §5.1's primitives stay in one component without drawing a card inside a card.
- **Rates print exactly as published** — `Intl` with a minimum of two fraction
  digits and no maximum, so a three-decimal rate is not rounded, and the basis
  stays in the cell with the amount.
- **Category chips are Family C and come from the whole table.** Selecting one
  no longer needs an invented "All" chip: the selected chip clears itself, which
  is what the board draws and what `aria-pressed` announces.
- **The maritime calculator did not exist.** §5.10 draws two forms and the wire
  has supported both all along, with exactly the ranges §5.10 prints. The
  surfaces swap all the way down, including the inner field backgrounds.
- **Currency is a fixed label**, `--canvas` on a dashed border, with §5.10's
  inline note — not the select the old form implied by omission.
- **The quote**: no meta strip; `XCD` repeated on every figure; the disclaimer
  drawn on a **full-strength critical fill**; and the incomplete-quote banner
  **below** the total it contradicts. All four corrected — and `CALCULATED` sits
  *beside* the source-kind badge, because a quote from sample rates is both.
- **The toolbar vanished on the click that used it.** A filter change is a new
  `queryKey`, so `isPending` is genuinely true and the whole card dropped to the
  skeleton — taking the chips with it. `keepPreviousData` on `useTariffs`.
- **The screen said "sample data" twice**: `OpsPage`'s banner exists for tables
  with no strip of their own, and every payload here has one.

### Board 19 — Support

Full reasoning in `frontend/docs/decisions.md` record **F021**.

- **Four finished components had no caller.** `EmergencyStrip` (built to §6.1
  exactly), `ContactCard` (verified on board 08), `EnquiryReceipt` (verified on
  board 11) and `ContactPointRow` were all correct and **none of them was on the
  screen** — `/support` rendered the pre-handoff design in the legacy `ops-*`
  palette. Third board in a row with the same shape of finding.
- **§6.4's privacy notice did not exist.** It is the section marked
  "**Required.** Without it, the absence of those fields reads as a broken form."
- **§6.5's transcript control did not exist**, and the receipt reported
  `transcript_included` as a `Conversation attached: Yes/No` row — neither of the
  two renderings §6.5 draws, and not among §6.6's three rows. The form now offers
  §1.4's checkbox **only when this session has a conversation to attach**, and the
  receipt draws "Requested: attach this conversation" or the caution "Not
  attached" panel from what the server did.
- **Neither field showed its cap.** Subject had `maxLength` and no counter — a
  field that silently refuses the 201st character — and Details had neither.
  `Textarea` gained `Input`'s `counter` prop, with the same at-limit treatment.
- **The contact row was a 44px `TapToCall` button** where §6.2, board 08 and
  board 19 all draw a `--brand-200` link. One row component now, drawn as
  specified, with the hit area grown at ≤640px per §7 and an accessible name that
  says it dials.
- **The email glyph was `receipt`** — the tariff calculator's mark. §6.3 says
  `file`.
- **§6.3's five row types and their state tags existed nowhere.**
  `ContactPointCatalogue` draws all five, which is what
  `08-blocked-and-forbidden.md` #7 asks for; the product still renders no
  valueless row.
- **The receipt's timestamp was `toLocaleString()`** — 12-hour, no zone, on a
  receipt meant to be read down a telephone. Third instance of this defect. The
  copy button was 36px at every width; §6.6 gives it 44px at ≤640px.

### Board 20 — Console, health, admin

Full reasoning in `frontend/docs/decisions.md` record **F022**.

- **Two marine advisory panels shipped, with two different empty states** — the
  one empty state in the product where a wrong sentence has physical
  consequences. One is §6.9's, in `--caution-fill`, and it now carries the
  telephone number the section gives ("telephone Marine Operations" without one
  is advice a reader cannot act on from the screen they are on).
- **The console printed a prediction and a record in one column.** `/ops/vessels`
  had a single "Arrival" column with `Actual` / `Estimated` captioned beneath.
  Global rule 2 refuses it; it is two columns drawn by `EstimatedTime` and
  `ActualTime` now. Flagged on board 17 as §5a item 3 — closed.
- **`console/SidePanels`' map, gate and marine panels are deleted**, not left
  orphaned; their tests were rewritten against the components that carry the
  rules now.
- **§6.7's map had no meta strip** and said "no AIS or positioning feed" in a
  bare heading. It is a `ProvenanceCard` with the `NO FEED` badge and §6.7's
  plot, and the three `reported_by` markers differ by **shape** before hue.
- **§6.8's gate tiles had no status pill** and no status-tinted edge. Both now,
  with `active`/`total` **required** props so the count cannot be recounted from
  the tiles on screen.
- **§6.10's profile card was two emoji in the legacy palette.** Rebuilt; `profile:
  null` returns nothing from the card itself.
- **§6.11 had one of its three states** — no `ok`, no voice. `ops/HealthPanel`
  has all three; the chat's dismissible banner is left alone, because a permanent
  green bar over a conversation is furniture.
- **§6.12 did not exist**, and the first build of it wired "Chunks" to
  `web_docs` — a different quantity, which printed `Chunks 0`. Blocked and
  reading `unknown`: "Zero documents is a fact about an index that was built."
- **§6.13 is not built.** See §4.10.

### Board 21 — Voice

Full reasoning in `frontend/docs/decisions.md` record **F023**.

- **The record button drew three emoji** — 🎙, ■, ✕ — on a `rounded-md` box that
  turned **red** while recording, where §6.15 says `--brand-500`. None of the six
  states existed: no hover treatment, no approaching-60s, no permission-denied,
  no voice-off. Rebuilt to §6.15's 44px circle with sprite glyphs and all six.
- **§6.16's eight-state panel had no caller.** `TranscriptionResult` was built
  correctly and nothing rendered it; the button showed two sentences of its own,
  so **no error named its limit**. The fourth dead component this project has
  found. Wired, with the measured figures carried through.
- **Voice off rendered nothing.** §6.15 draws it dashed and inert — the same
  correction board 15 made to the speak button. The two causes are now
  distinguished: the deployment switch draws the state; a browser that cannot
  record at all still renders nothing.
- **§6.17's Paused was mapped to idle** on the speak button, so a paused answer
  drew the resting waveform while its own label read "Resume reading this
  answer". Drawn now, in §6.17's treatment.

### Board 22 — the feedback matrix

Full reasoning in `frontend/docs/decisions.md` record **F024**. A verification
pass, per §7's own first line: "One grid, so the same event never gets two
treatments across screens." It found three events answered twice and two states
with nothing drawing them.

- **The advisory empty state was written twice** — §6.9's caution panel on the
  console, and a softer neutral one on `/profile` that did not give the number.
  It is the only empty state in the product a reader can act on to their harm.
  One panel now.
- **Every error re-typed the escalation block** — `ErrorState` drew its own
  "Reach SCASPA directly" panel with the three lines and the address inline,
  while `NoAnswerCard` and `StepLimitCard` used the shared one. §7.1: "Every
  error is followed by the escalation block."
- **A table loading looked two ways** — `TableSkeleton` on three screens, three
  blank headerless cards on the console. §7.5 keeps the headings "so the shape is
  stable"; `OpsListState` hands them to the one skeleton now.
- **The error envelope had no status and no fills.** §7.1 and §3.11 both draw the
  code in the leading slot with 4xx caution / 5xx critical grounds, and §6.16's
  transcription rows have drawn theirs since board 21 — so the product had two
  treatments of one thing. This overturned a documented "never an error code"
  decision; the record says why, and `request_id`, stacks and internal code names
  are still dev-console only.
- **§7.6's copy toast did not exist.** A copy is the one action here with no
  visible result; the receipt announced it to a screen reader and nobody else.

---

## 4. Documented specification inconsistencies

### 4.1 Board 07 versus Board 00c — status pill fill (**RESOLVED: 00c is canonical**)

**The conflict.** §1.2 Family B writes the pill as `border: 1px solid <hue at
45%>`, `background: transparent`, *"or the 12% tint where noted"* — noted on one
variant. **Board 07 draws every chip filled and borderless**, and its anatomy
panel says "fill at 12%" with no qualifier.

`README` §4's tie-break ("the file wins") appeared to hand it to board 07. It
does not, because the disagreement is **one board against the rest of the same
file**:

| Where | Outline | Filled |
| --- | --- | --- |
| board 00c — the badge-family board | **18** | 0 |
| in context — boards 00b, 14, 17, 20 | **12** | 0 |
| board 07 — the enumeration | 0 | 7 |

**Evidence that board 07 is not a distinct variant or a special state:**

1. **No distinct component.** Both boards' chips are
   `inline-flex; gap:7px; height:26px; padding:0 12px; border-radius:999px`
   wrapping a 7px dot and a `500 12px/16px` label. Identical markup.
2. **Same surface.** Both panels are `#171A2B`.
3. **No label, note or metadata declares a special state.** Board 07's subtitle
   is about *coverage* ("the full enumerations, including the values today's
   fixtures never produce"); its headings are "Anatomy" and "Why unknown is
   drawn, not guessed".
4. **It is a subset of 00c**, which already renders all twenty operational
   variants. Board 07 adds explanation, not treatment.
5. It diverges on **three unrelated axes plus a label** — drift, not design.
6. **§5.12, board 07's own prose, defers:** *"Full spec in
   `01-foundations.md` §1.2. Anatomy, for the record"* — and restores the
   qualifier the panel dropped: *"fill at 12% **(where used)**"*.

**Resolution.** Outline, transparent ground, 45% edge. 12% fill only where noted
(`urgent`, and the "Not priced" line in a tariff quote). Guarded by five
assertions in `tests/boards.test.tsx` so reading board 07 alone cannot flip it
back.

### 4.2 `--text-3` on readable labels (**RESOLVED: contrast requirement wins**)

§5.3 says `--text-3` is "placeholders and disabled only" at 3.74:1. §7 calls
4.5:1 non-negotiable. §2.1, §2.7 and §3.7 then set readable labels in it anyway.

**Resolution.** The requirement outranks the value table; those labels are
`--text-2`. `--text-3` survives where it is genuinely a placeholder or a **glyph**
(the 3:1 non-text bar applies). Named exemptions live in
`tests/contrast.test.ts` (`RESTING_GLYPH_INK`, `ICON_ONLY`) rather than being
pattern-matched. Same shape as the earlier `--color-absent` derivation.

### 4.3 `volatility: null` — handoff versus API contract (**RESOLVED: handoff**)

`docs/api-contract.md` said render an absent value as `high`; §1.2 and §3.7 both
say **`medium`** ("changes often") with an extra ring so the fallback is visible.

**Resolution.** Handoff followed; the contract paragraph rewritten to match.
`needsConfirmation` is true for `medium`, so the confirm line still fires. **This
is the only change in the whole pass that moves a safety signal down a rung** —
flagged so a reviewer who disagrees can find it.

### 4.5 Board 18's verified-date badge versus §1.2 (**RESOLVED: §1.2 is canonical**)

Board 18 draws the tariff source cell's badge reading **`1 APR 2026`**. §1.2
Family A gives the same badge the label **`CHECKED 1 APR 2026`**.

Same adjudication as §4.1, and the export settles it against itself: it renders
`Checked 1 Apr 2026` **twice elsewhere** — once at Family A's 22px on board 00c,
and once in the *same compact 20px form board 18 uses*, on the source-entry
board. Board 18's is the only bare-date instance.

The word also does real work. A bare date beside a source name, in a column
headed SOURCE, reads just as easily as the rate's *effective* date — a different
and materially important fact about a published tariff.

**Resolution.** `CHECKED <date>`, from the one `ProvenanceBadge`. The 20px
in-cell geometry is not in §1.2 either; the badge stays at Family A's 22px so
there is one badge rather than two.

### 4.6 The currency label's ground (**RESOLVED: the two doc sections**)

§5.10 and §1.4's ninth input both write the locked currency field as `--canvas`.
The export draws it `#10121F` — `--surface-1`. Two sections against one
instance, one step apart on a scale where both read as inert. `--canvas`, per the
sections that specify the control.

### 4.7 §6.2's contact row versus board 19's five cards (**RESOLVED: the label stays**)

§6.2 writes the row as "16px glyph `--brand-300` (3px top offset) + a **label/
value stack**" and gives both label styles. **Board 08 draws exactly that**;
board 19's five location cards draw the value alone.

**Resolution.** The label stays, on three counts: §6.2's prose specifies it with
measurements; board 08 renders it; and the label is the **feed's** word rather
than the kind's — four of the five locations send `"Via SCASPA"`, a fact about
how to reach a terminal with no line of its own that a phone glyph cannot carry.
Board 19 omits a label that would have read "Telephone" five times over its own
example data. That is not a different component.

### 4.8 §6.3's "never `--critical-fill`" (**RESOLVED: it names a treatment**)

"populated `--positive-fill`/`--positive`, TODO and not-populated
`--caution-fill`/`--caution`, never `--critical-fill`/`--critical-text`" reads
either as a third treatment or as a prohibition. The export settles it: the
extension row's tag is `rgba(217,86,75,0.12)` with `#E4736A` and reads **"Never"**.

### 4.9 §6.2's status row (**RESOLVED: the narrow reading**)

"there is no status row in the shipping markup at all, **and** no code path that
renders an empty one" — the first clause forbids the row, the second forbids
rendering it empty. The board's own annotation is the narrower: `status: "" —
element not rendered`.

**Resolution.** The narrow one. It satisfies the wide one for the data that
exists — `status` has never been non-empty on any location, so nothing renders —
and keeps a guard that already had a test.

### 4.10 §6.13's admin gate versus `frontend/CLAUDE.md` rule 2 (**NOT BUILT — needs an owner's decision**)

**The conflict.** §6.13 draws a secret gate — "Administrator key", a 38px field
of mono dots, a Continue button — plus a models panel and a config summary.
`GET /admin/stats` exists, takes `X-Admin-Secret`, and returns everything those
panels need. **`frontend/CLAUDE.md` rule 2 opens: "There is no auth and no
session token."** Building the gate puts an operator credential into a browser
SPA and holds it in memory to authorise fetches.

**Why this is not a gap.** §2.8 gives the admin route three states, and the third
is a designed shipping state: **C — route absent → the ordinary 404, and no entry
point anywhere.** The product is in State C, board 04 already ships that 404, and
`08-blocked-and-forbidden.md`'s check — `/admin/stats` unauthenticated and
`/adnim` byte-identical — holds trivially because neither exists in the client.

**Recommendation** (for whoever owns the security decision): if the gate is
wanted, the key must never be persisted (rule 5 permits two storage keys and this
is neither), the route must be reachable only by typing the address — no nav
item, no link, no sidebar search result — and a wrong key must return the
ordinary 404. §6.13 and §2.8 already specify all three; what is missing is the
decision, not the design.

**§6.14's spend panels are blocked with it.** `SpendSummary` was verified against
§6.14 on board 10 and has no caller, because the only source of spend figures is
`/admin/stats`. Left built and unreachable rather than fed invented figures.

### 4.11 §6.7's plot ground (**RESOLVED: the export**)

§6.7's prose says the 200px plot is `--canvas`; the export draws `#10121F`
(`--surface-1`). One instance each and no tiebreaker, so README §4's rule
governs — **the file wins** — and it is raised here. The opposite call from §4.6,
where *two* doc sections agreed against one export instance.

### 4.12 §3.13 versus §6.17 — one control, two drawings (**RESOLVED: §3.13, plus §6.17's paused**)

| | §3.13 (chat) | §6.17 (voice) |
| --- | --- | --- |
| Size | 28–32px ghost icon button | 36px circle |
| At rest | waveform `--text-3` | play `--text-2` |
| States | 7 — no paused, no finished | 9 — incl. paused, finished, three cache states |

**Resolution.** §3.13 governs the message-row control: it is the chapter
describing it in context, and §1.3's "ghost icon button (message actions)" is
28px with `speak` last in its row order — two sections agreeing against one.
**§6.17's `paused` is taken**, because it is a state rather than a size and the
speech store already tracked it; mapping it to idle drew a paused answer exactly
like one that had never started.

`finished` is not built: the store resets to idle when playback ends and §3.13,
the governing section, does not draw it.

### 4.13 §2.1's composer mic versus §6.15's record button (**RESOLVED: §6.15**)

§2.1 lists the composer's control row with a "32px mic button (no border)";
§6.15 opens "**44px circle at every breakpoint**". §6.15 is the section about the
control, and §1.3 pins tap-to-call at 44px at every breakpoint for the same
reason — the control that matters does not shrink. The shipped size already
agreed at 44px, so nothing changed but the record of why.

### 4.4 Recorded-questions fade (minor)

§2.1 draws a gradient overlay; it ships as a `mask-image`. Same picture, keeps
"no gradients inside the frame" intact, and cannot swallow a click.

---

## 5. Backend-blocked dependencies

Each is **built and gated on a named field**, per `08-blocked-and-forbidden.md`.
None is approximated or invented.

| # | Item | Board | Waiting on | Where |
| --- | --- | --- | --- | --- |
| 1 | Diagnostics "Rate-limit keys tracked" row | 15 | `tracked_clients` reachable outside `/admin/stats` (computed in `backend/app/ratelimit.py`, returned only behind the admin secret) | `chat/DiagnosticsPanel.tsx` — `trackedKeys` prop |
| 2 | Chart block meta strip | 16 | **`source: DataSource` on `ChartSpec`**. It carries `source: string` (a `kb-xxx` citation) — no kind, label, `as_of` or notice | `chat/ChartBlock.tsx` |
| 3 | "Expected today" tile | 17 | `arrivals_today` on `VesselMetrics`. Currently reads `arrivals_next_24h`, a rolling window rather than a calendar day | `routes/vessels.tsx` |
| 4 | Flights tiles — **Arrivals today · Departures today · Delayed** | 17 | `arrivals_today`, `departures_today` and `delayed` on `FlightMetrics`. It carries `total_flights` (both directions, whole feed), `on_time_percent`, `gates_active`, `gates_total` — none of which is one of §5.3's three. All three tiles render `—` / "not reported" | `routes/flights.tsx` |
| 5 | Operational advisory — the caution fill | 17 | `published_by` and `published_at` on `OperationalAdvisory`. §5.6 requires attribution ("always attributed to whoever published it, with a time") and the fill is what claims it; without them the panel draws §5.6's neutral fill | `ops/AdvisoryPanel.tsx` |
| 6 | Tariff source cell — the citation **link** | 18 | A title to label it with, and a route that renders a knowledge-base row. `TariffRow` carries `kb_id` alone; "never a link to nowhere" governs, so a sourced row names the feed in plain text beside the real verified-date badge | `ops/TariffTable.tsx` — `SourceCell` |
| 7 | Maritime calculator — **Vessel type** | 18 | `build_quote` reading `vessel_type` (it accepts the field and never uses it — the maritime lines are dockage, pilotage and harbour dues), **and** a published list of types. The select is drawn, disabled, with a note saying what the estimate uses | `ops/TariffCalculators.tsx` |
| 8 | Unpriced line — the charge's **name** | 18 | A label alongside the code on `TariffQuote.unpriced` (`list[str]` today). The code is absent from the tariff table by definition, so there is no row to read a name from; the code stands in | `ops/QuoteResult.tsx` — `UnpricedRow` |
| 9 | Index status — **Chunks** | 20 | A chunk count on `IndexStatus`. It carries `kb_rows` and `web_docs`, and `web_docs` is a *different quantity* — wiring it printed `Chunks 0`, which §6.12 forbids by name. Reads `unknown` | `ops/IndexStatusPanel.tsx` |
| 10 | §6.13's admin panels and §6.14's spend | 20 | **Not a wire gap — a decision.** `/admin/stats` exists and returns everything both need, behind `X-Admin-Secret`; building the gate conflicts with `frontend/CLAUDE.md` rule 2. See §4.10 | not built / `ops/SpendSummary.tsx` |
| 11 | §6.17's three **cache** states — hit, miss, `304` | 21 | **Also not a wire gap.** The backend sends `X-TTS-Cache: hit\|miss`, lists it in `EXPOSED_HEADERS` and 304s on a matching ETag. "Cached · instant" is a diagnostic caption and the only surface for one is §6.13's operator screen, which is not built | unplaced — see §4.10 |
| 12 | §6.18's speech preview — **admin only** | 21 | The same operator screen. Drawn nowhere rather than placed where it does not belong | not built |
| 13 | §7.5's **progressive rows** — `12 of 25 loaded` | 22 | **Nothing produces it.** Every list is paged with `limit`/`offset` and arrives whole; §4.4's `Showing 3 of 12` is a count row, not a loading state. Not blocked on a field — blocked on a surface that streams | not built |

**Pre-existing blocked components** (from `08-blocked-and-forbidden.md`) that are
built and unreachable by design, not defects: `source.kind: none` badge,
`volatility: static` badge, the 4-series chart legend, `live` data source,
`FlightStatus.arrived` / `VesselStatus.departed` / `VesselStatus.unknown`, and —
added on board 19 — the **email, extension and web contact rows** (#7), which are
drawn by `ContactPointCatalogue` and rendered by no screen.

### 5b. Board 19: two data differences, recorded rather than papered over

Neither is a client defect. Rendering the handoff's values instead of the feed's
would be this client inventing SCASPA's published contact details.

| What the handoff draws | What the wire sends |
| --- | --- |
| §6.2's five locations — Deep Water Port, Port Zante, R. L. Bradshaw, Vance W. Amory, Charlestown — with **five distinct telephone numbers** and two addresses | Five different names, all on the switchboard number, four with no address. The count matches, and the empty-address collapse is exercised by four of them |
| §1.4's seven departments — Marine Operations, Airport Operations, Cargo and Warehousing, Finance and Billing, Security, Cruise and Port Zante, General enquiries | Seven different names. `department` is free text on the wire, so sending the handoff's would be *accepted* — and would route a ticket to a department nobody handles |

---

## 5a. Found while verifying board 17, and deliberately **not** fixed here

Each is real, each is outside §5.1–5.8, and each is left for the board that owns
it rather than being resolved by preference in passing. Recorded so the next
session inherits the evidence rather than the surprise.

| # | Finding | Owner | Why it was not fixed here |
| --- | --- | --- | --- |
| 1 | **`/vessels` and `/flights` are not in the app shell.** They render through `OpsPage` — a 56px navy bar, a "← Assistant" link and the legacy `ops-*` aliases. §2.1 puts every operations screen in the 240px-sidebar shell with a 60px header row and the Operations nav group's active row in `--brand-500`. `FullPageShell` exists and only `/chat` uses it. | Shell / board 00-cover | Re-chroming two routes is §2.1 work with a wide blast radius — route chrome, the a11y harness, the responsive check. Board 17 is §5.1–5.8, the things *on* the screen. |
| 2 | **Telephone numbers render `869-465-8121`, not `869 465 8121`.** §10 fixes the spaced form; board 17's own §5.7 copy uses it. | Product-wide copy | One shared constant, 45 call sites, and several of the strings are the **backend's** own error copy that the client only renders. It is a product-wide decision, not a board-17 edit, and fixing it on this board alone would leave the number written two ways. |
| 3 | ~~**`/ops/vessels` merges ETA and ATA into one "Arrival" column**~~ | Board 20 — Console | **CLOSED on board 20.** Two columns, drawn by `EstimatedTime` / `ActualTime`, with a test pinning the headers and the absence of the old caption. |
| 4 | **The toolbar unmounts with the table** in the empty, error and loading states, so a search that matches nothing takes the search box away with it. Recovery is by the removable chips and "Clear filters", which is what §5.7 and §7.4 prescribe. **Board 18 met the same defect from the other side** — a filter change is a new `queryKey`, so the whole card dropped to the skeleton — and fixed it there with `keepPreviousData` on `useTariffs`. The same one-line change would fix the *filter-change* case on vessels and flights; the *empty-result* case still unmounts. | Board 17 | The handoff draws the four states as standalone cards and gives no composition; keeping the toolbar through an empty result means inventing a layout it does not draw. The filter-change half has a proven fix now — see `useTariffs`. |
| 5 | **`sm:` is `min-width: 640px`, so at exactly 640px the table shows** where §8 says "at or below 640px" is the card treatment. | Codebase convention | The whole product uses `sm:` for this threshold. Moving it for one component would make 640px render cards inside a desktop-height toolbar; moving it globally is a breakpoint change for every `sm:` in the codebase. |
| 6 | **A field's `<input>` measures 42px inside its 44px wrapper** — the border eats two pixels, and `npm run check:responsive` measures the input rather than the box a thumb lands on. Now on three screens (vessels, flights, tariffs) and on the sidebar search. axe reports nothing, because the effective target is 44px. | Product-wide | Restructuring the field wrapper is a change to every search and numeric field in the product. Recorded so the next person does not fix it on one screen and leave the other three. |

---

## 6. Files by board

New files are marked ✚. Everything else was modified.

| Board | Files |
| --- | --- |
| 00 | `styles/tokens.css`, `brand/LogoLockup.tsx`, `shells/ScaspaMark.tsx`, `ui/Icon.tsx`, `ui/iconPaths.ts`, `about/AboutScaspa.tsx`, `shells/NotFound.tsx`, `dev/Gallery.tsx` |
| 00a | `shells/WidgetShell.tsx`, `chat/ChatCore.tsx` |
| 00b | `chat/MessageBubble.tsx`, `chat/MessageList.tsx` |
| 00c | `ops/ProvenanceBadge.tsx`, `ops/StatusChip.tsx`, `ui/Chip.tsx`, `styles/tokens.css` |
| 00d | `ui/Button.tsx`, `ui/IconButton.tsx`, `ui/Input.tsx`, `ui/Textarea.tsx`, `ui/Segmented.tsx`, `ui/Checkbox.tsx` |
| 01 | `ops/console/Pagination.tsx` |
| 02 | `chat/CardFooterLink.tsx`, `chat/cardDestinations.ts` |
| 03 | `shells/Breadcrumb.tsx` (no change) |
| 04 | `shells/NotFound.tsx` |
| 05/15 | ✚`chat/DiagnosticsPanel.tsx`, `chat/SpeakButton.tsx`, `features/chat/errorCopy.ts`, `features/chat/useChatSession.ts`, `features/chat/reducer.ts`, `lib/api.ts`, `chat/MessageBubble.tsx`, `chat/EscalationBlock.tsx` |
| 06 | `ops/DataSourceCard.tsx` |
| 07 | `ops/StatusChip.tsx` |
| 08 | `ops/ContactCard.tsx` |
| 09 | `ops/QuoteResult.tsx` |
| 11 | `ops/EnquiryReceipt.tsx` |
| 12 | `ops/OpsListHeader.tsx` |
| 13 | `chat/Composer.tsx`, `ui/Textarea.tsx` (`bare` prop), `chat/SuggestedQuestions.tsx`, `features/chat/suggestions.ts` |
| 14 | `chat/StreamingMarkdown.tsx`, `chat/CitationChip.tsx`, `chat/SourceEntry.tsx`, `chat/SourceList.tsx`, `features/chat/citations.ts`, `features/chat/ChatSessionContext.tsx`, `shells/SourcePanel.tsx`, `features/chat/reducer.ts`, `features/chat/types.ts` |
| 16 | ✚`ops/ProvenanceCard.tsx`, ✚`ops/AirlineAvatar.tsx`, `chat/CardBlock.tsx`, `chat/ChartBlock.tsx`, `chat/ChartDataTable.tsx` |
| 17 | ✚`ops/OpsTable.tsx`, ✚`ops/TableStates.tsx`, `ops/MetricTile.tsx`, `ops/SourceNotice.tsx`, `routes/vessels.tsx`, `routes/flights.tsx`; **deleted** `ops/VesselCard.tsx`, `ops/FlightCard.tsx` |
| 17 (2nd pass) | `ops/TimeCell.tsx`, `ops/AdvisoryPanel.tsx`, `ui/Segmented.tsx` (`size`), `ops/OpsTable.tsx` (`widths`), `ops/TableStates.tsx` (`TableError`, density, department, live countdown), `ops/MetricTile.tsx` (`columns`), `ops/SourceNotice.tsx` (`SourceAge` stamp), `routes/vessels.tsx`, `routes/flights.tsx`, `mocks/handlers.ts`, `dev/Gallery.tsx`, `tests/operations.test.tsx` |
| 18 | ✚`ops/TariffCalculators.tsx`, `ops/TariffTable.tsx` (rebuild), `ops/QuoteResult.tsx` (rebuild), `routes/tariffs.tsx` (rebuild), `ops/OpsTable.tsx` (`bare`, optional row-card status), `ops/ProvenanceCard.tsx` (`derived`), `features/ops/queries.ts` (`keepPreviousData`), `dev/Gallery.tsx`, `tests/operations.test.tsx`, `tests/contrast.test.ts` |
| 19 | ✚`ops/PrivacyNotice.tsx`, ✚`ops/TranscriptState.tsx`, ✚`ops/EnquiryForm.tsx`, `ops/ContactPointRow.tsx` (rebuild + catalogue), `ops/ContactCard.tsx` (rows), `ops/EnquiryReceipt.tsx`, `routes/support.tsx` (rebuild), `ui/Textarea.tsx` (`counter`), `dev/Gallery.tsx`, `tests/operations.test.tsx`, `tests/boards.test.tsx` |
| 20 | ✚`ops/PositionMap.tsx`, ✚`ops/GateMap.tsx`, ✚`ops/HealthPanel.tsx`, ✚`ops/IndexStatusPanel.tsx`, ✚`ops/OperatorProfileCard.tsx`, `ops/AdvisoryPanel.tsx` (§6.9 copy, 24-hour stamp), `routes/ops.vessels.tsx` (ETA/ATA split, panels), `routes/ops.flights.tsx`, `routes/profile.tsx`, `dev/Gallery.tsx`, `tests/console.test.tsx`, `tests/operations.test.tsx`; **deleted** `console/SidePanels`' `MapPanel`, `GatePanel`, `MarineAdvisoryPanel` |
| 21 | `chat/VoiceButton.tsx` (rebuild), `chat/SpeakButton.tsx` (`paused`), `dev/Gallery.tsx`, `tests/voice.test.tsx` |
| 22 | ✚`ui/CopyToast.tsx`, `chat/ErrorState.tsx` (§7.1's shell + the shared escalation block), `features/chat/errorCopy.ts` (`status`), `ops/EnquiryReceipt.tsx`, `ops/OpsPage.tsx` (`columns`), `routes/profile.tsx`, `routes/ops.vessels.tsx`, `routes/ops.flights.tsx`, `ui/index.ts`, `dev/Gallery.tsx`, `tests/matrix.test.tsx`, `tests/unhappy-paths.test.tsx`, `tests/boards.test.tsx` |
| Shell | `shells/Sidebar.tsx` (full rebuild), `shells/FullPageShell.tsx`, `chat/ChatCore.tsx` |

Docs: `frontend/docs/decisions.md` (F013–**F024**), `docs/api-contract.md`
(volatility paragraph; **filtering and paging on the three list endpoints**),
`docs/decisions.md`.

---

## 7. Invariants and regression tests added

Reusable substrate the remaining boards should build on rather than re-solve:

| Component | Enforces |
| --- | --- |
| `ops/ProvenanceCard.tsx` | Meta strip + mandatory notice. `source` **required**; no suppress prop, no `dismissible` prop |
| `ops/OpsTable.tsx` | §5.1 primitives, real `<table>`, ≤640px row cards |
| `ops/TableStates.tsx` | §5.7's four states, with the two emptinesses kept distinct |
| `ops/StatusChip.tsx` | Family B, canonical from board 00c |
| `ops/ProvenanceBadge.tsx` | Family A, incl. unreachable variants |
| `ui/Chip.tsx` | Family C |
| `ops/TimeCell.tsx` | ETA/ATA, revised time, gate cell — and the 24-hour clock |
| `ops/AirlineAvatar.tsx` | 26px mark; never invented initials |
| `ops/TableStates.tsx` → `TableError` | 429 → §5.7's card, every other code → §7.1's shared envelope. A failure is never an empty result |
| `ops/AdvisoryPanel.tsx` | §5.6's three fills; the caution one gated on attribution |
| `ui/Segmented.tsx` | Two sizes — 26px toolbar (§5.1, §4.5), 32px form (00d) — both 44px at ≤640px |
| `ops/TariffTable.tsx` | §5.9: rates printed not computed, chips from the whole table, the source cell's two null cases |
| `ops/TariffCalculators.tsx` | §5.10's two surfaces, swapped all the way down; currency as a label, never a select |
| `ops/QuoteResult.tsx` | §5.11: separate subtotal and total, disclaimer last, no total at zero lines, "Total so far" only on the flag |
| `ops/ContactPointRow.tsx` | §6.2/§6.3's one row, and the five-kind catalogue for the three that will never be populated |
| `ops/TranscriptState.tsx` | §6.5: the box shows what the **server** did, and nothing when it was never asked for |
| `ops/PrivacyNotice.tsx` | §6.4, required — no dismiss, no collapse |
| `ops/PositionMap.tsx` | §6.7's plot and the three `reported_by` markers, distinct by shape |
| `ops/GateMap.tsx` | §6.8; `active`/`total` **required**, so the count cannot be recounted |
| `ops/HealthPanel.tsx` | §6.11's three states — never a bare "degraded" |
| `ops/IndexStatusPanel.tsx` | §6.12: every field "unknown", never 0; no rebuild control |
| `ops/OperatorProfileCard.tsx` | §6.10; `profile: null` renders nothing at all |

Guards worth knowing about before editing:

- **`tests/tokens-compile.test.ts`** — every token-derived utility must emit real
  CSS. Four utilities have silently compiled to nothing over this project's life
  (`min-h-touch-min`, `duration-fast`, `w-sidebar`, `border-caution-edge`).
  `w-*`, `h-*` and `min-h-*` read the **spacing** scale, not `--size-*`. Declare
  an `@utility` and add it here. A token with no call site cannot be listed — it
  has no rule to assert.
- **`tests/contrast.test.ts`** — parses the `@theme` block (not the whole file:
  `prefers-contrast: more` re-declares two tokens). Three colours are asserted to
  **fail** on purpose. Named exemption lists: `ICON_ONLY`, `RESTING_GLYPH_INK`.
- **`tests/matrix.test.tsx`** — source scan proving no component grew a way to
  hide a disclaimer, caption or provenance notice. **Comments are stripped
  first**: the components that obey the rule hardest are the ones that explain it
  in prose, and the scan reported `ProvenanceCard` for documenting itself.
- **`tests/boards.test.tsx`** — five assertions pinning Family B to board 00c
  (see §4.1), plus board 06's "unavailable is neutral, not critical".
- **`tests/no-arbitrary-values.test.ts`** — no hex in a `className`. Bracket px
  (`h-[34px]`) is fine; hex is not.
- **`tests/operations.test.tsx`** — board 17's table primitives, both empty
  states, the skeleton keeping its headers and its density, the 429 copy and its
  re-enabling countdown, the row card's top-right status, §5.4's column
  proportions, the 24-hour cells, and the advisory's attribution gate.
  **It also renders `/vessels` and `/flights` through the real route tree** —
  the guard that was missing, and the reason eight screen-level defects survived
  a suite in which every component passed. Do not test a screen by importing its
  route component: an extra export in a route file cannot be code-split, and
  doing it folded both screens into the entry chunk (433 kB → 469 kB).

### 7.1 Tests added in the board-17 second pass

Eighteen, taking the suite from 777 to 795. Each pins a defect that shipped, so
none of them is decoration:

| Test | Pins |
| --- | --- |
| `the vessels screen › says where the data came from exactly once` | §5.2's single banner — the shell's, not the shell's plus the route's |
| `… › sends the status filter to the server rather than filtering the page` | The request carries `status`; the page is not filtered client-side under a server total |
| `… › tells a rate limit apart from an empty result` | 429 renders §5.7's card, never "No movements match these filters" |
| `… › says the feed is missing, not that the filters are wrong` | `unavailable` + no rows → `NoFeedState`, and no "Clear filters" button |
| `the flights screen › draws §5.3's three tiles and puts no figure under them` | Arrivals today · Departures today · Delayed, all three em-dashed; no `total_flights` under a direction label |
| `… › says where the data came from exactly once` | As above, on the second screen |
| `… › renders the advisory as a passthrough, unattributed` | §5.6's panel is on the screen at all, and unattributed means the neutral fill |
| `the clock in a table cell › …` (×3) | ETA, ATA and both halves of a revision are `HH:MM` with no meridiem |
| `the operational advisory panel › renders nothing at all when there is no advisory` | §5.6's third state: no empty container |
| `… › keeps the caution fill for an attributed notice only` | The fill is the attribution claim |
| `the density toggle › is 26px in a toolbar and 32px in a form, and 44px under a thumb` | §5.1's size and §7's touch minimum together |
| `the operations table › lays the columns out in the proportions §5.4 gives them` | `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr` as a `<colgroup>`, `table-fixed` |
| `… › keeps the skeleton rows at the real height for the density` | §7.5's no-layout-shift rule |
| `… › gives the countdown back as a working control at zero` | §1.3's "re-enables at zero" |
| `… › shows no countdown when the server did not send Retry-After` | §7.2 — the only figure is the header's |
| `… › names the department the reader should actually telephone` | A flights feed outage does not route to Marine Operations |

### 7.2 Tests added for board 18

Seven at route level and four at component level, taking the suite to 802:

| Test | Pins |
| --- | --- |
| `the tariffs screen › says where the schedule came from, above the rates` | §5.9's meta strip, and **exactly one** of it — the shell's banner is for tables with no strip |
| `… › prints a rate exactly as published, with its basis` | No rounding, no normalised unit column |
| `… › keeps every category chip on screen while one is selected` | Chips from the whole table, and the toolbar surviving the click that uses it |
| `… › draws two calculators that do not look like each other` | §5.10's two surfaces |
| `… › carries no figures until the user enters some` | No prefilled quantity |
| `… › states the currency rather than offering to change it` | A label, not a select |
| `… › works out a total, and never shows it without the disclaimer` | Subtotal and total both present; the note is the last child |
| `the published tariff table › shows the verification date…` | `Checked 1 Jan 2026` from `2026-01-01`, and **not** `31 Dec 2025` — the UTC pin |
| `… › says "No source recorded" / marks an indexed rate with no check date` | §5.9's two source-cell null cases |
| `the fee calculator result › shows every quantity and rate…` | Bare line amounts under an XCD-labelled total |
| `a quote missing a published rate › names the missing code in the lines` | The unpriced row, above the total, with its pill |

### 7.3 Tests added for board 19

Eight, taking the suite to 810:

| Test | Pins |
| --- | --- |
| `the support screen › offers the telephone before the form, always` | §6.1's strip is on the screen at all |
| `… › explains why it asks for nothing about the person` | §6.4, the section marked *Required* |
| `… › asks for no name, email, telephone or attachment. Ever.` | §6.5, in bold |
| `… › shows the published departments, and does not invent any` | The select is the server's list, not §1.4's illustration |
| `… › collapses an empty postal field instead of drawing a gap` | §6.2: absent from the tree, no em dash, no reserved space |
| `… › offers the transcript only when there is a conversation to attach` | A tick that would attach nothing is the same lie as one that means "we tried" |
| `… › gives a reference, and says nobody will make contact first` | §6.6, and no status tracker anywhere on it |
| `EnquiryReceipt › reports what the server did with the transcript` (rewritten) | §6.5's **two drawn renderings**, replacing a `Conversation attached: No` row that is in neither §6.5 nor §6.6 |
| `EnquiryReceipt › says nothing about a transcript nobody asked for` | There is no third rendering on the board |

### 7.4 Tests added for board 20

Five at route level, plus six rewritten from `console.test.tsx`'s deleted panels
onto the components that carry those rules now. Suite: 815.

| Test | Pins |
| --- | --- |
| `the console screen › says why the map is empty, in the meta strip and in the plot` | §6.7's `NO FEED` strip, which the console's own version never had |
| `… › reports the service and the index without offering to rebuild either` | §6.11 and §6.12 exist at all; no rebuild control, no bare "degraded" |
| `… › draws one marine advisory panel, and its empty state is not an all-clear` | One panel, §6.9's copy, the number to ring |
| `… › keeps ETA and ATA in two columns on the console table` | Global rule 2, on the screen that broke it |
| `… › counts active gates from the server, not from the tiles on screen` | §6.8 and requirement #5 |
| `the console panels › names who reported each position…` | Marker shapes, hemispheres, and a null speed that is never `0.0 kn` |
| `… › lists stands without claiming to be an apron view, and counts from the server` | Two tiles on screen, `1 active of 8` from the response |
| `… › an empty marine advisory panel does not read as an all-clear` | No tick, no green chip, no "clear" |

### 7.5 Tests added for board 21

Three added and one rewritten. Suite: 818.

| Test | Pins |
| --- | --- |
| `the record button › is a 44px circle drawing a real glyph, not an emoji` | §6.15's size and shape, and that 🎙/■/✕ are gone — no icon rule can govern an emoji |
| `… › names the microphone block, and says what to do about it` | §6.15's permission-denied message, including where the control is |
| `the playback control › draws paused as paused, not as never started` | §6.17's paused, which used to render as idle |
| `the voice button › is DRAWN when the feature flag is off, dashed and inert` (rewritten) | §6.15's voice-off state, replacing an assertion that it renders nothing. The *browser cannot record* case still pins the empty container in the test above it |

### 7.6 Tests added for board 22

Six, of which three are **source scans** — the failure they catch is invisible in
any single component, because each copy is correct on its own screen and only
reading two screens together shows one event answered twice. Suite: 824.

| Test | Pins |
| --- | --- |
| `one event, one treatment › the advisory empty state is written once, and it is the caution one` | §6.9/§7.4's sentence resolves to one file |
| `… › the escalation block is one component, never re-typed` | §7.1's "every error is followed by the escalation block" |
| `… › a table loading is one skeleton, with its headings kept` | §7.5, and every `OpsListState` caller hands it the headings |
| `ErrorState › shows the status, and nothing else technical` (rewritten) | §7.1's code in the leading slot; `request_id` and the code name still hidden |
| `… › separates a fault the reader can act on from one that is ours` | 4xx caution / 5xx critical grounds |
| `EnquiryReceipt › confirms a copy on screen, not only to a screen reader` | §7.6's toast |

Rules encoded in types rather than in review: `DataSource` required on
`ProvenanceCard`; `CardDestination` a closed union of four; `LogoSize` an enum of
the two drawn pairings; `Icon` `size` limited to the six drawn sizes.

---

## 8. Current status

```
build       ok                     npm run build   (entry 435.55 kB / 135.18 kB gzip)
typecheck   ok                     npx tsc --noEmit          (strict)
lint        ok                     npx eslint src tests --max-warnings 0
tests       824 passed / 25 files  npx vitest run
a11y        0 axe violations       npm run check:a11y
            0 manual checks failed (26 route × viewport combinations)
backend     ruff check passed · 81 files formatted · 561 pytest passed
responsive  0 horizontal-overflow failures across 65 route × width checks
            27 touch-target reports, every one a desktop-sized control the
            handoff draws — see the note below
```

The a11y harness needs two dev dependencies that are deliberately **not** saved,
and they must be installed in **one** command — a second `--no-save` install
rewrites `node_modules` from `package.json` and removes the first:

```bash
npm i -D --no-save playwright@1.56.1 @axe-core/playwright@4.11.0
```

**`npm run check:responsive` is not in the list above, and should not be read as
green.** It builds and previews on `:4319`, so it needs that origin in
`ALLOWED_ORIGINS` and `OPS_DATA_SOURCE=fixture` or its console checks fail for
environmental reasons. Even configured, it reports **35 failures, all
pre-existing**: it applies the 44px touch minimum at *every* width, while §7
applies it at ≤640px and the handoff draws 26–36px desktop controls (suggestion
chips at 34, the send button at 34, icon buttons at 28–32, the toolbar select at
36). What it is genuinely useful for is **horizontal overflow**, which is `ok` at
every width on every route including the new fixed-layout table.

Two of its findings were acted on in board 17's pass: the segmented control now
grows to 44px at ≤640px like every other control, and the remaining
`input 188x42` is the bare `<input>` inside its 44px wrapper, measured two pixels
short by the border — product-wide, and recorded in §5a item 6.

After board 22 it reports **27**, all of them touch-target measurements and
**none** a horizontal overflow — 65 route × width overflow checks pass. Every
report is one of two things: a desktop-sized control the handoff draws (28px
chips, 32px segments, 34px suggestion chips and send button, 36–40px fields and
buttons), or the `input 188x42` wrapper measurement of §5a item 6. The harness
applies the 44px floor at **every** width; §7 applies it at ≤640px, and the
screens that were checked at 320 and 390 pass there.

**Running the a11y check needs the backend up**, or its two manual checks fail
for environmental reasons (no answer streams, so nothing to announce and no
citation chip to focus):

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000 &
cd frontend && npm run check:a11y
```

`backend/.env` (gitignored) has been widened locally for this:
`ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4400,http://127.0.0.1:4400`
and `RATE_LIMIT_PER_MINUTE=600`. The a11y harness serves on `:4400`.

---

## 9. Completion — all 27 boards

**Every board from 00 to 22 has been individually implemented or verified against
the handoff.** No board is partially implemented. Where something is not built it
is recorded below with the decision or dependency it waits on, and every one of
those was a deliberate call rather than an omission.

| Board | Title | Outcome |
| --- | --- | --- |
| 00 | Foundations | Rebuilt — radius scale completed, seal plated at both drawn pairings, four glyphs redrawn, eleven added |
| 00a | Embedded widget | Rebuilt — frame, header divider, shrunk greeting; close kept and documented |
| 00b | Two data paths | Bubble width, turn spacing, per-turn timestamp removed |
| 00c | Badge families | `*-edge` tokens added (they compiled to nothing), Family C resized, unreachable variants built |
| 00d | Buttons and inputs | Radius alias corrected, touch-growing introduced, `IconButton` split, inputs re-grounded |
| 01 | Pagination | Verified; readout trimmed to §2.4's string |
| 02 | Card footer link | Hover/pressed fills added |
| 03 | Breadcrumb and back | **Verified conformant, no changes** |
| 04 | Admin gate / 404 | Padding and button size; one template confirmed |
| 05 / 15 | Answer card, refusals, errors, speak, diagnostics | Diagnostics built, speak button de-emojified, three error copies corrected |
| 06 | Data source card | `unavailable` changed from a permanent red alarm to a neutral ring |
| 07 | Status chips | Verified; **inconsistency adjudicated** (§4.1) |
| 08 | Contact card | Padding, postal line breaks, footer link removed |
| 09 | Tariff quote | Total label corrected |
| 10 | Spend summary | **Verified conformant, no changes** |
| 11 | Enquiry receipt | Eyebrow tracking, 390px reference size |
| 12 | Ops list header | Filter field height |
| 13 | Composer | Rebuilt as §3.2's single box with eight states |
| 14 | Turns, streaming, citations | Streaming cursor built, citation chip resized, `SourceEntry` rebuilt, grounding indicator and replace handler built |
| 16 | Structured blocks | `ProvenanceCard` built, chart data table fixed, two cards stripped of figures |
| 17 | Vessels and Flights | Screen rebuilt on real tables; **re-verified at screen level**, eight further defects found and fixed |
| 18 | Tariffs, two steps | Screen rebuilt; a date that printed a day early caught |
| 19 | Support | Screen rebuilt; four finished components had no caller |
| 20 | Console, health, admin | §6.7–6.12 built or rebuilt; §6.13 **not built** (§4.10) |
| 21 | Voice | Record button rebuilt from emoji; §6.16 wired; §6.17's paused drawn |
| 22 | Feedback matrix | Verification pass — three events answered twice, now once |

### The pattern worth carrying forward

Five consecutive boards found the same shape of defect: **a component that was
correct and a screen that was not.** `VesselCard`, `FlightCard`, the console's
three panels, `EmergencyStrip`, `ContactCard`, `ContactPointRow`,
`EnquiryReceipt`, `TranscriptionResult` — every one built to spec, tested, and
rendered by nothing. The suite passed throughout.

What closed it was rendering the **screen** in a test. `tests/operations.test.tsx`
now drives `/vessels`, `/flights`, `/tariffs`, `/support` and the console through
the real route tree, and `tests/matrix.test.tsx` scans the source for one event
answered twice. Anything added from here should get the same treatment: a
component test proves the component, and only a screen test proves the screen.

---

## 10. Milestone M1 — the assistant answers from real information

Plan of record: `docs/implementation-plan.md` §5, milestone M1. Tasks T-02,
T-01 + T-01a + T-01b (atomic), T-03, T-04.

**Nothing in this section is claimed without a `file:line` or a command whose
output was read.** Board work above this line was written against the handoff;
this was written against a running build.

### 10.1 What changed

| Task | Change | Evidence |
| --- | --- | --- |
| **T-02** | `KB_CSV_PATH` default pointed at `../data/knowledge/latest.csv`, **a file that does not exist** — a fresh checkout resolved to nothing and indexed nothing, silently. Now the delivered export. `backend/.env` deliberately untouched: it holds the API key, and a blank value there already means "use the default" | `backend/app/config.py:190-195`; `.env.example:84-93` |
| **T-01b** | **CLAUDE.md rule 3.** Five `confirmed` rows carry `source_url = https://pay.scaspa.com/`, and `source_url` is rendered as an `href` — so indexing them unchanged put a live payment link in front of a user. `redact_blocked_links` blanks it at ingest, reusing `settings.scraper_blocklist_set` so the host stays configured in one place. Rows stay indexed and answerable; only the link goes | `backend/app/rag/ingest.py:16-33, 127-190, 214-217`; `backend/app/config.py:207-208`; frontend already drew the null case at `frontend/src/components/chat/SourceEntry.tsx:29,59,153` |
| **T-01a** | The eval set was keyed to fixture ids `kb-001`–`kb-012`, **all twelve of which collide with real ids meaning something else** — fixture `kb-008` is the ferry fare, real `kb-008` is "Where is St. Kitts and Nevis?". Eleven ids and their `expected_facts` re-keyed together; scoring against the wrong row would have produced a number rather than nonsense | `evals/stress_test_sample.csv:15-44` |
| **T-01** | Index rebuilt from `scaspa_kb_2026-07-31.csv`. **115 rows indexed**, not the 116 the plan's gate stated — that figure came from a naive CSV read that skipped the loader. Four rows are rejected for `source_type: reference\|directory` (Wikipedia, findyello.com); one, `kb-045`, was `confirmed` | `data/index_meta.json`; `backend/app/rag/models.py:37` |
| **T-03** | `CATEGORIES` was five while the corpus uses ten. The missing five — `marine`, `payments`, `access`, `jobs`, `corporate` — cover 47 confirmed rows that no client could filter to and `classify_category` could never select. Widened, with decisive keywords added; `vacancy`/`vacancies`/`careers` moved from `general` to `jobs`, where they are unambiguous | `backend/app/schemas.py:23-46`; `backend/app/rag/rewrite.py:75-105`; `frontend/src/lib/types.ts:21-40`; `docs/api-contract.md:113,159` |
| **T-04** | Six of the eight opening chips asked for **live operational state** — Vessels in port, Arrivals today, Berth positions, Port advisories, Gate assignments, Cruise call times. Prompt rule 10 forbids answering any of them and the feeds are empty, so the highest-converting element on the landing page mostly produced a refusal on first tap. All eight re-pointed at `confirmed` rows, each annotated with the id it targets. `NARROWED_QUESTIONS` re-pointed too — a chip shown *after* a refusal that refuses again is the worst one in the product | `frontend/src/features/chat/suggestions.ts:26-56, 58-77` |

### 10.2 Gates — actual output

Backend, all three in CI (`.github/workflows/ci.yml`):

```
uv run ruff check .            All checks passed!
uv run ruff format --check .   81 files already formatted
uv run pytest                  569 passed, 1 warning in 7.31s
```

Frontend (`.github/workflows/frontend.yml`):

```
npm run build        ✓ built in 2.96s — entry 435.55 kB / 135.18 kB gzip
npm run lint         clean (--max-warnings 0)
npm run typecheck    clean (tsc --noEmit)
npm run test         824 passed (25 files)
npm run format:check FAILING — 39 files, ALL PRE-EXISTING
```

**`format:check` was red before M1 and is not fixed here.** No file M1 touched is
among the 39 (`npx prettier --check src/lib/types.ts
src/features/chat/suggestions.ts` passes). It is in CI, so frontend CI is failing
independently of this milestone — `docs/found-during-build.md` §5.

Milestone-specific:

```
index_meta gate   PASS  filename=scaspa_kb_2026-07-31.csv rows=115 rejected=4 version=2026-07-31
scripts/search.py "what time is the last ferry to Nevis"
                  hit@1 kb-192 @ 0.703 — a real confirmed row; top 5 all ferry
scripts/evaluate.py --label m1-real-kb
                  RETRIEVAL  hit@1 73%  hit@3 82%  hit@5 82%  MRR 0.773
                  ANSWERS    fact recall 50%  pass 60%
                  REFUSALS   false accept 20%  false refuse 10%
                  CITATIONS  cited 70%  hallucinated 0
```

**Read hit@1 as a smoke signal, not a quality bar** — 15 eval rows against 115
indexed is thin. A sharp drop is signal; a small delta is noise. There is no
prior figure to compare against: the previous baseline was scored against the
12-row fixture and, after the id collision, was measuring nothing.

Not run, and not claimed: `check:a11y` (not in CI; needs two unsaved
dependencies and a running backend — see §8), `check:responsive` (known not
green), `check:integration`.

### 10.3 Verified end to end against a running backend

```
/api/health            status=ok  index.ready=True  kb_rows=115  kb_version=2026-07-31
POST /api/chat category=marine     → HTTP 200          (T-03 reaches the wire)
POST /api/chat category=nonsense   → VALIDATION_ERROR  (the 422 still fires)
POST /api/chat "Can I pay SCASPA fees online?"
        → cites kb-225 with source_url ""   (T-01b: no link renders)
```

The seven operations endpoints were re-checked and are unchanged — `200` with
`source.kind=unavailable` on all of them. Populating those is M4; M1 touched
nothing on that path.

### 10.4 What M1 did not do

- `pay.scaspa.com` still appears **in prose** on `kb-075` and `kb-225`. Bare
  hostnames, so `remark-gfm` does not autolink them and nothing renders as an
  anchor — but the assistant will say the host aloud. Deliberate: whether it
  should route someone to a payment portal is SCASPA's policy decision, not a
  side effect of a CSV field.
- Eleven further findings are in `docs/found-during-build.md`, including two
  confirmed rows carrying named individuals' work email addresses, a
  refusal-policy question opened by `kb-143`, and the fact that **SCASPA
  publishes no fixed ferry timetable** — which is a gap in their information
  rather than a defect in ours, and the one most worth raising with them.
