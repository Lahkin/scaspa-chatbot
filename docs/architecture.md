# Architecture

## Scope

Backend only. The React frontend is owned by a separate team.

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
  │    search_site_content ──────┤                               │
  │    make_chart ───────────────┼─> every retrieved id recorded  │
  │    calculate (AST, not eval) │   on the per-turn context      │
  │    escalate_to_human ────────┘                               │
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
  │     appear in a retrieved row.                               │
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

## Why each technology

| Choice | Why |
| --- | --- |
| **FastAPI** | Async for SSE streaming, and Pydantic at every boundary, which is the same validation the safety rules need |
| **LangChain v1 `create_agent`** | The v1 entry point on the LangGraph runtime; gives a tool loop and a middleware hook without hand-rolling reasoning. Verified against the installed package, not a tutorial — `create_react_agent` is the removed v0 API |
| **Chroma** | Embedded, no server to run, persists to a directory that can be baked into an image. Configured with **cosine** space explicitly, not its Euclidean default |
| **pdfplumber** | Chosen by measuring three libraries on a real SCASPA financial statement. PyMuPDF put every table cell on its own line, which would attribute a fee to the wrong service |
| **uv** | Reproducible resolution from a committed lock file; exact pins so a v0→v1 rename cannot arrive silently |
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

### 2. It cannot see current operational status

It has no connection to any live system. It does not know whether a ferry is
sailing right now, whether a flight is delayed today, whether a berth is occupied,
or whether a gate is open at this moment. For any such question it gives the
published information, says plainly that it cannot see live operations, and gives
the phone number. This is prompt rule 10 and is deliberate — the failure mode of
guessing here is someone missing a sailing.

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

### 6. A false claim carrying a valid citation is not detected

The backend verifies that a cited row exists and that every figure traces to it. It
does **not** verify that the sentence follows from the row. A model could cite
`kb-008` correctly, quote its fare correctly, and still assert something the row
does not say. Only the system prompt defends that. Closing it needs claim-level
entailment checking. See `docs/decisions.md` 0007.

### 7. No real model has been run against this build

Every behavioural claim in this repository is measured against a scripted test
double, because no API key has been available. The backend guarantees are real and
tested. How a real model behaves against the prompt — and how
`text-embedding-3-large` actually ranks retrieval — is **unverified**.

## Where to look

| Concern | File |
| --- | --- |
| Citation and number verification | `backend/app/rag/answer.py`, `backend/app/rag/grounding.py` |
| The prompt (the whole safety layer) | `backend/app/agent/prompts.py` |
| Agent and tools | `backend/app/agent/graph.py`, `backend/app/agent/tools.py` |
| Retrieval and its techniques | `backend/app/rag/retriever.py`, `rewrite.py`, `hybrid.py` |
| Scoring convention (the direction trap) | `backend/app/rag/store.py` |
| Scraper traps | `backend/app/scraper/site.py` |
| Every decision and why | `docs/decisions.md` |
