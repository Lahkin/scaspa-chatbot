# 05 — Operations: Vessels, Flights, Tariffs

Screenshots: `19-vessels-and-flights.png`, `20-tariffs.png`, `12-status-chips.png`, `13-contact-card-and-tariff-quote.png`, `25-responsive-390.png`

Six of the nine screens in this product are dense operational tables. **Extend the chat language rather than switching to a generic data-grid look** — row height, hairline weight and hover fill all derive from the sidebar's nav-row treatment, so the tables read as the same product.

---

## 5.1 Table primitives

```
container:   --surface-2; 1px solid --border; border-radius: 16px; overflow: hidden
toolbar row: padding 12px 20px; border-bottom: 1px solid --border; gap 10px; flex-wrap
column head: padding 10px 20px; border-bottom: 1px solid --border
             600 11px/16px uppercase 0.06em --text-3
row:         padding 0 20px; border-bottom: 1px solid --border
             height 44px comfortable  /  36px compact
cell:        400 13px/20px --text-2   (first column 500 --text-1)
row hover:   background --surface-3
numbers:     tabular, always
```

**Density toggle** on Vessels and Flights: 2-option segmented control in the toolbar, right-aligned, 26px segments — **Comfortable / Compact**.

Use real `<table>` semantics.

---

## 5.2 Source notice banner — three kinds

Sits above the metric tiles, full width. `padding: 14px 20px; border-radius: 12px; gap: 14px`.
Provenance badge (`flex: none`) · message `400 14px/22px --text-1` (`flex: 1`) · timestamp `500 12px/16px --text-2` tabular (`flex: none`).

| Kind | Background | Border | Message | Dismiss |
|---|---|---|---|---|
| `fixture` | `--caution-fill` | `1px solid rgba(217,162,59,0.3)` | These vessel movements are sample data loaded for testing. Do not quote them to a customer or plan a call around them. | **None** |
| `none` / `unavailable` | `--surface-3` | `1px solid --border` | No live feed is connected to this assistant. The times below were last recorded at 06:10 and may have changed since. | **None** |
| `live` | `--info-fill` | `1px solid rgba(59,155,217,0.3)` | Refreshed from the port feed at 14:32 AST. | 28px x button |

**Only the live banner carries a dismiss control, and live is the one kind that cannot currently occur.** A notice that says the data is not real must outlive the user's patience with it.

---

## 5.3 Metric tiles

`--surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px; gap: 8px`
Label `500 12px/16px --text-2` · value `600 30px/38px --text-1` tabular.

**Vessels — four tiles**

| Tile | Value | Notes |
|---|---|---|
| Vessels in port | `4` | |
| Expected today | `7` | |
| Berth occupancy | **`—`** `--text-3`, with `500 12px/16px --text-3` "not reported" beneath | The feed does not report it |
| Alongside of expected | `4` `--text-1` + `/ 11` in `500 20px/28px --text-3` | Ratio: numerator prominent, denominator recessive |

**Flights — three tiles**: Arrivals today · Departures today · Delayed. Same rules; any null takes the em-dash treatment.

**Rendering 0 in the occupancy tile would say the port is empty. That is the single most dangerous default in the product.** Route every numeric cell through one `renderValue` helper that maps null to the em dash; never `?? 0`.

---

## 5.4 Vessels table

Columns: **Vessel · Type · Berth · ETA · ATA · Status** at `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr`.

Toolbar: 240px search ("Vessel name or IMO") · status filter select ("All statuses") · spacer · density toggle.

### ETA / ATA — all four combinations

**One is a prediction, one is a record. That distinction is the entire point of having two fields.**

```
ETA present:  400 13px/20px --text-3, font-style: italic, prefixed "~"   →  ~11:15
ATA present:  500 13px/20px --text-1, upright                            →  06:40
either null:  400 13px/20px --text-3                                     →  —
```

| ETA | ATA | Means |
|---|---|---|
| `~11:15` | `—` | Predicted only. It has not happened. |
| `~06:30` | `06:40` | Both. The record is upright and full strength; the prediction recedes. |
| `—` | `05:55` | Arrived unannounced. No ETA was ever filed. |
| `—` | `—` | Neither reported. Two em dashes, no guess. |

### Status column

Vessel status pills, 24px in-cell variant. Five values — expected · en route · alongside · departed · **not reported** (the `unknown` enum). Spec in `01-foundations.md` §1.2 Family B.

`departed` is settled and closed — a fact, not an alert — so it takes no status hue.

---

## 5.5 Flights table

Columns: **Flight · From/To · Due · Status** (plus Gate and Airline where width allows). Direction toggle in the toolbar: Arrivals / Departures.

### Time cell with a revision

When a scheduled time is superseded:
```
scheduled: 400 13px/20px --text-3, text-decoration: line-through
revised:   500 13px/20px --caution
gap: 10px, both tabular
```
→ ~~`16:40`~~ `17:25`

### Gate cell

| Value | Rendering |
|---|---|
| Assigned | `Gate 4`, `500 13px/20px --text-1` tabular |
| `null` | `not reported`, `400 13px/20px --text-3` |

**Never "TBD"** — it sounds like the Authority has decided and is withholding.

### Airline avatar

`26px × 26px; border-radius: 8px`. With a code: `--border` fill, `600 11px/16px --text-2`. Without: `1px dashed --border` + 12px plane glyph `--text-3`. Never invented initials.

### Status column

Six values — scheduled · boarding · landed · arrived · delayed · cancelled. **`landed` and `arrived` differ by glyph and label, never by hue.**

---

## 5.6 Operational advisory panel

Passthrough only. **The assistant never authors an advisory**, and the panel never implies a forecast this service produced.

| Fill | Treatment |
|---|---|
| Full | `padding: 12px 14px; border-radius: 12px; --caution-fill; 1px solid rgba(217,162,59,0.3)`; 16px megaphone `--caution`; attribution line `500 13px/18px --caution` — **"Published by Marine Operations, 05:40 AST"**; body `400 13px/20px --text-2` |
| Partial | `--surface-3`, `1px solid --border`, 16px megaphone `--text-3`, `400 13px/20px --text-2` — "One notice was published today. Earlier notices are not retained by this assistant." |
| Entirely absent | **Panel not rendered.** No empty container, no "no advisories" line in this position — that case belongs to the advisory *list* on the Console (see `06-support-console-voice.md` §6.2), where it gets the deliberate not-an-all-clear treatment. |

Always attributed to whoever published it, with a time.

---

## 5.7 Table states

| State | Treatment |
|---|---|
| Populated | As above |
| **Empty — no feed connected** | Card, `padding: 32px 24px`, left-aligned. `NO FEED` provenance badge · `600 16px/24px --text-1` "No vessel feed is connected" · `400 13px/20px --text-2` "This assistant has no source of vessel movements at the moment. Telephone Marine Operations on 869 465 8121." |
| **Empty — filtered out** | 20px filter glyph `--brand-300` · `600 16px/24px --text-1` "No movements match these filters" · the active filters as removable chips · primary "Clear filters" button |
| **Loading** | Skeleton. **Column headers stay** so the shape is stable. Rows keep their 44px height; cells become 9–10px bars, `border-radius: 5px`, `--surface-3`, at 50–80% widths. No pulse under `prefers-reduced-motion`. |
| **429** | Card with a 20px clock glyph `--caution` · `600 16px/24px --text-1` "Too many requests" · `400 13px/20px --text-2` "Sixty a minute is the limit on operations data." · disabled retry showing `Refresh in 0:18` |

The two empty states are **distinct on purpose**: one is about the source, one is about the query. They lead to different actions.

---

## 5.8 Mobile row cards — ≤640px

Every table row becomes a card:
```
--surface-2; 1px solid --border; border-radius: 16px; padding: 14px 16px; gap: 10px
top row:  title 500 14px/22px --text-1  ·  status pill top-right, flex: none
grid:     2 columns, gap 8px
          label 500 12px/16px --text-3  /  value per the ETA-ATA rules above
```

**Status keeps the top-right corner** so a column of cards is still scannable.

---

## 5.9 Tariffs — step 1, the published table

Meta strip carries `Port tariff schedule 2026` and `as of 1 Apr 2026`.

Toolbar: 280px search ("Search code or description"), then **category chips**.

**Category chips are computed from the whole table, not from the filtered rows.** Selecting "Cargo" must never make the other four vanish and strand the user. Five categories: Cargo · Vessel dues · Storage · Passenger · Security.

Columns: **Code · Charge · Rate · Source** at `0.8fr 2fr 1fr 1.1fr`, rows 44px.

| Column | Style | Rule |
|---|---|---|
| Code | `500 13px/20px --text-1` tabular | `WHF-40`, `TON-GT`, `STO-D`, `SEC-C` |
| Charge | `400 13px/20px --text-2` | Full published description |
| Rate | `500 13px/20px --text-1` tabular | **Rendered exactly as published** — `186.00 per container`, `0.42`, `37.50 per day`. No rounding, no conversion, no normalised unit column. |
| Source | link + badges | Citation link `500 13px/20px --brand-200` + verified-date badge |

**Source cell null cases:**
- `verified_date` empty → `NO CHECK DATE` dashed badge beside the link.
- `kb_id: null` → **no link at all**; the cell reads `No source recorded` in `400 13px/20px --text-3`. Never a link to nowhere.

Pagination: `Showing 1–100 of 100` — the single-page collapse, readout only, no arrows.

---

## 5.10 Tariffs — step 2, two calculators

**Two visually distinct forms.** A user must never fill in the wrong one by muscle memory.

| | Maritime charges | Cargo charges |
|---|---|---|
| Surface | `--surface-2` | `--surface-3` |
| Icon tile | 28px, `rgba(56,58,151,0.35)`, ship glyph `--brand-200` | 28px, `--border`, receipt glyph `--brand-300` |
| Fields | Vessel type (select) · Length `0–2000` ft · Stay `0–365` days | Container size (2-option segmented, 20ft / 40ft) · Units `0–10,000` · Storage `0–365` days |
| Inner field bg | `--surface-3` | `--surface-2` |

**Currency is a fixed label, not a select.** `height: 32px; padding: 0 12px; --canvas; 1px dashed --border; border-radius: 10px`, value `500 13px/18px --text-2` tabular `XCD`, with an inline note `500 12px/16px --text-3`: "A label, not a selector — the schedule is published in XCD only".

---

## 5.11 Tariff quote

Meta strip carries the **`CALCULATED`** provenance badge (`--brand-400`, chart glyph) plus `from the 2026 schedule`. The derived badge is always on.

**Line items** — `padding: 12px 0; border-top: 1px solid --border` inside a `padding: 0 20–24px` body:
```
label:          500 14px/22px --text-1
quantity_label: 500 12px/16px --text-3, tabular  — "12 containers at 186.00"
amount:         500 14px/22px --text-1, tabular, right
```

**Subtotal and total are separate rows even when they are equal**, so a future surcharge line has a place to land without a redesign.
- Subtotal row: `padding: 12px 0`, both sides `500 14px/22px --text-2`.
- Total block: `padding: 14–16px 20–24px; border-top: 1px solid --border; background: --surface-3`; label `600 16px/24px --text-1`; amount `600 20px/28px --text-1` tabular, prefixed `XCD`.

**Disclaimer** — last child, always visible:
```
padding: 12px 20–24px; border-top: 1px solid --border; background: --caution-fill
400 13px/20px --text-1
```
> An estimate worked out from the published schedule. It is not an invoice and the Authority confirms all charges on billing.

Never collapsed, never truncated, never behind a tooltip.

### Line-count variants

| Variant | Treatment |
|---|---|
| Several lines | As above. `kb_id: null` on a line shows "no source recorded" in the quantity line. |
| One line | Identical structure — subtotal and total rows both present. |
| **Zero lines** | **No total is shown at all.** Card reads `600 16px/24px --text-1` "Nothing to charge for those figures" + `400 13px/20px --text-2` "No published charge applies to this combination. Change the figures, or telephone Finance and Billing on 869 465 8121." **`XCD 0.00` would read as free**, and prices default to zero until configured. |

### Unpriced code · **BLOCKED**

When a code the calculator expects is missing from the table, **the line still appears**:
```
label:  500 14px/22px --text-1
sub:    500 12px/16px --text-3 — "code BTH-18 is not in the table"
right:  status pill, 24px, --critical-fill, 6px --critical dot,
        500 12px/16px --critical-text — "Not priced"
```

A critical banner sits **above** the total: `padding: 12px 14px; border-radius: 12px; --critical-fill; 1px solid rgba(217,86,75,0.35)`, 16px alert `--critical-text`:

> **This quote is incomplete**
> Berthage has no published rate, so the total below is less than the amount payable. Call Marine Operations before quoting it to a customer.

And the total block changes:
- Label becomes **"Total so far"**, with `500 12px/16px --critical-text` "1 charge missing" beneath it.
- The amount is unchanged in styling.

**Needs `unpriced: list[str]` on `TariffQuote`.** `build_quote` computes unpriced codes and discards them, so today the total silently loses its largest component and returns a clean-looking figure. The standard "confirmed on invoice" disclaimer does not cover a total that is wrong by a whole charge. The word "Total" changes to "Total so far" **only when the flag is present** — do not infer it by string-matching.

---

## 5.12 Status chip enumerations — reference

Full spec in `01-foundations.md` §1.2. Anatomy, for the record:

```
26px tall · 12px side padding · full pill
7px dot · 7px gap · 12/16 medium label
fill at 12% (where used) · dot and label at full strength
```

**Three of the nine values never appear in current test data** — `VesselStatus.departed`, `VesselStatus.unknown`, `FlightStatus.arrived`. They are drawn at full fidelity because production will produce them, and **a chip that has never been rendered is a chip nobody has checked**.

`unknown` gets a genuine empty treatment, not a guess: hollow dot, em dash where a value would be, dashed outline instead of a fill, no status hue. Rendering it as "Expected" or leaving the cell blank would both be inventions.
