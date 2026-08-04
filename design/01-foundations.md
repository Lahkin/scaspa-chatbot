# 01 — Foundations

Screenshots: `02-foundations-tokens-type-seal.png`, `04-badge-families.png`, `05-buttons-and-inputs.png`

---

## 1.1 The seal

Dark blue circular line art on a transparent background. It will vanish on a dark surface, so it is **always** placed on a white circular plate.

| Context | Plate | Seal | Notes |
|---|---|---|---|
| Sidebar lockup | 40px circle, `#FFFFFF` | 32px | Wordmark beside it |
| Compact — widget header, 404 header, mobile header | 32px circle, `#FFFFFF` | 24px | |

Plate: `border-radius: 999px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; flex: none`.

**Never** recolour, outline, crop, apply a filter to, or knock the seal out to white. Never place it directly on a dark surface. Never use it without the plate at any size.

**Wordmark:** the string is `SCASPA Assistant`, set at `600 15px/20px`, `--text-1`, `white-space: nowrap`. Gap between plate and wordmark: 8px.

---

## 1.2 Badge system

There are **nine enum families and about forty-five variants**. One brand hue cannot carry that; colour alone collapses into "blue means five different things".

**Each family gets its own container shape. Hue carries severity within the family.** Build these as three separate components — `ProvenanceBadge`, `StatusPill`, `FilterChip` — not one component with a variant prop.

### Family A — Provenance (loudest)

Filled, icon-led, uppercase. Provenance outranks operational status visually, because a wrong status is a mistake and a wrong source is a lie.

```
height: 22px
padding: 0 8px
border-radius: 999px
background: <full-strength semantic hue>
gap: 6px
icon: 12px
label: 600 11px/16px, text-transform: uppercase, letter-spacing: 0.04em
```

Label/icon colour on the fill: `#22245E` on caution, `#0A0B14` on info / positive / neutral, `#FFFFFF` on brand-400/500, `#A3A8C0` on the `--border` fill.

| Enum | Variant | Fill | Glyph | Label |
|---|---|---|---|---|
| `source.kind` | live | `--info` | lightning | `LIVE FEED` |
| | fixture | `--caution` | alert | `SAMPLE DATA` |
| | none | `--neutral` | x | `NO FEED` |
| | unavailable | `--border` | info | `NOT CONNECTED` |
| `reported_by` | ais | `--info` | lightning | `AIS` |
| | operator | `--brand-400` | headset | `OPERATOR` |
| | estimated | transparent, `1px dashed --caution` | chart | `ESTIMATED` (label `--caution`) |
| `volatility` | static | `--border` | — | `STATIC` |
| | low | `--positive` | — | `RARELY CHANGES` |
| | medium | `--caution` | — | `CHANGES OFTEN` |
| | high | `--critical` | — | `CHECK BEFORE USE` |
| | **null** | `--caution` + `0 0 0 1px #D9A23B, 0 0 0 3px rgba(217,162,59,0.25)` | — | `CHANGES OFTEN` |
| `grounding` | grounded | `--positive` | check | `ALL CITED` |
| | partial | `--caution` | alert | `PARTLY CITED` |
| | ungrounded | `--critical` | x | `NO SOURCE` |
| | unverified | `--border` | info | `NOT CHECKED` |
| `derived` | true | `--brand-400` | chart | `CALCULATED` |
| `demo` | true | `--caution` | — | `DEMO ONLY` (short form `DEMO`, 18px tall, `--r-tiny`, in the sidebar row) |
| `verified_date` | present | `--border` | — | `CHECKED 1 APR 2026` |
| | empty | transparent, `1px dashed --text-3` | — | `NO CHECK DATE` |

**`volatility: null` renders as the cautious case — "changes often" — never as static or low.** It carries the extra ring so a reviewer can see the fallback fired.

### Family B — Operational status (quieter)

Outline pill with a leading dot. Sits in table cells by the hundred, so it must not shout.

```
height: 26px            (24px inside table cells and inline cards)
padding: 0 12px         (0 10px in cells)
border-radius: 999px
border: 1px solid <hue at 45%>       — or 1px solid --border for neutral
background: transparent               — or the 12% tint where noted
gap: 7px                (6px in cells)
dot: 7px circle         (6px in cells)
label: 500 12px/16px
```

| Enum | Variant | Border | Dot | Label colour |
|---|---|---|---|---|
| Vessel (5) | expected | caution 45% | `--caution` solid | `--caution` |
| | en route | info 45% | `--info` solid | `--info` |
| | alongside | positive 45% | `--positive` solid | `--positive` |
| | departed | `--border` | `--neutral` solid | `--text-2` |
| | unknown / not reported | `1px dashed --text-3` | 6–7px, `1.5px solid --text-3`, hollow | `--text-2` |
| Flight (6) | scheduled | `--border` | `--neutral` solid | `--text-2` |
| | boarding | info 45% | `--info` solid | `--info` |
| | landed | positive 45% | **arrow-to-line glyph 12px** | `--positive` |
| | arrived | positive 45% | **check glyph 12px** | `--positive` |
| | delayed | caution 45% | `--caution` solid | `--caution` |
| | cancelled | critical 45% | **x glyph 12px** | `--critical-text` |
| Gate (4) | open | positive 45% | `--positive` | `--positive` |
| | boarding | info 45% | `--info` | `--info` |
| | closed | `--border` | `--neutral` | `--text-2` |
| | unassigned | `1px dashed --text-3` | hollow | `--text-2` |
| Severity (3) | notice | info 45% | info glyph | `--info` |
| | warning | caution 45% | alert glyph | `--caution` |
| | urgent | critical 45% + `--critical-fill` background | alert glyph | `--critical-text` |
| Health (2) | ok | positive 45% | `--positive` | `--positive` |
| | degraded | caution 45% | `--caution` | `--caution` |

**Two pairs that will collapse into each other unless you follow this exactly:**

- **`landed` vs `arrived`** — wheels-down vs at-stand. Same hue, different glyph and different label. `Landed · wheels down` and `Arrived · at stand` in the enumeration; bare `Landed` / `Arrived` in table cells where the column header supplies context.
- **`unknown` (vessel) vs `not reported` (speed, gate, heading)** — both mean "no one told us", which is not zero, not empty and not stationary. Dashed container, hollow dot, `--text-2` label. Never a solid dot, never a hue.

Greyscale proof: board 00c renders landed / arrived / not reported / cancelled under `filter: grayscale(1)`. All four remain distinguishable. Any new variant must pass the same test.

### Family C — Filter and category chips

Ghost pill with a real interactive affordance. Taller than a status pill so it never reads as one in the same row.

```
height: 28px
padding: 0 14px          (0 12px when a 12px check glyph leads)
border-radius: 999px
label: 500 13px/18px
```

| State | Background | Border | Label |
|---|---|---|---|
| Default | `--surface-3` | `1px solid --border` | `--text-2` |
| Hover | `--border` | `1px solid --border` | `--text-1` |
| Focus-visible | unchanged | unchanged | + focus ring |
| Selected | `--brand-500` | none | `#FFFFFF`, leading 12px check |
| Disabled | `--surface-3` | `1px solid --surface-3` | `--text-3` |

Suggestion chips in the composer area are a related but distinct control: **34px tall, `--surface-2` background, `1px solid --border`, `padding: 0 14px`, 14px leading icon in `--brand-300`, label `500 13px/18px --text-1`, gap 8px.** Laid out in two wrapping rows with `gap: 8px`.

---

## 1.3 Buttons — six types × five states

Every interactive control shows the `--brand-200` focus ring on `:focus-visible`. The inner 2px of the ring is the element's own background.

### Primary action
`height: 40px; padding: 0 18px; border-radius: 10px; font: 500 14px/22px`

| State | Background | Label |
|---|---|---|
| Default | `--brand-500` | `#FFFFFF` |
| Hover | `--brand-600` | `#FFFFFF` |
| Focus-visible | `--brand-500` + ring | `#FFFFFF` |
| Pressed | `--brand-700` | `#FFFFFF` |
| Disabled | `--surface-3`, `1px solid --border` | `--text-3` |

### Icon button
`36px × 36px; border-radius: 10px; icon 16px` (44px at ≤640px)

| State | Background | Border | Icon |
|---|---|---|---|
| Default | transparent | `1px solid --border` | `--text-2` |
| Hover | `--surface-3` | `1px solid --border` | `--text-1` |
| Focus-visible | transparent + ring | `1px solid --border` | `--text-1` |
| Pressed | `--border` | `1px solid --border` | `--text-1` |
| Disabled | transparent | `1px solid --surface-3` | `--text-3` |

### Ghost icon button (message actions)
`28px × 28px; border-radius: 8px; icon 16px; no border` (44px, icon 18px, at ≤640px)

| State | Background | Icon |
|---|---|---|
| Default | transparent | `--text-3` |
| Hover | `--surface-3` | `--text-1` |
| Focus-visible | transparent + ring | `--text-1` |
| Pressed | `--border` | `--text-1` |
| Copied | `--positive-fill` | `--positive`, glyph swaps to check |
| Selected (thumb) | `--brand-selected` | `--brand-200` |

Row order: copy, edit, thumbs up, thumbs down, regenerate, speak. Gap 4px. Thumbs-down is the thumb glyph at `rotate(180deg)`.

### Tap to call
`height: 44px at every breakpoint; padding: 0 16px; border-radius: 10px; gap: 10px; icon 16px; number 500 14px/22px tabular`

| State | Background | Border | Content |
|---|---|---|---|
| Default | transparent | `1px solid --border` | `--brand-200` |
| Hover | `--surface-3` | `1px solid --brand-500` | `--brand-100` |
| Focus-visible | transparent + ring | `1px solid --border` | `--brand-100` |
| Pressed | `--border` | `1px solid --border` | `--brand-300` |
| Disabled | **never** | | The number is always dialable |

### Link out
Inline, no container. `500 14px/22px`, trailing 14–16px chevron.

| State | Colour | Extra |
|---|---|---|
| Default | `--brand-200` | |
| Hover | `--brand-100` | `underline`, `text-underline-offset: 3px`, chevron `translateX(3px)` |
| Focus-visible | `--brand-100` | ring on a 8px-radius 2px/6px inset box |
| Pressed | `--brand-300` | chevron stays at `translateX(3px)` |
| Disabled | `--text-3` | no underline, no motion |

### Retry (with countdown)
`height: 40px; padding: 0 18px; border-radius: 10px; 1px solid --border; gap: 8px; icon 16px`

Default/hover/focus/pressed follow the icon-button pattern with a `500 14px/22px --text-1` label reading **"Try again"**.
Disabled state is the countdown: `--surface-3` background, `1px solid --border`, `--text-3`, clock glyph, label **"Try again in 0:42"** (tabular). Re-enables at zero.

### Expand / collapse
`height: 32px; padding: 0 12px; border-radius: 10px; gap: 8px; leading 16px chevron; label 500 13px/18px tabular`
Default `--text-2` on transparent · hover `--surface-3` + `--text-1` · focus ring · pressed `--border` with the chevron at `rotate(180deg)` · disabled `--text-3` with the label "No tools ran".

---

## 1.4 Inputs — nine types

All inputs: `background: --surface-3; border: 1px solid --border; border-radius: 12px; height: 40px` (38px inside cards, 36px in toolbars); `padding: 0 12px`; value `400 14px/22px --text-1`; placeholder `--text-3`. Field label above at `500 13px/18px --text-1`, 8px gap. Focus adds `border-color: --brand-500` plus the ring.

| # | Type | Spec |
|---|---|---|
| 1 | **Text with counter** | Counter bottom-right, `500 12px/16px --text-3`, tabular, `n/200`. At the limit: border `--caution`, counter and helper `--caution`, helper reads "200 characters is the maximum". Over the limit: border `--critical`, counter `--critical-text`, helper "Remove 38 characters to send", overflow span highlighted `rgba(217,86,75,0.22)` with a `1px solid --critical` bottom edge. |
| 2 | **Textarea, 4000** | `height: 88px` minimum, `padding: 10px 12px`, counter `0/4000` bottom-right. |
| 3 | **Search** | Leading 16px search glyph `--text-3`, gap 10px. Placeholder names the field: "Search vessel name or IMO", "Search code or description". |
| 4 | **Filter select** | Value `--text-1`, trailing 16px chevron `--text-2`. Closed value defaults to "All statuses". |
| 5 | **Numeric with range** | Fixed 120px width for the input, unit label beside it at `500 13px/18px --text-2`, range hint at `500 12px/16px --text-3` tabular — `0–2000`, `0–365`, `0–10,000`. |
| 6 | **Segmented, 2 options** | Track `--surface-3`, `1px solid --border`, `border-radius: 12px`, `padding: 3px`. Segment `height: 32px; padding: 0 16px; border-radius: 9px`. Selected `--brand-500` + `#FFFFFF`; unselected `--text-2`. |
| 7 | **Segmented, 4 options** | As above, `padding: 0 14px` per segment. |
| 8 | **Checkbox with consequence text** | Row `padding: 14px`, `--surface-3`, `1px solid --border`, `border-radius: 12px`. Box `18px`, `border-radius: 5px`; unchecked `1px solid --border`; checked `--brand-500` with a 12px white check. Title `500 13px/18px --text-1`; **consequence line `400 13px/20px --text-2` stating what actually happens** — "The department will be able to read every question and answer in this session." |
| 9 | **Read-only locked field** | `--canvas` background, `1px dashed --border`, value `500 14px/22px --text-2`. Used for the XCD currency label. Carries an inline note: "Fixed — not a currency selector". Not focusable, not a select, no chevron. |

**Department select (7 options)** — the open state. Menu `--surface-3`, `1px solid --border`, `border-radius: 12px`, `padding: 4px`. Option rows `height: 34px; padding: 0 10px; border-radius: 9px`, `500 13px/18px`. Selected/highlighted row `--border` background with `--text-1`; others `--text-2`.

Options, in this order:
1. Marine Operations
2. Airport Operations
3. Cargo and Warehousing
4. Finance and Billing
5. Security
6. Cruise and Port Zante
7. General enquiries
