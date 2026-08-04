# 04 — Structured blocks inside a chat turn

Screenshot: `18-structured-blocks.png` (see also `10-assistant-answer-card.png`)

Every block in this chapter is an operations payload, so **every one carries a meta strip**. Build them all as instances of one shared provenance-card component.

---

## 4.1 The provenance card

```
--surface-2; 1px solid --border; border-radius: 16px; overflow: hidden
```

**Meta strip** (always first child):
```
padding: 10px 16px            (10px 20px on wide cards)
background: --surface-3
border-bottom: 1px solid --border
display: flex; align-items: center; gap: 8–10px; flex-wrap: wrap
```
Contents in order: source-kind **provenance badge** · `source.label` at `500 12px/16px --text-2` · a 3px `--text-3` dot separator · `as_of` at `500 12px/16px --text-2` tabular, prefixed "as of" or "last known".

**Mandatory notice** (second child, present whenever `kind` is `fixture` or `unavailable`):
```
padding: 12px 16px
background: --caution-fill   (fixture)  |  --surface-3  (unavailable/none)
border-bottom: 1px solid --border
text: 400 13px/20px --text-1
```
`notice` is schema-enforced non-empty for those kinds. **Not dismissible. No close control.**

**Body slot** — table, chart, rows, whatever the payload is.

**Footer link slot** — optional, one only, per `02-shell-and-navigation.md` §2.5.

---

## 4.2 Chart block

Three chart types, 1 and 4 series, 1 and 40 points, categorical and numeric x-axis.

```
title:   600 16px/24px --text-1
subtitle: 400 13px/18px --text-2   (optional)
plot:    border-bottom: 1px solid --border
bars:    border-radius: 6px 6px 0 0
value labels above bars: 500 12px/16px --text-2, tabular
axis labels:              500 12px/16px --text-3, tabular
legend swatch: 10px × 10px, border-radius: 3px
legend label:  500 13px/18px --text-1
```

**Series palette** — `#5457BE` · `#3B9BD9` · `#3BA776` · `#D9A23B`.

These borrow the semantic hues, which is exactly why **a chart never shows a coloured mark without its legend label beside it**. In a chart those hues carry no status meaning.

| Variant | Notes |
|---|---|
| Bar, 1 series, categorical x | Container / Cruise / Cargo / Tanker. Bars `flex: 1`, `gap: 12–14px`, plot height 120–150px. |
| Line, 4 series, 40 points, numeric x | Dense fill, `gap: 1px`, left and bottom hairline axes, first and last x-values labelled only. Legend in a 2×2 grid. |
| Single point | **Keeps its axis and its caption.** Bar fixed at 56px wide. It must not collapse into a metric tile — a tile makes no provenance claim. |
| Narrow / phone | Legend stacks to one column; value labels drop below 6 bars; caption never truncates. |

### The caption — mandatory, never truncated, never collapsed

Last child of the card, always rendered:
```
padding: 12px 20px; border-top: 1px solid --border; background: --caution-fill
text: 400 13px/20px --text-1
```

> Illustrative figures from sample data. Not an official statistic of the Authority.

It is the only thing on the block that states whether the numbers are official. It is never behind a disclosure, never `text-overflow: ellipsis`, never a tooltip.

**The 4-series legend is BLOCKED but must be built.** The schema allows four; `make_chart` produces one today. The schema is the contract.

---

## 4.3 Chart data table

The accessible equivalent — **a real equivalent, not a fallback.** Always in the DOM. Same figures, same caption obligation.

```
header row: padding 12px 16px; border-bottom: 1px solid --border
            16px table glyph --brand-300 + 500 13px/18px --text-1 "Same figures as a table"
column head: 600 11px/16px uppercase 0.06em --text-3, padding 9px 16px
rows:        padding 9px 16px; border-bottom: 1px solid --border
             label 400 13px/20px --text-1 · value 500 13px/20px --text-1 tabular
caption:     identical to the chart's, same styling
```

Do not hide it behind a toggle that defaults to off.

---

## 4.4 Vessel arrivals card

Inline in a chat turn. **Maximum 3 rows.**

Meta strip + mandatory notice, then rows:
```
padding: 11px 16px; border-bottom: 1px solid --border
left:  name 500 13px/20px --text-1
       meta 500 12px/16px --text-3 tabular — "Berth 2 · 06:40"
right: status pill, 24px, flex: none
```

Then a count row — `padding: 10px 16px`, `500 12px/16px --text-2` tabular: **`Showing 3 of 12`**.
Then the footer link — "See all vessel movements".

### `total: 0` — the card still renders

Rows are replaced by a centred empty block, `padding: 28px 16px`, `gap: 8px`:

> **No vessel movements recorded for today**
> The record returned nothing for this date. It is not a fault.

`500 14px/22px --text-1` and `400 13px/20px --text-2`. The footer link stays.

**The card is kept so the meta strip is kept.** Dropping the block would silently lose the statement about where the emptiness came from.

### Fixture and unavailable

Driven entirely by the meta strip and notice. Rows are unchanged — nothing in a row ever indicates source.

---

## 4.5 Flight schedules card

Same shape, with a direction toggle and airline avatars.

**Direction toggle** — a 2-option segmented control in its own `padding: 10px 16px; border-bottom` row: **Arrivals / Departures**. Track `--surface-3`, segments 26px, `padding: 0 12px`, `border-radius: 8px`, selected `--brand-500` + white.

**Rows** — `padding: 11px 16px; gap: 10px`:
- **Airline avatar**, `26px × 26px; border-radius: 8px; flex: none`
  - With a code: `--border` background, `600 11px/16px --text-2`, the two-letter code (`LI`, `AA`, `BW`, `B6`).
  - **Without a code: `1px dashed --border`, 12px plane glyph `--text-3`.** Never invented initials.
- Line 1 `500 13px/20px --text-1` tabular — `LI 631 · Antigua`
- Line 2 `500 12px/16px --text-3` tabular — `Due 15:20 · Gate 4`, or `Due 16:05 · gate not reported`

**Gate: never "TBD".** "TBD" sounds like the Authority has decided and is withholding. Null gate reads "gate not reported".

---

## 4.6 Tariff calculator card

**Carries no figures at all — not even a prefilled quantity.**

`--surface-2`, `1px solid --border`, `border-radius: 16px`, `padding: 18px 20px`, `gap: 14px`.
16px receipt glyph `--brand-300` + `600 16px/24px --text-1` "Work out a charge".
Body `400 13px/20px --text-2`: "Open the calculator and enter your own figures. Nothing here is prefilled."
Two empty 36px fields showing placeholders only — "Container size", "Number of units".
Primary 38px button: "Open the calculator".

A prefilled quantity would read as a quote the Authority had made.

---

## 4.7 Support ticket card

`--surface-2`, `1px solid --border`, `border-radius: 16px`, `padding: 18px 20px`, `gap: 12px`.
16px headset glyph `--brand-300` + `600 16px/24px --text-1` "Send this to a department".

Field label `500 12px/16px --text-3`: **"Subject — drafted for you, edit before sending"**.
Field: 36px, `--surface-3`, **`1px solid --brand-500`** (it is focused and editable on arrival), value `400 13px/18px --text-1` with a `--brand-200` caret — "Berthing window for MV Vega Sirius".

Secondary 38px button, `1px solid --border`: "Continue to the form".

The subject is model-written. It is presented as a draft the user edits, never as a fixed value they merely confirm.
