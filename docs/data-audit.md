# Data-coverage audit — SCASPA AI Chatbot

**Date:** 2026-08-03 · **Branch:** `feat/connect-halves-and-import-mockups` · **Method:** static read only.
No server was started, no endpoint was called, no seed or migration was run, `OPS_DATA_SOURCE` was
not exercised. Every statement below is derived from reading source, configuration and committed
data files. Where a claim could only be settled by running something, it is marked `UNVERIFIED`.

---

## Configuration this audit was taken against

Three facts set the baseline for everything that follows. Each is verified, not assumed.

| Fact | Evidence | Consequence |
|---|---|---|
| `OPS_DATA_SOURCE` is **not set in either `.env`** | absent from `.env` and `backend/.env` (grepped); default `"none"` at `backend/app/config.py:220` | `build_ops_source` returns `UnavailableOpsSource` (`backend/app/ops/source.py:256-260`). **Every `/api/vessels`, `/api/flights`, `/api/tariffs`, `/api/ops/*` response is an empty list with `source.kind == "unavailable"`.** |
| The built search index holds **10 rows from `sample_kb.csv`** | `data/index_meta.json:4-5`; Chroma `scaspa_kb` collection = 10 embeddings, `scaspa_web` = 0 (read-only sqlite query) | The assistant answers from 10 deliberately-fake sample rows. The real 232-row KB is present but not indexed. |
| `ADMIN_SECRET` is blank | `.env:101`, `backend/.env:101`; `backend/app/main.py:243-246` | `/api/admin/stats` is **not registered**. Spend, tool cap, model names and `tracked_clients` are unreachable. |

Two secondary facts: `OPENAI_API_KEY` is populated in both `.env` files (167 / 166 chars — value not
read), so the chat and voice paths have a credential; and `VITE_ENABLE_MOCKS=false`
(`frontend/.env`), so the browser talks to the real backend, not MSW.

**The distinction that matters for the client demonstration.** There are three possible data states
per surface, and only the first is a demo:

1. `OPS_DATA_SOURCE=fixture` — obviously-fake sample rows (`MV SAMPLE CARRIER`, airline `ZZ`, tariff
   codes `SMP-*`). Refused at boot when `ENV=prod` (`backend/app/main.py:193-206`).
2. `OPS_DATA_SOURCE=none` — **the current state and the production default.** Empty lists, honest
   "no feed connected" panels.
3. A real feed — **does not exist anywhere in this repository.** There is no third `OpsSource`
   implementation, no adapter, no integration stub, no credentials field for one.

---

## A. Board coverage checklist

**The design spec is not a 10-board system.** `design/IMPLEMENTATION_PROGRESS.md:77-106` enumerates
**27 boards** — `00`, `00a`–`00d`, and `01`–`22`. (That document's own §9 calls it "all 23 boards"
while its §2 table lists 27 rows; §2 is the complete enumeration and is used here.) All 27 appear
below, per the instruction that every board appears in the final report.

Fifteen of the 27 are pure chrome or component boards that display no external data — they are
marked `N-A (chrome)` rather than forced into LIVE/PARTIAL/EMPTY, because calling a button board
"LIVE" would be misleading. Verdicts are taken **against the current configuration** (`OPS_DATA_SOURCE`
unset).

| Board ID | Board name | Verdict | Findings |
|---|---|---|---|
| 00 | Foundations (seal, type, radii, tokens) | N-A (chrome) | 0 |
| 00a | Embedded widget | N-A (chrome) | 0 |
| 00b | Two data paths | N-A (chrome) | 0 |
| 00c | Badge families | N-A (chrome) | 0 |
| 00d | Buttons and inputs | N-A (chrome) | 0 |
| 01 | Pagination | N-A (chrome) | 1 |
| 02 | Card footer link | N-A (chrome) | 0 |
| 03 | Breadcrumb and back | N-A (chrome) | 0 |
| 04 | Admin gate / 404 | N-A (chrome) | 0 |
| 05 | Assistant answer card | PARTIAL | 3 |
| 06 | Data source status card | LIVE | 1 |
| 07 | Status chips | N-A (chrome) | 1 |
| 08 | Contact card | LIVE | 2 |
| 09 | Tariff quote | PARTIAL | 4 |
| 10 | Spend summary | EMPTY | 1 |
| 11 | Enquiry receipt | PARTIAL | 2 |
| 12 | Ops list header | N-A (chrome) | 0 |
| 13 | Composer, 8 states | N-A (chrome) | 1 |
| 14 | Turns, streaming, trace | LIVE | 1 |
| 15 | Refusals, errors, speak, diagnostics | PARTIAL | 2 |
| 16 | Structured blocks (charts, cards) | PARTIAL | 5 |
| 17 | Vessels and Flights | EMPTY | 13 |
| 18 | Tariffs, two steps | EMPTY | 6 |
| 19 | Support | PARTIAL | 6 |
| 20 | Console, health, admin | EMPTY | 9 |
| 21 | Voice | PARTIAL | 3 |
| 22 | Feedback matrix | N-A (chrome) | 0 |

**Not a board, but on screen during any walkthrough:** the landing page `/` (`frontend/src/routes/index.tsx`,
294 lines) is **not in the design spec at all** and is still on the pre-handoff palette. It carries 2
findings (F-43, F-44). Likewise `/about`, `/about-scaspa`, `/privacy`, `/settings` are shipped routes
with no board.

---

## B. Facility coverage matrix

Columns are the facility-scoped boards. Cells are the verdict for that facility on that board under
the current configuration.

| Facility | 17 Vessels | 17 Flights | 18 Tariffs | 19 Support | 20 Console | 16 Chat cards | Chat / KB (§D) |
|---|---|---|---|---|---|---|---|
| **Deep Water Harbour** (cargo) | EMPTY | N-A | EMPTY | LIVE | EMPTY | EMPTY | PARTIAL — 3 sample rows |
| **Port Zante** (cruise) | EMPTY | N-A | EMPTY | LIVE | EMPTY | EMPTY | PARTIAL — 2 sample rows |
| **Basseterre Ferry Terminal** | **N-A — no surface exists** | N-A | EMPTY | LIVE | N-A | N-A | PARTIAL — 2 sample rows |
| **RLB International Airport** | N-A | EMPTY | EMPTY | LIVE | EMPTY | EMPTY | PARTIAL — 2 sample rows |

### Facilities that would fail a live demo question

**All four**, for three distinct reasons.

1. **No ops model carries a facility.** `VesselArrival` has `berth: str` and nothing else
   (`backend/app/schemas.py:384-399`). There is no `facility`, `terminal` or `port` field on
   `VesselArrival`, `Flight`, `GateAssignment` or `TariffRow`. Deep Water Harbour and Port Zante are
   distinguishable **only** by a berth-string convention in the sample data (`"Berth 1"` vs
   `"Pier 1"`, `backend/app/ops/fixtures.py:75,86`). *"Which vessels are at Port Zante?"* cannot be
   answered by filtering — `filter_vessels` offers `q`, `vessel_type`, `berth`, `status` and no
   facility (`backend/app/ops/source.py:171-189`).

2. **The Basseterre Ferry Terminal has no operational surface anywhere.** There is no ferry schedule
   endpoint, no ferry model, no ferry board, no ferry fixture row. Grepping `ferry` across
   `backend/app/ops/` and `backend/app/schemas.py` returns only a contact-directory entry
   (`fixtures.py:309`), a department name (`fixtures.py:469`) and the chat retrieval category
   (`schemas.py:25`). The ferry terminal is one of the four facilities in `CLAUDE.md` and is covered
   by **chat only** — two sample KB rows, both of which say "SAMPLE DATA — not a real sailing time".
   *"What time is the last ferry?"* — the single question the landing page uses as its own headline
   (`frontend/src/routes/index.tsx:58`) — has no real answer in this system today.

3. **Nothing is live.** With `OPS_DATA_SOURCE` unset, every vessel, flight, tariff, position, gate
   and marine-advisory surface renders its no-feed empty state for every facility.

---

## C. Findings

45 findings. Grouped by board for readability; the specified columns are preserved throughout.
"Data class" is `STATIC-KB` (knowledge base / vector store), `LIVE-OPS` (fed by `OPS_DATA_SOURCE`),
or `DERIVED` (computed by this system).

### Board 17 — Vessels (`/vessels`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable w/o contract change? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | 17 | `MetricTile` | "Vessels in port" | OPS-STUB | LIVE-OPS | `GET /api/vessels` → `VesselMetrics.vessels_at_berth` | `vessels_at_berth` | EXISTS | Only a feed. Chain is complete; `none` yields `null` → em dash | YES | `frontend/src/routes/vessels.tsx:183`; `backend/app/schemas.py:408` |
| F-02 | 17 | `MetricTile` | "Expected today" | BACKEND-MISSING | LIVE-OPS | `VesselMetrics.arrivals_today` (design §5.3) | `arrivals_today` | PARTIAL | The field does not exist. UI reads `arrivals_next_24h`, a rolling window under a calendar-day label | NEEDS-CONTRACT-CHANGE | `frontend/src/routes/vessels.tsx:190`; `backend/app/schemas.py:410` |
| F-03 | 17 | `MetricTile` | "Berth occupancy" | HARDCODED | LIVE-OPS | a berth-occupancy field on `VesselMetrics` | none exist | MISSING | Literal `value={null}` in the component. No field is even proposed; §5.3 calls rendering `0` here "the single most dangerous default in the product" | NEEDS-CONTRACT-CHANGE | `frontend/src/routes/vessels.tsx:196` |
| F-04 | 17 | `MetricTile` | "Alongside of expected" ratio | DERIVED | DERIVED | client arithmetic over two server fields | `vessels_at_berth`, `arrivals_next_24h` | PARTIAL | The denominator is `at_berth + arrivals_next_24h`, invented here. `berth_capacity` exists and is **not** used on this screen | YES | `frontend/src/routes/vessels.tsx:205-209`; `backend/app/schemas.py:409` |
| F-05 | 17 | `MetricTile` | `berth_capacity` | ORPHAN-FIELD | LIVE-OPS | `VesselMetrics.berth_capacity` | — | EXISTS | Returned (`4` in fixture); read only by `/ops/vessels`, never by the public `/vessels` screen | YES | `backend/app/ops/fixtures.py:106`; `frontend/src/routes/ops.vessels.tsx:112` |
| F-06 | 17 | `MetricTile` | `daily_cargo_teu` | ORPHAN-FIELD | LIVE-OPS | `VesselMetrics.daily_cargo_teu` | — | EXISTS | Returned (`1111`); read only by the console, never by `/vessels` | YES | `backend/app/ops/fixtures.py:107`; `frontend/src/routes/ops.vessels.tsx:117` |
| F-07 | 17 | `OpsTable` | Vessel rows — name, type, berth, ETA, ATA, status | OPS-STUB | LIVE-OPS | `GET /api/vessels` → `vessels[]` | `id,name,vessel_type,berth,eta,ata,status` | EXISTS | Only a feed. Under `none`: 0 rows → `NoFeedState`. Under `fixture`: 3 invented vessels | YES | `frontend/src/routes/vessels.tsx:267-282`; `backend/app/ops/fixtures.py:66-99` |
| F-08 | 17 | `OpsTable` | Facility scoping of a vessel row | BACKEND-MISSING | LIVE-OPS | a `facility` field on `VesselArrival` | none | MISSING | No model distinguishes Deep Water Harbour from Port Zante. Berth strings are the only signal | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:384-399`; `backend/app/ops/source.py:171-189` |
| F-09 | 17 | `OpsTable` | `agent`, `imo` columns | ORPHAN-FIELD | LIVE-OPS | `VesselArrival.agent` / `.imo` | — | EXISTS | Sent on every row; `/vessels` renders neither (`imo` is search-only). Both are on the console table | YES | `backend/app/schemas.py:389-391`; `frontend/src/routes/vessels.tsx:43` |
| F-10 | 17 | `TableStates.NoFeedState` | "No vessel feed is connected" panel | WIRED-EMPTY | LIVE-OPS | `source.kind === 'unavailable'` + 0 rows | `source` | EXISTS | Nothing — this is the correct, complete rendering of the current state. Recorded because it is what a client sees today | YES | `frontend/src/routes/vessels.tsx:224-226` |
| F-11 | 17 | `VesselStatusChip` | `departed`, `unknown` values | WIRED-EMPTY | LIVE-OPS | `VesselArrival.status` | `status` | EXISTS | No fixture row produces either. Built and untested against real data by design (`08-blocked-and-forbidden.md` #6) | YES | `backend/app/ops/fixtures.py:66-99`; `frontend/src/routes/vessels.tsx:49-56` |
| F-12 | 17 | `Pagination` | `Showing 1–25 of n` | LIVE | DERIVED | `total`/`limit`/`offset` from `GET /api/vessels` | `total` | EXISTS | Nothing on the backend. **MSW ignores `limit`/`offset`**, so pagination is never exercised in tests or mock demos | YES | `frontend/src/routes/vessels.tsx:245-251`; `frontend/src/mocks/handlers.ts:400-445` |
| F-13 | 17 | `SourceNotice` | `live` source-kind banner + dismiss | BACKEND-MISSING | LIVE-OPS | `DataSource.kind === 'live'` | `kind: 'live'` | MISSING | `live` is in the type and unreachable — there is no `OpsSource` that emits it | NO — needs a feed | `backend/app/ops/source.py:101-165`; `backend/app/schemas.py:340` |

### Board 17 — Flights (`/flights`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-14 | 17 | `MetricTile` ×3 | "Arrivals today", "Departures today", "Delayed" | HARDCODED / BACKEND-MISSING | LIVE-OPS | `FlightMetrics.arrivals_today` / `.departures_today` / `.delayed` | all three | MISSING | All three literal `value={null}`. `FlightMetrics` carries `total_flights`, `on_time_percent`, `gates_active`, `gates_total` — **none is one of the three §5.3 names** | NEEDS-CONTRACT-CHANGE | `frontend/src/routes/flights.tsx:151-153`; `backend/app/schemas.py:444-450` |
| F-15 | 17 | `MetricTile` | `on_time_percent`, `gates_active`, `gates_total` | ORPHAN-FIELD | LIVE-OPS | `FlightMetrics` | — | EXISTS | Returned by the feed; the public flights screen reads none of them (console does) | YES | `backend/app/ops/fixtures.py:166-172`; `frontend/src/routes/ops.flights.tsx:77-84` |
| F-16 | 17 | `OpsTable` | Flight rows — no., route, due, gate, airline, status | OPS-STUB | LIVE-OPS | `GET /api/flights` → `flights[]` | `flight_no,port,scheduled_time,estimated_time,gate,airline_code,status` | EXISTS | Only a feed. `fixture` gives 4 invented `ZZ` flights | YES | `frontend/src/routes/flights.tsx:230-249`; `backend/app/ops/fixtures.py:111-163` |
| F-17 | 17 | `OperationalAdvisoryPanel` | Attribution line + caution fill | BACKEND-MISSING | LIVE-OPS | `published_by`, `published_at` on `OperationalAdvisory` | both | MISSING | Design §5.6 requires attribution ("always attributed to whoever published it, with a time"); the fill *is* that claim. Neither field exists, so the panel draws the neutral fill | NEEDS-CONTRACT-CHANGE | `frontend/src/components/ops/AdvisoryPanel.tsx:50-58`; `backend/app/schemas.py:453-463` |
| F-18 | 17 | `OperationalAdvisoryPanel` | `temperature_c`, `systems_status` | ORPHAN-FIELD | LIVE-OPS | `OperationalAdvisory` | — | EXISTS | Sent on every flights response; the `/flights` panel renders `headline` and `detail` only. Read on the console panel | YES | `frontend/src/components/ops/AdvisoryPanel.tsx:75-85`; `frontend/src/components/ops/console/SidePanels.tsx:115-124` |
| F-19 | 17 | `NoFeedState` | "No flight feed is connected" | WIRED-EMPTY | LIVE-OPS | `source.kind` + 0 rows | `source` | EXISTS | Nothing. **MSW has no `ops_unavailable` branch for `/api/flights`** (only `/api/vessels`), so this state cannot be demoed from mocks | YES | `frontend/src/routes/flights.tsx:169-172`; `frontend/src/mocks/handlers.ts:448-482` |
| F-20 | 17 | `FlightStatusChip` | `arrived` value | WIRED-EMPTY | LIVE-OPS | `Flight.status` | `status` | EXISTS | No fixture produces it. Blocked by design (`08-blocked-and-forbidden.md` #6) | YES | `backend/app/ops/fixtures.py:111-163` |

### Board 18 — Tariffs (`/tariffs`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-21 | 18 | `TariffTable` | Code · Charge · Rate · Source rows | OPS-STUB | LIVE-OPS | `GET /api/tariffs` → `tariffs[]` | `code,service,basis,amount,currency,category,as_of` | EXISTS | Under `none`: zero rows. Under `fixture`: 9 invented `SMP-*` rates. **No real SCASPA tariff data exists anywhere in the repo** | YES | `frontend/src/routes/tariffs.tsx:75-95`; `backend/app/ops/fixtures.py:184-265` |
| F-22 | 18 | `TariffTable.SourceCell` | Citation link to the KB row | BACKEND-MISSING | STATIC-KB | `TariffRow.kb_id` + a route rendering a KB row | `kb_id`, a row title | MISSING | `kb_id` is `null` on all 9 fixture rows by deliberate choice ("saying otherwise would fabricate a citation"), and there is no `/kb/:id` route to link to. Cell reads "No source recorded" | NEEDS-CONTRACT-CHANGE | `frontend/src/components/ops/TariffTable.tsx:210-213`; `backend/app/ops/fixtures.py:186-191` |
| F-23 | 18 | `TariffTable` | Category chips | WIRED-EMPTY | LIVE-OPS | `TariffTableResponse.categories` | `categories` | EXISTS | Computed server-side from the whole table (`operations.py:269`). Empty under `none` | YES | `frontend/src/routes/tariffs.tsx:79`; `backend/app/routers/operations.py:269` |
| F-24 | 18 | `TariffCalculators` (maritime) | "Vessel type" select | BACKEND-UNWIRED | DERIVED | `TariffQuoteRequest.vessel_type` | a published list of types; `build_quote` reading it | PARTIAL | The field is accepted and **never used** — `build_quote` prices dockage, pilotage and harbour dues regardless. The select is drawn disabled | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:663`; `backend/app/ops/tariffs.py:103-117` |
| F-25 | 18 | `TariffCalculators` → `build_quote` | Which codes the calculator applies | HARDCODED | DERIVED | `app/ops/tariffs.py` code constants | 7 tariff codes | PARTIAL | **The calculator is hardcoded to the fixture's `SMP-001/002/003/010/011/012/013`.** Load a real tariff table with real codes (`WHF-40`, `TON-GT`…) and every line lands in `unpriced` and the quote totals zero | NO — code change | `backend/app/ops/tariffs.py:39-45` |
| F-26 | 18 | `QuoteResult.UnpricedRow` | The missing charge's **name** | BACKEND-MISSING | DERIVED | a label alongside the code on `TariffQuote.unpriced` | `{code,label}` | PARTIAL | `unpriced` is `list[str]` — codes only. The row prints the bare code because the charge is absent from the table by definition | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:724-732`; `frontend/src/components/ops/QuoteResult.tsx:187-208` |

### Board 19 — Support (`/support`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-27 | 19 | `ContactCard` | Five location cards — name, telephone, post | LIVE | STATIC-KB | `GET /api/support/directory` → `locations[]` | `name,address,contacts[]` | EXISTS | Nothing broken — this is the **one genuinely real data surface in the product**, and it survives `OPS_DATA_SOURCE=none` because `contact_locations()` is on the base class | n/a | `backend/app/ops/source.py:93-98`; `backend/app/ops/fixtures.py:286-320` |
| F-28 | 19 | `ContactCard` | Per-facility telephone numbers and addresses | PLACEHOLDER | STATIC-KB | published per-facility numbers | 5 numbers, 5 addresses | PARTIAL | Four of the five locations have `address: ""` and **all five share the one switchboard number**. Design §6.2 draws five distinct numbers (`869 466 5021`, `869 465 8472`, `869 469 9040`, `869 469 5521`) and two addresses. Those are not in any verified source | YES — but the values must come from the client | `backend/app/ops/fixtures.py:296-320`; `design/06-support-console-voice.md:39` |
| F-29 | 19 | `EnquiryForm` | Department select options | PLACEHOLDER | STATIC-KB | `SupportDirectory.departments` | 7 department names | EXISTS | The seven names are **this project's invention**, not SCASPA's published departments — and `department` is free text on the wire, so a ticket can be routed to a desk nobody staffs | YES — values need client sign-off | `backend/app/ops/fixtures.py:465-473`; `backend/app/schemas.py:806` |
| F-30 | 19 | `EnquiryReceipt` | `SC-nnnn` reference and delivery | BACKEND-MISSING | DERIVED | a ticket store or mail relay | any persistence | MISSING | **A ticket is logged and discarded.** `post_support_ticket` writes one log line and returns a random reference; nothing stores it, nothing forwards it, nobody receives it. The receipt copy is honest ("nobody will contact you first"), but no department gets the enquiry either | NO — needs a delivery mechanism | `backend/app/routers/support.py:115-142` |
| F-31 | 19 | `ContactPointRow` (email) | Published email address | BACKEND-MISSING | STATIC-KB | a published SCASPA email | one address | MISSING | Open TODO. `SCASPA_EMAIL` is `null`; the site obfuscates addresses behind Cloudflare and the scraper deliberately did not decode them | YES — value from client | `frontend/src/lib/scaspa-facts.ts:65`; `data/scraped/flagged_for_client.md:31-40` |
| F-32 | 19 | `ContactPointRow` (extension, web) | Extension / web rows | BACKEND-MISSING | STATIC-KB | — | — | MISSING | **Intentional and should stay missing.** Extensions will never be built ("a caller routed to the wrong security-gate extension is worse off"); rows are drawn in the catalogue and rendered by no screen | NO — by decision | `design/08-blocked-and-forbidden.md:55-59`; `backend/app/ops/fixtures.py:274-280` |

### Board 20 — Console, health, admin (`/ops/vessels`, `/ops/flights`, `/profile`)

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-33 | 20 | `PositionMap` | Vessel position markers, heading, speed | OPS-STUB | LIVE-OPS | `GET /api/ops/positions` → `positions[]` | `lat,lon,heading_degrees,speed_knots,reported_by,reported_at` | EXISTS | **No AIS receiver is connected and none is configured.** Under `none` the plot draws its "No positions are being reported" state, which §6.7 calls "the expected state, not an error" | YES | `backend/app/routers/operations.py:127-148`; `backend/app/ops/source.py:73-74` |
| F-34 | 20 | `GateMap` | Gate tiles, `active`/`total` counts | OPS-STUB | LIVE-OPS | `GET /api/ops/gates` | `gate,status,flight_number,airline,scheduled_at,active,total` | EXISTS | Only a feed. `fixture` gives 5 `Z`-prefixed stands | YES | `backend/app/routers/operations.py:157-180`; `backend/app/ops/fixtures.py:378-402` |
| F-35 | 20 | `MarineAdvisoryPanel` | Notices to mariners | OPS-STUB | LIVE-OPS | `GET /api/ops/advisories` | `port,headline,detail,severity,issued_at` | EXISTS | Only a feed. The empty state is the deliberate not-an-all-clear panel — the one empty state in the product where a wrong sentence has physical consequences | YES — with care | `backend/app/routers/operations.py:189-211`; `backend/app/ops/fixtures.py:405-433` |
| F-36 | 20 | `HealthPanel` | Service state, search, voice | LIVE | DERIVED | `GET /api/health` | `status`, `index.ready` | EXISTS | Nothing. It correctly reports the current index | n/a | `frontend/src/routes/ops.vessels.tsx:96`; `backend/app/routers/health.py:32-86` |
| F-37 | 20 | `IndexStatusPanel` | "Chunks" row | BACKEND-MISSING | STATIC-KB | a chunk count on `IndexStatus` | `chunks` | MISSING | Literal `value={null}` → "unknown". `IndexStatus` carries `kb_rows` and `web_docs`; `web_docs` is a different quantity and wiring it printed `Chunks 0`, which §6.12 forbids by name | NEEDS-CONTRACT-CHANGE | `frontend/src/components/ops/IndexStatusPanel.tsx:63`; `backend/app/schemas.py:952-980` |
| F-38 | 20 | `IndexStatusPanel` | Documents · Built · Version | LIVE | STATIC-KB | `HealthResponse.index` | `kb_rows,index_built_at,kb_version` | EXISTS | Nothing — but it will truthfully report **10 documents from `sample_kb.csv`, version `2026-06-01`** in front of the client | n/a | `data/index_meta.json:2-9` |
| F-39 | 20 | `OperatorProfileCard` | Demo identity card | MOCK-ONLY | LIVE-OPS | `GET /api/ops/profile` → `profile` | whole object | EXISTS | Null on every source but `fixture`, by design. Under the current config `/profile` renders "There is no account" | YES | `backend/app/ops/source.py:82-88`; `frontend/src/routes/profile.tsx:72-76` |
| F-40 | 20 | §6.13 admin panels (not built) | Secret gate, models panel, config summary | BACKEND-UNWIRED | DERIVED | `GET /api/admin/stats` (`X-Admin-Secret`) | `env,models,rate_limit*,tracked_clients` | EXISTS | The endpoint returns everything both panels need — **and is not even registered, because `ADMIN_SECRET` is blank.** Not built is a recorded decision, not a gap (`IMPLEMENTATION_PROGRESS.md` §4.10) | NO — security decision | `backend/app/routers/admin.py:48-80`; `backend/app/main.py:243-246` |
| F-41 | 20 | `ops/SpendSummary.tsx` | Spend tiles, stacked bar, history | ORPHAN-FIELD | DERIVED | `AdminStats.today` / `.history` | `chat_usd,embedding_usd,voice_usd,total_usd` | EXISTS | The component is built and verified and **has no caller outside a test** — its only data source is the unregistered admin endpoint | NO — see F-40 | `frontend/src/components/ops/SpendSummary.tsx`; import scan: only `tests/boards.test.tsx` |

### Boards 05, 15, 16, 21 and the landing page

| ID | Board | Component | Element / field group | Label | Data class | Expected source | Required fields | Backend | What's missing | Mockable? | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-42 | 16 | `ChartBlock` | Meta strip (provenance badge, label, `as_of`) | BACKEND-MISSING | STATIC-KB | `DataSource` on `ChartSpec` | `kind,label,as_of,notice` | PARTIAL | `ChartSpec.source` is a **string** — a `kb-xxx` citation. It carries no kind, label, `as_of` or notice, so the one block in the product that is an operations payload without a meta strip is this one | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:130-132`; `frontend/src/components/chat/ChartBlock.tsx` |
| F-43 | 16 | `CardBlock` (`vessel_arrivals`) | Inline arrivals rows + `Showing 3 of n` | OPS-STUB | LIVE-OPS | `build_card` → `source.vessels()` | same as F-07 | EXISTS | Same feed as F-07. Under `none` the card renders with zero rows and its notice, which is the designed behaviour | YES | `backend/app/ops/cards.py:49-55` |
| F-44 | 16 | `CardBlock` (`flight_schedules`) | Inline flight rows | OPS-STUB | LIVE-OPS | `build_card` → `source.flights()` | same as F-16 | EXISTS | Same feed as F-16 | YES | `backend/app/ops/cards.py:57-65` |
| F-45 | 16 | `ChartBlock` legend | 4-series legend | WIRED-EMPTY | STATIC-KB | `ChartSpec.series` (1–4) | up to 4 series | EXISTS | The schema allows four; `make_chart` produces one. Built and unreachable by design | YES | `backend/app/schemas.py:120-122`; `design/08-blocked-and-forbidden.md:39-43` |
| F-46 | 16 | `ChartBlock` | Real SCASPA statistics to chart | BACKEND-MISSING | STATIC-KB | KB rows carrying annual figures | vessel calls, flights, cruise passengers, cargo tonnes | MISSING | The homepage counters are JavaScript and read `0` over HTTP, so the scraper deliberately stored nothing. Chartable figures exist only in `sample_charts_kb.csv`, which is **not indexed** | YES — values from client | `data/scraped/flagged_for_client.md:9-27`; `data/index_meta.json:4` |
| F-47 | 15 | `DiagnosticsPanel` | "Rate-limit keys tracked" row | BACKEND-UNWIRED | DERIVED | `tracked_clients` outside `/admin/stats` | `tracked_clients` | PARTIAL | Computed in `ratelimit.py`, returned only behind the admin secret. The row renders nothing when the prop is `undefined` | NEEDS-CONTRACT-CHANGE | `frontend/src/components/chat/DiagnosticsPanel.tsx:85-87`; `backend/app/schemas.py:1026` |
| F-48 | 15 | `NoAnswerCard` / `StepLimitCard` | Tool-cap vs low-confidence no-answer | BACKEND-MISSING | DERIVED | a distinct `refusal_category` or `hit_tool_limit` | one discriminator | PARTIAL | `step_limit_reached` now exists on the wire, but the two low-confidence cases still arrive byte-identical | NEEDS-CONTRACT-CHANGE | `backend/app/schemas.py:266-273`; `design/08-blocked-and-forbidden.md:19-23` |
| F-49 | 21 | `SpeakButton` | Cache hit / miss / 304 states | BACKEND-UNWIRED | DERIVED | `X-TTS-Cache` header (already sent + exposed) | header read | EXISTS | Not a wire gap. The header is sent and CORS-exposed; §6.17 puts the caption on the operator screen, which is not built | NO — see F-40 | `backend/app/routers/voice.py:157`; `backend/app/main.py:55` |
| F-50 | 21 | §6.18 speech preview | "Preview the voice" panel | BACKEND-UNWIRED | DERIVED | `POST /api/tts/preview` | `text` | EXISTS | The endpoint exists and is called by `previewSpeech`; the admin-only panel that would host it is not built | NO — see F-40 | `backend/app/routers/voice.py:162-173`; `frontend/src/lib/api.ts:438-451` |
| F-51 | 06 | `DataSourceCard` | Sidebar source card | LIVE | LIVE-OPS | `DataSource` from any ops response | `kind,label,as_of` | EXISTS | Nothing — it correctly draws the hollow neutral "No feed connected" ring today | n/a | `frontend/src/components/shells/Sidebar.tsx`; `design/02-shell-and-navigation.md:79-95` |
| F-52 | 05 | `routes/index.tsx` `ExampleAnswer` | The hero's example answer and citation | HARDCODED | STATIC-KB | — | — | n/a | Entirely literal: a fake 18:00 sailing, a fake citation chip, a fake "Verified on 2026-04-01". Deliberate (the hero must not wait on the backend) and captioned as illustrative, but it is a fabricated SCASPA answer on the first screen a client sees | n/a | `frontend/src/routes/index.tsx:222-244` |
| F-53 | 05 | `routes/index.tsx` `SiteFooter` | Credits line | PLACEHOLDER | — | — | — | n/a | Renders the literal chip **"Team names pending"** in the page footer | n/a | `frontend/src/routes/index.tsx:267-269` |
| F-54 | 13 | `SuggestedQuestions` | The eight opening chips | PLACEHOLDER | LIVE-OPS | — | — | n/a | Six of eight — Vessels in port, Arrivals today, Berth positions, Port advisories, Gate assignments, Cruise call times — ask for live operational facts the assistant is **forbidden** to state (prompt rule 10) and whose feeds are empty. "Cruise call times" has no endpoint at all | YES — rewrite the chips | `frontend/src/features/chat/suggestions.ts:26-36`; `backend/app/agent/prompts.py` rule 10 |
| F-55 | 14 | `SourceEntry` / `CitationChip` | Citation label, snippet, volatility, `as_of` | LIVE | STATIC-KB | `ChatResponse.citations[]` | all five | EXISTS | Nothing. Fully wired end to end — but every value it renders today comes from a sample row (see §D) | n/a | `backend/app/schemas.py:28-61` |
| F-56 | 01 | `Pagination` | Positions / gates / advisories | — | LIVE-OPS | — | — | EXISTS | **Correctly absent.** Those three endpoints take no `limit`/`offset` and return the complete set. Recorded so nobody adds it | n/a | `backend/app/routers/operations.py:127-211`; `design/08-blocked-and-forbidden.md:73` |
| F-57 | 07 | `StatusChip` | `unknown` vessel status | WIRED-EMPTY | LIVE-OPS | `VesselArrival.status` | `status` | EXISTS | Drawn at full fidelity; no data path produces it | YES | `backend/app/schemas.py:379`; `design/05-operations.md:275-277` |
| F-58 | 09 | `QuoteResult` | Subtotal / total / disclaimer | LIVE | DERIVED | `POST /api/tariffs/quote` | `line_items,subtotal,total,disclaimer,source` | EXISTS | Nothing structurally. **But every rate it applies is a fixture rate** — see F-21 and F-25 | YES | `backend/app/routers/operations.py:288-332` |
| F-59 | 11 | `EnquiryReceipt` `TranscriptState` | "Attached" / "Not attached" | LIVE | DERIVED | `SupportTicketResponse.transcript_included` | `transcript_included` | EXISTS | Nothing. Correctly reports what the server did (**MSW always returns `false`**, so the "attached" rendering is only reachable against the real backend) | YES | `backend/app/routers/support.py:120-122`; `frontend/src/mocks/handlers.ts:645` |
| F-60 | 10 | `SpendSummary` | "no price configured" state | WIRED-EMPTY | DERIVED | `AdminStats` price settings | `PRICE_*` env vars | EXISTS | All five `PRICE_*` settings default to `0.0` and are blank in both `.env` files, so every spend figure would be `$0.00` — which §6.14 warns "may mean unpriced, not free" | n/a — see F-40 | `backend/app/config.py:155-159` |

---

## D. Chat & retrieval coverage

### Is the knowledge base ingested and embedded, or only present as a file?

**Both — but not the one that matters.** There are three CSVs in `data/knowledge/`:

| File | Rows | `confirmed` | Indexed? |
|---|---|---|---|
| `sample_kb.csv` | 12 | 10 | **Yes — this is the live index** |
| `sample_charts_kb.csv` | 5 | 5 | No |
| `scaspa_kb_2026-07-31.csv` | **232** | **116** | **No** |

`data/index_meta.json:4-5` names `sample_kb.csv` and `kb_rows_indexed: 10`; the Chroma
`scaspa_kb` collection holds exactly 10 embeddings (verified by read-only sqlite query). The
`scaspa_web` collection holds **0** — no scraped page has ever been embedded, and
`index_meta.json:10` agrees (`web_docs: 0`).

**The ten indexed rows are deliberately fake, and every one says so in its own answer text.** A
sample of what the live assistant retrieves today:

- `kb-008` "How much is a ferry ticket?" → *"SAMPLE DATA — not a real fare. Placeholder one-way fare is XCD 44.44…"*
- `kb-004` "What is the container handling charge at the Deep Water Harbour?" → *"SAMPLE DATA — not a real tariff. Placeholder charge is XCD 333.33…"*
- `kb-012` "How do I contact SCASPA?" → *"SAMPLE DATA — not real contact details. A placeholder desk answers on 555-0100…"*

**There is not one real SCASPA fact in the live retrieval index.** The 232-row researched KB —
which does contain real content, real `source_url`s and `as_of` dates from 2021-09-09 to
2026-07-31 — has never been built into an index.

A second, quieter problem: `KB_CSV_PATH` is **blank in both `.env` files**, so it falls back to
`../data/knowledge/latest.csv` (`backend/app/config.py:190`) — **a file that does not exist**. Any
rebuild that relies on the default path will fail or find nothing. `UNVERIFIED`: I did not run
`scripts/build_index.py` to observe the failure mode.

### Which facilities have thin or absent KB coverage

Against the **live index** (10 rows), coverage is uniformly minimal and entirely fictional:

| Facility | Indexed rows | Which |
|---|---|---|
| Deep Water Harbour | 3 | `kb-004` handling charge, `kb-005` gate hours, `kb-006` clearance documents |
| Port Zante | 2 | `kb-001` arrival window, `kb-002` Wi-Fi |
| Basseterre Ferry Terminal | 2 | `kb-007` sailing time, `kb-008` fare |
| RLB International Airport | 2 | `kb-010` arrive-early advice, `kb-011` parking |
| General | 1 | `kb-012` contact |

Against the **researched KB, if it were indexed** (116 confirmed rows), the picture inverts and the
thin facility is the ferry:

| Category | Confirmed rows | Note |
|---|---|---|
| `corporate` | 22 | Mostly leadership (12 rows) |
| `airport` | 19 | The best-covered facility |
| `cruise` | 18 | Port Zante berthing, piers, operations |
| `marine` | 16 | Pilotage, tugs, MARSEC, conditions |
| `general` | 15 | |
| `cargo` | 10 | Thin for the Authority's main cargo business |
| **`ferry`** | **7** | **Thinnest facility by a wide margin** |
| `payments` / `access` | 8 | |
| `jobs` | 1 | |

Two structural notes on that KB. First, **half of it would be discarded**: 89 rows are `probable`
and 27 are `unverified`, and only `confirmed` rows are indexed (`backend/app/rag/models.py:42`).
The airport loses the most — 53 of its 72 rows are non-confirmed. Second, **five of its ten
categories are not valid retrieval filters**: `CATEGORIES` accepts `ferry, cargo, cruise, airport,
general` (`backend/app/schemas.py:25`), while the KB also uses `marine`, `payments`, `access`,
`jobs` and `corporate`. Those 47 confirmed rows can still be retrieved semantically, but no client
can filter to them and `classify_category` can never select them
(`backend/app/rag/rewrite.py:56-77`).

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

| Question | Answer |
|---|---|
| Provider | OpenAI, both directions — `OpenAI(api_key=settings.OPENAI_API_KEY)` at `backend/app/voice/stt.py:196` and `tts.py:247` |
| Models | `settings.OPENAI_TRANSCRIBE_MODEL` (default `gpt-transcribe`), `OPENAI_TTS_MODEL` (`gpt-4o-mini-tts`), voice `marin`. No model name is hardcoded — `CLAUDE.md` rule 2 holds |
| Keys | `OPENAI_API_KEY` is populated in both `.env` files. **`UNVERIFIED`** — I did not call the provider, so I cannot confirm the key is valid or that the account has access to those models |
| Reachable? | Yes. `/api/stt`, `/api/tts` and `/api/tts/preview` are registered unconditionally (`backend/app/main.py:236`); the frontend flag `VITE_ENABLE_VOICE=true` |
| Limits enforced | 20 MB, ~60 s, an allow-list of content types, and a separate `voice` rate-limit scope. Each error names the measured value and the limit, per §6.16 |
| Language | `LANGUAGE_HINT = "en"`, pinned (`stt.py:79`). Dictation is English only |
| Privacy | Audio is read into memory and dropped; only synthesised output is cached (`data/tts_cache/`, one file present) |
| Gaps | The three cache-state captions (F-49) and the §6.18 preview panel (F-50) have no surface, because both belong to the unbuilt operator screen |

---

## E. Contract divergences

| # | Divergence | MSW | TS types | Backend | Authoritative | Impact |
|---|---|---|---|---|---|---|
| E-1 | Tariff row count | 5 rows (`MOCK_TARIFFS`) | n/a | 9 rows | **Backend** | Mock omits `SMP-002/003/020/030`, so the maritime calculator's pilotage and harbour-dues lines are never exercised in a mock demo. `opsFixtures.ts:143-194` vs `fixtures.py:184-265` |
| E-2 | Tariff categories | Hardcoded `['cargo','maritime']` | `string[]` | Sorted from the whole table → `['aviation','cargo','maritime','passenger']` | **Backend** | Two of four category chips never appear under mocks. `handlers.ts:555` vs `operations.py:269` |
| E-3 | Support directory | 2 locations, 3 departments | n/a | 5 locations, 7 departments | **Backend** | The mock cannot exercise the empty-address collapse on cards 4–5, which §6.2 specifically requires. `opsFixtures.ts:204-228` vs `fixtures.py:286-320,465-473` |
| E-4 | Gate map | 4 gates (`Z1,Z2,Z3,Z4`) | n/a | 5 gates (`Z1…Z5`) | **Backend** | Mock `active` = 2 of 4; backend = 2 of 5. `opsFixtures.ts:315-332` vs `fixtures.py:378-402` |
| E-5 | Vessel positions | 2 positions | n/a | 3 positions | **Backend** | Mock omits `fx-vessel-2`; the `estimated` marker shape is unreachable in both |
| E-6 | `/api/flights` no-feed state | no `ops_unavailable` branch | n/a | returns `unavailable` under `none` | **Backend** | The flights screen's `NoFeedState` cannot be demoed from mocks. `handlers.ts:448-482` |
| E-7 | Query-parameter fidelity | `/vessels` ignores `vessel_type`, `berth`, `limit`, `offset`; `/flights` ignores `airline`, `status`, `limit`, `offset`; `/tariffs` ignores `limit`, `offset` | typed in `VesselQuery`/`FlightQuery`/`TariffQuery` | all implemented | **Backend** | Pagination and three filters are untested. `handlers.ts:400-559` vs `source.py:171-232` |
| E-8 | `TariffQuote.unpriced` | **omitted** from the mock response | `unpriced: string[]` (required) | `list[str]`, always present | **Backend** | Survives only because zod defaults it to `[]` (`schemas.ts:348`). The "Total so far" / unpriced-line rendering is unreachable under mocks |
| E-9 | `volatility` default | n/a | `types.ts:69` says *"Null or absent → treated as `high`"*; `citations.ts:260` implements `medium` | sends `null`, never guesses | **The contract** (`api-contract.md:172-178` says `medium`) | Doc-only. The code is correct; two comments and `frontend/docs/backend-issues.md` are stale |
| E-10 | Endpoint summary table | n/a | n/a | 17 routes registered | **Backend** | `docs/api-contract.md:11-22` lists 12 endpoints and omits all four `/api/ops/*`. They are documented in full at lines 779-806, so the summary table alone is incomplete |
| E-11 | `refusal_category` | sends two known values | closed union of 2 + `null` | `str \| None`, free-form | **Backend** | A third category added server-side would be coerced by zod rather than rendered. Low risk, worth knowing |
| E-12 | KB categories vs retrieval filter | n/a | `Category` = 5 values | `CATEGORIES` = 5 values; the researched KB uses **10** | **The KB is the outlier** | `marine`, `payments`, `access`, `jobs`, `corporate` — 47 confirmed rows — are unfilterable and unclassifiable. `schemas.py:25` vs `scaspa_kb_2026-07-31.csv` |
| E-13 | `/api/admin/stats` | **no handler** | no types | exists, conditionally registered | **Backend** | No client, no mock, no types. Consistent with the §4.10 decision not to build the gate |

---

## F. Grouped summary

### 1. Already implemented (real data, end to end)

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
| `vessel_type` | `POST /api/tariffs/quote` | Accepted by the schema and never read by `build_quote` |

### 3. Backend missing

| What | Nature |
|---|---|
| **Any real operational feed** | No `OpsSource` implementation beyond `none` and `fixture`. This is the single largest gap in the product |
| **A ferry surface** | No model, no endpoint, no board, for one of the four facilities |
| **Facility scoping on ops models** | No field distinguishes Deep Water Harbour from Port Zante on any row |
| `arrivals_today` on `VesselMetrics` | Design §5.3 tile |
| A berth-occupancy field | Design §5.3 tile; nothing proposed |
| `arrivals_today`, `departures_today`, `delayed` on `FlightMetrics` | All three §5.3 flight tiles |
| `published_by`, `published_at` on `OperationalAdvisory` | The caution fill is the attribution claim |
| A chunk count on `IndexStatus` | §6.12 |
| A label alongside each `unpriced` code | §5.11 |
| A KB-row route, and `kb_id` on real tariff rows | §5.9's source-cell link |
| `DataSource` on `ChartSpec` | §4.1's meta strip |
| A tool-cap discriminator | §3.9 cards 3 and 4 |
| Ticket delivery or persistence | Tickets are logged and dropped |
| The published email address | Open TODO, needs the client |
| Real annual statistics | Homepage counters read `0`; nothing was stored |

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

| Rank | ID | Finding | Vis | Effort | Risk | Why here |
|---|---|---|---|---|---|---|
| 1 | §D | **Index the real 232-row KB** (currently 10 fake rows) | 5 | S | LOW | Every answer in the demo currently begins "SAMPLE DATA — not a real…". One script run and an explicit `KB_CSV_PATH` changes the entire chat experience. Nothing else on this list moves the needle as far for as little |
| 2 | F-01,07,16,21 | **Set `OPS_DATA_SOURCE=fixture`** for the demo environment | 5 | S | LOW | Three screens and two chat cards are empty panels today. One environment variable populates all of them. Refused at boot if `ENV=prod`, which is the correct guard |
| 3 | F-21,25 | Real-shaped tariff table + matching calculator codes | 5 | M | LOW | The tariff screen is the most concrete "this is worth money" surface in the demo, and the calculator silently produces nothing if the codes and the table disagree. Must be one change |
| 4 | F-14 | Three flight tiles read "not reported" | 5 | M | **MED** | Three em dashes at the top of the flights screen, permanently. Needs `arrivals_today`, `departures_today`, `delayed` on `FlightMetrics` |
| 5 | F-02,03 | "Expected today" is a rolling window; "Berth occupancy" is a literal null | 4 | M | **MED** | Two of the four vessel tiles. F-03 needs a field nobody has specified yet |
| 6 | F-54 | Six of eight opening chips ask for things the assistant may not answer | 4 | S | LOW | The first thing a visitor taps, and the fastest route to a refusal on stage. Rewriting the chips to what the KB actually covers is a data change in one file |
| 7 | F-08 | No facility field on any ops row | 4 | M | **HIGH** | "Show me Port Zante" is the obvious question for a four-facility authority and cannot be answered. Touches every ops model, the filters and the mocks |
| 8 | F-53,52 | "Team names pending" chip and the hardcoded example answer on `/` | 4 | S | LOW | Literally the first screen. A visible placeholder chip in the footer of the landing page |
| 9 | F-30 | Support tickets are logged and discarded | 3 | M | LOW | Invisible in a demo, serious in production: someone sends an enquiry, gets a reference, and no department ever sees it |
| 10 | F-42 | `ChartBlock` has no meta strip | 3 | M | **MED** | The one operations payload in the product that does not state its own provenance — the exact rule the design calls "the single most important rule in the implementation" |

Just below the line, in order: F-17 (advisory attribution, vis 3, M, MED), F-22 (tariff citation
link, vis 3, L, MED), F-37 (index "Chunks" unknown, vis 2, S, MED), F-26 (unpriced charge name,
vis 2, S, MED), F-47 (`tracked_clients`, vis 1, S, MED).

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
7. **Should the Basseterre Ferry Terminal have an operations surface?** It has none, and the ferry
   is the most frequently asked-about facility on a landing page whose headline is about it.
8. **Is the admin gate wanted?** (§4.10.) It blocks the spend panel, the models panel, the config
   summary, `tracked_clients` and the three TTS cache captions — five findings on one decision.
9. **Which environment will the demonstration run in?** `fixture` (populated, obviously fake, refuses
   `ENV=prod`) or `none` (honest empty states)? This decides how half this report reads on the day.

### Assumptions made

1. **The design spec (`design/*.md` + `IMPLEMENTATION_PROGRESS.md`) is authoritative**, as instructed
   — over `docs/api-contract.md` where the two disagree.
2. **Verdicts are taken against the current configuration** (`OPS_DATA_SOURCE` unset, index = 10
   sample rows). Under `fixture` most `EMPTY` verdicts become "populated with obviously-fake data",
   which is still not `LIVE`.
3. **I did not run the backend, the frontend, the test suite, the index build or any endpoint**, per
   the read-only constraint. Statements about what a request returns are derived from reading the
   router, the source class and the fixture module together.
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

- **`frontend/src/routes/ops.flights.tsx:219-224`** — a local `formatTime` using
  `toLocaleTimeString(undefined, …)`. On a US-locale browser this renders `06:40 AM` in the console's
  flight-time column. `IMPLEMENTATION_PROGRESS.md` records this exact defect being fixed three times
  elsewhere (`TimeCell`, `SourceAge`, `EnquiryReceipt`); this is a fourth instance the sweep missed.
- **`frontend/src/routes/index.tsx`, `profile.tsx`, `ops.flights.tsx`** still use the pre-handoff
  `ops-*` palette (`bg-ops-navy`, `text-ops-ink`, `bg-neutral-100`). Consistent with §5a item 1,
  which records that `/vessels` and `/flights` were never moved into the design's app shell.

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
