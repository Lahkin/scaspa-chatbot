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
| `GET /api/health` | Working |
| Config, schemas, request-ID middleware, CORS | Working |
| Lint, format, tests, CI | Working |
| Chat / voice endpoints, agent, RAG, scraper | Not implemented |

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
