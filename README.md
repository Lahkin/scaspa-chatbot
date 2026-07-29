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
| Voice endpoints, charts, scraper | Not implemented |

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
| `make_chart` | Port activity over time; values must come from retrieved rows |
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

Deploying? Read [docs/deploy.md](docs/deploy.md) first — it explains why you must
not deploy with the fixture knowledge base.

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
