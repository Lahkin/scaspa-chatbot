# Architecture

## Scope

**This document describes the backend.** The React client has its own rules in
`frontend/CLAUDE.md`; where the two meet — the streaming contract, provenance,
what a client may and may not infer from a payload — the authority is
`docs/api-contract.md`.

## What it is

A retrieval-grounded assistant for SCASPA — the St. Christopher Air & Sea Ports
Authority — covering four facilities: the Deep Water Harbour (cargo), Port Zante
(cruise), the Basseterre Ferry Terminal, and R.L. Bradshaw International Airport.

The governing constraint is that it must never invent a schedule, a fee or a rule.
Everything below exists to make that structurally true rather than merely intended.

## How a question becomes a cited answer

```
  POST /api/chat  {"message": "How much is a ferry ticket?"}
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. MIDDLEWARE      request id stamped, bound to every log    │
  │ 2. RATE LIMIT      per client; IP hashed to a key, discarded │
  │ 3. INPUT SAFETY    length, control chars, injection guard    │
  └─────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 4. REFUSAL GATE    vessel ops? personal record? -> DECLINE   │
  │                    Runs BEFORE the agent exists, so no tool  │
  │                    sequence can route around it.             │
  └─────────────────────────────────────────────────────────────┘
        │ not refused
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 5. PRE-FLIGHT PROBE  best similarity across both collections │
  │    below RETRIEVAL_MIN_SCORE -> no-answer, model NEVER called │
  └─────────────────────────────────────────────────────────────┘
        │ score ok
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 6. AGENT  langchain.agents.create_agent (LangGraph runtime)   │
  │    tool loop capped by ToolCallLimitMiddleware               │
  │                                                              │
  │    search_scaspa_knowledge ──┐                               │
  │    search_site_content ──────┤  every retrieved id recorded   │
  │    make_chart ───────────────┤  on the per-turn context       │
  │    calculate (AST, not eval) │                               │
  │    escalate_to_human ────────┤                               │
  │    show_card ────────────────┤                               │
  │    get_cruise_schedule ──────┘  records EVIDENCE, not ids     │
  └─────────────────────────────────────────────────────────────┘
        │        │                        ▲
        │        ▼                        │
        │   Chroma (cosine)  ◄── OpenAI embeddings
        │   scaspa_kb   curated CSV rows, confidence == confirmed
        │   scaspa_web  scraped pages + PDFs, fenced as untrusted
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ 7. VERIFICATION — the part that matters                      │
  │                                                              │
  │  a. citation ids parsed from the answer, checked against the  │
  │     UNION of every id every search returned this turn.        │
  │     Invented id -> stripped, logged, grounded=false.          │
  │  b. citations array rebuilt from STORED METADATA, never from  │
  │     model text.                                              │
  │  c. every currency / time / date / phone in the answer must   │
  │     appear in a retrieved row, OR in the evidence that        │
  │     a structured tool recorded this turn.                     │
  │     Fails -> THE ANSWER IS DISCARDED and replaced.            │
  └─────────────────────────────────────────────────────────────┘
        │
        ▼
  ChatResponse { answer, citations[], chart|null, tool_calls[], meta }
  or SSE: meta -> tool_start/tool_end -> token* -> citations -> chart? -> done
```

The asymmetry in step 7 is the design. Steps (a) and (b) mean a citation cannot be
fabricated. Step (c) means a *number* cannot be fabricated — and it discards rather
than flags, because a `grounded: false` field in a JSON payload does not stop
anyone reading the figure, and the figure is what they act on.

## The second data path: Watchtower and the operational store

Everything above is the *assistant*. It answers prose questions from prose the
researchers verified, and it is the only path with a model in it.

Operational facts do not fit that shape. "Which ships arrive on Thursday" is an
exact question over rows that change without anybody here doing anything, and
putting it in Chroma would be wrong three ways at once: the answer would be
approximate where the question is exact, a row could not be updated without
re-embedding it, and the assistant would have to read a date out of a sentence
rather than compare two dates.

So there is a second path, with no model anywhere in it.

```
  app/watchtower/registry.py   an ALLOW-LIST, in source control
        │                      adding a source is a code change with a review
        ▼
  fetch → revision marker → compare → (stop if unchanged)
        │                             the cheap question first: a few hundred
        │                             bytes against a quarter of a megabyte
        ▼
  parse → validate → timestamp → store → log
        │
        │  the parser DROPS what SCASPA does not publish: captain, pilot,
        │  agent, ship workers, and rows the Authority marked hidden
        ▼
  data/operational.sqlite3
        │  cruise_calls, keyed (call_date, vessel)
        │  every row carries source_id, source_url, retrieved_at, content_hash
        ▼
  app/ops/cruise.py  ─┬─> GET /api/cruise-schedule   (the Vessels page)
                      └─> get_cruise_schedule tool   (the assistant)
```

**One service under both callers**, so a screen and a sentence can never
disagree about what SCASPA published or when it was last checked. That matters
more than the deduplication: two arrival times for one ship is the failure this
product is least able to survive.

**A failed fetch never empties the store.** A 500, a restyled page, a row that
will not validate — the previous schedule stays exactly where it is and the
failure is recorded. Clearing the table because a request timed out would turn
somebody else's brief outage into this product telling a passenger that no ships
are coming.

**`published` is not `live`.** The schedule is fetched every six hours, and a
six-hourly snapshot presented as live is the one claim that would make every
other claim on the screen worth less. The schema refuses to build a `published`
source without the timestamp that says so.

`app/watchtower/scheduler.py` runs the sweep in the API process, every fifteen
minutes, with each source deciding from its own `interval_hours` whether it is
due. A SQLite lease settles which worker sweeps — see limitation 5.

## A second exit from the knowledge base

`GET /api/guide` serves confirmed knowledge-base rows straight onto a page:
Airport Information, Cargo & Shipping, and the console tabs over them.

No model is involved, so nothing there can be hallucinated. It exists because a
traveller opening "Airport Information" does not yet know what to ask, and a
screen that tells them to go and think of a question is a screen that stays
empty. The rows are the same ones the assistant retrieves from, with the same
`kb-` ids — so an answer met on a page and the same answer met in a conversation
are one row, not two sources that happen to agree.

The `confidence == "confirmed"` rule applies here exactly as it does to the
index. A page is not a lower standard than a sentence: a screen is scanned and
believed without the reader ever forming a question they might have doubted the
answer to.

## Voice

Two providers, because the OpenAI key for this project has no speech-model
entitlement at all — `/v1/models` returns nine models and not one can transcribe
or synthesise. ElevenLabs does both halves.

```
  app/voice/provider.py     resolve_provider()  auto | openai | elevenlabs
        │                   `auto` picks ElevenLabs when its key is set, so one
        │                   key is the whole of the configuration
        ├─> stt.py   audio in memory -> transcript. Never written to disk.
        └─> tts.py   sanitise -> synthesise -> cache on disk by SHA-256

  app/voice/availability.py  probes once an hour; /api/health reports it, and
                             the client hides a control that cannot work
```

**The sanitiser is the valuable part, and it is provider-independent.** Markdown,
citation markers, URLs and currency codes are all unlistenable, and the
telephone number is the one that matters: `869-465-8121` read as a quantity is
"eight hundred sixty-nine million, four hundred sixty-five thousand…", and it
ends every refusal this product gives. A second provider must not mean a second
copy of that thinking, so `provider.py` is only the network call.

**A control that always fails is worse than an absent one.** `VITE_ENABLE_VOICE`
is set by whoever builds the frontend; the entitlement belongs to whoever holds
the key. Nothing connected them, so the microphone was rendered for every user
and failed on every press. The backend now says what it can do before the press
— and reports `checked: false` rather than a guess when it could not find out,
because hiding a working microphone is the quieter and worse mistake.

## Why each technology

| Choice | Why |
| --- | --- |
| **FastAPI** | Async for SSE streaming, and Pydantic at every boundary, which is the same validation the safety rules need |
| **LangChain v1 `create_agent`** | The v1 entry point on the LangGraph runtime; gives a tool loop and a middleware hook without hand-rolling reasoning. Verified against the installed package, not a tutorial — `create_react_agent` is the removed v0 API |
| **Chroma** | Embedded, no server to run, persists to a directory that can be baked into an image. Configured with **cosine** space explicitly, not its Euclidean default |
| **pdfplumber** | Chosen by measuring three libraries on a real SCASPA financial statement. PyMuPDF put every table cell on its own line, which would attribute a fee to the wrong service |
| **uv** | Reproducible resolution from a committed lock file; exact pins so a v0→v1 rename cannot arrive silently |
| **SQLite** for operational rows | A file beside the Chroma one, backed up by copying it, swappable later behind `app/watchtower/store.py`. Introducing PostgreSQL — a server, a pool, a migration tool — to hold what is currently a few hundred cruise calls would be the largest operational change in the project, made for its smallest table |
| **httpx** for ElevenLabs, not their SDK | Already a dependency, already wrapped by `call_with_retry` with the backoff and classification the rest of the product uses, and this needs exactly two endpoints. An SDK would add a dependency to own two requests and bring a second retry policy alongside the existing one |
| **In-memory everything** (conversations, rate limits, spend) | A deliberate privacy position, not a shortcut. See below |

## Data flow into the index

```
  researchers' Google Sheet
        │ export
        ▼
  data/knowledge/scaspa_kb_YYYY-MM-DD.csv
        │ validated row by row; nothing dropped silently
        │ ONLY confidence == "confirmed" is indexed
        ▼
  scaspa_kb   ── one CSV row = exactly one chunk, never concatenated

  scaspa.com + PDFs
        │ robots.txt honoured, sitemap filtered through it, ~1 req/sec
        │ zero-value JS statistics QUARANTINED, never stored
        │ obfuscated emails replaced, never decoded
        ▼
  scaspa_web  ── 800/120 chunks, fenced as untrusted data in the prompt
```

## Known limitations

Named because judges reliably find the ones a team hides, and because each of
these is a real constraint rather than a bug waiting to be fixed.

### 1. The knowledge base is a snapshot, not a live feed

The index is built from a dated CSV export and **baked into the container image**.
Updating it requires a rebuild and redeploy — minutes, not seconds. Every answer
states the date its information was verified. If the researchers update the sheet
at 09:00, the assistant knows about it after the next deploy, not immediately.

The alternative (a mounted volume rebuilt by a job) is faster to update and was
rejected for a competition build. Reasoning in `docs/decisions.md` 0017.

### 2. It cannot see LIVE operational status

Narrower than it used to be, and the narrowing is worth stating precisely.

It now reads one real source: SCASPA's published cruise schedule, fetched every
six hours by Watchtower. So it can say which ships are due on Thursday, and the
Vessels page can draw them, both labelled `published` with the time they were
last checked.

It still has **no connection to any live system**. It does not know whether a
ferry is sailing right now, whether a flight is delayed today, whether a berth is
occupied, or whether a gate is open at this moment. There is no AIS feed, no
flight feed and no cargo status — `scaspa.com/cargo.html` describes a searchable
table the site does not publish, which `/cargo` says plainly rather than
reproducing the dead end.

For any live question it gives the published information, says it cannot see live
operations, and gives the phone number. Prompt rule 10, and the reason the
distinction is enforced in the schema rather than left to prose: the failure mode
of guessing is someone missing a sailing.

### 3. Scraped statistics require client confirmation

The homepage figures for vessel calls, flights, cruise passengers and cargo
tonnage are JavaScript counters. Fetched over HTTP they are **literally zero**. All
four are quarantined into `data/scraped/flagged_for_client.md` and never indexed.
Until SCASPA supplies the real numbers with a source and a date, the assistant has
no annual statistics at all — which is correct, because a bot reporting zero cruise
passengers would be worse than one that says it does not know.

### 4. Conversation memory is in-process and lost on restart

Nothing is written to disk. A restart erases every conversation. With more than one
worker, a request may land on a process that has not seen the conversation, so
history is best-effort. This is a privacy position: the alternative is a durable
transcript tied to a session, which for people passing through a port would be a
record of where someone was and when.

History is also currently **stored but not fed into the prompt** — each answer is
produced from the current question alone.

### 5. Single instance, no horizontal scaling

The container runs **one worker on purpose**. Conversation memory, the rate limiter
and the spend counter are all per-process, so a second worker would silently
multiply the effective rate limit, split conversations, and under-count spend.
Scaling out means moving that state to shared storage keyed by client — which is
the record this design avoids.

Concretely: one instance, one worker, and the rate limit is the real concurrency
control.

**Watchtower is the exception, and it is built for the other case.** The sweep
would duplicate on every worker, so `scheduler_lease` in SQLite settles which one
runs it — a lease rather than a lock, because a worker killed mid-sweep never
releases a lock and the schedule would then stop updating forever with the
application still serving happily. That is the one piece of shared state this
design does accept, and it holds no record of any person.

### 6. A false claim carrying a valid citation is not detected

The backend verifies that a cited row exists and that every figure traces to it. It
does **not** verify that the sentence follows from the row. A model could cite
`kb-008` correctly, quote its fare correctly, and still assert something the row
does not say. Only the system prompt defends that. Closing it needs claim-level
entailment checking. See `docs/decisions.md` 0007.

### 7. What has and has not been run against a real model

This section used to say no real model had ever been run. That is no longer
true, and the replacement is worth being exact about, because "we tested it" is
the easiest sentence in engineering to say loosely.

**Run for real:** the index is built with `text-embedding-3-large`; chat turns
have been driven end to end against the live chat model and returned grounded
answers with real citations; Watchtower fetches the real SCASPA endpoint; voice
runs against a real ElevenLabs key, both directions.

**Still measured against a scripted double:** the whole test suite. Every
behavioural guarantee in CI — refusals, the grounding gate, citation
verification — is asserted against a test double, and that is deliberate: those
are properties of *this* code, and a suite that needed a paid model would be a
suite nobody runs.

**Still unverified:** how the model behaves across the full question set rather
than the handful driven by hand, and how retrieval ranks on real embeddings
beyond the same. `scripts/evaluate.py` exists for the first and has not been run
against a real key at scale.

## Where to look

| Concern | File |
| --- | --- |
| Citation and number verification | `backend/app/rag/answer.py`, `backend/app/rag/grounding.py` |
| The prompt (the whole safety layer) | `backend/app/agent/prompts.py` |
| Agent and tools | `backend/app/agent/graph.py`, `backend/app/agent/tools.py` |
| Retrieval and its techniques | `backend/app/rag/retriever.py`, `rewrite.py`, `hybrid.py` |
| Scoring convention (the direction trap) | `backend/app/rag/store.py` |
| Scraper traps | `backend/app/scraper/site.py` |
| What Watchtower is allowed to fetch | `backend/app/watchtower/registry.py` |
| What the parser refuses to publish | `backend/app/watchtower/parsers.py` |
| Why a failed fetch keeps the old data | `backend/app/watchtower/monitor.py` |
| The sweep, and the multi-worker lease | `backend/app/watchtower/scheduler.py`, `store.py` |
| One service under the page and the tool | `backend/app/ops/cruise.py` |
| Confirmed rows served without a model | `backend/app/ops/guide.py` |
| Which speech provider, and can it work | `backend/app/voice/provider.py`, `availability.py` |
| Why a phone number is listenable | `backend/app/voice/tts.py` |
| Every decision and why | `docs/decisions.md` |
| What is true of SCASPA's own site | `docs/found-during-build.md` |
