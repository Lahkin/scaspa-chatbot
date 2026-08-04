# 07 — Feedback and cross-cutting states

Screenshot: `24-feedback-matrix.png`

One grid, so the same event never gets two treatments across screens. Build these as shared components and reference them everywhere; do not re-solve "empty table" per screen.

---

## 7.1 Error envelopes

Eight codes, eight distinct copies. Full table in `03-chat.md` §3.11.

Rendering shell: `padding: 12px 14px; border-radius: 12px; gap: 12px`, code at `600 12px/20px` tabular in the leading slot, body `400 13px/20px --text-2`.
Fill: `--caution-fill` for 4xx, `--critical-fill` for 5xx. Code colour `--caution` / `--critical-text`.

**Every error is followed by the escalation block** (`03-chat.md` §3.10).

---

## 7.2 Rate-limit countdowns — three, each naming the action it blocks

Ring: `background: conic-gradient(--brand-400 0deg <angle>, --border <angle> 360deg)`, inner circle in the container surface. 40px/30px in a card, 34px/26px in a list.

| Scope | Limit | Copy |
|---|---|---|
| Chat | 15 a minute | `Send again in 0:42` |
| Voice | 5 a minute | `Record again in 0:26` |
| Operations | 60 a minute | `Refresh in 0:18` |

Label `500 13px/18px --text-1` tabular, sub-line `500 12px/16px --text-2` tabular.

**The ring is drawn from `Retry-After`.** There is no remaining-quota figure anywhere in the product — `Decision.remaining` is computed by the backend and dropped. Do not build a "questions remaining this minute" counter or a quota meter.

---

## 7.3 Mandatory notices — six, none dismissible

| # | Notice | Where |
|---|---|---|
| 1 | Sample data on an operations screen | Every fixture-sourced provenance card and banner |
| 2 | No feed connected | Every unavailable/none-sourced card and banner |
| 3 | Chart caption — official or illustrative | Every chart block and chart data table |
| 4 | Quote disclaimer | Every tariff quote, every variant |
| 5 | Demonstration profile | Sidebar bottom row, operator profile card |
| 6 | Spend is an estimate, not a bill | Spend summary and breakdown |

**No close control, no "don't show again", no collapse, no truncation, no tooltip.** Each renders as prominently as the thing it qualifies. Notices 1 and 2 are schema-enforced non-empty by the backend; the client must not have a code path that omits them.

---

## 7.4 Empty states — five, each naming the next action

| State | Heading | Next action |
|---|---|---|
| No results for these filters | No movements match these filters | → Clear filters (primary button + the filters named as removable chips) |
| No feed connected | No vessel feed is connected | → Telephone 869 465 8121 |
| Nothing recorded for today | No vessel movements recorded for today | → Try another date |
| No positions reported | No positions are being reported | → Normal. No AIS is connected. |
| **No advisory published** | No notice has been published to this assistant | → **Not an all-clear. Telephone before sailing.** |

The last one is the **only empty state rendered in `--caution-fill`**; the rest are neutral. A quiet advisory screen read as safety has physical consequences.

An empty state that does not name a next action is a bug.

---

## 7.5 Loading states — five

| State | Treatment |
|---|---|
| **Skeleton table** | Column headers stay so the shape is stable. Rows keep their real height (44px/36px); cells become 9–10px bars, `border-radius: 5px`, `--surface-3`, at 50–80% widths. |
| **Streaming tokens** | Text renders progressively; cursor `8px × 16px`, `--brand-200`, `vertical-align: -3px`. Citation markers stay raw. |
| **Inline button spinner** | 12px circle, `2px solid rgba(255,255,255,0.35)` with `border-top-color: #FFFFFF`, inside a `--brand-600` button. Label changes to the present participle — "Sending". |
| **Tool running** | 6px `--brand-200` dot + `500 13px/18px --brand-200` "`build_quote` running", row tinted `rgba(56,58,151,0.12)`. |
| **Progressive rows** | `500 13px/18px --text-2` tabular — "12 of 25 loaded". |

Under `prefers-reduced-motion: reduce`: no pulse, no blink, no spin. The live region carries the state instead. **No layout shift in any loading state** — the skeleton occupies the real row height, and the spinner replaces the icon slot rather than widening the button.

---

## 7.6 Copy toast

`padding: 12px 16px; border-radius: 12px; --surface-3; 1px solid --border; gap: 10px`
20px `--positive-fill` tile, `border-radius: 6px`, with a 12px check `--positive` · `500 13px/18px --text-1` "Copied to the clipboard".

Dismisses on a timer. The originating ghost icon button simultaneously enters its **Copied** state (`01-foundations.md` §1.3).

---

## 7.7 Screen-reader announcer

- **Polite region** announces "answering", then the **settled answer once** — never token by token.
- **Assertive region** for errors, rate limits and **source-kind changes**. A card silently switching from live to fixture must be announced.
- Loading states announce their label, not their animation.
- Under reduced motion the announcer carries the state that the cursor, skeleton and spinner would otherwise convey.
- The chart data table is a real table in the DOM; do not `aria-hidden` the chart and duplicate it, and do not hide the table behind a toggle.
