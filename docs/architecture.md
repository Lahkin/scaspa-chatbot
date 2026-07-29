# Architecture

## Scope

Backend only. The React frontend is owned by a separate team and is not part of
this repository.

## What the system is

A retrieval-grounded assistant for SCASPA — the St. Christopher Air & Sea Ports
Authority. It answers questions about four facilities:

| Facility | Role |
| --- | --- |
| Deep Water Harbour | Cargo port |
| Port Zante | Cruise terminal |
| Basseterre Ferry Terminal | Inter-island ferries |
| R.L. Bradshaw International Airport | Air travel |

The governing constraint is that it must never invent a schedule, a fee or a
rule. Every factual claim carries a citation the backend has verified against a
retrieved knowledge-base row.

## Layers

```
                 HTTP
                   │
        ┌──────────▼───────────┐
        │   app/routers/       │  thin: validate, call a service, return
        │   health · chat · voice
        └──────────┬───────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
┌────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
│ app/agent│ │  app/rag  │ │ app/voice │
│  graph   │ │ retriever │ │ stt · tts │
│  prompts │ │ store     │ └───────────┘
│  tools   │ │ chunking  │
└────┬─────┘ │ ingest    │
     │       └─────┬─────┘
     │             │
     │       ┌─────▼──────┐
     │       │  Chroma    │  data/chroma (persisted on disk)
     │       └─────┬──────┘
     │             │
     │       ┌─────▼──────────────┐
     │       │ data/knowledge/*.csv│  curated, confidence-tagged
     │       └────────────────────┘
     │
     └──► OpenAI (chat · embeddings · transcribe · TTS)
```

`app/scraper/site.py` is an offline feeder: it writes raw pages to
`data/scraped/`, which a human curates into the knowledge-base CSV. Scraped text
is never indexed directly — only curated rows marked `confidence == "confirmed"`
reach the live index.

## Request flow (planned)

1. Router validates the request against a schema in `app/schemas.py`.
2. Agent (`langchain.agents.create_agent`, LangGraph runtime) plans the turn.
3. Retrieval tool queries Chroma for `RETRIEVAL_FETCH_K` candidates, keeps the
   `RETRIEVAL_TOP_K` scoring above `RETRIEVAL_MIN_SCORE`.
4. Model drafts an answer constrained to the retrieved chunks.
5. **Citation verification** — the backend checks every citation against an
   actually-retrieved row, and checks that money and time values appear verbatim
   in a retrieved chunk. Unverifiable claims do not ship to the user.
6. Router returns the response.

Step 5 is the load-bearing one. The model is never trusted to self-report
whether it cited correctly.

## Current state

Only the health endpoint exists. `agent/`, `rag/`, `voice/`, `scraper/` and the
chat and voice routers are documented placeholders.

## Cross-cutting

- **Config** — one `Settings` object, `lru_cache`d, everything from env.
- **Request IDs** — middleware stamps every request, echoes `X-Request-ID`, and
  binds the id into every log line via a `ContextVar`.
- **Logging** — question text and latency are logged. IP addresses, audio and
  user identifiers never are.
- **Safety** — `pay.scaspa.com` is a live payment portal. It is in
  `SCRAPER_BLOCKLIST` and is never fetched, tested against, or linked to.
