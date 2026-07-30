# SCASPA Chatbot — Backend

Backend for the SCASPA AI assistant. SCASPA is the St. Christopher Air & Sea
Ports Authority, the statutory body running the Deep Water Harbour (cargo),
Port Zante (cruise), the Basseterre Ferry Terminal and R.L. Bradshaw
International Airport in St. Kitts.

The assistant answers questions about those facilities from verified SCASPA
information, cites every factual claim, and never invents a schedule, a fee or
a rule.

This repository is **backend only**. The React frontend is owned by a separate
team and lives elsewhere.

## Status

Scaffold. The health endpoint is live; the agent, RAG, voice and scraper layers
are documented placeholders. See [docs/architecture.md](docs/architecture.md).

| Piece | State |
| --- | --- |
| `GET /api/health` | Working — index state, models, uptime |
| `POST /api/chat` | Working |
| `POST /api/chat/stream` | Working — Server-Sent Events |
| Config, schemas, request-ID middleware, CORS, errors | Working |
| Ingestion: CSV validation, chunking, Chroma index | Working |
| Retrieval + answer chain | Working |
| Agent with five tools, capped tool loop | Working |
| Tool events on the stream and in the response | Working |
| Conversation memory (in-process, not persisted) | Working |
| Lint, format, tests, CI | Working |
| Voice: `POST /api/stt`, `POST /api/tts` | Working |
| Charts (`make_chart` -> `ChartSpec`) | Working |

The full API contract for the frontend team is
[docs/api-contract.md](docs/api-contract.md).

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) — `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Setup

```bash
git clone <repo-url>
cd scaspa-chatbot/backend

uv sync --group dev          # creates .venv and installs pinned dependencies

cp ../.env.example .env      # then fill in OPENAI_API_KEY and the model ids
```

`.env` lives in `backend/` and is gitignored. Only `.env.example` is committed.
Every key is documented inline there.

The health endpoint runs without an API key. The agent, RAG and voice layers
will need one.

## Run

```bash
cd backend
uv run uvicorn app.main:app --reload
```

- Health — <http://127.0.0.1:8000/api/health>
- Interactive docs — <http://127.0.0.1:8000/docs>

## Building the index

The researchers export a Google Sheet to `data/knowledge/` with a dated filename
(`scaspa_kb_2026-08-04.csv`). Point `KB_CSV_PATH` at it — a `latest.csv` symlink
is fine, the build resolves it and records the real dated filename.

```bash
cd backend
uv run python scripts/build_index.py --dry-run    # validate only, no API calls
uv run python scripts/build_index.py              # build
uv run python scripts/build_index.py --force      # rebuild an unchanged CSV
uv run python scripts/build_index.py --csv ../data/knowledge/sample_kb.csv
```

The build prints a full report: totals, every rejected row with its line number
and reason, counts by category / confidence / volatility, the oldest `as_of`, and
what was withheld from the index.

Two things worth knowing:

- **Only `confidence == "confirmed"` rows are indexed.** `probable` and
  `unverified` rows are counted and reported, never indexed.
- **An unchanged CSV is not re-embedded.** The build hashes the file (SHA-256)
  into `data/index_meta.json` and skips when it matches, because embedding costs
  real money. `--force` overrides. `--dry-run` embeds nothing at all and needs no
  API key.

`/api/health` reads `data/index_meta.json`, so it reports what is actually
indexed. With no index built it returns **200 with `status: "degraded"`** and an
explanatory message — never a 500.

### Fixture data

`data/knowledge/sample_kb.csv` is **fixtures only — 12 rows of invented
placeholder content**. Every time, fee, phone number and rule in it is fake, and
every `source_url` points at `https://example.invalid/`, a reserved domain that
cannot resolve. It exists so the test suite and local smoke tests have something
to chew on.

**Never index it for a demo or deployment.** Serving any of it to a user would be
inventing a schedule, a fee or a rule, which CLAUDE.md rule 5 forbids. Replace it
with a real researcher export first.

## The agent

The assistant is a real agent, not a search box: it chooses which tools to use
and may chain several in one turn. Built with LangChain v1's `create_agent`.

| Tool | Used for |
| --- | --- |
| `search_scaspa_knowledge` | Verified facts: ferry, cruise, cargo, tariffs, airport, contacts |
| `search_site_content` | scaspa.com pages and PDFs — empty until the scraper runs |
| `make_chart` | A ChartSpec the frontend renders. Every figure checked against the source row |
| `calculate` | Exact arithmetic on retrieved figures. AST whitelist, never `eval` |
| `escalate_to_human` | SCASPA contact details |

Guardrails that survive agency:

- The **refusal gate runs before the agent is built**, so no tool sequence routes
  around it.
- The tool loop is capped at `AGENT_MAX_TOOL_CALLS`. On hitting the cap the turn
  returns the no-answer message — never a partial answer, never the library's
  raw internal string.
- Citations are validated against the **union of every id every search tool
  returned this turn**, so multi-tool answers are still fully verified.
- Every turn logs tool count, tool names in order, token counts and latency.

### Charts

The model never draws a chart — it describes one, and the frontend renders it.
`make_chart` enforces two rules in code, not in the prompt:

1. The `source_kb_id` must be a row retrieved during that turn.
2. **Every number** in the chart must appear in that row's text — y values and
   numeric x values alike. A calculated total, a rounded fare or a converted
   figure is rejected with an instruction to say "I don't have the data" instead.

Captions are mandatory and must state whether the figures are official or
illustrative, enforced by a Pydantic validator. If the source row itself reads as
illustrative, the caption must say so — so a chart from the fixture rows can never
claim to be official.

An invented tariff drawn as a confident bar chart is the most dangerous thing this
product could emit: a wrong sentence gets questioned, a wrong chart gets
screenshotted and budgeted against. Details in
[docs/decisions.md](docs/decisions.md) 0014.

The handbook's chart subjects need **real knowledge-base rows built with the
researchers**. `data/knowledge/sample_charts_kb.csv` holds fixture rows with
obviously-fake figures so the path can be tested; it is not demo data.

Deploying? Read [docs/deploy.md](docs/deploy.md) first — it explains why you must
not deploy with the fixture knowledge base.

## Scraping scaspa.com

**Absolute rule: `pay.scaspa.com` is never fetched, tested against, or linked
to.** It is a live payment portal. Any URL matching `SCRAPER_BLOCKLIST` raises
`BlockedURLError` — it is **not** quietly skipped, because a skip is a decision
the code makes silently and an exception is one a person has to look at. This is
CLAUDE.md rule 3 and it is enforced at every fetch entry point and covered by
tests in `tests/test_scraper.py`.

```bash
cd backend
uv run python scripts/crawl_site.py              # crawl + PDFs
uv run python scripts/crawl_site.py --limit 5    # a quick look
uv run python scripts/build_index.py --web       # index into scaspa_web
uv run python scripts/build_index.py --all       # knowledge base + web
uv run python scripts/reconcile.py               # site vs CSV disagreements
```

The crawl reads robots.txt first and honours it, prefers the sitemap, identifies
itself with `SCRAPER_USER_AGENT`, and rate-limits to about one request a second.
`portzante.com` is **out of scope** by default (handbook open question 17) — it
is a separate operator's site.

### What the crawler refuses to store

Two things on the site are actively quarantined into
`data/scraped/flagged_for_client.md` and never indexed:

- **The homepage statistics.** Vessel Calls, Flights, Cruise Passengers and
  Tonnes of Cargo are JavaScript counters. Fetched over HTTP they are literally
  `0`. Each is replaced with `[FIGURE UNAVAILABLE — CONFIRM WITH CLIENT]`. The
  real figures must come from the annual reports or from SCASPA and be entered
  as knowledge-base rows with a source and a date.
- **Email addresses.** Cloudflare-obfuscated. Not decoded, not stored; replaced
  with `[EMAIL — CONFIRM WITH CLIENT]`.

Each crawl also writes `diff_YYYY-MM-DD.md` — pages added, removed and changed,
with excerpts — so a new travel advisory is something the system notices.

`scripts/reconcile.py` reports where the site and the researchers' CSV disagree
on a fee, a time or a phone number. **It never resolves a conflict.** The site
being authoritative is guidance for a researcher, not a licence for code to
overwrite a verified row.

## Voice

Voice is accessibility, not novelty. Someone on the pier with a bag in one hand
talks before they type.

```bash
cd backend
uv run python scripts/voice_smoke.py question.wav       # STT -> chat -> TTS -> mp3
uv run python scripts/voice_smoke.py --preview-only --text "**Call** 869-465-8121 / 2 / 3"
```

### The microphone needs HTTPS — tell the frontend team before they debug it

`getUserMedia` only works in a secure context: **HTTPS or `localhost`**. On a LAN
address over plain HTTP — `http://192.168.1.20:5173`, the normal way to test on a
phone — `navigator.mediaDevices` is `undefined` and the mic **fails silently**.
No prompt, no error. The deployed frontend must be on HTTPS. This is in
[docs/api-contract.md](docs/api-contract.md) too, with a guard to copy.

### What the voice layer guarantees

- **Uploaded audio never touches disk** and is never logged. Neither is the
  transcript. Processed in memory, discarded.
- **The transcript is not chained into the assistant.** `/api/stt` returns text
  and stops, so the user can correct a misheard fee before asking.
- **Answers are sanitised before synthesis.** Markdown, `[kb-xxx]` markers, URLs,
  JSON and table pipes are stripped; phone numbers become digit groups
  (`8 6 9, 4 6 5, 8 1 2 1`) and currency codes are expanded. Read as an integer
  the SCASPA number is "eight hundred sixty-nine million" — unwriteable, and it
  ends every refusal.
- **Synthesised audio is cached** on disk by SHA-256 of the sanitised text, with
  an LRU cap, plus `ETag`/`Cache-Control` so the browser caches too. The canned
  messages are paid for once, not once per rehearsal. This cache is the only
  audio written anywhere.
- **Voice degrades to nothing.** A provider failure returns a clean 503 and the
  text path is unaffected. If the mic dies on stage, keep typing.

## Measuring retrieval

Measurement came before improvement, and improvements were kept only if the
numbers moved.

```bash
cd backend
uv run python scripts/evaluate.py --label baseline
uv run python scripts/evaluate.py --no-query-rewrite --no-category-filter
uv run python scripts/evaluate.py --sweep-min-score
```

Writes `evals/runs/eval_<timestamp>.json`, appends to `evals/history.csv`
(append-only — the accuracy-over-time line cannot be rebuilt later) and rewrites
`evals/latest.md` with every failure, ready to file as issues.

Retrieval is scored **separately** from answers: most failures are retrieval
failures, and looking only at final answers means tuning prompts to fix a search
problem.

Four techniques, each independently toggleable so the eval can compare
configurations and any one can be switched off before a demo:

| Setting | Default | Why |
| --- | --- | --- |
| `RETRIEVAL_QUERY_REWRITE` | on | Kept — measured as part of the pair below |
| `RETRIEVAL_CATEGORY_FILTER` | on | Kept — hit@3 82% → 100%, MRR 0.727 → 0.818 |
| `RETRIEVAL_HYBRID` | **off** | Implemented, but not evaluable without real embeddings |
| `RETRIEVAL_RERANK` | **off** | Costs a model call; unmeasured |

**Read the numbers with their caveats.** Retrieval scores are real, but they come
from a lexical stand-in embedding and 15 rows of fixture data, so they measure the
harness and the mechanisms — not production accuracy. With 11 scored questions,
one question is 9 percentage points, so anything smaller than that is noise. Full
reasoning, including a technique that measured *worse* and had to be fixed, is in
[docs/decisions.md](docs/decisions.md) 0015.

## Hardening

Feature freeze declared **2026-07-30** (docs/decisions.md 0016): fixes, content and
rehearsal only.

- **No number reaches a user unverified.** Every currency amount, time, date and
  phone number in an answer is checked against the rows retrieved that turn. A
  figure that cannot be traced **discards the answer** rather than flagging it — a
  `grounded: false` field does not stop anyone reading the number.
- **Rate limited** per client, with a stricter cap on voice. Returns `429` with
  `Retry-After`. The IP is hashed into a key and never logged or stored.
- **Logs carry the question, never the asker.** The formatter raises if a record
  contains an identifier-shaped field.
- **Spend is bounded** by `MAX_OUTPUT_TOKENS`, `AGENT_MAX_TOOL_CALLS` and a daily
  estimate on `/api/admin/stats` — which is not registered at all unless
  `ADMIN_SECRET` is set.

> **Set a hard monthly spending cap on the OpenAI account.** The application
> estimate cannot see spend that bypasses it. It is the warning light, not the fuse.
> This is **still outstanding**.

See [SECURITY.md](SECURITY.md) and [docs/privacy.md](docs/privacy.md).

```bash
uv run python scripts/export_questions.py --gaps   # what people actually asked
```

## Privacy: what this service stores

**Nothing is persisted about a user. Not one thing.**

Conversation history lives in the serving process's memory and nowhere else. It
is never written to disk, never put in a database, and does not survive a
restart. It holds question text, answer text and a timestamp — and no IP
address, user agent, cookie, account, name or device identifier. A
`conversation_id` is a random UUID that is derived from nothing and links to
nothing.

History is capped at `MAX_HISTORY_TURNS` and expires after
`CONVERSATION_TTL_MINUTES` of inactivity.

The trade is deliberate: lose the id and you lose the conversation, and with
multiple workers history is best-effort. That is preferred to holding a durable
record of which traveller asked what, and when. Reasoning in
[docs/decisions.md](docs/decisions.md) 0008; enforced by tests in
`tests/test_memory.py`.

Server logs record question text and latency, never identifiers (CLAUDE.md
rule 9).

## Asking questions (HTTP)

```bash
cd backend
uv run uvicorn app.main:app --reload

# One JSON response
curl -X POST http://127.0.0.1:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "How much is a ferry ticket?"}'

# The same answer, streamed
uv run python scripts/stream_demo.py "How much is a ferry ticket?"
```

`/api/chat` and `/api/chat/stream` return identical content — streaming changes
when you see the answer, not what it says. Streaming exists because time to
first token is what makes a six-second answer feel acceptable on venue wifi;
measured locally at ~100ms to first token against ~790ms total.

See [docs/api-contract.md](docs/api-contract.md) for every field, all three
response shapes (cited answer, refusal, no-answer), the error codes, and the
rule that streamed `[kb-xxx]` markers must be reconciled against the `citations`
event.

## Asking questions (CLI)

The same chain, without HTTP.

```bash
cd backend

# Retrieval only. No model call, no API key needed for the retrieval itself.
uv run python scripts/search.py "how much is a ferry ticket?"
uv run python scripts/search.py --k 3 --file questions.txt

# Full chain: retrieve -> model -> verify. Needs OPENAI_API_KEY.
uv run python scripts/chat_repl.py
uv run python scripts/chat_repl.py --ask "how much is a ferry ticket?"
```

`chat_repl.py` prints the answer, then every chunk it considered with scores,
then exactly which rows were cited:

```
ANSWER
The placeholder one-way fare is XCD 44.44 for an adult ticket [kb-008]. That was
verified on 2026-04-01, so please confirm with SCASPA before you travel.

RETRIEVAL — every chunk considered
  kb id     score   cited   conf       category
  kb-008    0.577   YES     confirmed  ferry
  kb-007    0.273   no      confirmed  ferry (below floor)

ROWS USED (verified citations, built from stored metadata)
  [kb-008] verified 2026-04-01 — https://example.invalid/ferry-terminal/fares
```

### What the backend guarantees, and what it does not

Guaranteed in code, and tested:

- **A cited id that was never retrieved is stripped** from the answer, logged as
  `hallucinated_citation`, and the response is marked `grounded: false`.
- **Citations are built from stored row metadata**, never from the model's text.
- **Money and time values must appear verbatim** in a retrieved chunk
  (CLAUDE.md rule 10). A rounded fee or reformatted time is flagged.
- **Weak retrieval never reaches the model.** Below `RETRIEVAL_MIN_SCORE` the
  chain returns `NO_ANSWER_MESSAGE` without generating anything.
- **Vessel/aircraft operations and personal-record questions never reach the
  model**, via a deterministic refusal gate.

Not guaranteed — prompt-only, and **unverified**:

- A **false claim carrying a valid citation**. The validator proves the row
  exists, not that the sentence follows from it.
- A **topically-adjacent but wrong row** clearing the score floor.

Both are documented with evidence in [docs/decisions.md](docs/decisions.md)
entry 0007. Do not read `grounded: true` as "this answer is correct" — read it
as "every id and figure in this answer traces to a retrieved row".

## Checks

Run all three before finishing any task:

```bash
cd backend
uv run ruff check .
uv run ruff format .
uv run pytest
```

CI runs `ruff check`, `ruff format --check` and `pytest` on every pull request.
It has no OpenAI API key, so any test that would call the API must be skipped
or use a fake — mark such tests with `@pytest.mark.openai`.

## Layout

```
scaspa-chatbot/
├── CLAUDE.md              standing rules for anyone working in this repo
├── .env.example           every config key, documented
├── docs/                  architecture, decisions, api-contract
├── data/
│   ├── knowledge/         curated, confidence-tagged knowledge base (source of truth)
│   ├── scraped/           raw scraper output, not indexed directly
│   └── chroma/            persisted vector index (build artifact)
└── backend/
    ├── pyproject.toml     pinned dependencies, ruff and pytest config
    ├── app/
    │   ├── main.py        app creation, CORS, request-ID middleware, routers
    │   ├── config.py      Settings, all config from env
    │   ├── schemas.py     all Pydantic request/response models
    │   ├── routers/       health (live) · chat, voice (placeholders)
    │   ├── agent/         graph, prompts, tools
    │   ├── rag/           ingest, chunking, retriever, store
    │   ├── voice/         stt, tts
    │   └── scraper/       site
    ├── scripts/           build_index, evaluate, chat_repl
    └── tests/
```

## Toolchain

Built on LangChain v1. The agent entry point is
`from langchain.agents import create_agent` — **not** the older
`create_react_agent`, which v1 replaced. Integrations are `langchain-openai`
and `langchain-chroma`. Versions are pinned exactly; the reasoning and the
verification are in [docs/decisions.md](docs/decisions.md).

## Ground rules

Read [CLAUDE.md](CLAUDE.md) before contributing. The rules that bite most often:

- Never commit a secret. Only `.env.example` is committed.
- Never hardcode an OpenAI model name — always `settings.OPENAI_*_MODEL`.
- Never fetch, test against, or link to `pay.scaspa.com`. It is a live payment
  portal.
- Only knowledge-base rows with `confidence == "confirmed"` are indexed.
- Test fixtures use obviously-fake values, never anything mistakable for a real
  SCASPA fact.
