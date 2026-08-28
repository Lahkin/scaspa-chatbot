# Data-coverage audit — SCASPA AI Chatbot

**Originally taken:** 2026-08-03 · **Branch:** `feat/connect-halves-and-import-mockups` ·
**Method:** static read only — no server started, no endpoint called, `OPS_DATA_SOURCE` not
exercised.

**Refreshed:** 2026-08-28 · **Branch:** `main` · **Method:** the backend was **run** this time,
under the configuration the repository actually carries, and every operations endpoint was called.
Fixture contents, schema fields and component wiring were re-read from source.

---

## Why this document was refreshed, and how to read it now

> **A stale audit is worse than no audit**, because it is read as current. This one was: its board-18
> row said "9 invented `SMP-*` rates" and four category chips, of a board that had carried 30
> design-convention codes across six categories since T-11. Work was nearly planned against it.
>
> The original was accurate on the day. What made it go stale is that it was written **against a
> configuration that has since changed** — `OPS_DATA_SOURCE` was unset, so every operations verdict
> below was a verdict about an empty feed rather than about the code.

**Every finding in §C now carries a `Status` column**, and it means exactly one of four things:

| Status | Meaning |
| --- | --- |
| `CLOSED` | Re-verified on 2026-08-28 and no longer true. The original text is kept and the closure noted, so the record of what was found survives |
| `OPEN` | Re-verified and still true as written |
| `CHANGED` | The finding still stands but its shape moved — usually because the board was rebuilt around it |
| `NOT RE-CHECKED` | Not re-verified in this pass. **Treat as unknown, not as current** |

Nothing is marked `CLOSED` or `OPEN` on inference. Each was checked against a running endpoint, the
fixture module, or the schema field it names.

---

## Configuration this audit was taken against

Three facts set the baseline for everything that follows. Each is verified, not assumed.

**Two of the three baseline facts have changed since 2026-08-03, and they are the reason most of
§C moved.** Both tables are kept: the first is what this audit was originally taken against, the
second is what it is now taken against.

### As at 2026-08-03 — superseded

| Fact | Consequence at the time |
|---|---|
| `OPS_DATA_SOURCE` **not set** → `"none"` | Every `/api/vessels`, `/api/flights`, `/api/tariffs`, `/api/ops/*` response was an empty list with `source.kind == "unavailable"`. **Every operations verdict in §A and §C was a verdict about an empty feed.** |
| Index held **10 rows from `sample_kb.csv`** | The assistant answered from 10 deliberately-fake sample rows. |
| `ADMIN_SECRET` blank | `/api/admin/stats` not registered. |

### As at 2026-08-28 — current

| Fact | Evidence | Consequence |
|---|---|---|
| `OPS_DATA_SOURCE=fixture` | `backend/.env:127`; default is still `"none"` at `backend/app/config.py:284` | **Every operations endpoint is populated.** Called this pass: vessels 11, flights 12, tariffs 30 across 6 categories, positions 4, gates 8, advisories 1, profile present, directory 5 locations / 7 departments — all `source.kind == "fixture"` with 0032's notice attached. Refused at boot when `ENV=prod` (`app/main.py`), which is now load-bearing rather than belt-and-braces |
| The index holds **115 rows from `scaspa_kb_2026-07-31.csv`**, 4 rejected | `data/index_meta.json`; `GET /api/health` → `kb_rows: 115`, `kb_version: "2026-07-31"`, built `2026-08-26` | The real knowledge base is indexed. The CSV carries **232 rows, of which 116 are `confirmed`** — and rule 8 indexes only those, so 115 of 116 reached the index. `sample_kb.csv` is no longer the source |
| `ADMIN_SECRET` is still blank | `backend/.env`; `app/main.py` | **Unchanged.** `/api/admin/stats` is still not registered, so F-40, F-41, F-47, F-49, F-50 and F-60 all still stand |

Secondary facts, also re-checked: there is **no root `.env`** any more — configuration lives in
`backend/.env` alone, so the original's "absent from both" reading no longer applies to a file that
does not exist. There is **no `frontend/.env`** either; `VITE_ENABLE_MOCKS` appears only in
`frontend/.env.example` (`false`), so a developer without a local override talks to the real
backend. `OPENAI_API_KEY` is populated (length only was checked; the value was not read), and
`ELEVENLABS_API_KEY` is now populated too — see the voice section in §D.

**The distinction that matters for the client demonstration.** There are three possible data states
per surface, and only the first is a demo:

1. `OPS_DATA_SOURCE=fixture` — **the current state.** No longer "obviously-fake": decision 0032
   replaced that convention with *realistic in every field that shapes the layout, synthetic in
   every field that could be written down and acted on*. Berths, gates, tariff codes and times are
   real-shaped; vessel names (`MV SAMPLE …`), IMO numbers, airline codes and **every money amount**
   (repeated-digit — `44.44`, `222.22`) are not. Refused at boot when `ENV=prod`, which under
   realistic values is the only thing between sample data and a passenger.
2. `OPS_DATA_SOURCE=none` — still the production default in code, and still the honest empty state.
3. A real operational feed — **still does not exist.** No third `OpsSource`, no adapter, no
   credentials field. Unchanged since 2026-08-03.

**A fourth state now exists that this framing did not have.** Watchtower fetches SCASPA's published
cruise schedule on a timer and stores it, and `/api/cruise-schedule` and `/api/guide` serve it with
`source.kind == "published"` (`app/ops/cruise.py`, `app/ops/guide.py`). That is neither a fixture nor
a live feed: it is real SCASPA information with a retrieval date attached. `"live"` remains
unreachable — nothing emits it (F-13).

---

## A. Board coverage checklist

**The design spec is not a 10-board system.** `design/IMPLEMENTATION_PROGRESS.md:77-106` enumerates
**27 boards** — `00`, `00a`–`00d`, and `01`–`22`. (That document's own §9 calls it "all 23 boards"
while its §2 table lists 27 rows; §2 is the complete enumeration and is used here.) All 27 appear
below, per the instruction that every board appears in the final report.

Fifteen of the 27 are pure chrome or component boards that display no external data — they are
marked `N-A (chrome)` rather than forced into LIVE/PARTIAL/EMPTY, because calling a button board
"LIVE" would be misleading.

**Verdicts were originally taken against `OPS_DATA_SOURCE` unset, and are now taken against
`fixture`** — which is what changed almost every operations row below. `FIXTURE` is used where a
board is fully wired and populated by sample data: it is not `LIVE`, because no real feed exists,
and calling it `EMPTY` was only ever true of the configuration rather than of the board.

| Board ID | Board name | Verdict (2026-08-28) | Findings | Change since 2026-08-03 |
|---|---|---|---|---|
| 00 | Foundations (seal, type, radii, tokens) | N-A (chrome) | 0 | — |
| 00a | Embedded widget | N-A (chrome) | 0 | — |
| 00b | Two data paths | N-A (chrome) | 0 | — |
| 00c | Badge families | N-A (chrome) | 0 | — |
| 00d | Buttons and inputs | N-A (chrome) | 0 | — |
| 01 | Pagination | N-A (chrome) | 1 | — |
| 02 | Card footer link | N-A (chrome) | 0 | — |
| 03 | Breadcrumb and back | N-A (chrome) | 0 | — |
| 04 | Admin gate / 404 | N-A (chrome) | 0 | — |
| 05 | Assistant answer card | PARTIAL | 3 | F-52 closed — the landing page was rebuilt |
| 06 | Data source status card | LIVE | 1 | Unchanged |
| 07 | Status chips | N-A (chrome) | 1 | — |
| 08 | Contact card | LIVE | 2 | — |
| 09 | Tariff quote | **FIXTURE** | 4 | Prices 30 published rates; rejects a category it cannot price (0050) |
| 10 | Spend summary | EMPTY | 1 | Unchanged — `ADMIN_SECRET` still blank |
| 11 | Enquiry receipt | PARTIAL | 2 | F-30 still open: a ticket is logged and discarded |
| 12 | Ops list header | N-A (chrome) | 0 | — |
| 13 | Composer, 8 states | N-A (chrome) | 1 | F-54 closed — the eight chips were rewritten to KB-backed questions |
| 14 | Turns, streaming, trace | LIVE | 1 | Now over the real 115-row index, not 10 sample rows |
| 15 | Refusals, errors, speak, diagnostics | PARTIAL | 2 | Unchanged |
| 16 | Structured blocks (charts, cards) | PARTIAL | 5 | Cards now populated; F-42/F-46 still open |
| 17 | Vessels and Flights | **FIXTURE** | 13 | `/vessels` was **rebuilt** around the published cruise schedule; 11 vessels, 12 flights |
| 18 | Tariffs, two steps | **FIXTURE** | 6 | 30 rows, 6 categories, calculator matched. 4 of 6 findings closed |
| 19 | Support | PARTIAL | 6 | F-31 closed (email published); F-28/F-29/F-30 still open |
| 20 | Console, health, admin | **FIXTURE** | 9 | Console rebuilt; positions/gates/advisories/profile populated. Admin panels still gated off |
| 21 | Voice | **WORKING** | 3 | ElevenLabs supplies both halves; `/api/health` reports `stt: true, tts: true` |
| 22 | Feedback matrix | N-A (chrome) | 0 | — |

**Not a board, but on screen during any walkthrough:** the landing page `/` (`frontend/src/routes/index.tsx`,
294 lines) is **not in the design spec at all** and is still on the pre-handoff palette. It carries 2
findings (F-43, F-44). Likewise `/about`, `/about-scaspa`, `/privacy`, `/settings` are shipped routes
with no board.

---

## B. Facility coverage matrix

Columns are the facility-scoped boards. Cells are the verdict for that facility on that board under
the current configuration.

Cells are the verdict for that facility on that board **as at 2026-08-28**, under
`OPS_DATA_SOURCE=fixture`. Counts were obtained by calling each endpoint with `?facility=`.

| Facility | 17 Vessels | 17 Flights | 18 Tariffs | 19 Support | 20 Console | 16 Chat cards | Chat / KB (§D) |
|---|---|---|---|---|---|---|---|
| **Deep Water Harbour** (cargo) | FIXTURE — 5 | N-A | FIXTURE — 23 | LIVE | FIXTURE | FIXTURE | 10 confirmed `cargo` rows (of 25) |
| **Port Zante** (cruise) | FIXTURE — 3 · **plus the real published schedule** | N-A | FIXTURE — 25 | LIVE | FIXTURE | FIXTURE | 18 confirmed `cruise` rows (of 33) |
| **Basseterre Ferry Terminal** | FIXTURE — 2 | N-A | FIXTURE — 24 | LIVE | FIXTURE | FIXTURE | **7 confirmed `ferry` rows (of 20) — the thinnest** |
| **RLB International Airport** | N-A | FIXTURE — 12 | FIXTURE — 27 | LIVE | FIXTURE | FIXTURE | 19 confirmed `airport` rows (of 72) |

Tariff counts exceed the per-facility rates because a charge with `facility: null` is port-wide and
is returned under every facility filter — deliberate, and documented in `api-contract.md`.

### Facilities that would fail a live demo question

**Two of the original three reasons are now closed. Read them as a record of what was fixed.**

1. ~~**No ops model carries a facility.**~~ **CLOSED (T-06 and follow-ups).** `VesselArrival`,
   `Flight`, `GateAssignment` and `TariffRow` all carry
   `facility: "deep_water_harbour" | "port_zante" | "basseterre_ferry_terminal" | "rlb_airport" | null`,
   and all three list endpoints filter on it. Verified by calling them: the four facilities return
   5 / 3 / 2 / 0 vessels and 0 / 0 / 0 / 12 flights. *"Which vessels are at Port Zante?"* is
   answerable.

2. **The Basseterre Ferry Terminal still has no schedule.** Partly closed and worth stating
   precisely, because the original overstated it and the correction matters: the ferry now **does**
   have an operational surface — two vessel movements attributed to it, returned by
   `/api/vessels?facility=basseterre_ferry_terminal`, and it appears in the tariff table and the
   contact directory. What it still has **no** surface for is **sailing times**. There is no ferry
   schedule endpoint and no published source for one.

   So *"What time is the last ferry?"* — the question the landing page once used as its own headline
   — still has no real answer, and it is now the clearest remaining gap of the four facilities: the
   thinnest KB coverage (7 confirmed rows) on the facility asked about most.

3. ~~**Nothing is live.**~~ **CLOSED as written, with a caveat that replaces it.** Every operations
   surface is populated. But populated by *fixtures*: it is sample data wearing 0032's notice and
   its sample-data hatch, not an operational feed. **No real feed exists** (see §A state 3). The one
   genuinely real operational surface is the published cruise schedule Watchtower retrieves.

---

## C. Findings

**60 findings, F-01 to F-60** — the original text said "45", which was wrong on the day and is
corrected here rather than carried forward. Grouped by board for readability; the specified columns
are preserved throughout. "Data class" is `STATIC-KB` (knowledge base / vector store), `LIVE-OPS`
(fed by `OPS_DATA_SOURCE`), or `DERIVED` (computed by this system).

**The `Status` column is the 2026-08-28 re-verification** — see the legend at the top of this
document. Original wording is left untouched so the record survives; where a finding is `CLOSED`,
the status cell says what closed it and how that was checked.

### Board 17 — Vessels (`/vessels`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable w/o contract change? | Evidence | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | 17 | `MetricTile` | "Vessels in port" | OPS-STUB | LIVE-OPS | `GET /api/vessels` → `VesselMetrics.vessels_at_berth` | `vessels_at_berth` | EXISTS | Only a feed. Chain is complete; `none` yields `null` → em dash | YES | `frontend/src/routes/vessels.tsx:183`; `backend/app/schemas.py:408` | CHANGED — the tile survives, but `/vessels` was rebuilt (70 lines) around `CruiseSchedule` + `VesselMovements`; tiles now live in `VesselMovements`. Feed populated: 11 vessels |
| F-02 | 17 | `MetricTile` | "Expected today" | BACKEND-MISSING | LIVE-OPS | `VesselMetrics.arrivals_today` (design §5.3) | `arrivals_today` | PARTIAL | The field does not exist. UI reads `arrivals_next_24h`, a rolling window under a calendar-day label | NEEDS-CONTRACT-CHANGE | `frontend/src/routes/vessels.tsx:190`; `backend/app/schemas.py:410` | **CLOSED** — `VesselMetrics.arrivals_today` exists (model fields re-read). The calendar-day/rolling-window confusion this described is gone |
| F-03 | 17 | `MetricTile` | "Berth occupancy" | HARDCODED | LIVE-OPS | a berth-occupancy field on `VesselMetrics` | none exist | MISSING | Literal `value={null}` in the component. No field is even proposed; §5.3 calls rendering `0` here "the single most dangerous default in the product" | NEEDS-CONTRACT-CHANGE | `frontend/src/routes/vessels.tsx:196` | OPEN — no berth-occupancy field on `VesselMetrics` (fields: `vessels_at_berth`, `arrivals_today`, `arrivals_next_24h`, `berth_capacity`, `daily_cargo_teu`) |
| F-04 | 17 | `MetricTile` | "Alongside of expected" ratio | DERIVED | DERIVED | client arithmetic over two server fields | `vessels_at_berth`, `arrivals_next_24h` | PARTIAL | The denominator is `at_berth + arrivals_next_24h`, invented here. `berth_capacity` exists and is **not** used on this screen | YES | `frontend/src/routes/vessels.tsx:205-209`; `backend/app/schemas.py:409` | CHANGED — the invented denominator went with the old tile row; `berth_capacity` is still not read on the public screen |
| F-05 | 17 | `MetricTile` | `berth_capacity` | ORPHAN-FIELD | LIVE-OPS | `VesselMetrics.berth_capacity` | — | EXISTS | Returned (`4` in fixture); read only by `/ops/vessels`, never by the public `/vessels` screen | YES | `backend/app/ops/fixtures.py:106`; `frontend/src/routes/ops.vessels.tsx:112` | OPEN — `berth_capacity` still read only by the console |
| F-06 | 17 | `MetricTile` | `daily_cargo_teu` | ORPHAN-FIELD | LIVE-OPS | `VesselMetrics.daily_cargo_teu` | — | EXISTS | Returned (`1111`); read only by the console, never by `/vessels` | YES | `backend/app/ops/fixtures.py:107`; `frontend/src/routes/ops.vessels.tsx:117` | OPEN — `daily_cargo_teu` still read only by the console |
| F-07 | 17 | `OpsTable` | Vessel rows — name, type, berth, ETA, ATA, status | OPS-STUB | LIVE-OPS | `GET /api/vessels` → `vessels[]` | `id,name,vessel_type,berth,eta,ata,status` | EXISTS | Only a feed. Under `none`: 0 rows → `NoFeedState`. Under `fixture`: 3 invented vessels | YES | `frontend/src/routes/vessels.tsx:267-282`; `backend/app/ops/fixtures.py:66-99` | **CLOSED as an empty-feed finding** — 11 fixture vessels across all four facilities, not 3 |
| F-08 | 17 | `OpsTable` | Facility scoping of a vessel row | BACKEND-MISSING | LIVE-OPS | a `facility` field on `VesselArrival` | none | MISSING | No model distinguishes Deep Water Harbour from Port Zante. Berth strings are the only signal | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:384-399`; `backend/app/ops/source.py:171-189` | **CLOSED** — `facility` is on `VesselArrival` and filterable; verified per facility (5/3/2/0) |
| F-09 | 17 | `OpsTable` | `agent`, `imo` columns | ORPHAN-FIELD | LIVE-OPS | `VesselArrival.agent` / `.imo` | — | EXISTS | Sent on every row; `/vessels` renders neither (`imo` is search-only). Both are on the console table | YES | `backend/app/schemas.py:389-391`; `frontend/src/routes/vessels.tsx:43` | OPEN — `/vessels` still renders neither `agent` nor `imo` |
| F-10 | 17 | `TableStates.NoFeedState` | "No vessel feed is connected" panel | WIRED-EMPTY | LIVE-OPS | `source.kind === 'unavailable'` + 0 rows | `source` | EXISTS | Nothing — this is the correct, complete rendering of the current state. Recorded because it is what a client sees today | YES | `frontend/src/routes/vessels.tsx:224-226` | CHANGED — still correct rendering, but no longer what a client sees: the feed is populated |
| F-11 | 17 | `VesselStatusChip` | `departed`, `unknown` values | WIRED-EMPTY | LIVE-OPS | `VesselArrival.status` | `status` | EXISTS | No fixture row produces either. Built and untested against real data by design (`08-blocked-and-forbidden.md` #6) | YES | `backend/app/ops/fixtures.py:66-99`; `frontend/src/routes/vessels.tsx:49-56` | **CLOSED** — the fixture now produces both. Statuses present: `at_berth, departed, en_route, scheduled, unknown` |
| F-12 | 17 | `Pagination` | `Showing 1–25 of n` | LIVE | DERIVED | `total`/`limit`/`offset` from `GET /api/vessels` | `total` | EXISTS | Nothing on the backend. **MSW ignores `limit`/`offset`**, so pagination is never exercised in tests or mock demos | YES | `frontend/src/routes/vessels.tsx:245-251`; `frontend/src/mocks/handlers.ts:400-445` | **CLOSED** — MSW honours `limit`/`offset` (`handlers.ts:114-117`), with a comment saying pagination is exercised rather than assumed |
| F-13 | 17 | `SourceNotice` | `live` source-kind banner + dismiss | BACKEND-MISSING | LIVE-OPS | `DataSource.kind === 'live'` | `kind: 'live'` | MISSING | `live` is in the type and unreachable — there is no `OpsSource` that emits it | NO — needs a feed | `backend/app/ops/source.py:101-165`; `backend/app/schemas.py:340` | OPEN for `live` — nothing emits that kind. **But `published` became reachable**: Watchtower's cruise schedule and `/api/guide` emit it |

### Board 17 — Flights (`/flights`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-14 | 17 | `MetricTile` ×3 | "Arrivals today", "Departures today", "Delayed" | HARDCODED / BACKEND-MISSING | LIVE-OPS | `FlightMetrics.arrivals_today` / `.departures_today` / `.delayed` | all three | MISSING | All three literal `value={null}`. `FlightMetrics` carries `total_flights`, `on_time_percent`, `gates_active`, `gates_total` — **none is one of the three §5.3 names** | NEEDS-CONTRACT-CHANGE | `frontend/src/routes/flights.tsx:151-153`; `backend/app/schemas.py:444-450` | **CLOSED** — `FlightMetrics` carries `arrivals_today`, `departures_today` and `delayed` |
| F-15 | 17 | `MetricTile` | `on_time_percent`, `gates_active`, `gates_total` | ORPHAN-FIELD | LIVE-OPS | `FlightMetrics` | — | EXISTS | Returned by the feed; the public flights screen reads none of them (console does) | YES | `backend/app/ops/fixtures.py:166-172`; `frontend/src/routes/ops.flights.tsx:77-84` | OPEN — `on_time_percent`, `gates_active`, `gates_total` still console-only |
| F-16 | 17 | `OpsTable` | Flight rows — no., route, due, gate, airline, status | OPS-STUB | LIVE-OPS | `GET /api/flights` → `flights[]` | `flight_no,port,scheduled_time,estimated_time,gate,airline_code,status` | EXISTS | Only a feed. `fixture` gives 4 invented `ZZ` flights | YES | `frontend/src/routes/flights.tsx:230-249`; `backend/app/ops/fixtures.py:111-163` | **CLOSED as an empty-feed finding** — 12 fixture flights, six distinct statuses |
| F-17 | 17 | `OperationalAdvisoryPanel` | Attribution line + caution fill | BACKEND-MISSING | LIVE-OPS | `published_by`, `published_at` on `OperationalAdvisory` | both | MISSING | Design §5.6 requires attribution ("always attributed to whoever published it, with a time"); the fill *is* that claim. Neither field exists, so the panel draws the neutral fill | NEEDS-CONTRACT-CHANGE | `frontend/src/components/ops/AdvisoryPanel.tsx:50-58`; `backend/app/schemas.py:453-463` | OPEN — `OperationalAdvisory` still has only `headline, detail, systems_status, temperature_c`. No `published_by`, no `published_at` |
| F-18 | 17 | `OperationalAdvisoryPanel` | `temperature_c`, `systems_status` | ORPHAN-FIELD | LIVE-OPS | `OperationalAdvisory` | — | EXISTS | Sent on every flights response; the `/flights` panel renders `headline` and `detail` only. Read on the console panel | YES | `frontend/src/components/ops/AdvisoryPanel.tsx:75-85`; `frontend/src/components/ops/console/SidePanels.tsx:115-124` | OPEN — both still rendered on the console panel only |
| F-19 | 17 | `NoFeedState` | "No flight feed is connected" | WIRED-EMPTY | LIVE-OPS | `source.kind` + 0 rows | `source` | EXISTS | Nothing. **MSW has no `ops_unavailable` branch for `/api/flights`** (only `/api/vessels`), so this state cannot be demoed from mocks | YES | `frontend/src/routes/flights.tsx:169-172`; `frontend/src/mocks/handlers.ts:448-482` | **CLOSED** — `/api/flights` has an `ops_unavailable` branch (`handlers.ts:639`) |
| F-20 | 17 | `FlightStatusChip` | `arrived` value | WIRED-EMPTY | LIVE-OPS | `Flight.status` | `status` | EXISTS | No fixture produces it. Blocked by design (`08-blocked-and-forbidden.md` #6) | YES | `backend/app/ops/fixtures.py:111-163` | **CLOSED** — the flight fixture produces `arrived` |

### Board 18 — Tariffs (`/tariffs`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-21 | 18 | `TariffTable` | Code · Charge · Rate · Source rows | OPS-STUB | LIVE-OPS | `GET /api/tariffs` → `tariffs[]` | `code,service,basis,amount,currency,category,as_of` | EXISTS | Under `none`: zero rows. Under `fixture`: 9 invented `SMP-*` rates. **No real SCASPA tariff data exists anywhere in the repo** | YES | `frontend/src/routes/tariffs.tsx:75-95`; `backend/app/ops/fixtures.py:184-265` | **CLOSED** — 30 rows on the design's code convention (`WHF-40`, `TON-GT`, `STO-D`, `SEC-C`…), not 9 `SMP-*` |
| F-22 | 18 | `TariffTable.SourceCell` | Citation link to the KB row | BACKEND-MISSING | STATIC-KB | `TariffRow.kb_id` + a route rendering a KB row | `kb_id`, a row title | MISSING | `kb_id` is `null` on all 9 fixture rows by deliberate choice ("saying otherwise would fabricate a citation"), and there is no `/kb/:id` route to link to. Cell reads "No source recorded" | NEEDS-CONTRACT-CHANGE | `frontend/src/components/ops/TariffTable.tsx:210-213`; `backend/app/ops/fixtures.py:186-191` | OPEN — `kb_id` is `None` on all 30 rows and there is still no KB-row route. Blocked on SCASPA's mapping |
| F-23 | 18 | `TariffTable` | Category chips | WIRED-EMPTY | LIVE-OPS | `TariffTableResponse.categories` | `categories` | EXISTS | Computed server-side from the whole table (`operations.py:269`). Empty under `none` | YES | `frontend/src/routes/tariffs.tsx:79`; `backend/app/routers/operations.py:269` | **CLOSED** — six categories computed from the whole table; all six chips render |
| F-24 | 18 | `TariffCalculators` (maritime) | "Vessel type" select | BACKEND-UNWIRED | DERIVED | `TariffQuoteRequest.vessel_type` | a published list of types; `build_quote` reading it | PARTIAL | The field is accepted and **never used** — `build_quote` prices dockage, pilotage and harbour dues regardless. The select is drawn disabled | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:663`; `backend/app/ops/tariffs.py:103-117` | **CLOSED** — `vessel_type` selects between `DCK-FT` and `DCK-CR`; the total moves 377.55 → 599.55 |
| F-25 | 18 | `TariffCalculators` → `build_quote` | Which codes the calculator applies | HARDCODED | DERIVED | `app/ops/tariffs.py` code constants | 7 tariff codes | PARTIAL | **The calculator is hardcoded to the fixture's `SMP-001/002/003/010/011/012/013`.** Load a real tariff table with real codes (`WHF-40`, `TON-GT`…) and every line lands in `unpriced` and the quote totals zero | NO — code change | `backend/app/ops/tariffs.py:39-45` | **CLOSED** — all 8 calculator constants resolve to published codes, asserted by a test |
| F-26 | 18 | `QuoteResult.UnpricedRow` | The missing charge's **name** | BACKEND-MISSING | DERIVED | a label alongside the code on `TariffQuote.unpriced` | `{code,label}` | PARTIAL | `unpriced` is `list[str]` — codes only. The row prints the bare code because the charge is absent from the table by definition | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:724-732`; `frontend/src/components/ops/QuoteResult.tsx:187-208` | OPEN — `TariffQuote.unpriced` is still `list[str]`, codes only |

### Board 19 — Support (`/support`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-27 | 19 | `ContactCard` | Five location cards — name, telephone, post | LIVE | STATIC-KB | `GET /api/support/directory` → `locations[]` | `name,address,contacts[]` | EXISTS | Nothing broken — this is the **one genuinely real data surface in the product**, and it survives `OPS_DATA_SOURCE=none` because `contact_locations()` is on the base class | n/a | `backend/app/ops/source.py:93-98`; `backend/app/ops/fixtures.py:286-320` | OPEN as written, and no longer the *only* real surface — the published cruise schedule joined it |
| F-28 | 19 | `ContactCard` | Per-facility telephone numbers and addresses | PLACEHOLDER | STATIC-KB | published per-facility numbers | 5 numbers, 5 addresses | PARTIAL | Four of the five locations have `address: ""` and **all five share the one switchboard number**. Design §6.2 draws five distinct numbers (`869 466 5021`, `869 465 8472`, `869 469 9040`, `869 469 5521`) and two addresses. Those are not in any verified source | YES — but the values must come from the client | `backend/app/ops/fixtures.py:296-320`; `design/06-support-console-voice.md:39` | OPEN — **client-blocked.** Five locations still share one switchboard number |
| F-29 | 19 | `EnquiryForm` | Department select options | PLACEHOLDER | STATIC-KB | `SupportDirectory.departments` | 7 department names | EXISTS | The seven names are **this project's invention**, not SCASPA's published departments — and `department` is free text on the wire, so a ticket can be routed to a desk nobody staffs | YES — values need client sign-off | `backend/app/ops/fixtures.py:465-473`; `backend/app/schemas.py:806` | OPEN — **client-blocked.** Seven invented department names; `department` still free text |
| F-30 | 19 | `EnquiryReceipt` | `SC-nnnn` reference and delivery | BACKEND-MISSING | DERIVED | a ticket store or mail relay | any persistence | MISSING | **A ticket is logged and discarded.** `post_support_ticket` writes one log line and returns a random reference; nothing stores it, nothing forwards it, nobody receives it. The receipt copy is honest ("nobody will contact you first"), but no department gets the enquiry either | NO — needs a delivery mechanism | `backend/app/routers/support.py:115-142` | OPEN — re-read `routers/support.py`: a reference is generated, one line is logged, the response returns. **Nothing stores or forwards it** |
| F-31 | 19 | `ContactPointRow` (email) | Published email address | BACKEND-MISSING | STATIC-KB | a published SCASPA email | one address | MISSING | Open TODO. `SCASPA_EMAIL` is `null`; the site obfuscates addresses behind Cloudflare and the scraper deliberately did not decode them | YES — value from client | `frontend/src/lib/scaspa-facts.ts:65`; `data/scraped/flagged_for_client.md:31-40` | **CLOSED** — `info@scaspa.com`, decoded from the site's own `data-cfemail` on four pages. `SCASPA_EMAIL` is set and the row renders |
| F-32 | 19 | `ContactPointRow` (extension, web) | Extension / web rows | BACKEND-MISSING | STATIC-KB | — | — | MISSING | **Intentional and should stay missing.** Extensions will never be built ("a caller routed to the wrong security-gate extension is worse off"); rows are drawn in the catalogue and rendered by no screen | NO — by decision | `design/08-blocked-and-forbidden.md:55-59`; `backend/app/ops/fixtures.py:274-280` | OPEN by decision — unchanged and should stay so |

### Board 20 — Console, health, admin (`/ops/vessels`, `/ops/flights`, `/profile`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-33 | 20 | `PositionMap` | Vessel position markers, heading, speed | OPS-STUB | LIVE-OPS | `GET /api/ops/positions` → `positions[]` | `lat,lon,heading_degrees,speed_knots,reported_by,reported_at` | EXISTS | **No AIS receiver is connected and none is configured.** Under `none` the plot draws its "No positions are being reported" state, which §6.7 calls "the expected state, not an error" | YES | `backend/app/routers/operations.py:127-148`; `backend/app/ops/source.py:73-74` | CHANGED — still no AIS receiver, but the endpoint returns 4 fixture positions rather than an empty plot |
| F-34 | 20 | `GateMap` | Gate tiles, `active`/`total` counts | OPS-STUB | LIVE-OPS | `GET /api/ops/gates` | `gate,status,flight_number,airline,scheduled_at,active,total` | EXISTS | Only a feed. `fixture` gives 5 `Z`-prefixed stands | YES | `backend/app/routers/operations.py:157-180`; `backend/app/ops/fixtures.py:378-402` | CHANGED — 8 fixture gates |
| F-35 | 20 | `MarineAdvisoryPanel` | Notices to mariners | OPS-STUB | LIVE-OPS | `GET /api/ops/advisories` | `port,headline,detail,severity,issued_at` | EXISTS | Only a feed. The empty state is the deliberate not-an-all-clear panel — the one empty state in the product where a wrong sentence has physical consequences | YES — with care | `backend/app/routers/operations.py:189-211`; `backend/app/ops/fixtures.py:405-433` | CHANGED — 1 fixture advisory; the not-an-all-clear empty state is now off the default path |
| F-36 | 20 | `HealthPanel` | Service state, search, voice | LIVE | DERIVED | `GET /api/health` | `status`, `index.ready` | EXISTS | Nothing. It correctly reports the current index | n/a | `frontend/src/routes/ops.vessels.tsx:96`; `backend/app/routers/health.py:32-86` | OPEN — correct; now reports the real 115-row index |
| F-37 | 20 | `IndexStatusPanel` | "Chunks" row | BACKEND-MISSING | STATIC-KB | a chunk count on `IndexStatus` | `chunks` | MISSING | Literal `value={null}` → "unknown". `IndexStatus` carries `kb_rows` and `web_docs`; `web_docs` is a different quantity and wiring it printed `Chunks 0`, which §6.12 forbids by name | NEEDS-CONTRACT-CHANGE | `frontend/src/components/ops/IndexStatusPanel.tsx:63`; `backend/app/schemas.py:952-980` | OPEN — `IndexStatusPanel.tsx:77` is still a literal `value={null}` for Chunks |
| F-38 | 20 | `IndexStatusPanel` | Documents · Built · Version | LIVE | STATIC-KB | `HealthResponse.index` | `kb_rows,index_built_at,kb_version` | EXISTS | Nothing — but it will truthfully report **10 documents from `sample_kb.csv`, version `2026-06-01`** in front of the client | n/a | `data/index_meta.json:2-9` | **CLOSED** — it no longer reports 10 rows of `sample_kb.csv` at version `2026-06-01`. It reports **115 rows, `scaspa_kb_2026-07-31`, built 2026-08-26** |
| F-39 | 20 | `OperatorProfileCard` | Demo identity card | MOCK-ONLY | LIVE-OPS | `GET /api/ops/profile` → `profile` | whole object | EXISTS | Null on every source but `fixture`, by design. Under the current config `/profile` renders "There is no account" | YES | `backend/app/ops/source.py:82-88`; `frontend/src/routes/profile.tsx:72-76` | **CLOSED as an empty finding** — `OPS_DATA_SOURCE=fixture`, so `/api/ops/profile` returns a profile |
| F-40 | 20 | §6.13 admin panels (not built) | Secret gate, models panel, config summary | BACKEND-UNWIRED | DERIVED | `GET /api/admin/stats` (`X-Admin-Secret`) | `env,models,rate_limit*,tracked_clients` | EXISTS | The endpoint returns everything both panels need — **and is not even registered, because `ADMIN_SECRET` is blank.** Not built is a recorded decision, not a gap (`IMPLEMENTATION_PROGRESS.md` §4.10) | NO — security decision | `backend/app/routers/admin.py:48-80`; `backend/app/main.py:243-246` | OPEN — `ADMIN_SECRET` still blank, endpoint still unregistered |
| F-41 | 20 | `ops/SpendSummary.tsx` | Spend tiles, stacked bar, history | ORPHAN-FIELD | DERIVED | `AdminStats.today` / `.history` | `chat_usd,embedding_usd,voice_usd,total_usd` | EXISTS | The component is built and verified and **has no caller outside a test** — its only data source is the unregistered admin endpoint | NO — see F-40 | `frontend/src/components/ops/SpendSummary.tsx`; import scan: only `tests/boards.test.tsx` | OPEN — `SpendSummary` still imported only by `tests/boards.test.tsx` |

### Boards 05, 15, 16, 21 and the landing page

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-42 | 16 | `ChartBlock` | Meta strip (provenance badge, label, `as_of`) | BACKEND-MISSING | STATIC-KB | `DataSource` on `ChartSpec` | `kind,label,as_of,notice` | PARTIAL | `ChartSpec.source` is a **string** — a `kb-xxx` citation. It carries no kind, label, `as_of` or notice, so the one block in the product that is an operations payload without a meta strip is this one | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:130-132`; `frontend/src/components/chat/ChartBlock.tsx` | OPEN — `ChartSpec.source` is still `str` |
| F-43 | 16 | `CardBlock` (`vessel_arrivals`) | Inline arrivals rows + `Showing 3 of n` | OPS-STUB | LIVE-OPS | `build_card` → `source.vessels()` | same as F-07 | EXISTS | Same feed as F-07. Under `none` the card renders with zero rows and its notice, which is the designed behaviour | YES | `backend/app/ops/cards.py:49-55` | **CLOSED as an empty-feed finding** — the card renders 11 vessels |
| F-44 | 16 | `CardBlock` (`flight_schedules`) | Inline flight rows | OPS-STUB | LIVE-OPS | `build_card` → `source.flights()` | same as F-16 | EXISTS | Same feed as F-16 | YES | `backend/app/ops/cards.py:57-65` | **CLOSED as an empty-feed finding** — the card renders 12 flights |
| F-45 | 16 | `ChartBlock` legend | 4-series legend | WIRED-EMPTY | STATIC-KB | `ChartSpec.series` (1–4) | up to 4 series | EXISTS | The schema allows four; `make_chart` produces one. Built and unreachable by design | YES | `backend/app/schemas.py:120-122`; `design/08-blocked-and-forbidden.md:39-43` | OPEN by design — unchanged |
| F-46 | 16 | `ChartBlock` | Real SCASPA statistics to chart | BACKEND-MISSING | STATIC-KB | KB rows carrying annual figures | vessel calls, flights, cruise passengers, cargo tonnes | MISSING | The homepage counters are JavaScript and read `0` over HTTP, so the scraper deliberately stored nothing. Chartable figures exist only in `sample_charts_kb.csv`, which is **not indexed** | YES — values from client | `data/scraped/flagged_for_client.md:9-27`; `data/index_meta.json:4` | OPEN — **client-blocked.** No annual statistics anywhere; `sample_charts_kb.csv` still unindexed |
| F-47 | 15 | `DiagnosticsPanel` | "Rate-limit keys tracked" row | BACKEND-UNWIRED | DERIVED | `tracked_clients` outside `/admin/stats` | `tracked_clients` | PARTIAL | Computed in `ratelimit.py`, returned only behind the admin secret. The row renders nothing when the prop is `undefined` | NEEDS-CONTRACT-CHANGE | `frontend/src/components/chat/DiagnosticsPanel.tsx:85-87`; `backend/app/schemas.py:1026` | OPEN — gated behind F-40 |
| F-48 | 15 | `NoAnswerCard` / `StepLimitCard` | Tool-cap vs low-confidence no-answer | BACKEND-MISSING | DERIVED | a distinct `refusal_category` or `hit_tool_limit` | one discriminator | PARTIAL | `step_limit_reached` now exists on the wire, but the two low-confidence cases still arrive byte-identical | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:266-273`; `design/08-blocked-and-forbidden.md:19-23` | OPEN — re-checked. `refusal_category` carries only two **forbidden-topic** values (`vessel_or_aircraft_operations`, `personal_record`, `answer.py:214-233`), which do not separate the two low-confidence cases. `step_limit_reached` still exists and still only covers the tool cap |
| F-49 | 21 | `SpeakButton` | Cache hit / miss / 304 states | BACKEND-UNWIRED | DERIVED | `X-TTS-Cache` header (already sent + exposed) | header read | EXISTS | Not a wire gap. The header is sent and CORS-exposed; §6.17 puts the caption on the operator screen, which is not built | NO — see F-40 | `backend/app/routers/voice.py:157`; `backend/app/main.py:55` | OPEN — gated behind F-40 |
| F-50 | 21 | §6.18 speech preview | "Preview the voice" panel | BACKEND-UNWIRED | DERIVED | `POST /api/tts/preview` | `text` | EXISTS | The endpoint exists and is called by `previewSpeech`; the admin-only panel that would host it is not built | NO — see F-40 | `backend/app/routers/voice.py:162-173`; `frontend/src/lib/api.ts:438-451` | OPEN — gated behind F-40 |
| F-51 | 06 | `DataSourceCard` | Sidebar source card | LIVE | LIVE-OPS | `DataSource` from any ops response | `kind,label,as_of` | EXISTS | Nothing — it correctly draws the hollow neutral "No feed connected" ring today | n/a | `frontend/src/components/shells/Sidebar.tsx`; `design/02-shell-and-navigation.md:79-95` | CHANGED — it no longer draws the hollow no-feed ring by default; it reports `fixture` |
| F-52 | 05 | `routes/index.tsx` `ExampleAnswer` | The hero's example answer and citation | HARDCODED | STATIC-KB | — | — | n/a | Entirely literal: a fake 18:00 sailing, a fake citation chip, a fake "Verified on 2026-04-01". Deliberate (the hero must not wait on the backend) and captioned as illustrative, but it is a fabricated SCASPA answer on the first screen a client sees | n/a | `frontend/src/routes/index.tsx:222-244` | **CLOSED** — the landing page was rebuilt; the fabricated 18:00 sailing and its fake citation are gone |
| F-53 | 05 | `routes/index.tsx` `SiteFooter` | Credits line | PLACEHOLDER | — | — | — | n/a | Renders the literal chip **"Team names pending"** in the page footer | n/a | `frontend/src/routes/index.tsx:267-269` | **CLOSED** — the literal placeholder chip no longer occurs anywhere in `frontend/src` |
| F-54 | 13 | `SuggestedQuestions` | The eight opening chips | PLACEHOLDER | LIVE-OPS | — | — | n/a | Six of eight — Vessels in port, Arrivals today, Berth positions, Port advisories, Gate assignments, Cruise call times — ask for live operational facts the assistant is **forbidden** to state (prompt rule 10) and whose feeds are empty. "Cruise call times" has no endpoint at all | YES — rewrite the chips | `frontend/src/features/chat/suggestions.ts:26-36`; `backend/app/agent/prompts.py` rule 10 | **CLOSED** — the eight chips were rewritten and each names the KB row that answers it (`suggestions.ts`). None asks for a live operational fact |
| F-55 | 14 | `SourceEntry` / `CitationChip` | Citation label, snippet, volatility, `as_of` | LIVE | STATIC-KB | `ChatResponse.citations[]` | all five | EXISTS | Nothing. Fully wired end to end — but every value it renders today comes from a sample row (see §D) | n/a | `backend/app/schemas.py:28-61` | **CLOSED as a sample-data finding** — citations now resolve against the real 115-row index |
| F-56 | 01 | `Pagination` | Positions / gates / advisories | — | LIVE-OPS | — | — | EXISTS | **Correctly absent.** Those three endpoints take no `limit`/`offset` and return the complete set. Recorded so nobody adds it | n/a | `backend/app/routers/operations.py:127-211`; `design/08-blocked-and-forbidden.md:73` | OPEN — correctly absent, unchanged |
| F-57 | 07 | `StatusChip` | `unknown` vessel status | WIRED-EMPTY | LIVE-OPS | `VesselArrival.status` | `status` | EXISTS | Drawn at full fidelity; no data path produces it | YES | `backend/app/schemas.py:379`; `design/05-operations.md:275-277` | **CLOSED** — the fixture produces `unknown` (`fx-vessel-11`, deliberately unattributed) |
| F-58 | 09 | `QuoteResult` | Subtotal / total / disclaimer | LIVE | DERIVED | `POST /api/tariffs/quote` | `line_items,subtotal,total,disclaimer,source` | EXISTS | Nothing structurally. **But every rate it applies is a fixture rate** — see F-21 and F-25 | YES | `backend/app/routers/operations.py:288-332` | OPEN — structurally sound; every rate is still a fixture rate. **Two defects found and fixed 2026-08-28** — see decisions.md 0050 |
| F-59 | 11 | `EnquiryReceipt` `TranscriptState` | "Attached" / "Not attached" | LIVE | DERIVED | `SupportTicketResponse.transcript_included` | `transcript_included` | EXISTS | Nothing. Correctly reports what the server did (**MSW always returns `false`**, so the "attached" rendering is only reachable against the real backend) | YES | `backend/app/routers/support.py:120-122`; `frontend/src/mocks/handlers.ts:645` | OPEN — MSW still returns `transcript_included: false` unconditionally (`handlers.ts:933`) |
| F-60 | 10 | `SpendSummary` | "no price configured" state | WIRED-EMPTY | DERIVED | `AdminStats` price settings | `PRICE_*` env vars | EXISTS | All five `PRICE_*` settings default to `0.0` and are blank in both `.env` files, so every spend figure would be `$0.00` — which §6.14 warns "may mean unpriced, not free" | n/a — see F-40 | `backend/app/config.py:155-159` | OPEN — all five `PRICE_*` still default to `0.0` |

---

## D. Chat & retrieval coverage

### Is the knowledge base ingested and embedded, or only present as a file?

> **This answer has reversed since 2026-08-03, and it is the single biggest change in the
> document.** The original finding — *"There is not one real SCASPA fact in the live retrieval
> index"* — was true then and is **false now**. Kept below, struck, because it is the finding this
> whole audit was commissioned to surface.

**The real knowledge base is indexed.** Verified two ways: `data/index_meta.json`, and
`GET /api/health` against the running service.

| File | Rows | `confirmed` | Indexed? |
|---|---|---|---|
| `scaspa_kb_2026-07-31.csv` | **232** | **116** | **Yes — this is the live index (115 rows)** |
| `sample_kb.csv` | — | — | No longer indexed |
| `sample_charts_kb.csv` | 21 | 0 | No — still unindexed (F-46) |

`index_meta.json` names `scaspa_kb_2026-07-31.csv`, `kb_rows_indexed: 115`, `kb_rows_rejected: 4`,
`kb_version: 2026-07-31`, built `2026-08-26T23:10:08Z` on `text-embedding-3-large`. `/api/health`
reports the same. **115 of the 116 `confirmed` rows reached the index**, which is rule 8 working:
only `confirmed` is indexed, and the 4 rejections are recorded rather than silent.

`scaspa_web` still holds **0** documents — no scraped page has ever been embedded, and
`web_docs: 0` agrees. Unchanged.

~~**There is not one real SCASPA fact in the live retrieval index.**~~ **Closed.** The assistant now
answers from the researched KB, with real `source_url`s and `as_of` dates. The three sample rows
quoted in the original — the XCD 44.44 ferry fare, the XCD 333.33 handling charge, the 555-0100
contact desk — are no longer what retrieval returns.

~~A second, quieter problem: `KB_CSV_PATH` is blank in both `.env` files, so it falls back to
`../data/knowledge/latest.csv` — a file that does not exist.~~ **Closed.** `KB_CSV_PATH` is still
blank in `backend/.env`, but the default it falls back to is now
`../data/knowledge/scaspa_kb_2026-07-31.csv` (`config.py:239`) — the file that is actually there.
`latest.csv` still does not exist, and nothing points at it any more.


### Which facilities have thin or absent KB coverage

~~Against the **live index** (10 rows), coverage is uniformly minimal and entirely fictional.~~
**Closed** — that table described the 10 sample rows and is gone. The researched KB *is* the live
index now, so the second table below is no longer hypothetical: it is what the assistant answers
from. Re-counted from the CSV on 2026-08-28, and the figures are unchanged from the original.

| Category | Confirmed rows | Of total | Note |
|---|---|---|---|
| `corporate` | 22 | 27 | Mostly leadership |
| `airport` | 19 | 72 | Best-covered facility, but see the rejection rate |
| `cruise` | 18 | 33 | Port Zante berthing, piers, operations |
| `marine` | 16 | 17 | Pilotage, tugs, MARSEC, conditions |
| `general` | 15 | 29 | |
| `cargo` | 10 | 25 | Thin for the Authority's main cargo business |
| **`ferry`** | **7** | 20 | **Still the thinnest facility by a wide margin** |
| `access` | 4 | 4 | |
| `payments` | 4 | 4 | |
| `jobs` | 1 | 1 | |

Two structural notes, one of which has since closed.

**First, half the KB is still discarded, and that is now visible rather than theoretical.** 89 rows
are `probable` and 27 are `unverified`; only `confirmed` is indexed (rule 8). The airport loses the
most — 53 of its 72 rows are non-confirmed, which is why the best-covered facility on paper is not
the best-covered in practice. **This is the largest single lever left on answer coverage**: the 116
non-confirmed rows are already written, and confirming them is research rather than engineering.

~~**Second, five of its ten categories are not valid retrieval filters.**~~ **CLOSED.**
`CATEGORIES` now carries all ten — `ferry, cargo, cruise, airport, general, marine, payments,
access, jobs, corporate` (`app/schemas.py:36-47`). The 47 confirmed rows in `marine`, `payments`,
`access`, `jobs` and `corporate` are filterable and selectable by the classifier.


### Do tariff answers come from the KB, or are they hardcoded?

**Neither, and the two paths disagree — which is the most demo-dangerous finding in this section.**

- **In chat**, a tariff answer comes from the KB and only from the KB. Prompt rule 4 forbids
  stating, estimating, rounding or converting any fee not in the retrieved context, and
  `find_unverified_figures` (`backend/app/rag/answer.py:245-265`) checks every money and time value
  in the answer verbatim against the retrieved chunks, replacing the answer if one fails. Today that
  means the assistant can quote exactly two fee figures — `XCD 333.33` and `XCD 44.44` — both
  labelled sample data in the source row.
- **On `/tariffs`**, the rates come from `OPS_DATA_SOURCE`, a completely separate non-LLM path
  (`backend/app/ops/fixtures.py:184-265`), and `kb_id` is `null` on every one of them. So a rate on
  the tariff screen and a rate in an answer have **no shared source, no shared identifier and no way
  to be reconciled**.
- The **calculator's arithmetic** is a recorded exception to rule 4 (`docs/decisions.md` 0020),
  narrowly bounded: published rates only, code not a model, `derived: Literal[True]`, mandatory
  non-empty disclaimer. Nothing about it is hardcoded in a component. But the *code list* it applies
  is hardcoded to the fixture (F-25).
- Nothing in `frontend/src/lib/scaspa-facts.ts` carries a figure — that file forbids fees,
  schedules, hours and statistics by rule and is enforced by a test.

### Does the chat surface have fallback / no-answer handling, and what does it render?

Yes, and it is the most complete part of the product. Six distinct terminal states, each with its
own component and its own approved copy:

| State | Wire signal | Renders |
|---|---|---|
| No answer | `refusal: true`, no category | `NoAnswerCard` — the four card-footer destinations, the only card that carries all four |
| Refusal (out of scope) | `refusal_category` = `vessel_or_aircraft_operations` \| `personal_record` | `EscalationCard` + the shared escalation block |
| Tool cap hit | `step_limit_reached: true` | `StepLimitCard` |
| Answer rewritten | `answer_replaced: true` | `AnswerCorrectionNotice` |
| Question altered by input safety | `question_sanitised` | `SanitisedQuestion`, struck through, `aria-hidden` |
| 429 / 5xx / offline | HTTP status + `Retry-After` | `RateLimitCard` / `ErrorState`, each followed by the one shared escalation block |

Refusals are HTTP 200 throughout — the mock enforces this too (`handlers.ts:103-105`). Every error
message ends with the SCASPA telephone number. The one gap is F-48: a tool-cap no-answer and a
low-confidence no-answer are still indistinguishable to a reader.

### Voice board — provider, config, reachability

**The provider changed after this audit was taken.** The original row read *"OpenAI, both
directions"* and marked the key `UNVERIFIED` because no provider call was made. A provider call was
made this time.

| Question | Answer (2026-08-28) |
|---|---|
| Provider | **ElevenLabs, both directions.** `/api/health` reports `provider: "elevenlabs"`. `resolve_provider()` takes `auto` → ElevenLabs whenever its key is set (`app/voice/provider.py`); OpenAI remains implemented and selectable |
| Why it changed | This project's OpenAI key has **no speech-model entitlement**, so the original "reachable" reading was reachable-in-code rather than reachable-in-fact — exactly what `UNVERIFIED` was flagging. See decisions.md 0047 and 0048 |
| Models | `ELEVENLABS_TTS_MODEL` (`eleven_multilingual_v2`), `ELEVENLABS_STT_MODEL` (`scribe_v1`), voice from `ELEVENLABS_VOICE_ID`. Still no hardcoded model name — rule 2 holds. `/api/health` still reports the **OpenAI** model names under `models`, which describe the chat and embedding path, not voice |
| Keys | `ELEVENLABS_API_KEY` populated (length checked, value not read) |
| Reachable? | **Verified, not assumed.** `/api/health` reports `stt: true, tts: true, checked: true` after an actual probe. Its `detail` is worth reading: *the voice id could not be verified because this key has no `voices_read` permission, which synthesis does not require* — a least-privilege key, correctly tolerated rather than reported as broken |
| Limits enforced | 20 MB, ~60 s, an allow-list of content types, a separate `voice` rate-limit scope. Unchanged |
| Language | `LANGUAGE_HINT = "en"`, pinned. Dictation is English only. Unchanged |
| Privacy | Audio read into memory and dropped; only synthesised output cached. Unchanged |
| Gaps | F-49 and F-50 unchanged — both belong to the unbuilt operator screen, gated behind F-40 |

---

## E. Contract divergences

**Nine of the thirteen are closed.** Most were mock-versus-backend drift, and `62c633b` ("mirror the
fixtures") closed them in a batch. The cautionary one is **E-8**: it was closed, and the very same
mock handler was still silently pricing renamed codes to a `XCD 0.00` total months later. Closing a
divergence is not the same as the mock being right.


| # | Divergence | MSW | TS types | Backend | Authoritative | Impact | Status (2026-08-28) |
|---|---|---|---|---|---|---|---|
| E-1 | Tariff row count | 5 rows (`MOCK_TARIFFS`) | n/a | 9 rows | **Backend** | Mock omits `SMP-002/003/020/030`, so the maritime calculator's pilotage and harbour-dues lines are never exercised in a mock demo. `opsFixtures.ts:143-194` vs `fixtures.py:184-265` | **CLOSED** — mock and backend both carry the same 30 rows; codes and amounts diffed and identical |
| E-2 | Tariff categories | Hardcoded `['cargo','maritime']` | `string[]` | Sorted from the whole table → `['aviation','cargo','maritime','passenger']` | **Backend** | Two of four category chips never appear under mocks. `handlers.ts:555` vs `operations.py:269` | **CLOSED** — the mock computes categories from the whole table; all six chips appear |
| E-3 | Support directory | 2 locations, 3 departments | n/a | 5 locations, 7 departments | **Backend** | The mock cannot exercise the empty-address collapse on cards 4–5, which §6.2 specifically requires. `opsFixtures.ts:204-228` vs `fixtures.py:286-320,465-473` | **CLOSED** — mock now 5 locations / 7 departments, matching the live directory |
| E-4 | Gate map | 4 gates (`Z1,Z2,Z3,Z4`) | n/a | 5 gates (`Z1…Z5`) | **Backend** | Mock `active` = 2 of 4; backend = 2 of 5. `opsFixtures.ts:315-332` vs `fixtures.py:378-402` | **CLOSED** — 8 gates both sides |
| E-5 | Vessel positions | 2 positions | n/a | 3 positions | **Backend** | Mock omits `fx-vessel-2`; the `estimated` marker shape is unreachable in both | **CLOSED** — 4 positions both sides |
| E-6 | `/api/flights` no-feed state | no `ops_unavailable` branch | n/a | returns `unavailable` under `none` | **Backend** | The flights screen's `NoFeedState` cannot be demoed from mocks. `handlers.ts:448-482` | **CLOSED** — `/api/flights` has an `ops_unavailable` branch |
| E-7 | Query-parameter fidelity | `/vessels` ignores `vessel_type`, `berth`, `limit`, `offset`; `/flights` ignores `airline`, `status`, `limit`, `offset`; `/tariffs` ignores `limit`, `offset` | typed in `VesselQuery`/`FlightQuery`/`TariffQuery` | all implemented | **Backend** | Pagination and three filters are untested. `handlers.ts:400-559` vs `source.py:171-232` | **CLOSED** — the mock applies every filter in the same order, with a comment citing E-7 by name (`handlers.ts:595-613`) |
| E-8 | `TariffQuote.unpriced` | **omitted** from the mock response | `unpriced: string[]` (required) | `list[str]`, always present | **Backend** | Survives only because zod defaults it to `[]` (`schemas.ts:348`). The "Total so far" / unpriced-line rendering is unreachable under mocks | **CLOSED** — the mock always sends `unpriced`. **But the same handler was still priced against renamed codes and totalled `XCD 0.00`** until 2026-08-28 — see decisions.md 0050 |
| E-9 | `volatility` default | n/a | `types.ts:69` says *"Null or absent → treated as `high`"*; `citations.ts:260` implements `medium` | sends `null`, never guesses | **The contract** (`api-contract.md:172-178` says `medium`) | Doc-only. The code is correct; two comments and `frontend/docs/backend-issues.md` are stale | OPEN — `types.ts:87` still says *“Null or absent → treated as `high`”* while `volatilityOf` applies **medium** (`types.ts:61-62`). Comment-only, still contradictory |
| E-10 | Endpoint summary table | n/a | n/a | 17 routes registered | **Backend** | `docs/api-contract.md:11-22` lists 12 endpoints and omits all four `/api/ops/*`. They are documented in full at lines 779-806, so the summary table alone is incomplete | OPEN — the summary table grew to 14 and gained `/api/cruise-schedule` and `/api/guide`, but **still omits all four `/api/ops/*`** |
| E-11 | `refusal_category` | sends two known values | closed union of 2 + `null` | `str \| None`, free-form | **Backend** | A third category added server-side would be coerced by zod rather than rendered. Low risk, worth knowing | OPEN — backend still `str | None`; the frontend union is still closed |
| E-12 | KB categories vs retrieval filter | n/a | `Category` = 5 values | `CATEGORIES` = 5 values; the researched KB uses **10** | **The KB is the outlier** | `marine`, `payments`, `access`, `jobs`, `corporate` — 47 confirmed rows — are unfilterable and unclassifiable. `schemas.py:25` vs `scaspa_kb_2026-07-31.csv` | **CLOSED** — `CATEGORIES` now carries all ten (`schemas.py:36-47`). The 47 confirmed rows in `marine`, `payments`, `access`, `jobs`, `corporate` are filterable |
| E-13 | `/api/admin/stats` | **no handler** | no types | exists, conditionally registered | **Backend** | No client, no mock, no types. Consistent with the §4.10 decision not to build the gate | OPEN — unchanged, consistent with the §4.10 decision |

---

## F. Grouped summary

> **Refreshed 2026-08-28.** Struck rows are closed; the rest were re-verified as still true.

### 1. Already implemented (real data, end to end)

- **The published cruise schedule.** New since this audit: Watchtower retrieves it from SCASPA on a
  timer and serves it with `kind="published"` and a retrieval date. It is the one genuinely real
  operational surface in the product, and `/vessels` is now built around it.
- **The researched knowledge base.** 115 confirmed rows indexed and answering, replacing the 10
  sample rows this audit was taken against — the single biggest change in the document.

- **The contact directory.** Five locations, the switchboard number, the postal address and the
  emergency routing advice — real published values, and the only surface that survives
  `OPS_DATA_SOURCE=none` intact (`source.py:93-98`).
- **The support ticket round-trip** — reference generation, transcript-consent handling, the receipt
  and its copy button. (Delivery does not exist; F-30.)
- **Health and index reporting** — `/api/health` → `HealthPanel` + `IndexStatusPanel`, honestly
  reporting whatever index is built.
- **The whole chat pipeline** — retrieval, citation verification, verbatim figure checking, the
  streaming contract, six terminal states, voice in and out. Structurally complete; the *content* is
  the problem, not the plumbing.
- **Every provenance mechanism** — `DataSource` required by type, `ProvenanceCard` with no suppress
  prop, mandatory non-dismissible notices, the chart caption validator, the quote disclaimer
  validator. These are the hardest parts to retrofit and they are done.

### 2. Backend exists, not wired to the UI

| What | Endpoint / field | Why it is unwired |
|---|---|---|
| Spend tiles, models panel, config summary, `tracked_clients` | `GET /api/admin/stats` | The admin gate is an open security decision (§4.10), and `ADMIN_SECRET` is blank so the route is not even registered |
| TTS cache captions | `X-TTS-Cache` header | Sent and CORS-exposed; the only surface for a diagnostic caption is the unbuilt operator screen |
| Speech preview | `POST /api/tts/preview` | Client function exists (`previewSpeech`); no screen calls it |
| `berth_capacity`, `daily_cargo_teu` | `/api/vessels` | Read by the console, not by the public vessels screen |
| `on_time_percent`, `gates_active`, `gates_total` | `/api/flights` | Same split |
| `temperature_c`, `systems_status` | `/api/flights` → `advisory` | Rendered by the console panel, dropped by the public one |
| ~~`vessel_type`~~ | `POST /api/tariffs/quote` | **CLOSED** — `build_quote` reads it and selects between two published dockage rates; the select is enabled and the total moves |

### 3. Backend missing

| What | Nature |
|---|---|
| **Any real operational feed** | No `OpsSource` implementation beyond `none` and `fixture`. This is the single largest gap in the product |
| **A ferry sailing schedule** | **Narrowed.** The ferry now has an operational surface — movements, tariffs, directory — but no sailing times and no published source for them |
| ~~**Facility scoping on ops models**~~ | **CLOSED** — `facility` on four models, filterable on three endpoints |
| ~~`arrivals_today` on `VesselMetrics`~~ | **CLOSED** — the field exists |
| A berth-occupancy field | Design §5.3 tile; nothing proposed |
| ~~`arrivals_today`, `departures_today`, `delayed` on `FlightMetrics`~~ | **CLOSED** — all three exist |
| `published_by`, `published_at` on `OperationalAdvisory` | The caution fill is the attribution claim |
| A chunk count on `IndexStatus` | §6.12 |
| A label alongside each `unpriced` code | §5.11 |
| A KB-row route, and `kb_id` on real tariff rows | §5.9's source-cell link |
| `DataSource` on `ChartSpec` | §4.1's meta strip |
| A tool-cap discriminator | §3.9 cards 3 and 4 |
| Ticket delivery or persistence | Tickets are logged and dropped |
| ~~The published email address~~ | **CLOSED** — `info@scaspa.com`, decoded from SCASPA's own site rather than guessed |
| Real annual statistics | **Still blocked on SCASPA.** Homepage counters read `0`; nothing was stored |

### 4. Mock/demo data recommended

Ranked by demo value. All eight are `OPS_DATA_SOURCE=fixture` work only — **none needs a contract
change**, and none should be loaded with `ENV=prod` (the boot guard refuses it).

> **Naming conventions to keep.** `CLAUDE.md` rule 5 bans seed data mistakable for a real SCASPA
> fact, and `fixtures.py:1-29` explains the existing conventions. The values below are **more
> plausible than today's `MV SAMPLE …`**, so if any are adopted, the `fixture` notice and the boot
> guard become load-bearing rather than belt-and-braces. That trade is the client's to make; my
> recommendation is to keep the repeated-digit money convention (`44.44`, `111.11`) even where
> vessel and berth names become realistic, so that **no figure** can be mistaken for a published one.

| # | Fixture | Rows | Shape and realistic values |
|---|---|---|---|
| 1 | **Real KB index** — not a mock, the real thing | 116 | Rebuild `scripts/build_index.py` against `scaspa_kb_2026-07-31.csv`. Set `KB_CSV_PATH` explicitly (the default path does not exist). Biggest single win available |
| 2 | Vessel arrivals | 10–12 | Add a `facility` field first (F-08). Container ships and tankers to `Berth 1–4` (Deep Water Harbour); cruise calls to `Pier 1–2` (Port Zante) — Port Zante's two piers are documented in the researched KB (`kb-115`, `kb-116`). Agents: Delisle Walwyn and S.L. Horsford are the real St Kitts shipping agents named in the design exports — **use `Placeholder Shipping Ltd.` instead**. Spread status across all five values so `departed` and `unknown` finally render. Times relative to `now`, as today |
| 3 | Vessel metrics | 1 | `vessels_at_berth: 4`, `berth_capacity: 6`, `arrivals_next_24h: 7`, `daily_cargo_teu: 1111`. Leave berth occupancy absent — the em dash is the correct rendering and the design says so twice |
| 4 | Flight schedules | 12–16 | RLB's real carriers are American (`AA`), Delta (`DL`), JetBlue (`B6`), Liat (`LI`), Caribbean (`BW`), Seaborne (`BB`) — the design's own example uses `LI 631 · Antigua`. Routes: Antigua, San Juan, Miami, Charlotte, New York JFK, St Maarten. Gates from the real stand set (`Z1–Z5` today; RLB has 4 gates in the researched KB). Include one delayed flight with both times, one with `gate: null`, one `landed` and one `arrived` |
| 5 | Flight metrics | 1 | Blocked on F-14 — do not populate `total_flights` under a §5.3 label. If the three fields land: `arrivals_today: 8`, `departures_today: 7`, `delayed: 2` |
| 6 | Tariff table | 25–30 | **The highest-value fixture after the KB.** Codes in the design's own convention: `WHF-20`/`WHF-40` (wharfage), `TON-GT` (tonnage dues), `STO-D` (storage per day), `SEC-C` (security per call), `PIL-E` (pilotage entry), `DCK-FT` (dockage per ft per 24 h), `PAX-H` (passenger head tax), `LDG-T` (landing per tonne). Five categories per §5.9: Cargo · Vessel dues · Storage · Passenger · Security. XCD figures consistent with the repeated-digit convention: `186.00 per container`, `0.42`, `37.50 per day`, `11.11 per passenger`. **`app/ops/tariffs.py:39-45` must be updated in the same change** or the calculator prices nothing (F-25) |
| 7 | Gate assignments | 8 | §6.8 draws "2 active of 8". Four statuses across eight stands, two with flight numbers matching fixture #4 |
| 8 | Vessel positions | 4–5 | One per `reported_by` value so all three marker shapes render; one with `speed_knots: null` and one with `heading_degrees: null`. Keep the coordinates a visibly synthetic arc — a plausible approach track to Basseterre is exactly what should not exist |
| 9 | Marine advisories | 2–3 | **Treat with more caution than everything else combined.** One `low`, one `moderate`. Keep `port: "Placeholder Port"` and keep "sample" in every headline. A fabricated sea-state warning naming a real port can cause someone to sail or not sail |
| 10 | Per-facility contacts | 5 | Not a mock — **ask the client** for the five telephone numbers and two addresses the design draws (F-28). Until then the switchboard for all five is the honest rendering |

---

## G. Priority ranking

Scored on **demo visibility** (1–5: is it on screen during the client walkthrough), **effort**
(S/M/L) and **contract risk** (does populating it force a schema change). Ranked by visibility
descending, then effort ascending.

### What the original ranking said, and what happened to it

**Seven of the ten have shipped.** Kept as a record, because the ordering turned out to be roughly
right and the two cheapest items were indeed the two that moved the most.

| Rank | ID | Original item | Outcome |
|---|---|---|---|
| 1 | §D | Index the real 232-row KB | **DONE** — 115 confirmed rows indexed, version `2026-07-31` |
| 2 | F-01,07,16,21 | Set `OPS_DATA_SOURCE=fixture` | **DONE** — `backend/.env:127` |
| 3 | F-21,25 | Real-shaped tariff table + matching calculator codes | **DONE** — 30 rows, codes matched, asserted by a test |
| 4 | F-14 | Three flight tiles read "not reported" | **DONE** — all three fields exist |
| 5 | F-02,03 | Rolling-window "Expected today"; null "Berth occupancy" | **HALF** — F-02 done, **F-03 still open** |
| 6 | F-54 | Six of eight opening chips ask for forbidden facts | **DONE** — chips rewritten, each naming its KB row |
| 7 | F-08 | No facility field on any ops row | **DONE** — four models, three filters, verified per facility |
| 8 | F-53,52 | Placeholder chip and hardcoded example answer on `/` | **DONE** — landing page rebuilt |
| 9 | F-30 | Support tickets logged and discarded | **STILL OPEN** |
| 10 | F-42 | `ChartBlock` has no meta strip | **STILL OPEN** |

### The ranking as at 2026-08-28

Same scoring. What is left divides cleanly into work this team can do and work only SCASPA can
unblock, so they are ranked separately — mixing them is how a blocked item gets read as a to-do.

**Unblocked — this team can do these now:**

| Rank | ID | Finding | Vis | Effort | Risk | Why here |
|---|---|---|---|---|---|---|---|
| 1 | §D | **Confirm more of the 116 non-confirmed KB rows** | 5 | M | LOW | The largest remaining lever on answer coverage, and it is research rather than engineering: the rows are written. 53 of the airport's 72 are non-confirmed, so the best-covered facility on paper is not the best-covered in practice |
| 2 | F-30 | Support tickets are logged and discarded | 3 | M | LOW | Invisible in a demo, serious the day it ships: someone sends an enquiry, gets a reference, and no department ever sees it. Re-verified — still a log line and a return |
| 3 | F-42 | `ChartBlock` has no meta strip | 3 | M | MED | `ChartSpec.source` is still a bare `str`. The one operations payload that does not state its own provenance |
| 4 | F-03 | "Berth occupancy" is a literal null | 4 | M | MED | Still no field. §5.3 calls rendering `0` here "the single most dangerous default in the product", so the null is correct until a field is specified |
| 5 | F-17 | Advisory has no attribution | 3 | M | MED | §5.6 requires a publisher and a time; neither field exists, so the panel draws the neutral fill |
| 6 | F-26 | `unpriced` carries codes without labels | 2 | S | MED | A dropped charge prints as a bare code |
| 7 | F-37 | Index "Chunks" reads unknown | 2 | S | MED | Still a literal null |
| 8 | F-59 | MSW always returns `transcript_included: false` | 1 | S | LOW | The "attached" rendering is unreachable from mocks — the same class of gap that let the tariff quote total 0.00 unnoticed |

**Blocked on SCASPA — do not schedule these as engineering:**

| ID | Needs | Consequence while blocked |
|---|---|---|
| F-46 | The four annual statistics, with the year each covers and a citable source | `ChartBlock` has nothing real to chart |
| F-28 | Five per-facility telephone numbers and two addresses | All five locations share one switchboard number |
| F-29 | The seven real department names | Tickets route by free text to desks that may not exist |
| F-22 | The `kb_id` mapping for tariff rows | "No source recorded" on all 30 rows — the most repeated string on the tariffs screen |
| §A | A real operational feed, and its kind | Every ops surface is fixtures; `kind="live"` is unreachable |
| — | The real tariff schedule, with effective dates | The board is shaped correctly and priced synthetically |

**Gated behind one decision, not blocked:** F-40, F-41, F-47, F-49, F-50 and F-60 all resolve the
moment the admin gate question is answered (§4.10). Six findings, one call.


---

## H. Open questions and assumptions

### Flagged explicitly: multilingual support

**In scope for the interface, out of scope for the answers, and nobody has confirmed the Authority
wants it.** The facts:

- Three locales ship — `en`, `es`, `fr` (`frontend/src/features/i18n/locales.ts:37`), with complete
  typed dictionaries.
- **It translates this application's chrome only.** The KB is English, `CLAUDE.md` rule 10 requires
  money and time values to appear verbatim in a retrieved chunk, and a translation layer breaks that
  guarantee. `stt.py:79` pins dictation to English. The conversation column carries an explicit
  `lang="en"`.
- **Only `/settings` is actually translated.** `OpsPage` takes `backLabel` as a prop precisely
  because vessels, flights, tariffs, support and profile "are still English throughout"
  (`frontend/src/components/ops/OpsPage.tsx:29-37`). So a visitor who picks Español gets a Spanish
  settings page and an English everything-else.
- **The backend has no language parameter at all** — no field on `ChatRequest`, no `Accept-Language`
  handling, nothing in the system prompt.
- **The design spec never mentions multilingual support.** No board, no token, no copy rule. Design
  README §10 specifies "British and Caribbean spelling" for interface copy, which reads as an
  English-only product.

**Do not assume it is wanted.** As shipped it is a half-translated interface over an English-only
assistant, which may read to a client as less finished than an honestly monolingual product. This
needs a decision: complete it, restrict the picker to `/settings` with a visible scope note (which
is what the code already does), or remove it.

### Open questions for the client

1. **When will there be an operational feed, and of what kind?** AIS, an AODB, a manual spreadsheet
   upload? The entire `OPS_DATA_SOURCE` interface exists and waits on this one answer.
2. **The five per-facility telephone numbers and two addresses** the design draws (F-28) — are they
   correct, and may they be published?
3. ~~**The public email address** (F-31) — obfuscated on the website and deliberately not
   guessed.~~ **Answered without the client, 2026-08-28.** The obfuscation is Cloudflare's
   `email-decode.min.js`; decoding every `data-cfemail` on the site yields `info@scaspa.com`
   on four pages and no other address anywhere. Set in `lib/scaspa-facts.ts`. See
   `docs/found-during-build.md` entry 2.
4. **The seven department names** (F-29) — are these SCASPA's real desks, or should they be replaced?
   A ticket is routed by free text today.
5. **The four annual statistics** (F-46) — vessel calls, flights, cruise passengers, cargo tonnes —
   with the year each covers and a citable source.
6. **A real tariff schedule** with codes, bases, amounts and effective dates. Without it the tariff
   board and the calculator cannot leave fixture data.
7. **Should the Basseterre Ferry Terminal have a sailing schedule?** Narrowed since 2026-08-03: it
   now *has* an operations surface — two vessel movements, tariff rows, a directory entry — but no
   **sailing times**, and no published source for them. With 7 confirmed KB rows it is also the
   thinnest facility in the index. The question is no longer "should it have a surface" but "is
   there a schedule we may publish, and where does it come from?" 
8. **Is the admin gate wanted?** (§4.10.) It blocks the spend panel, the models panel, the config
   summary, `tracked_clients` and the three TTS cache captions — five findings on one decision.
9. ~~**Which environment will the demonstration run in?**~~ **Answered by configuration, 2026-08-28:
   `fixture`.** `backend/.env` sets it, and decision 0032 replaced "obviously fake" with realistic
   shape and synthetic values. Two consequences the original could not have stated: the `ENV=prod`
   boot guard is now the *only* thing between sample operational data and a passenger, and the
   demo screens no longer read as broken software.

### Assumptions made

1. **The design spec (`design/*.md` + `IMPLEMENTATION_PROGRESS.md`) is authoritative**, as instructed
   — over `docs/api-contract.md` where the two disagree.
2. ~~**Verdicts are taken against the current configuration** (`OPS_DATA_SOURCE` unset, index = 10
   sample rows).~~ **Superseded 2026-08-28.** The configuration is now `fixture` with the real
   115-row index, and every verdict was re-taken against it. The original prediction held exactly:
   the `EMPTY` verdicts became "populated", and populated is still not `LIVE`.
3. ~~**I did not run the backend, the frontend, the test suite, the index build or any endpoint**~~
   — true of the original pass and the reason several claims carried `UNVERIFIED`. **The refresh did
   run the backend and call every endpoint**, which is how the voice provider change and the
   populated feeds were confirmed rather than inferred. Where the refresh did *not* re-check
   something, the row says `NOT RE-CHECKED` rather than carrying the old claim forward.
4. **`.env` values were checked for presence and length only.** No secret was read or printed.
5. **The Chroma count came from a read-only sqlite query** against `data/chroma/chroma.sqlite3`.
   Nothing was written.
6. **"Findings count" in §A** counts findings anchored to that board; a finding spanning two boards
   is counted once, at its primary board.
7. **`N-A (chrome)`** is used in §A for boards displaying no external data. The brief specified
   LIVE/PARTIAL/EMPTY; none fits a button or badge board, and forcing one would misreport.
8. **The "10 boards" premise in the brief does not match the spec**, which enumerates 27. The spec
   was treated as authoritative, as instructed.

### Two defects found while tracing, outside the data-coverage remit

Recorded because they were found and would otherwise be lost, not because they are coverage findings:

- ~~**`ops.flights.tsx:219-224`** — a local `formatTime` using `toLocaleTimeString(undefined, …)`,
  rendering `06:40 AM` on a US-locale browser.~~ **CLOSED** — there is no `toLocaleTimeString`
  anywhere under `frontend/src/routes/` any more.
- ~~**`index.tsx`, `profile.tsx`, `ops.flights.tsx` still use the pre-handoff `ops-*` palette.**~~
  **CLOSED, by redefinition rather than by removal** — worth stating, because a grep alone would
  suggest otherwise. `ops-*` is no longer a separate palette: `styles/tokens.css:413-425` aliases
  every one of those names onto the design tokens (`--color-ops-ink: var(--color-text-1)`,
  `--color-ops-navy: var(--color-brand-700)`). `index.tsx` and `ops.flights.tsx` no longer reference
  them at all; `profile.tsx` still does, and now resolves to design-token colours.
- **Two new defects were found on the tariffs board during this refresh** and fixed in the same
  pass: the quote endpoint answered `0.00` to four of six categories it cannot price, and the MSW
  quote handler priced four codes that no longer existed, totalling `XCD 0.00` under mocks. Both are
  recorded in decisions.md 0050. Noted here because they are the same lesson this document is
  about: **a check that stops matching reality keeps returning a confident answer.**

---

## Appendix — files scanned and skipped

### Scanned in full

**Design (11):** `design/README.md`, `01-foundations.md`*, `02-shell-and-navigation.md`,
`03-chat.md`*, `04-structured-blocks.md`, `05-operations.md`, `06-support-console-voice.md`,
`07-feedback-and-states.md`*, `08-blocked-and-forbidden.md`, `IMPLEMENTATION_PROGRESS.md`,
`tokens.css`*. (*read in part — see skipped.)

**Backend (24):** `app/main.py`, `app/config.py`, `app/schemas.py`, `app/routers/{operations,
support,health,voice,admin,chat}.py`, `app/ops/{source,fixtures,cards,tariffs}.py`,
`app/rag/{answer,retriever,rewrite,models,loader,ingest}.py` (targeted), `app/agent/{prompts,
tools}.py` (targeted), `app/voice/{stt,tts}.py` (targeted), `app/ratelimit.py` (targeted).

**Frontend (30+):** `src/lib/{api,types,config,scaspa-facts}.ts`, `src/lib/schemas.ts` (targeted),
`src/features/ops/queries.ts`, `src/features/chat/{suggestions,facilities,citations}.ts`,
`src/features/i18n/{locales,index}.ts`, `src/mocks/{handlers,opsFixtures}.ts`,
`src/routes/{index,vessels,flights,tariffs,support,profile,ops.vessels,ops.flights,ops.index}.tsx`,
`src/components/ops/{OpsPage,AdvisoryPanel,IndexStatusPanel,TariffTable,QuoteResult}.tsx`
(targeted), `src/components/chat/DiagnosticsPanel.tsx` (targeted),
`src/components/shells/Sidebar.tsx` (targeted), `src/routeTree.gen.ts` (route list).

**Data & config (9):** `data/index_meta.json`, `data/knowledge/*.csv` (all three, parsed),
`data/chroma/chroma.sqlite3` (read-only query), `data/scraped/flagged_for_client.md`, `.env`,
`backend/.env`, `frontend/.env`, `.env.example` (targeted).

**Docs (4):** `docs/api-contract.md` (targeted), `frontend/docs/backend-issues.md`, `CLAUDE.md`,
`frontend/CLAUDE.md`.

### Paths named in the brief that do not exist

| Named | Reality |
|---|---|
| `src/types/**` | Does not exist — types are in `frontend/src/lib/types.ts` |
| `src/schemas/**` | Does not exist — zod schemas are in `frontend/src/lib/schemas.ts` |
| `src/lib/api/**` | Does not exist — a single `frontend/src/lib/api.ts` plus `lib/stream.ts` |
| `app/models/**` | Does not exist — Pydantic models are in `backend/app/schemas.py`; KB row models in `app/rag/models.py` |
| `app/schemas/**` | Does not exist — a single `backend/app/schemas.py` (1,052 lines) |
| `app/api/**` | Does not exist — routers are `backend/app/routers/` |
| Seeds / migrations | **None exist.** No ORM, no database, no migration directory. Operational data comes from `app/ops/fixtures.py`; the only persistence is the Chroma vector store and `data/tts_cache/` |

### Skipped, with reason

| Skipped | Reason |
|---|---|
| `design/design-source/*.html` (438 kB, 2 files) | The exported prototype. `IMPLEMENTATION_PROGRESS.md` §1 records that its board-by-board content has been extracted and adjudicated against the markdown chapters; re-extracting adds nothing to a data audit |
| `design/screenshots/*.png` (27) | Visual reference; carries no data-source information |
| `design/01-foundations.md`, `03-chat.md`, `07-feedback-and-states.md`, `tokens.css` | Read in part. Foundations and tokens are styling; chat and feedback were read for the state enumerations cited in §D. No data-source claims were taken from the unread portions |
| `backend/tests/**` (23 files), `frontend/tests/**` (25 files) | Tests prove behaviour, not data coverage. Their existence is noted where it bears on a finding (F-41's only import is a test) |
| `data/scraped/pdfs/*.pdf` (14) | Source material for the researched KB. `web_docs: 0` — none is indexed. Their content does not change any finding |
| `data/scraped/scaspa_*.jsonl` (2 crawls) | Same — crawled but never embedded |
| `evals/**`, `backend/scripts/**` | Offline tooling. `build_index.py` was inspected only for the `KB_CSV_PATH` fallback |
| `frontend/dist/**`, `node_modules/**`, `.venv/**`, `__pycache__/**` | Build output and dependencies |
| `data/chroma/<uuid>/**` | Binary HNSW segment files. The sqlite catalogue was queried instead |
| `pay.scaspa.com` | Never fetched, referenced or linked — `CLAUDE.md` rule 3 |
