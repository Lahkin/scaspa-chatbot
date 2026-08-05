# 06 — Support, Console, Voice

Screenshots: `21-support.png`, `22-console-and-health.png`, `23-voice.png`, `13-contact-card-and-tariff-quote.png`, `14-spend-receipt-ops-header.png`

---

# Support

## 6.1 Emergency strip

**Always present, and never a permanently-red alarm banner.** A bar that is red on every visit teaches people to look past it, and then it is not there when it matters.

```
container: padding 14px 20px; border-radius 12px;
           background --surface-3; border 1px solid --border
icon tile: 32px circle, --critical-fill, 16px phone glyph --critical-text
title:     500 14px/22px --text-1
sub:       400 13px/20px --text-2
button:    44px; padding 0 16px; border-radius 10px;
           background --critical; colour #0A0B14; 600 14px/22px tabular
```

> **In an emergency, telephone the port at once — do not use this form**
> Enquiries sent here are read during office hours only.
> `[ 869 465 8121 ]`

A neutral strip with exactly **one** red element: the button that actually dials.

## 6.2 Location cards — five

`--surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px; gap: 12px`
Name `600 16px/24px --text-1`. Rows: 16px glyph `--brand-300` (3px top offset) + a label/value stack.

| Row | Label | Value |
|---|---|---|
| Telephone | `500 12px/16px --text-3` | `500 14px/22px --brand-200` tabular |
| Post | `500 12px/16px --text-3` | `400 14px/22px --text-1`, line breaks preserved |

Five locations: Deep Water Port (869 465 8121, Bird Rock, Basseterre) · Port Zante (869 466 5021, Port Zante, Basseterre) · R. L. Bradshaw Airport (869 465 8472, Golden Rock, Basseterre) · Vance W. Amory Airport (869 469 9040) · Charlestown Port (869 469 5521).

### Empty fields collapse — they do not leave a gap

Cards 4 and 5 have `address: ""`. The postal row is **absent from the tree**. No em dash, no `—` placeholder, no reserved space, no empty label. The card is simply shorter and still reads as complete.

`status: ""` is **always empty** on every location. Design the card so the absent status collapses cleanly — there is no status row in the shipping markup at all, and no code path that renders an empty one.

## 6.3 Contact point rows — five kinds

Row: `gap: 12px`, 16px glyph, value, trailing state tag.

| Kind | Glyph | State | Notes |
|---|---|---|---|
| Telephone | phone | **Populated** | `--brand-200`, tabular |
| Post | pin | **Populated** | `--text-1` |
| Email | file | **Open TODO** | Row type drawn, `opacity: 0.6`, `--text-3`. The published address is an open TODO. |
| Extension | headset | **Never** | Row type drawn only. |
| Web | info | **Not populated** | Row type drawn, `opacity: 0.6`. |

State tags: `height: 20px; padding: 0 7px; border-radius: 5px; 600 11px/16px` — populated `--positive-fill`/`--positive`, TODO and not-populated `--caution-fill`/`--caution`, never `--critical-fill`/`--critical-text`.

**No staff extension directory will be built.** A caller routed to the wrong security-gate extension is worse off than one who was never offered the number.

## 6.4 Privacy notice

`--surface-2; 1px solid --border; border-radius: 16px; padding: 24px; gap: 12px`
16px shield glyph `--brand-300` + `600 16px/24px --text-1` "Why we ask for so little"; body `400 14px/22px --text-2`:

> This form takes no name, no email address, no telephone number and no attachment. The Authority does not hold an account for you, and nothing you send here is linked to a person. Quote the reference when you telephone.

**Required.** Without it, the absence of those fields reads as a broken form.

## 6.5 Enquiry form

| Field | Spec |
|---|---|
| Department | Select, 7 options (`01-foundations.md` §1.4) |
| Subject | Text with counter, **1–200**, prefilled from the ticket card, editable |
| Details | Textarea, **1–4000** |
| Transcript | Checkbox with consequence text |

**No name, email, telephone or attachment field. Ever.**

### Transcript checkbox — the UI reflects the response, not the request

Two renderings, and the second is the one people discover at the worst moment if you get it wrong.

| | Treatment |
|---|---|
| Requested | Checked box, `--surface-3`, `1px solid --border`, `400 13px/20px --text-2` — "Requested: attach this conversation" |
| **Server did not attach** | **Unchecked box**, `1px solid rgba(217,162,59,0.3)`, title `500 13px/18px --caution` "Not attached", body `400 13px/20px --text-2` — "The conversation could not be attached to this enquiry. The department will see your message only." |

The box shows what the server did. A tick that means "we tried" is a lie.

## 6.6 Enquiry receipt

`--surface-2; 1px solid --border; border-radius: 16px; padding: 24px; gap: 20px`

Header: 36px `--positive-fill` circle with an 18px check `--positive` + `600 16px/24px --text-1` "Enquiry received".

**Reference block** — the most prominent element on the screen:
```
padding: 18px 20px; border-radius: 12px; --surface-3; 1px solid --border
label:     600 11px/16px uppercase 0.06em --text-3  "Your reference"
reference: 600 30px/38px --text-1, tabular, letter-spacing 0.02em   (24/32 at 390px)
copy button: 36px icon button (44px at ≤640px)
```

`SC-4821`

Body `400 14px/22px --text-2`:

> Quote this reference when you telephone the department. It cannot be looked up online, so write it down or copy it now.

Detail rows beneath a `border-top`: Department · Telephone · Sent, each `500 13px/18px --text-2` label / `500 13px/18px --text-1` value (telephone `--brand-200`, all tabular where numeric).

**No status tracker, no "check my ticket" field, no progress steps.** Nothing behind this screen can answer "where is my enquiry now", so nothing on it offers to.

---

# Console, Health, Admin

## 6.7 Vessel position map — empty is the normal state

```
plot: height 200px; background --canvas
      background-image: linear-gradient(#171A2B 1px, transparent 1px),
                        linear-gradient(90deg, #171A2B 1px, transparent 1px);
      background-size: 32px 32px;
      border-bottom: 1px solid --border
```

Centred: 24px map glyph `--text-3` · `500 14px/22px --text-1` "No positions are being reported" · `400 13px/20px --text-2`, max 300px, centred — "No AIS receiver is connected to this assistant. Positions appear here only when one is."

Meta strip above it carries the `NO FEED` badge. This is the expected state, not an error.

### Position markers — all three `reported_by` values visually distinct

A map that draws an estimate like a transponder fix invites reading it as one.

| `reported_by` | Marker |
|---|---|
| `ais` | 16px circle, `--info` fill, `2px solid --canvas`, `box-shadow: 0 0 0 2px --info` — solid, ringed |
| `operator` | 16px **square**, `border-radius: 4px`, `--brand-400` fill — solid |
| `estimated` | 16px circle, **`1.5px dashed --caution`, no fill** — hollow, dashed |

**Null heading draws no arrow at all. Null speed is never 0 knots** — that would say the vessel is stopped. Both render "not reported" in `500 13px/20px --text-3`.

## 6.8 Gate map

Header: `600 16px/24px --text-1` "Gate assignments" + `500 13px/18px --text-2` tabular **"2 active of 8"**.

Tiles in a 2-column grid: `padding: 12px; border-radius: 12px; --surface-3`, border tinted to the gate status at 35% (or `1px dashed --border` for unassigned). Gate number `500 13px/18px --text-1` tabular + a 22px status pill.

Four statuses: open · boarding · closed · unassigned (`01-foundations.md` §1.2).

**The active count comes from the server.** It is never recomputed from the visible rows, which would drop to zero under a filter.

**No pagination.** Gates return the complete set and accept no `limit`/`offset` — use the ops list header (`02-shell-and-navigation.md` §2.7).

## 6.9 Marine advisory list — the not-an-all-clear empty state

Header: `600 16px/24px --text-1` "Advisories" + `500 13px/18px --text-2` tabular "0 in total".

Empty body — **the only empty state in the product drawn in caution rather than neutral**:
```
padding: 24px 16px; background: --caution-fill; border-bottom: 1px solid --border
16px alert glyph --caution + 500 14px/22px --text-1
body 400 13px/20px --text-2
```

> **No notice has been published to this assistant**
> That is not confirmation that conditions are normal. Telephone Marine Operations on 869 465 8121 before sailing.

A quiet screen read as safety has physical consequences here. Never "all clear", never "conditions are normal", never a green tick.

Three severity levels when populated: notice · warning · urgent.

## 6.10 Operator profile card

```
--surface-2; 1px solid --border; border-radius: 16px; padding: 18px 20px; gap: 12px
32px circle --surface-3 + 1px solid --border + 16px anchor glyph --brand-300
name 500 14px/22px --text-1  ·  DEMO ONLY provenance badge, right
```

Four active × verified combinations, as a 2×2 legend of 6px dots + `500 12px/16px --text-2`:

| | Verified | Unverified |
|---|---|---|
| **Active** | `--positive` solid | `--caution` solid |
| **Inactive** | `--neutral` solid | hollow, `1.5px solid --neutral` |

Body `400 13px/20px --text-2`: "A fixed demonstration object. It is not a sign-in, not an account and never becomes one."

**`profile: null` is the production state.** The card is **not rendered**. No placeholder, no "sign in" prompt, no silhouette avatar.

## 6.11 Health banner

`padding: 14px 18px; border-radius: 12px; gap: 12px`, 8px dot.

| State | Background | Dot | Copy |
|---|---|---|---|
| ok | `--surface-3`, `1px solid --border` | `--positive` | All parts of the service are responding |
| degraded — search | `--caution-fill`, `1px solid rgba(217,162,59,0.3)` | `--caution` | **Search is unavailable** / The assistant cannot answer questions. Vessels, flights and tariffs still work. |
| degraded — voice | same | `--caution` | **Voice is switched off** / Speaking and listening are unavailable. You can still type your question. |

**Two causes, two messages.** "Degraded" alone tells a user nothing about whether the thing they came for still works.

## 6.12 Index status panel

Header: 8px `--caution` dot + `500 14px/22px --text-1` "Search index not ready".

Rows `padding: 10px 16px; border-bottom: 1px solid --border`, label `500 13px/20px --text-2` / value right.

| Field | `ready: false` value |
|---|---|
| Documents | `unknown` `--text-3` |
| Chunks | `unknown` `--text-3` |
| Built | `unknown` `--text-3` |
| Version | `v4.2.0` `--text-1` tabular |

**Every field reads "unknown", never 0.** Zero documents is a fact about an index that was built; this index has not reported at all.

Footnote: "The version string is the only visible trace of the offline scripts. No rebuild control, no progress, no job status."

## 6.13 Admin — secret gate, models, config

**Secret gate.** `--surface-2` card, `padding: 20px`, `gap: 12px`. Label "Administrator key"; 38px field, `--surface-3`, mono `13px --text-3` dots; 38px primary "Continue". Footnote:

> Reached only by typing the address. A wrong key returns the ordinary 404, the same as a mistyped URL.

**Models panel.** Header `500 13px/18px --text-1` "Models in use" + an `ADMIN ONLY` tag (`--border` fill, `600 11px/16px --text-2`). Rows: label `500 13px/20px --text-2` / value in the mono stack at `12px --text-1`. Chat · Embedding · Chat limit.

**Config summary.** Same row pattern, values `500 13px/20px --text-1`:

| Field | Value |
|---|---|
| Environment | `testing` |
| Data source | `fixture` — rendered in `--caution` |
| Voice | `enabled` |
| Rate-limit keys tracked | `37` tabular |
| Tool cap | `6 per question` |

**"Rate-limit keys tracked" is a count of hashed keys.** Never labelled users, visitors or addresses.

## 6.14 Spend

**Three categories only — chat, embedding, voice.** No per-endpoint drill-down exists; legend rows are not links.

**Tiles**: `--surface-2; 1px solid --border; border-radius: 16px; padding: 16px`, label `500 12px/16px --text-2`, value `600 20px/28px --text-1` tabular.

**A `$0.00` may mean "unpriced", not "free".** An unconfigured category renders `—` in `--text-3` plus `500 12px/16px --caution` "no price configured".

**Stacked bar**: `height: 16px; border-radius: 8px; overflow: hidden; gap: 2px`, widths proportional. Ramp — one hue, three tints, **not** the semantic palette: `#5457BE` chat · `#7A7CD6` embedding · `#A5A7E6` voice.

**Legend rows**: 10px swatch, `border-radius: 3px` · name `500 13px/18px --text-1`, `flex: 1` · amount `500 13px/18px --text-2` tabular.

**History**: six 56px-tall bars, `--border`, current month `--brand-400`, `border-radius: 3px 3px 0 0`.

**Caveat, always shown**: `padding: 10px 12px; border-radius: 10px; --caution-fill`, `400 13px/20px --text-1`:

> An estimate from metered usage. It is not a bill and will not match the invoice exactly.

Total in the summary header: `600 20px/28px --text-1` tabular, `USD 532.20`.

---

# Voice

Screenshot: `23-voice.png`

## 6.15 Record button — six states

44px circle at every breakpoint.

| State | Treatment | Caption |
|---|---|---|
| Idle | `1px solid --border`, 18px mic `--text-2` | |
| Hover | `1px solid --brand-500`, `--surface-3`, mic `--brand-100` | |
| Recording | `--brand-500` fill, 18px waveform `#FFFFFF` | `Recording 0:12` |
| **Approaching 60s** | `--caution` fill, elapsed time in `600 12px/16px #22245E` tabular | `7 seconds left` in `--caution` |
| **Permission denied** | `--critical-fill`, `1px solid rgba(217,86,75,0.4)`, mic `--critical-text` | see below |
| Voice off | `1px dashed --border`, mic `--text-3` | |

Permission-denied message: `--critical-fill`, `1px solid rgba(217,86,75,0.35)`, 16px alert:

> Your browser is blocking the microphone for this site. Allow it in the address bar, or type your question instead.

## 6.16 Transcription result — eight states

Rows: `padding: 12px 14px; border-radius: 12px; gap: 12px`. Status codes render at `600 12px/20px` tabular in the leading slot.

| # | State | Fill | Copy |
|---|---|---|---|
| 1 | Working | `--surface-3` | Working out what you said… |
| 2 | **Success** | `--surface-3`, `1px solid --brand-500` | The transcript in quotes at `400 14px/22px --text-1`, then `500 12px/16px --brand-200`: **"Placed in the composer. Correct it before sending."** |
| 3 | No speech | `--surface-3` | We could not make out any words. Record again, closer to the microphone. |
| 4 | `422` format | `--critical-fill` | That file type is not supported. Send a WAV, MP3, M4A, OGG or WebM recording. |
| 5 | `413` size | `--critical-fill` | That recording is **26.4 MB**. The limit is **20 MB**. Record a shorter clip. |
| 6 | `422` duration | `--critical-fill` | That recording is **1 minute 14 seconds**. The limit is **60 seconds**. |
| 7 | `429` | `--caution-fill` | Five recordings a minute is the limit. Try again in 0:26. |
| 8 | `503` | `--surface-3` | Voice is switched off at the moment. **You can still type your question.** |

**Every error names the actual limit it hit and the measured value that broke it** — the format list, MB against 20 MB, the measured duration against 60 seconds. Never "invalid file".

**The transcript lands in the composer, editable, and is never auto-sent.** The user must be able to correct a misheard terminal name before asking.

## 6.17 Playback control — nine states

36px circle.

| State | Treatment |
|---|---|
| Ready | `1px solid --border`, play glyph `--text-2` |
| Preparing | `rgba(56,58,151,0.35)`, clock `--brand-200` |
| Playing | `--brand-500`, pause `#FFFFFF` |
| Paused | `1px solid --brand-500`, play `--brand-200` |
| Finished | `1px solid --border`, check `--positive` |
| Cache hit | `1px solid --border`, lightning `--info` — caption "Cached · instant" |
| Cache miss | `1px solid --border`, refresh `--text-2` — caption "Not cached" |
| `304` | `1px solid --border`, check `--text-2` — caption "304 unchanged" tabular |
| Failed | `--critical-fill`, alert `--critical-text` |

## 6.18 Speech preview — admin only

`padding: 12px 14px; border-radius: 12px; --surface-3; 1px solid --border`
28px `--brand-500` circle + 14px play glyph · `500 13px/18px --text-1` "Preview the voice" · `ADMIN ONLY` tag.
