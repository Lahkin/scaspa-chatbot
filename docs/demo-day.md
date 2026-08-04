# Demo day

**The one runbook.** `scripts/preflight-frontend.md` is the machine checklist —
what to start and what to verify. This is what to _do_ and what to _say_.

Audience: SCASPA operational staff and management, **plus their IT staff**. The
technical questions are in §6 and they are the ones most likely to be asked.

---

## 0. The decision that governs everything

**The demo runs on `npm run dev`. Not a deployed build.**

Not a convenience — it is what keeps the last-resort fallback reachable.
`/dev/rehearsal` is guarded on `import.meta.env.DEV`
(`src/routes/dev.rehearsal.tsx:14,27`), so **a production build emits no chunk
for it and the route 404s**. That guard is correct and stays: a recorded fake
conversation must not ship to a production origin.

The consequence is the thing to remember: **deploying the night before silently
removes the recovery path.** If a deploy becomes necessary, the fallback becomes
`VITE_ENABLE_MOCKS=true` alone, and §7 changes.

---

## 1. Twenty minutes before

Run `scripts/preflight-frontend.md` §0–§6. Two things from it that have already
cost this project a session each:

```bash
lsof -ti:8000            # must be empty, or be the process you are about to start
```

**A stale backend has looked like a config bug twice.** A uvicorn from hours
earlier holds `:8000`, the new one cannot bind, and the old one answers every
request with the configuration it booted with — so the screens report
`source.kind: unavailable` long after the feed was switched on. `lsof -ti:8000 |
xargs kill` and start again. The same is true of a stale vite: it serves a
module graph from before your last change and the CSS looks broken for no
reason.

```bash
lsof -ti:8000 | xargs kill 2>/dev/null       # then:
cd backend  && OPS_DATA_SOURCE=fixture uv run uvicorn app.main:app
cd frontend && npm run dev
```

Warm the tab: load `/chat` and ask one question before anyone is watching. The
first request pays for a cold connection and is always the slowest.

---

## 2. The walkthrough — five screens, in this order

The order is deliberate: **the assistant first, because it is the product**;
the operations screens after, because they are what the assistant will one day
read from; support last, because it is the one screen that is entirely real.

### `/chat` — the assistant

The four questions in §3. Then the **deliberate no-answer** in §4 — do not skip
it, it is the most persuasive thing in the demo.

> "Everything it says is drawn from a verified SCASPA source, and every factual
> claim carries a numbered citation. Tap one and you see the source and the date
> it was verified."

Tap a citation chip. The panel opens at that source with its `as_of` date.

### `/vessels` — arrivals

> "This is the operations side. Eleven vessels, every status the schema allows —
> alongside, expected, departed, and the ones we have no report for."

**This is the screen to demonstrate the facility filter on** (§5). Pick Port
Zante: 11 → 3. Then "Filter by status": All 11 → Expected 2 → En route 3 →
Alongside 4.

Show that **"not reported" is an em dash, never a zero** — §5.3 calls that the
single most dangerous default to get wrong, and it is worth saying out loud to
the operational staff.

### `/flights` — RLB International

> "Same shape, different facility. Seven arrivals, five departures."

**Toggle Direction** — Arrivals 7, Departures 5.

The facility filter is here too, but **do not demonstrate it on this screen**:
every flight is at R. L. Bradshaw, so selecting it changes nothing and selecting
anything else empties the table. That is correct — there is one airport — and it
makes a poor thing to show. Vessels is where the filter has something to say.

### `/tariffs` — the schedule and the calculator

**Say the data line here** (§6.2) before anything else, because this is the
screen where the numbers look most like something to write down.

Then the calculator, live: **12 × 40 ft containers, 3 storage days.** It
computes from the table above it, not from a hardcoded total.

> "The arithmetic is real. The rates are placeholders until SCASPA gives us the
> published schedule — which is one of the asks in §7."

### `/support` — and it is real

> "Everything you have seen so far is sample data, deliberately marked. This
> screen is not. These are SCASPA's published contact details."

**That contrast is the point of ending here.** `contact_locations()` lives on the
base `OpsSource`, not the fixture one, so support never goes dark — see §6.3.

---

## 3. The four chat questions

Use the **chips**, not the keyboard. A tapped chip cannot be mistyped on stage.

**All four below were run against the live backend in T-23 and returned a cited
answer with a real verified date.** Do not substitute an untested question — two
plausible ones failed this check and were removed (§8).

- [ ] **Where do cruise ships dock in St. Kitts?** — `kb-113`, `kb-117`
- [ ] **Where do I collect a barrel shipped to St. Kitts?** — `kb-161`, `kb-153`
- [ ] **What are SCASPA's opening hours?** — `kb-016`, `kb-005`
- [ ] **What time is the last ferry back from Nevis?** — `kb-192`

**Save the fourth for last. It is the best answer in the set**, and it should be
presented as the design working rather than as something the system cannot do.

It is the question on the landing page. The assistant answers it — with a
citation, from a confirmed row — and the answer is that **SCASPA publishes no
fixed timetable**: _"I do not have a fixed last-departure time. Ferry times vary
by operator and day; SCASPA directs travellers to its ferry schedule."_ `kb-192`,
verified 2026-07-31.

> "This is the one I'd point at. It is a question with an obvious wrong answer
> available — any system could have produced a plausible sailing time, and most
> would have. This one went to the Authority's own record, found that SCASPA
> publishes times through a live schedule rather than a timetable, and told you
> that instead, with the source. **It is not that it failed to find a time. It
> declined to invent one**, and it can show you why."

That is the product's entire argument, and it lands better as one worked example
than as a paragraph about verification. **Do not apologise for this answer or
introduce it as a limitation** — the citation underneath is what makes it a
demonstration rather than a shrug.

If one is slow, lead with a different one.

---

## 4. The deliberate no-answer — a feature, not a failure

Ask: **"Where is my container right now?"**

The assistant declines and shows the escalation card with three tappable
telephone numbers. **Show this on purpose.** Most teams demonstrating an
assistant hide the refusals; the refusal is the reason this one can be trusted
with the Authority's name.

> "It will not guess. It has no live view of operations, so rather than inventing
> a location it routes you to the people who can actually look. Everything it
> _does_ answer, it answers from a verified source with a citation — and that is
> only possible because it refuses everything else."

The same discipline is why there is no fee, no sailing time and no statistic
anywhere in the product that did not come from a cited row.

---

## 5. Filters, both viewports

- **Filter by facility — on `/vessels`.** Pick **Port Zante**: 11 → 3. The
  control exists on `/flights` too, but every flight is at R. L. Bradshaw, so it
  has nothing to show there (§2). This is the one that demonstrates the
  per-facility work directly, and it is worth naming as you do it:

  > "Every vessel, flight, gate and tariff row carries the facility it belongs
  > to, so the same screen serves the cargo port, the cruise terminal, the ferry
  > terminal and the airport. That is one field on the record and one parameter
  > on the API — which is what makes adding Nevis a small job rather than a
  > second product."

- **`/vessels` — "Filter by status".** All 11 → Expected 2 → En route 3 →
  Alongside 4. The count drops and the source notice stays.
- **`/flights` — the Direction toggle.** Arrivals 7, Departures 5.
- **Search** — type a full word. `CARRIER` on `/vessels` narrows 11 → 1;
  `SAMPLE` on `/flights` narrows to 2. The field keeps focus while you type.
- **Both viewports.** Narrow the window, or present the phone. The tables become
  cards; nothing is cut off and no horizontal scroll appears.

---

## 6. For their IT staff

These will come back at you. They are answers, not deflections.

### 6.1 "How does our real feed plug in?"

**One interface, two methods that matter.** `backend/app/ops/source.py:44` —
`OpsSource` declares `vessels()`, `flights()`, `tariffs()`, `positions()`,
`gates()`, `advisory()`, `contact_locations()`. Every method has a safe default
that returns empty, so **a partial feed is a first-class case**: implement
`vessels()` alone and the vessel screen goes live while everything else keeps
rendering its designed "not connected" state.

> "A third implementation of that class is the whole integration. We have two —
> fixtures and unavailable. Yours would be the third, and nothing above it
> changes."

What we need from you: _what system holds vessel movements today, and can it
export? One worked example of a real record — not a schema._

### 6.2 "Is this data real?" — say this **before** they ask

> "No, and it is built so it cannot be mistaken for real. Berths, gates, times
> and statuses are realistic, because the screens have to behave the way they
> will behave on your data. **Every vessel name, IMO number, flight number and
> money amount is synthetic** — the amounts are deliberately repeated digits so
> no one can write one down and act on it."

Three enforcement layers, worth naming to a technical audience:

1. **The schema refuses** a fixture response that carries no source notice —
   it is a Pydantic validator, not a convention someone remembers.
2. **The service will not boot** with `ENV=prod` and `OPS_DATA_SOURCE=fixture`.
3. **The diagonal hatch** behind every fixture table, which is `aria-hidden`,
   `pointer-events: none`, and cannot be dismissed or screenshotted away.

Full contract: `docs/decisions.md` 0032.

### 6.3 "Then why is `/support` not hatched?"

Because **those contact details are real.** `contact_locations()` sits on the
base `OpsSource` rather than the fixture one, precisely so support never goes
dark. Hatching them would say the Authority's own switchboard number is sample
data — on the screen someone reaches when everything else has told them to call.
That is a worse lie than the one the hatch exists to prevent.

### 6.4 "What about Nevis — Vance W. Amory, Charlestown?"

Scoped out deliberately, not missed. Both are in the design's own location list.
Adding them is a one-line change to the `Facility` enum plus fixture rows — the
filters, the query parameters and the client types all key off that enum and
follow automatically. We kept the demo to the four St. Kitts facilities so the
data set was one we could populate properly.

### 6.5 "Can it show US dollars?"

> "The tariffs are published in XCD, and that is the currency the schedule
> shows. The USD peg is already in our knowledge base as a confirmed, cited
> entry — USD 1.00 to XCD 2.70 — so showing dollars is a display change rather
> than a data question. We left it out deliberately, and it should be agreed with
> the Authority before a second currency appears next to official charges."

The analysis is done and does not need redoing: `docs/found-during-build.md`
entry 20 has the contract shape, the sourcing and the design deviation.

---

## 7. What we need from SCASPA

The asks, phrased as asks. Full table: `docs/implementation-plan.md` §3.

| We need                                                                                                                                   | Why                                                                                | Until then                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| **An operational feed** — AIS provider, AODB, or an agreed file drop. Format, cadence, credentials                                        | Unblocks 20 of the audit's findings                                                | Marked sample data, and the designed empty states |
| **The published tariff schedule** — codes, descriptions, bases, XCD amounts, effective dates, and which are indexed in the knowledge base | The calculator arithmetic is finished and correct; only the rates are placeholders | Realistic shape, synthetic amounts                |
| **Whether berth occupancy is measured at all**, and against what capacity                                                                 | We will not invent a denominator                                                   | "Not reported", which is the correct rendering    |
| **Confirmation of the five per-facility telephone numbers**                                                                               | The design draws them; they are in no verified source                              | The published switchboard, on every location      |

> "Every one of these is a question about your data, not about the software. The
> software is waiting for them."

---

## 8. Rehearsal record — T-23

Run 2026-08-04 against the live backend (`OPS_DATA_SOURCE=fixture`) and the dev
server, driven through the real interface rather than asserted in tests.

> ### ⚠ The index went stale **twice** during this one session
>
> Both times the backend answered from the **10-row `sample_kb.csv`** while
> `/api/health` reported `status: ok` and `ready: true`. Every other field
> described the stale build accurately — the count was a real count, the build
> time a real time — so nothing looked wrong.
>
> The first cause was a Chroma index persisted from an earlier session and
> loaded rather than rebuilt. **The second recurrence, mid-session, could not be
> reproduced** — the backend test suite was ruled out empirically (it isolates
> to a temp directory) and no other cause was found. It is not understood, so
> treat it as something that can happen again.
>
> **This is why the check is now the first line of the preflight.** Run it, and
> run it again after anything that touches the backend:
>
> ```bash
> curl -s localhost:8000/api/health | grep -E 'kb_csv_filename|kb_rows'
> ```
>
> It must say `scaspa_kb_2026-07-31.csv` and `115`. The same two figures are on
> screen at `/ops/vessels` — the index panel's **Source** row, added in M5
> precisely for this.

**Chat questions** — all four returned a cited answer with a real `as_of`:

| Question                                          | Citations          | Verified                |
| ------------------------------------------------- | ------------------ | ----------------------- |
| Where do cruise ships dock in St. Kitts?          | `kb-113`, `kb-117` | 2026-07-31              |
| Where do I collect a barrel shipped to St. Kitts? | `kb-161`, `kb-153` | 2026-07-31 / 2025-09-01 |
| What are SCASPA's opening hours?                  | `kb-016`, `kb-005` | 2026-07-31              |
| What time is the last ferry back from Nevis?      | `kb-192`           | 2026-07-31              |

**Two questions were removed** for failing the bar:

- _"Who do I contact about a shipment?"_ — **0 citations.** The number-verification
  guard fires and the answer becomes _"I could not verify one of the figures
  against SCASPA's published sources, so I will not repeat it."_ Correct
  behaviour, useless as a demonstration of a cited answer.
- _"How much is a 40-foot container?"_ — the real schedule is blocked on SCASPA.

**The deliberate no-answer** — _"Where is my container right now?"_ returns
`refusal: true`, `refusal_category: personal_record`, `grounded: false`, and the
escalation renders with **4 `tel:` links** on the page. Reads as care, not as
failure.

**Calculator, live.** 12 × 40 ft, 3 storage days:

| Line                       | Working       | Amount |
| -------------------------- | ------------- | ------ |
| Wharfage — 40 ft container | 12 × 44.44    | 533.28 |
| Container handling         | 12 × 33.33    | 399.96 |
| Container storage          | 12 × 3 × 5.55 | 199.80 |

Maritime, 220 ft × 2 days — **and the vessel type genuinely moves the figure**:
cruise `220 × 2 × 2.22 = 976.80`, commercial `220 × 2 × 1.11 = 488.40`, with
pilotage 111.11 and harbour dues 44.44 on both.

**Filters and search** — `/vessels` status All 11 → Expected 2 → En route 3 →
Alongside 4; `/flights` Arrivals 7, Departures 5; search `CARRIER` → 1 row and
`SAMPLE` → 2 rows, **field still focused, full term intact**.

**Facility filter** — wired into the interface in M5, having existed only on the
API since M4a. Rehearsed on both screens and matching the fixture distribution
exactly: `/vessels` Deep Water Harbour 5, Port Zante 3, Basseterre Ferry Terminal
2, All 11; `/flights` R. L. Bradshaw 7, Port Zante 0.

Wiring it surfaced a dead end and closed it. The toolbar lives **inside**
`OpsTable`, so an empty result replaces the table and takes every control with
it — and "Clear filters" reset only the search box. A facility that matched no
row therefore stranded the reader on an empty screen with no way back but a
reload. The empty panel now names the facility and clearing restores it:
verified live, Port Zante → 0 rows → **Clear filters → 7 rows, control back**.

**Five screens × two viewports** (1280×900 and 390×800): every screen rendered,
**0 console errors**, sample hatch present on all four fixture screens and
correctly **absent on `/support`**, whose contacts are real.

**Gates:** ruff clean · **584 pytest** · frontend lint, typecheck, format:check
clean · **839 vitest** · build ✓ · budget **133.7 kB gz** · **check:integration
126 passed** · **check:a11y 0 violations** (13 routes × 2 viewports, 0 manual
failures).

**Frozen commit:** `5c9f65d`, on `feat/connect-halves-and-import-mockups`.

Re-frozen after the greeting fix. Supersedes `09b0aca` and `72c6990`.

**Open with a greeting.** "hi" used to return _"I do not have that in SCASPA's
verified information"_ — the first word anyone types, answered as a failed
lookup. It now replies directly, in 0 ms, with no retrieval and no model call
behind it. Worth typing first on stage: it sets the register before the first
real question, and it is instant.

Politeness in front of a question is still a question — _"hi, where do cruise
ships dock?"_ returns its two citations as normal.

To return to it exactly:

```bash
git checkout 5c9f65d
cd backend  && uv run python scripts/build_index.py        # 115 indexed, 4 rejected
lsof -ti:8000 | xargs kill 2>/dev/null
OPS_DATA_SOURCE=fixture uv run uvicorn app.main:app
cd frontend && npm install && npm run dev                  # NOT a production build
```

Then run the health check at the top of this section. The index has gone stale
twice, once for reasons still unknown.

Anything committed after this has not been rehearsed.

---

## If something fails

| Symptom                                   | First thing                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Page loads, answers do not                | CORS. `ALLOWED_ORIGINS` must include this page's origin. The fix is never in the frontend                                            |
| "You appear to be offline" but wifi works | Same, or the backend is down. The browser cannot tell a CORS refusal from being offline                                              |
| Screens say "no source configured"        | A **stale backend** on `:8000` answering with its old config. `lsof -ti:8000`. This has happened twice                               |
| Everything is slow                        | Use the chips and keep talking. Say so plainly — a slow demo you narrate beats a fast one you apologise for                          |
| A rate limit trips                        | Expected, and designed. "Several people are asking at once." The Send button shows a countdown                                       |
| **Anything unrecoverable**                | `VITE_ENABLE_MOCKS=true npm run dev`, or the tab already open at **`/dev/rehearsal`** — the recorded conversation, no network at all |

Have `/dev/rehearsal` **open in a background tab before you start**. Reaching it
should not involve typing a URL in front of people.

Say the line out loud once, beforehand:

> _"The venue wifi has gone — here is the same conversation, recorded earlier."_

Rehearsing that sentence is what makes it sound calm rather than apologetic.
**Composure beats perfection.** Every failure on this list has a next action, and
the room remembers how it was handled far longer than what broke.
