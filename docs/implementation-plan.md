# Implementation plan — SCASPA client demonstration

**Prepared:** 2026-08-03 · **Branch:** `feat/connect-halves-and-import-mockups`
**Inputs:** the repository, `design/**` (27 boards), `design/IMPLEMENTATION_PROGRESS.md`,
`docs/data-audit.md` (45 findings).
**Method:** read-only. Nothing was built, run, migrated or seeded. Claims that could only be
settled by executing something are marked `UNVERIFIED`.

## Demo context — authoritative scope

| | |
|---|---|
| **Runway** | 5 working days (~10–15 working sessions) |
| **Audience** | Mixed — SCASPA operational staff and management **plus their IT/technical staff** |
| **Walkthrough path** | `/chat` → `/vessels` → `/flights` → `/tariffs` → `/support` — boards 05/13/14/15/16, 17, 18, 19 |
| **Data posture** | `OPS_DATA_SOURCE=fixture`, upgraded to realistic SCASPA-shaped values — **and it must be impossible to mistake that data for live operational data** |
| **Out of path** | Boards 00–04, 06–12, 20 (console/health/admin), 21 (voice), 22, 00a (widget). Planned below, not scheduled. |

Two consequences of the audience that shape everything below. First, **IT staff will ask how the
ops feed plugs in** — so the `OpsSource` interface, the schema changes and the blocked-on-client
asks need to be answerable on the day, not deflected. Second, **a visible design discontinuity
reads as "unfinished"** to a technical viewer; that is why T-15 is on the critical path rather than
in the backlog (see §4).

The data-posture instruction is the sharpest constraint in the brief and is treated as a
first-class engineering requirement, not a fixture-writing style note. It is specified in T-08 and
enforced as a coupled unit (§2, CU-3).

---

## 0. Reconciliation — `IMPLEMENTATION_PROGRESS.md` against code

The doc is largely accurate on components. It is **not** accurate on its own board count, on one
"defect fixed" claim, or on the reproducibility of its green-gate table — and it misses one
duplication that its own board-22 pass existed to catch.

| # | Claimed | Actual | Evidence |
|---|---|---|---|
| 0.1 | "Every board, 00 through 22, is implemented or verified … Nothing is partially implemented" | **PARTIAL** — six boards carry ⚠️ in the same table, and §4.10 states §6.13 is **not built** | `IMPLEMENTATION_PROGRESS.md:8-10` vs `:98-104`, `:591-615` |
| 0.2 | "Completion — all **23** boards" | **NOT-FOUND** — §2's table enumerates **27** (`00`, `00a`–`00d`, `01`–`22`) | `IMPLEMENTATION_PROGRESS.md:981` vs `:77-106` |
| 0.3 | Board 17 — `VesselCard` / `FlightCard` deleted | **VERIFIED** | `git status`: `D frontend/src/components/ops/VesselCard.tsx`, `D …/FlightCard.tsx` |
| 0.4 | Board 17 — source banner rendered once per screen | **VERIFIED** — only `OpsPage` draws it | `frontend/src/routes/vessels.tsx:169-180`; `flights.tsx:136-142`; `components/ops/OpsPage.tsx:68` |
| 0.5 | Board 17 — §5.3's three flight tiles, all em-dashed, no `total_flights` under a direction label | **VERIFIED** | `frontend/src/routes/flights.tsx:150-154` |
| 0.6 | Board 17 — §5.6 advisory panel has a caller | **VERIFIED** | `frontend/src/routes/flights.tsx:163` |
| 0.7 | Board 17 — the 24-hour clock defect fixed; "`SourceAge` was the third instance" | **PARTIAL — a fourth instance survives.** A local `formatTime` using `toLocaleTimeString` renders `06:40 AM` on a US-locale browser | `frontend/src/routes/ops.flights.tsx:219-224` |
| 0.8 | Board 18 — maritime calculator built; §5.10's two forms | **VERIFIED** | `components/ops/TariffCalculators.tsx` (359 lines); `routes/tariffs.tsx:100-101` |
| 0.9 | Board 18 — the tariff table is a `ProvenanceCard` with `OpsTable bare` | **VERIFIED** | `components/ops/TariffTable.tsx:4,75,114-115,158` |
| 0.10 | Board 18 — `keepPreviousData` on `useTariffs` | **VERIFIED** | `features/ops/queries.ts:144` |
| 0.11 | Board 19 — four orphaned components now on `/support` | **VERIFIED** | `routes/support.tsx:4-8,71-110` |
| 0.12 | Board 20 — `console/SidePanels`' map, gate and marine panels deleted | **VERIFIED** — only `ActivityPanel` and `AdvisoryPanel` remain | `components/ops/console/SidePanels.tsx:37,102` |
| 0.13 | Board 22 — "one event, one treatment" sweep complete | **NOT-FOUND — new drift.** **Two** operational-advisory components render the same `advisory` payload with different fields: the console's shows `temperature_c` and `systems_status`, the public one drops both | `components/ops/console/SidePanels.tsx:102,115-124` vs `components/ops/AdvisoryPanel.tsx:44,75-85`; callers `ops.flights.tsx:7,52` vs `flights.tsx:5,163` |
| 0.14 | Board 22 — §7.6 copy toast built | **VERIFIED** | `components/ui/CopyToast.tsx` present |
| 0.15 | §5 backend-blocked table, 13 items, each gated on a named field | **VERIFIED** (9 spot-checked) | #1 `DiagnosticsPanel.tsx:85-87`; #2 `schemas.py:130-132`; #3 `vessels.tsx:190`; #4 `flights.tsx:151-153`; #5 `AdvisoryPanel.tsx:50-53`; #6 `TariffTable.tsx:210-213`; #7 `tariffs.py:103-117`; #8 `schemas.py:724`; #9 `IndexStatusPanel.tsx:63` |
| 0.16 | §5a #1 — `/vessels` and `/flights` are not in the app shell | **VERIFIED, STILL OPEN — and worse than recorded.** `FullPageShell` is imported by **one** route. Four of the five walkthrough screens render in the legacy `ops-*` chrome | `routes/chat.tsx:2,13` is the only import; `components/ops/OpsPage.tsx:41-51` |
| 0.17 | §5a #2 — telephone numbers render `869-465-8121`, not §10's `869 465 8121` | **VERIFIED, STILL OPEN** — 22 hyphenated call sites against 5 spaced | `lib/scaspa-facts.ts:31-33`; repo-wide grep |
| 0.18 | §8 — "tests 824 passed / 25 files" | **UNVERIFIED** (read-only). File count is consistent: 24 in `frontend/tests/` + 1 in `src/lib/__tests__/` | `ls frontend/tests/*.test.*` |
| 0.19 | §8 — "backend … 561 pytest passed" | **UNVERIFIED** (read-only). 22 test files present | `ls backend/tests/test_*.py` |
| 0.20 | §8 — "a11y 0 axe violations, 0 manual checks failed" | **PARTIAL — not reproducible from a clean checkout.** `check:a11y` is **not in CI**, and `playwright` / `@axe-core/playwright` are deliberately unsaved; the script exits 2 without them and additionally needs a running backend | `scripts/a11y-check.mjs:11-28`; `package.json` devDependencies; `.github/workflows/frontend.yml` |
| 0.21 | §8 — `check:responsive` "should not be read as green"; 27 reports | **VERIFIED as self-described.** Consistent with the doc; not a gate | `IMPLEMENTATION_PROGRESS.md:940-962` |
| 0.22 | `docs/data-audit.md` configuration findings | **VERIFIED, all three still true** — `OPS_DATA_SOURCE` absent from both `.env`; index = 10 rows from `sample_kb.csv`; `ADMIN_SECRET` blank | `config.py:220`; `data/index_meta.json:4-5`; `main.py:243-246` |

**Net:** two counting errors, one unfixed defect off the demo path (0.7), one genuine new
duplication on the demo path (0.13), one green-gate claim that cannot be reproduced (0.20), and two
correctly-recorded open items that the chosen walkthrough promotes from "known" to "blocking"
(0.16, 0.17). Everything else the doc claims about components is true.

---

## 1. Task graph

Derived from `docs/data-audit.md` findings. **Demo-required** is judged strictly against the
walkthrough path. Session count assumes one focused working session ≈ half a day.

| ID | Description | Prereqs | Unlocks | Risk if postponed | Risk if too early | Files | Layer | Demo | Effort |
|---|---|---|---|---|---|---|---|---|---|
| **T-01** | Rebuild the search index against `scaspa_kb_2026-07-31.csv` (116 confirmed rows) | T-02 | T-03, T-04; every chat answer | **The demo opens with "SAMPLE DATA — not a real fare."** Highest-visibility defect in the product | Retrieval quality is unmeasured against the new corpus; a bad `RETRIEVAL_MIN_SCORE` shows as false no-answers | `data/index_meta.json`, `backend/scripts/build_index.py`, `data/chroma/**` | data | **YES** | S · 1 |
| **T-02** | Fix `KB_CSV_PATH` — the default resolves to `data/knowledge/latest.csv`, which does not exist | — | T-01 | Any rebuild using defaults silently finds nothing | None | `backend/app/config.py:190`, `backend/.env` | config | **YES** | S · 0.5 |
| **T-03** | Reconcile retrieval categories with the KB's ten (`marine`, `payments`, `access`, `jobs`, `corporate` are unfilterable today) | T-01 | Correct classification for 47 confirmed rows | 47 confirmed rows are semantically reachable but never category-filtered; `classify_category` can never select them | Widening before the index exists cannot be tested | `backend/app/schemas.py:25`, `backend/app/rag/rewrite.py:56-77`, `frontend/src/lib/types.ts:22` | backend | **YES** | M · 1 |
| **T-04** | Rewrite the eight opening chips to questions the indexed KB answers | T-01 | A demo that does not open on a refusal | Six of eight chips ask for live-ops facts prompt rule 10 forbids answering (F-54). First thing a visitor taps | Rewriting before T-01 targets the wrong corpus | `frontend/src/features/chat/suggestions.ts:26-36` | frontend | **YES** | S · 0.5 |
| **T-05** | Set `OPS_DATA_SOURCE=fixture` in the demo environment | T-09…T-13 | Populated boards 17, 18 | Five walkthrough screens are empty panels | **Flipping it before T-08/T-09 puts today's thin fixtures on screen with no integrity treatment** | `backend/.env` | config | **YES** | S · 0.25 |
| **T-06** | Add `facility` to `VesselArrival`, `GateAssignment`, `TariffRow`; extend `filter_vessels`/`filter_tariffs`; add the query parameter | — | T-09, T-10, T-11; any per-facility question | "Show me Port Zante" is unanswerable — F-08. Deep Water Harbour and Port Zante are distinguishable only by a berth-string convention | Schema churn before the enum values are agreed | `backend/app/schemas.py:384-399,524-533,625-638`, `app/ops/source.py:171-232`, `app/routers/operations.py:57-85`, `frontend/src/lib/{types,schemas}.ts` | backend | **YES** | M · 2 |
| **T-07** | Add `arrivals_today` to `VesselMetrics`; `arrivals_today`, `departures_today`, `delayed` to `FlightMetrics` | — | T-09, T-10; four metric tiles | Four of seven tiles on the two busiest screens read `—` permanently (F-02, F-14) | None | `backend/app/schemas.py:402-411,444-450`, `app/ops/fixtures.py:102-108,166-172`, `frontend/src/routes/vessels.tsx:190`, `flights.tsx:151-153` | backend | **YES** | M · 1.5 |
| **T-08** | **Fixture-integrity contract** — specify and document the four-layer scheme that makes realistic fixtures impossible to mistake for live data (§2, CU-3) | — | T-09, T-10, T-11, T-14 | Realistic fixtures ship with only today's conventions behind them — the exact `CLAUDE.md` rule 5 failure, made worse by better-looking data | None. This is design work with no code | `docs/decisions.md` (new record), `backend/app/ops/fixtures.py:1-29` (docstring) | data | **YES** | S · 1 |
| **T-09** | Regenerate vessel arrivals + positions to realistic shape under the T-08 contract | T-06, T-07, T-08 | Board 17 vessels; chat `vessel_arrivals` card | Vessels screen shows 3 rows and no `departed`/`unknown` chip ever renders | Generating before T-06/T-07 means regenerating after them | `backend/app/ops/fixtures.py:66-108,334-375` | data | **YES** | M · 1.5 |
| **T-10** | Regenerate flights + gates to realistic shape under the T-08 contract | T-06, T-07, T-08 | Board 17 flights | Flights screen shows 4 `ZZ` rows; `arrived` chip never renders | Same as T-09 | `backend/app/ops/fixtures.py:111-172,378-402` | data | **YES** | M · 1.5 |
| **T-11** | Real-shaped tariff table — 25–30 rows, five §5.9 categories, the design's code convention | T-06, T-08 | Board 18 step 1 | Tariff board shows 9 `SMP-*` rows in 4 categories, not §5.9's 5 | Generating before T-06 means adding `facility` to 30 rows afterwards | `backend/app/ops/fixtures.py:184-265` | data | **YES** | M · 1.5 |
| **T-12** | Update the calculator's code constants to match T-11 | T-11 | Board 18 step 2 | — | — | `backend/app/ops/tariffs.py:39-45` | backend | **YES** | S · 0.5 |
| **T-13** | Mirror every regenerated fixture into MSW; close divergences E-1…E-8 | T-09, T-10, T-11, T-12 | A green test suite; mock-driven demo fallback | **The suite goes red the moment backend fixtures change**, and eight known mock/backend divergences persist | Mirroring before the backend fixtures settle is wasted work | `frontend/src/mocks/opsFixtures.ts`, `mocks/handlers.ts:400-623` | frontend | **YES** | M · 2 |
| **T-14** | Fixture-mode render treatment — the visible, non-dismissible layer of the T-08 contract | T-08 | The data-posture requirement | Realistic values on screen with only a text notice between them and a screenshot | Building before T-08 fixes the treatment before the contract is agreed | `frontend/src/components/ops/ProvenanceCard.tsx`, `SourceNotice.tsx`, `styles/tokens.css` | frontend | **YES** | M · 1.5 |
| **T-15** | Move `/vessels`, `/flights`, `/tariffs`, `/support` into `FullPageShell` | — | A walkthrough with one chrome | **Four of five walkthrough screens change chrome mid-demo** — legacy navy bar and a "← Assistant" link, in front of technical viewers (0.16) | Doing it *after* fixtures means re-verifying every populated screen (§4) | `frontend/src/components/ops/OpsPage.tsx`, `routes/{vessels,flights,tariffs,support}.tsx`, `components/shells/FullPageShell.tsx` | frontend | **YES** | L · 3 |
| **T-16** | Consolidate the two operational-advisory components into one (drift 0.13) | — | §7 "one event, one treatment"; F-18 | Two renderings of one payload on two screens; the public one silently drops two fields | None | `components/ops/AdvisoryPanel.tsx`, `components/ops/console/SidePanels.tsx:102-127`, `routes/flights.tsx:163`, `ops.flights.tsx:52` | frontend | **YES** | S · 1 |
| **T-17** | Telephone-format sweep to §10's spaced form (22 call sites) | — | Copy consistency | Two formats of the Authority's own number on screen (0.17). Several strings are the backend's error copy | Doing it before the copy sweep list is settled means two passes | `frontend/src/lib/scaspa-facts.ts:31-33` + 21 sites; `backend/app/agent/prompts.py:20` | frontend | NO | S · 1 |
| **T-18** | Landing page: remove the "Team names pending" chip; re-caption `ExampleAnswer` | — | First-impression polish | A literal placeholder chip in the footer of the first screen (F-53) | None | `frontend/src/routes/index.tsx:222-244,267-269` | frontend | **YES** | S · 0.5 |
| **T-19** | Berth-occupancy: specify the field or ratify the em dash | T-06 | The fourth vessels tile (F-03) | A hardcoded `null` with no field even proposed | Adding a field before SCASPA says whether they measure occupancy invents a metric | `backend/app/schemas.py:402-411`, `frontend/src/routes/vessels.tsx:196` | backend | NO | M · 1 |
| **T-20** | `published_by` / `published_at` on `OperationalAdvisory` (F-17) | T-16 | §5.6's caution fill | Advisory panel draws the neutral fill; the attribution claim cannot be made | None | `backend/app/schemas.py:453-463`, `components/ops/AdvisoryPanel.tsx:50-53` | backend | NO | M · 1 |
| **T-21** | `DataSource` on `ChartSpec` (F-42) | — | Board 16's chart meta strip | The one operations payload with no provenance strip | None | `backend/app/schemas.py:105-132`, `components/chat/ChartBlock.tsx` | backend | NO | M · 1.5 |
| **T-22** | Support-ticket delivery or persistence (F-30) | — | A ticket that reaches a human | Enquiries are logged and discarded. **IT staff will ask about this** | None | `backend/app/routers/support.py:115-142` | backend | NO | L · 3+ |
| **T-23** | Demo rehearsal — drive the walkthrough end to end, freeze | all demo-YES | Confidence | Untested path on the day | Rehearsing before M4 rehearses the wrong build | `frontend/src/dev/Rehearsal.tsx`, `scripts/integration-check.mjs` | infra | **YES** | S · 1 |

**Demo-required total:** 15 tasks ≈ **19 sessions** against a ~10–15 session runway. That does not
fit. §4 and §5 resolve it: T-15 (3 sessions) is the explicit go/no-go, and T-13 can degrade to a
narrower mirror. See the M3 exit gate.

---

## 2. Coupled units — atomic, unsafe to ship apart

Four clusters where completing one half breaks something that currently passes.

### CU-1 — Tariff table and calculator codes · **T-11 + T-12**

The example named in the brief, verified. `backend/app/ops/tariffs.py:39-45` hardcodes
`SMP-001/002/003/010/011/012/013`. `build_quote` looks each up by code and, on a miss, appends to
`unpriced` and omits the line (`tariffs.py:96-100`). Replace the table with real-shaped codes
(`WHF-40`, `TON-GT`, `DCK-FT`…) and **every line lands in `unpriced`, `total_of([])` returns
`0.0`, and the quote renders "Nothing to charge for those figures"** — §5.11's zero-line variant,
which suppresses the total entirely. No test fails: the arithmetic is still correct, the disclaimer
is still present, the schema still validates. It fails silently and only on screen.

*Ship together. Exit check:* a cargo quote for 12 × 40 ft with 3 storage days returns ≥ 3 line
items and a non-zero subtotal, and `unpriced` is empty.

### CU-2 — Backend fixtures and MSW mirror · **T-09 + T-10 + T-11 + T-12 → T-13**

`frontend/src/mocks/opsFixtures.ts:1-13` states the mirror obligation explicitly, and
`frontend/tests/operations.test.tsx` drives `/vessels`, `/flights`, `/tariffs` and `/support`
through the real route tree against MSW. Change the backend fixtures alone and CI still passes
while the two halves disagree — which is precisely the failure mode `IMPLEMENTATION_PROGRESS.md`
§9 identifies as this project's recurring one ("a component that was correct and a screen that was
not"). Change the mocks alone and the demo environment shows different data from the test suite.

*Ship as one unit.* T-13 also closes E-1…E-8 from the audit, including the mock's missing
`unpriced` field and the absent `ops_unavailable` branch on `/api/flights`.

### CU-3 — The fixture-integrity contract · **T-08 + T-09 + T-10 + T-11 + T-14**

**This unit exists because of the demo-context instruction: realistic shape, impossible to
mistake.** Those two goals pull against each other, and the resolution has to be structural. Today
the only thing standing between sample data and a customer is a naming convention
(`fixtures.py:1-29`) plus a boot guard. Make the values realistic and that convention stops
working — the better the data looks, the less the notice is read.

The contract to specify in T-08 and implement across T-09…T-11 and T-14, in four layers, ordered
by how hard each is to defeat:

| Layer | Mechanism | Status |
|---|---|---|
| **1 — Schema** | `DataSource._fixture_must_warn` refuses to construct a `fixture` source without a notice; `ProvenanceCard` takes `source` as required with no suppress prop | **Already exists** (`schemas.py:365-376`). Do not weaken |
| **2 — Deployment** | `main.py:193-206` refuses to boot with `fixture` when `ENV=prod` | **Already exists.** Becomes load-bearing rather than belt-and-braces once values are realistic — say so in the decision record |
| **3 — Value** | **Realistic in every field that shapes the layout; unmistakably synthetic in every field that could be written down and acted on.** Realistic: berth and pier identifiers, gate designators, tariff codes and bases, times, statuses, quantities, route structure. Synthetic: vessel names, IMO numbers (check-digit-invalid), airline names and codes (a 2-letter code IATA does not assign), flight numbers, **and every money amount** — repeated-digit throughout (`44.44`, `222.22`, `5.55`) | **New in T-09…T-11.** This is the layer that does the real work: a screen that behaves exactly like the real thing and contains not one quotable figure |
| **4 — Render** | A fixture-mode treatment that is visible without reading, present on every operations surface, and not dismissible — beyond the existing text notice | **New in T-14** |

Layer 3 is the trade the audience answer forces, and it is worth being explicit that it is a trade:
a flight board reading `ZZ 1111 · Sampleton · Gate 3 · Delayed` exercises every column, chip and
null case while remaining unquotable. Using real carrier codes and real route cities would demo
better and would put a plausible delayed-arrival claim on screen. **The recommendation is layer 3
as written.** If the room wants real carrier names, that is a decision for the client, and it
belongs in the decision record with the boot guard named as the only remaining protection.

Layer 4 is a **deliberate deviation from the design spec** — §5.2 and §4.1 specify the notice and
forbid dismissal, but draw no watermark. It needs a `docs/decisions.md` record saying so, per
`CLAUDE.md` Style. It is additive and consistent with §5.2's own reasoning ("a notice that says the
data is not real must outlive the user's patience with it").

### CU-4 — Facility field and everything that carries one · **T-06 + T-09 + T-10 + T-11**

Adding `facility` after the fixtures are written means editing 30 tariff rows, ~12 vessels and
~16 flights a second time, plus their MSW mirrors. It is the cheapest ordering constraint in this
plan and the most expensive to get wrong. See §4, edge E1.

---

## 3. Blocked on client

Nothing in the demo-required set is blocked — that is deliberate. Everything below is real work
that cannot complete without SCASPA, and each row carries what to show instead and what to ask for
on the day. **With IT staff in the room, these are the questions that will come back at you**, so
they are phrased as asks rather than as gaps.

| Blocked task | Needs from SCASPA | Demo instead | Ask on the day |
|---|---|---|---|
| **A real ops feed** (unblocks F-01…F-20, F-33…F-35 — 20 findings) | Feed access: AIS provider, AODB, or an agreed file drop. Format, cadence, credentials | `OPS_DATA_SOURCE=fixture` with the CU-3 treatment, **and** the `none` empty states shown deliberately for 30 seconds — they are the production default and they are designed | "What system holds vessel movements today, and can it export? We need one worked example of a real record, not a schema." The `OpsSource` interface is two methods; a third implementation is the whole integration |
| **T-11 — real tariff schedule** | The published schedule: codes, descriptions, bases, XCD amounts, effective dates, and which are indexed in the KB | The realistic-shaped table with synthetic amounts (CU-3 layer 3), and the calculator arithmetic working end to end | "Which document is authoritative, and what is its effective date? We need the `kb_id` mapping too, or the source column stays 'No source recorded'" (F-22) |
| **T-19 — berth occupancy** | Whether occupancy is measured at all, and against what capacity | The em dash with "not reported" — which §5.3 calls the correct rendering and the single most dangerous default to get wrong | "Do you measure berth occupancy? If not, we will keep showing 'not reported' rather than invent a denominator" |
| **F-28 — per-facility contacts** | Five telephone numbers and two postal addresses the design draws | All five locations on the published switchboard — currently true and verifiable | "Are these five numbers correct and publishable?" (design §6.2 lists them; they are in no verified source) |
| **F-29 — department list** | The seven real desks that receive enquiries | The current seven, which are this project's invention | "Who actually receives these? `department` is free text on the wire, so a wrong name routes to nobody" |
| **F-31 — published email** | One address | The phone routes; the email row is absent, not empty | "The website obfuscates it and we would not guess. One address closes this" |
| **F-46 — annual statistics** | Vessel calls, flights, cruise passengers, cargo tonnes — with year and source | No chart. The homepage counters read `0` over HTTP and nothing was stored | "The audited financial statements look like the source — can you confirm the figures and the year?" |
| **T-22 — ticket delivery** | A destination mailbox or ticketing system | The reference-code round trip, and the honest "nobody will contact you first" copy | "Where should an enquiry land? Today it is logged and discarded" |
| **F-40 — admin gate** | A decision, not data: does an operator screen with a shared secret in a browser SPA meet their security posture? | Nothing — the route does not exist, and §2.8 State C is a designed shipping state | "Do you want an operator statistics screen? It blocks spend, model config and three diagnostics" |

---

## 4. Critical path

```
T-02 ─→ T-01 ─┬─→ T-03 ─┐
              └─→ T-04 ─┤
                        ├─→  [M1 green]
T-08 ─────────────────┐ │
T-06 ─────────────────┤ ├─→  [M2 green] ─→ T-15 ─→ [M3 green]
T-07 ─────────────────┘ │                            │
                        │                            ↓
T-09 ┬── T-10 ┬── T-11+T-12 ──→ T-13 ──→ T-14 ──→ T-05 ──→ [M4 green]
     └────────┴──────────────────────────────────────────────→ T-16, T-18 ──→ T-23 ──→ [M5 freeze]
```

Justification per edge — **what would have to be redone if the order were reversed**:

| Edge | Why this direction | Cost of reversing |
|---|---|---|
| **E1 · T-06/T-07 → T-09/T-10/T-11** | **Schema before fixture generation** — the brief calls this out and it is the single most expensive ordering error available. Adding `facility` and the four metric fields after the fixtures exist means editing ~58 fixture records plus their MSW mirrors a second time | ~2 sessions of pure rework, and a real chance the two copies diverge — which no test catches (CU-2) |
| **E2 · T-08 → T-09/T-10/T-11/T-14** | The integrity contract decides what the values *are*. Generating first and retro-fitting tells means rewriting every record | Full regeneration, plus a decision record written after the fact — which is how a convention becomes undocumented |
| **E3 · T-02 → T-01** | `KB_CSV_PATH` resolves to a nonexistent file. Rebuilding first either fails or silently indexes nothing | A rebuild that appears to succeed and does not — the failure mode the audit found already in place |
| **E4 · T-01 → T-03/T-04** | Both depend on knowing what the corpus actually contains. Chips written against the sample KB target 10 fake rows; category widening cannot be validated against an index that does not hold those categories | T-04 redone entirely; T-03 shipped unverified |
| **E5 · T-11 → T-12 (atomic)** | CU-1. Not an ordering preference — they are one change | Silent zero-total quotes |
| **E6 · T-09…T-12 → T-13** | Mirror last, once, when the backend fixtures have settled | Every intermediate fixture edit mirrored twice or three times |
| **E7 · T-15 before T-09…T-14** | **The counter-intuitive one, and the one worth arguing.** T-15 is chrome and depends on no data, so it *could* go last. It must not: every populated screen would then be verified twice — once in `OpsPage`, once in `FullPageShell` — and the second pass is where layout regressions surface, against data that is now realistic enough to hide them. Doing the shell first means the fixture work is built, reviewed and a11y-checked **once, in its final frame** | ~1.5 sessions of re-verification across four screens × two viewports, at the point in the week with the least recovery time |
| **E8 · T-14 → T-05** | The render treatment must exist before realistic data is switched on anywhere reachable | A window in which realistic fixtures are live with only a text notice — the exact state CU-3 exists to prevent |
| **E9 · T-16 before T-20** | Consolidating the two advisory components first means the `published_by` work lands in one place | The new fields wired into one component and not the other — the duplication that produced drift 0.13 |
| **E10 · everything → T-23** | Rehearsal against the frozen build | Rehearsing a build that then changes |

**The 19-vs-15-session gap resolves here.** T-15 is 3 sessions and is the largest single item. It
is on the critical path because of the audience, not because of the data — and it is the one task
whose removal costs nothing downstream. **Decision rule, to be taken at the M2 exit gate:** if M1
and M2 have not both closed green by end of day 2, drop T-15 to the backlog and open the demo on
`/chat`, navigating to the operations screens via the sidebar rather than the "← Assistant" link,
so the chrome change reads as a section boundary rather than a different application.

---

## 5. Milestones

Sequential. Each leaves the repository green and demoable.

### Gate inventory — what actually exists today

Verified against `package.json`, `pyproject.toml` and both workflow files. **Report of what is
real, not an assumption that it passes:**

| Gate | Command | In CI? | State |
|---|---|---|---|
| Frontend build | `cd frontend && npm run build` | ✅ `frontend.yml` | Configured. Typechecks via `vite-plugin-checker` |
| Frontend lint | `npm run lint` (`--max-warnings 0`) | ✅ | Configured |
| Format check | `npm run format:check` | ✅ | Configured |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ | Configured. Must run **after** build — `routeTree.gen.ts` is generated and gitignored |
| Frontend tests | `npm run test` (vitest, 25 files) | ✅ | Configured. All via MSW; an unmocked request is a hard failure |
| Bundle budget | `npm run check:budget` | ✅ | Configured. Initial JS ≤ **200 kB gzipped**; currently ~135 kB — ~65 kB headroom |
| Backend lint | `cd backend && uv run ruff check .` | ✅ `ci.yml` | Configured |
| Backend format | `uv run ruff format --check .` | ✅ | Configured |
| Backend tests | `uv run pytest` (22 files) | ✅ | Configured. No `OPENAI_API_KEY` in CI; `@pytest.mark.openai` tests skip |
| **Accessibility** | `npm run check:a11y` | ❌ **not in CI** | **Configured but not runnable as-is.** Needs `npm i -D --no-save playwright@1.56.1 @axe-core/playwright@4.11.0` **in one command**, plus a running backend. Exits 2 otherwise (`scripts/a11y-check.mjs:11-28`). §8's "0 violations" is **not reproducible from a clean checkout** (0.20) |
| **Responsive** | `npm run check:responsive` | ❌ | Configured, **not green and not expected to be** — 27 touch-target reports, all desktop-sized controls the handoff draws. Useful only for horizontal-overflow |
| Integration | `npm run check:integration` | ❌ | Configured; needs a real backend and an allowed origin |
| Composite | `npm run verify` | — | `build && lint && typecheck && test`. **Does not include** `format:check` or `check:budget`, both of which CI runs |

Exit criteria below use the **CI-equivalent set** plus the two manual gates where they are
meaningful. `check:a11y` is required only at M3 and M5 — the two points where chrome changes — and
its dependency install is listed as part of the step, because it is not a saved dependency.

---

### M1 — The assistant answers from real information

**Goal.** Replace the ten sample rows with the 116 confirmed rows of the researched knowledge base,
so no answer in the demo begins "SAMPLE DATA".

**Tasks:** T-02, T-01, T-03, T-04.

**Exit criteria**
```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd ../frontend && npm run build && npm run lint && npm run format:check && npm run typecheck && npm run test
# and, specific to this milestone:
cd ../backend && uv run python -c "import json;m=json.load(open('../data/index_meta.json'));assert m['kb_csv_filename']=='scaspa_kb_2026-07-31.csv' and m['kb_rows_indexed']==116, m"
uv run python scripts/search.py "what time is the last ferry to Nevis"   # returns a real, cited row
uv run python scripts/evaluate.py                                        # record hit@1 as the new baseline
```

**Newly demoable.** Every one of the four facilities answers from real, cited, verified-dated
content instead of placeholder text. The citation chip, the source panel, the volatility badge and
the verified date all become meaningful — they were rendering correctly against fake rows before.

**Rollback.** `data/chroma/` and `data/index_meta.json` are the only artefacts. Keep a copy of both
before rebuilding; restoring them reverts to the 10-row index in seconds. `git checkout` covers
T-02/T-03/T-04. No schema change, so nothing downstream is affected.

---

### M2 — Schema and contract, before any fixture is written

**Goal.** Land every model change and agree the fixture-integrity contract, so fixture generation
happens exactly once.

**Tasks:** T-06, T-07, T-08.

**Exit criteria**
```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd ../frontend && npm run build && npm run lint && npm run format:check && npm run typecheck && npm run test
# and:
curl -s localhost:8000/openapi.json | python3 -c "import json,sys;s=json.load(sys.stdin)['components']['schemas'];assert 'facility' in s['VesselArrival']['properties'];assert 'arrivals_today' in s['FlightMetrics']['properties']"
grep -q 'fixture-integrity' docs/decisions.md    # T-08's record exists
```
Existing tests must be updated, not deleted, for the new required fields — `docs/api-contract.md`
updated in the same change (`CLAUDE.md`: "Update docs/api-contract.md if any endpoint or schema
changed").

**Newly demoable.** Nothing visible. That is the point: this milestone exists so M4 is not done
twice. What *is* newly answerable is the IT-staff question — the feed contract is now the shape a
real integration would target.

**Rollback.** Self-contained: three schema files, the two filter functions, the router signatures
and the TS mirrors. `git revert` of one commit. Nothing has been generated against it yet, which is
exactly why it comes before M3 and M4.

**⚠️ Go/no-go on T-15.** If M1 and M2 have not both closed green by end of day 2, drop T-15 per
§4's decision rule and go straight to M4.

---

### M3 — One shell across the walkthrough

**Goal.** The four operations screens render in the design's app shell, so the walkthrough does not
change chrome at step two.

**Tasks:** T-15.

**Exit criteria**
```bash
cd frontend && npm run build && npm run lint && npm run format:check && npm run typecheck && npm run test
npm run check:budget                      # initial JS still ≤ 200 kB gz
npm i -D --no-save playwright@1.56.1 @axe-core/playwright@4.11.0   # one command — a second --no-save install wipes the first
# backend must be running for the two manual checks:
npm run check:a11y                        # 0 axe violations across the four moved routes, both viewports
npm run check:responsive                  # no NEW horizontal-overflow failures vs the 27 pre-existing touch-target reports
```

**Newly demoable.** `/chat` → `/vessels` → `/flights` → `/tariffs` → `/support` navigated from the
240px sidebar with the Operations group's active row, rather than through a navy bar and a back
link. The first point at which the walkthrough looks like one product.

**Rollback.** The largest blast radius in this plan and the reason it sits at day 3 rather than
day 5. Do it on its own branch; `OpsPage` stays in the tree until the four routes are proven, so
abandoning is `git checkout` of five files. If `check:a11y` or `check:budget` regresses and cannot
be resolved in one session, **abandon and proceed to M4** — the plan is designed so M4 does not
depend on it.

---

### M4 — Populated operations, unmistakably sample

**Goal.** Every board on the walkthrough shows realistic, behaviourally complete data that no
viewer can mistake for live operations.

**Tasks:** T-09, T-10, T-11 + T-12 (atomic), T-13, T-14, T-05.

**Exit criteria**
```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd ../frontend && npm run build && npm run lint && npm run format:check && npm run typecheck && npm run test
npm run check:budget
# CU-1 — the quote must not silently zero out:
cd ../backend && uv run python -c "
from app.ops.source import FixtureOpsSource; from app.ops.tariffs import build_quote, total_of
from app.schemas import TariffQuoteRequest
lines, unpriced = build_quote(TariffQuoteRequest(category='cargo', container_size='40ft', units=12, storage_days=3), FixtureOpsSource())
assert len(lines) >= 3 and total_of(lines) > 0 and not unpriced, (lines, unpriced)"
# CU-3 layer 3 — no quotable money anywhere in the fixtures:
grep -nE '[0-9]+\.[0-9]{2}' app/ops/fixtures.py | grep -vE '(([0-9])\2*)\.(\2\2)' && echo "FAIL: a non-repeated-digit amount" || echo "ok"
# ENV=prod guard still refuses fixtures:
ENV=prod OPS_DATA_SOURCE=fixture uv run python -c "from app.main import create_app; create_app()" 2>&1 | grep -q "must not be 'fixture'"
```

**Newly demoable.** All four vessel tiles and all three flight tiles carry figures. Vessels shows
~12 movements across five statuses (`departed` and `unknown` render for the first time), flights
~16 across six (`arrived` renders for the first time), tariffs 25–30 rows across §5.9's five
categories with working chips and a real total from the calculator. Per-facility filtering answers
"show me Port Zante". Chat's `vessel_arrivals` card populates under an answer that still declines to
describe it — the two-data-paths demonstration, which is the product's central design argument, is
demoable for the first time.

**Rollback.** Fixtures and mocks only — no schema, no chrome. `OPS_DATA_SOURCE` back to unset
reverts every screen to its designed empty state in one line, and those empty states are themselves
demoable (see §3). This is the cheapest rollback in the plan and the reason T-05 is last.

---

### M5 — Consolidation, copy, rehearsal, freeze

**Goal.** Close the drift found in §0, remove the visible placeholder, and drive the walkthrough
end to end on the frozen build.

**Tasks:** T-16, T-18, T-23. (T-17 if time allows — it is a 22-site sweep touching backend copy.)

**Exit criteria**
```bash
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd ../frontend && npm run build && npm run lint && npm run format:check && npm run typecheck && npm run test
npm run check:budget
npm run check:a11y                        # backend running; final pass
npm run check:integration                 # against the real backend on the demo config
grep -rn "Team names pending" src/ && echo "FAIL" || echo "ok"
# one advisory component, not two:
test $(grep -rln "OperationalAdvisory" src/components/ops/ | wc -l) -eq 1
```

**Newly demoable.** Nothing new — that is the definition of a freeze milestone. What changes is
confidence: the walkthrough has been driven end to end at both viewports against the real backend
on the demo configuration.

**Rollback.** Each task is independently revertible; none is a prerequisite for the others. If
T-23 surfaces a defect that cannot be fixed in one session, the fallback is `VITE_ENABLE_MOCKS=true`
with MSW serving the mirrored fixtures from T-13 — which is why T-13 is demo-required rather than a
test-hygiene task.

---

## 6. POST-DEMO backlog

Planned, not scheduled. Ordered by the audit's visibility × effort × contract-risk scoring.

**Schema and contract**
- **T-19** Berth occupancy — specify the field or ratify the em dash (F-03). Blocked on client.
- **T-20** `published_by` / `published_at` on `OperationalAdvisory` (F-17).
- **T-21** `DataSource` on `ChartSpec` — the one operations payload with no meta strip (F-42).
- Label alongside each `unpriced` code (F-26); `kb_id` on real tariff rows plus a KB-row route to link to (F-22).
- A chunk count on `IndexStatus` (F-37); a tool-cap discriminator (F-48); `tracked_clients` outside the admin secret (F-47).

**Backend**
- **`extra="forbid"` on the Pydantic models.** Only `KBRow` sets it
  (`app/rag/models.py:51`). Everywhere else a mistyped or unknown keyword is
  **accepted and discarded** — which is what let twelve `Flight` constructors
  carry `facility="rlb_airport"` that nothing read, through ruff, pytest and the
  typechecker, until the distribution was counted. Post-demo, and worth doing
  repo-wide rather than case by case.
- **The `Facility` enum covers four sites; SCASPA publishes five.** Vance W.
  Amory and Charlestown are out of scope for the demo by decision — see the
  day-of talking point in `docs/found-during-build.md`.
- **T-22** Ticket delivery or persistence (F-30). IT staff will ask; have the answer ready.
- The third `OpsSource` implementation, when a feed exists. The interface is ready.
- Web-corpus ingestion — `scaspa_web` holds 0 embeddings and 14 scraped PDFs are unindexed.

**Frontend**
- **T-17** Telephone-format sweep, if not taken at M5 (0.17).
- Board 20 console: positions, gates, marine advisories, health, index (F-33…F-38) — off the walkthrough.
- **Drift 0.7** — `ops.flights.tsx:219-224` `formatTime` renders `06:40 AM` on a US-locale browser. Fourth instance of a defect recorded as fixed three times.
- The legacy `ops-*` palette surviving in `routes/index.tsx`, `profile.tsx`, `ops.flights.tsx`.
- Boards not on the path: 00a embedded widget, 21 voice cache states (F-49), §6.18 speech preview (F-50).

**Decisions, not code**
- **F-40** the admin gate — blocks §6.13's panels, §6.14's spend (F-41), the three TTS cache captions and `tracked_clients`. Five findings on one security decision.
- Multilingual scope (audit §H). Three locales ship; only `/settings` is translated; the backend takes no language parameter; the design spec never mentions it. Complete it, scope it visibly, or remove it.
- **`IMPLEMENTATION_PROGRESS.md` corrections** — the 23-vs-27 board count (0.2), the "nothing is partially implemented" claim (0.1), and a note that §8's a11y line is not reproducible from a clean checkout (0.20).
