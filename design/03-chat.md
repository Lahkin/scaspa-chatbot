# 03 — Chat

Screenshots: `10-assistant-answer-card.png`, `15-composer-states.png`, `16-turns-streaming-trace.png`, `17-refusals-and-errors.png`

---

## 3.1 Turn pattern

**User turns** — right-aligned tinted bubble.
`max-width: 74–76% (82% when carrying a neutralisation note); padding: 12px 16px; border-radius: 16px; background: rgba(56,58,151,0.32); border: 1px solid --brand-500`; text `400 14px/22px --text-1`.

**Assistant turns** — flush left, `400 14px/22px --text-1`, **no bubble, no border, no background**. Followed by the ghost icon-button row (`01-foundations.md` §1.3).

Turn spacing 24px. The card is the only bounded thing in the column, so **a card always means structured data behind it**.

### Injection-neutralised user turn

When the backend replaces instruction-like spans, the bubble shows the replacement inline, in position:

```
inline pill: padding 1px 8px; border-radius 999px;
             --caution-fill; 1px dashed rgba(217,162,59,0.5);
             500 12px/18px --caution
label: instruction-like text removed
```

Directly beneath the bubble, right-aligned, max 82%, an explanatory note: `padding: 10px 12px; border-radius: 12px; --caution-fill; 1px solid rgba(217,162,59,0.3)`, 14px shield glyph, `400 13px/20px --text-2`:

> Part of your message looked like an instruction to the assistant, so it was not passed on. Your question was sent as written otherwise.

**The user's own words changed on screen.** That needs explaining in place, not in a tooltip, and the removed span keeps its position in the sentence so they can see exactly what went.

---

## 3.2 Composer — eight states

Base: `--surface-3`, `1px solid --border`, `border-radius: 12px`, `padding: 16px 16px 12px`, `gap: 16px`. Limit **1000 characters**. Counter `500 12px/16px` tabular, in the control row.

**Send is blocked, never hidden.** A missing button gives the user nothing to reason about.

| # | State | Border | Field | Control row | Send |
|---|---|---|---|---|---|
| 1 | Empty | `--border` | placeholder `--text-3`: "Ask about a vessel, a flight, a tariff or a department…" | attach · spacer · mic | `--surface-3` + `1px solid --border`, arrow `--text-3` — inert |
| 2 | Typing | `--brand-500` | value `--text-1` + caret `--brand-200` | attach · spacer · `42/1000` `--text-3` · mic | `--brand-500`, white arrow |
| 3 | At the limit | `--caution` | value `--text-1` | helper `--caution` "1000 characters is the maximum" · `1000/1000` `--caution` | `--brand-500` — **still sendable** |
| 4 | Over the limit | `--critical` | overflow span highlighted `rgba(217,86,75,0.22)` with a `1px solid --critical` underline | helper `--critical-text` "Remove 38 characters to send" · `1038/1000` `--critical-text` | inert |
| 5 | Whitespace only | `--border` | whitespace + caret | `4/1000` `--text-3` | inert |
| 6 | Disabled while streaming | `--border` | "Answering…" `--text-3` | attach disabled | **Replaced by a Stop control**: 32px pill, `1px solid --border`, 8px square `--text-2` + `500 13px/18px --text-1` "Stop" |
| 7 | Disabled — rate limited | `--border` | **the question stays in the box** | inline caution strip: `padding: 8px 12px; border-radius: 10px; --caution-fill`, 14px clock, `500 12px/16px --caution` tabular — "15 questions a minute is the limit. Send again in 0:42." | 34px circle `--surface-3` + `1px solid --border` showing the countdown seconds at `600 12px/16px --text-3` tabular |
| 8 | Disabled — index missing | `--border` | placeholder | inline critical strip: `--critical-fill`, 14px alert, `400 13px/20px --text-2` — "The assistant cannot search its records at the moment, so it cannot answer. Vessels, flights and tariffs still work — or telephone 869 465 8121." | inert |

In state 7 the user's text is never cleared. In state 8 the message names what still works, because the operations screens are unaffected.

---

## 3.3 Category chips

Five values, rendered as filter chips (`01-foundations.md` §1.2 Family C): **Berthing · Cargo · Tariffs · Flights · General**.

The 422 rejection, below the row: `padding: 12px 14px; border-radius: 12px; --critical-fill; 1px solid rgba(217,86,75,0.35)`, 16px alert `--critical-text`, title `500 13px/18px --critical-text`, body `400 13px/20px --text-2`.

> **That category is not one we handle**
> Choose berthing, cargo, tariffs, flights or general. Your question is still in the box.

Chips are 28px and filled when selected, so they never read as the 26px outline status pills that appear in the same answers.

---

## 3.4 Suggested questions

| State | Treatment |
|---|---|
| Initial | Suggestion chips, `1px solid --border` |
| After a refusal | Narrowed to what we actually hold; chip border becomes `1px solid --brand-500`, glyph `--brand-200` |
| Hidden | **Not rendered** — while streaming, and after a 429 |

Hidden means removed from the DOM, not disabled. A greyed-out suggestion during a rate limit invites a click that cannot succeed.

---

## 3.5 Streaming and citations

### Streaming, markers raw

Citation markers arrive as literal `[kb-014]` text and render in the mono stack at `13px --text-3`. **A chunk boundary can fall mid-marker** — the board shows `[kb-0` followed by the cursor. Nothing is stripped mid-stream.

Cursor: `display: inline-block; width: 8px; height: 16px; background: --brand-200; vertical-align: -3px`. Under `prefers-reduced-motion` it does not blink.

### Settled, markers reconciled

Each marker becomes a numbered chip:
`display: inline-flex; height: 18px; padding: 0 6px; border-radius: 5px; background: rgba(56,58,151,0.35); font: 600 11px/16px --brand-200; tabular; vertical-align: 1px`

Numbers match the source list order.

### Replace handler

When the backend replaces an in-flight answer, the accumulated tokens are shown struck through in `--text-3` and a caution line follows: 14px refresh glyph + `500 12px/16px --caution` "Rewriting with the published figures…". Do not silently swap the text.

---

## 3.6 Agent activity trace

Real, populated, **collapsed by default** on every arrival. It is evidence, not part of the answer.

**Collapsed:** `--surface-2`, `1px solid --border`, `border-radius: 16px`, `padding: 14px 20px`, `gap: 12px`. 16px tool glyph `--text-3` · `500 13px/18px --text-2` tabular "3 tools used · 1.94s" · trailing 16px chevron `--text-3`.

**Expanded header:** same box, header row gets `--surface-3` and `border-bottom: 1px solid --border`; glyph `--brand-300`, label `--text-1`, chevron rotated 180°.

**Rows:** `display: grid; grid-template-columns: 1.1fr 1.3fr auto; gap: 14px; padding: 11px 20px; border-bottom: 1px solid --border`

| Column | Style | Content |
|---|---|---|
| Tool name | `500 13px/20px --text-1` | `search_knowledge`, `lookup_tariff`, `build_quote`, `list_vessels`, `list_flights`, `get_contacts` |
| Argument summary | `400 13px/20px --text-2` | One line. `"wharfage 40ft", top 5` · `code WHF-40, import` · `port BAS, limit 25` |
| Duration | `500 13px/20px --text-2` tabular | `310 ms`, `1.42 s` |

**Running rows:** row background `rgba(56,58,151,0.12)`; the duration cell becomes a 6px `--brand-200` dot + `500 13px/20px --brand-200` "running". Concurrent tools show multiple running rows at once.

**Cap reached (6 of 6):** header reads "6 of 6 tools used · 4.02s" and a footer strip in `--caution-fill` closes the panel:

> Six tools is the most that can run for one question. The answer below was written with what these returned.

Never show request bodies or responses. Tool name, one-line argument summary, duration.

---

## 3.7 Citation chip and source list

Chip: `display: flex; gap: 12px; padding: 14px 16px; --surface-2; 1px solid --border; border-radius: 12px`.
Index badge `22px × 22px; border-radius: 6px; background: rgba(56,58,151,0.35); font: 600 11px/16px --brand-200` tabular.
Title `500 13px/18px --text-1` · volatility badge · verified-date badge · snippet `400 13px/20px --text-2` in quotes · source type `500 12px/16px --brand-300`.

**Five source types:** Published schedule · Scraped page · PDF document · Departmental record · Notice board. Rendered as the trailing meta line, e.g. `Published schedule · PDF`.

### The null cases — all four must be handled

| Field | Null rendering |
|---|---|
| `label: null` | `Untitled source`, `500 13px/18px --text-2`, italic. **Never fall back to the id.** |
| `snippet: null` | `No extract available for this source.`, `400 13px/20px --text-3`. **Never fabricate one** — scraped and PDF sources genuinely have none. |
| `source_url: ""` | The link is removed entirely; meta line reads `Scraped page · no link recorded`. No dead anchor. |
| `volatility: null` | Renders the **cautious** case — `CHANGES OFTEN` — with the extra ring. Never static, never low. |

### Source list

| Count | Treatment |
|---|---|
| 1 | Single row, no header count |
| 2–5 | `"4 sources"` header, numbered to match the inline markers |
| 0 | **Section removed entirely.** An empty "Sources" heading implies one is loading. |

---

## 3.8 Grounding indicator

Four states, rendered as provenance badges (`01-foundations.md` §1.2 Family A): `ALL CITED` · `PARTLY CITED` · `NO SOURCE` · `NOT CHECKED`. Placed at the head of the source list, not inline in the prose.

---

## 3.9 Refusal cards — five, which must not look alike

All five append the escalation block (§3.10).

### 1 — Safety: vessel or aircraft operations
`--surface-2`, **`1px solid rgba(217,86,75,0.35)`**, `border-radius: 16px`, `padding: 20px`.
16px shield glyph `--critical-text` + `600 16px/24px --text-1`:

> **This assistant cannot advise on operations**
> Berthing, pilotage, manoeuvring and aircraft handling are decided by duty officers with live information this assistant does not have. Telephone Marine Operations.

### 2 — Personal record
`1px solid --border`. 16px user glyph `--brand-300`.

> **We do not hold records about people**
> This assistant holds published information only — schedules, tariffs and departmental contacts. It cannot look up a person, a consignment owner or a staff member.

### 3 — Low confidence, no answer
`1px solid --border`. 16px search glyph `--brand-300`.

> **We don't hold that information**
> Nothing in the published record covers cargo insurance. What we do hold is vessel movements, flight arrivals, port tariffs and departmental contacts.

The full-width version of this card carries **all four footer destinations** as stacked 46px rows.

### 4 — Tool cap reached · **BLOCKED**
`1px solid --border`. 16px tool glyph `--brand-300`.

> **That took more steps than we can run in one go**
> Ask for one thing at a time and it will usually answer straight away.

Plus a shortened-query suggestion: `padding: 10px 12px; border-radius: 10px; --surface-3; 1px solid --border`, 14px sparkle `--brand-300`, `500 13px/18px --text-1`, trailing 14px right-arrow `--brand-200` — "Which vessels are alongside today?"

**Needs a distinct `refusal_category` value or a `hit_tool_limit` flag.** Cards 3 and 4 arrive byte-identical today, so the client cannot tell "simplify it" from "we don't have it", and telling a user to simplify a question we simply do not cover sends them round in circles.

### 5 — Ungrounded figure replaced · **BLOCKED**
`1px solid --border`, with a caution-tinted inline note **above** the answer body:
`padding: 12px 14px; border-radius: 12px; --caution-fill; 1px solid rgba(217,162,59,0.3)`, 16px alert, title `500 13px/18px --caution`, body `400 13px/20px --text-2`.

> **Two figures were replaced**
> The rates first drafted could not be matched to the published tariff. The values below come from the tariff table.

**Needs `answer_replaced` on `ResponseMeta`.** String-matching the message is the only detection available today and it is fragile.

---

## 3.10 Escalation block

Appended to **every refusal and every error**, identical wherever it appears. A refusal that ends without a way forward is a dead end.

`--surface-3`, `1px solid --border`, `border-radius: 16px`, `padding: 20px`, `gap: 14px`.
Heading `500 13px/18px --text-1` — "Speak to the Authority".
Tap-to-call control (44px, see `01-foundations.md`): `869 465 8121 / 8122 / 8123`.
Postal row: 16px pin glyph `--brand-300`, `400 13px/20px --text-2` — `P.O. Box 963, Bird Rock, Basseterre, St Kitts`.

---

## 3.11 Error envelopes — eight codes, eight copies

Each names what happened and what to do about it. Never a generic "something went wrong" for a code that knows better.

| Code | Heading | Body |
|---|---|---|
| `400` | We could not read that request | Something in the question was malformed. Retype it and send again. |
| `404` | Page not found | We could not find that page. Check the address, or go back and ask the assistant. |
| `413` | That file is too large | The recording was 26 MB. The limit is 20 MB. Record a shorter clip. |
| `422` | We could not use that | Names the field and the actual limit it hit — never a generic "invalid input". |
| `429` | Too many questions in a short time | Countdown from `Retry-After`. Your question stays in the box. |
| `500` | Something went wrong at our end | Try again. If it keeps happening, telephone 869 465 8121. |
| `503` | This part of the service is off | Voice is unavailable. You can still type your question. |
| `504` | That took too long | The record did not answer in time. Try a narrower question. |

Code colour: `--caution` for 4xx, `--critical-text` for 5xx, `600 12px/20px` tabular.

---

## 3.12 Rate limited — the 429 card

`--surface-2`, `1px solid --border`, `border-radius: 16px`, `padding: 20px 24px`, `gap: 18px`.

Heading `600 16px/24px --text-1` "Too many questions in a short time"; body `400 14px/22px --text-2`:

> The assistant has paused this session. Your question is still in the box — send it again when the countdown ends.

**Countdown block:** `padding: 14px 16px; border-radius: 12px; --surface-3; 1px solid --border; gap: 14px`.
Ring: 40px circle, `background: conic-gradient(--brand-400 0deg <angle>, --border <angle> 360deg)`, inner 30px circle in the container's surface holding a 14px clock glyph `--brand-200`.
Beside it: `600 20px/28px --text-1` tabular `0:42`, and `500 12px/16px --text-2` "until you can ask again".

Below: a disabled 40px "Send again" button that enables at zero.

**The countdown is the whole component.** No questions-remaining counter, no quota meter — the backend computes `Decision.remaining` and drops it; only `Retry-After` survives.

---

## 3.13 Speak button — seven states

28–32px ghost icon button, waveform glyph.

| State | Background | Glyph |
|---|---|---|
| Idle | transparent | waveform `--text-3` |
| Hover | `--surface-3` | waveform `--text-1` |
| Focus-visible | transparent + ring | waveform `--text-1` |
| Preparing | `rgba(56,58,151,0.35)` | clock `--brand-200` |
| Speaking | `--brand-500` | pause `#FFFFFF` |
| Failed | `--critical-fill` | alert `--critical-text` |
| Voice off | transparent, `1px dashed --border` | waveform `--text-3` |

---

## 3.14 Diagnostics panel

Collapsed by default. `--surface-2`, `1px solid --border`, `border-radius: 16px`. Header `padding: 14px 20px`, 16px info glyph `--text-3`, `500 13px/18px --text-2` "Diagnostics", trailing chevron.

Expanded rows: `padding: 14px 20px`, label `500 13px/20px --text-2` left, value `500 13px/20px --text-1` tabular right.

| Label | Example |
|---|---|
| Answer time | `4.02 s` |
| Records searched | `1,284` |
| Rate-limit keys tracked | `37` |

Footnote `500 12px/16px --text-3`: **"Hashed keys, not users, visitors or addresses."** `tracked_clients` is a count of hashed rate-limit keys and must never be labelled otherwise.
