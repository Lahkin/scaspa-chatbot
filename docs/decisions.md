# Decision log

Significant decisions, the alternatives considered, and the reason.
Newest last.

---

## 0001 — LangChain v1 agent entry point and integration packages

**Date:** 2026-07-29
**Status:** Accepted

### Context

The backend needs an agent runtime, an OpenAI integration and a Chroma vector
store. Most tutorials still show the LangChain v0 pattern, which no longer
matches the shipped library. Before pinning anything, the current documentation
at docs.langchain.com was checked and then each claim verified by importing it
from the installed packages.

### Findings

| Concern | Verified answer |
| --- | --- |
| Agent entry point | `from langchain.agents import create_agent` |
| Implementation module | `langchain.agents.factory` |
| Runtime | LangGraph |
| Key parameters | `model`, `tools`, `system_prompt`, `middleware`, `response_format`, `state_schema`, `context_schema`, `checkpointer`, `store` |
| OpenAI integration | package `langchain-openai`; `from langchain_openai import ChatOpenAI, OpenAIEmbeddings` |
| Chroma integration | package `langchain-chroma`; `from langchain_chroma import Chroma` |

`create_react_agent` is the v0 entry point. It was replaced by `create_agent`
in LangChain v1.0. It is still importable from `langgraph.prebuilt` in the
pinned versions, but it is deprecated and **must not be used** in this project.

A forum thread titled *"create_agent no longer exists in langchain.agents
v1.1.0"* appears prominently in search results and is misleading: the reported
failure was a stale virtualenv, not a moved symbol. Verified directly against
the installed package — `create_agent` imports from `langchain.agents` as
documented.

### Decision

Build the agent with `langchain.agents.create_agent`. Pin exact versions so a
future upgrade is a deliberate, reviewable change:

```
langchain==1.3.14        langchain-core==1.5.2     langgraph==1.2.10
langchain-openai==1.4.1  langchain-chroma==1.1.0   chromadb==1.5.9
```

### Alternatives considered

- **`langgraph.prebuilt.create_react_agent`** — the pattern in most existing
  tutorials. Rejected: deprecated in v1, and it lacks the middleware hook that
  citation verification (CLAUDE.md rule 4) will need.
- **Hand-rolled LangGraph graph** — maximum control. Rejected for now: it means
  reimplementing the tool-calling loop that `create_agent` already provides.
  Reconsider if middleware proves insufficient for citation enforcement.
- **Version ranges instead of exact pins** — smaller maintenance burden.
  Rejected: LangChain's v0→v1 rename is exactly the breakage that unpinned
  ranges cause silently.

---

## 0002 — OpenAI model ids come from settings, never from source

**Date:** 2026-07-29
**Status:** Accepted

### Context

Model ids change often. Hardcoding one in source means an upgrade touches code
in several places and can be missed in review.

### Decision

Every model id is a `Settings` field read from the environment
(`OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_TRANSCRIBE_MODEL`,
`OPENAI_TTS_MODEL`). Defaults were taken from the OpenAI models pages on
2026-07-29, not from memory:

| Setting | Default | Note |
| --- | --- | --- |
| `OPENAI_CHAT_MODEL` | `gpt-5.6-terra` | Balances intelligence and cost; the mini tier of the GPT-5.6 family. `gpt-5.6-sol` is the frontier option if answer quality proves insufficient. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | 3072 dimensions, strongest retrieval quality. |
| `OPENAI_TRANSCRIBE_MODEL` | `gpt-transcribe` | Current high-accuracy speech-to-text model. |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` | Current TTS model, default snapshot `gpt-4o-mini-tts-2025-12-15`. |
| `OPENAI_TTS_VOICE` | `marin` | Documented as one of the two most natural voices. |

One caveat recorded deliberately: the models *index* page summarised
`gpt-4o-mini-tts` as deprecated, but its own model page and the text-to-speech
guide both present it as current with an active December 2025 snapshot. The
model page was treated as authoritative. Re-check before the voice layer ships.

`CHAT_TEMPERATURE` defaults to `0` per the product brief. Whether the GPT-5.6
family accepts a `temperature` parameter was **not** confirmed — verify when the
agent layer is built, and drop the parameter rather than passing an unsupported
one.

### Alternatives considered

- **Constants in `app/agent/graph.py`** — simplest. Rejected: violates CLAUDE.md
  rule 2 and makes model changes a code deploy rather than a config change.

---

## 0003 — Chroma scoring: which method, and how it is normalised

**Date:** 2026-07-29
**Status:** Accepted

### Context

Chroma can report a match as either a *distance* or a *relevance score*, and the
two run in opposite directions. Getting this backwards returns the **worst**
matches for every question with no error raised — the retrieval layer would look
like it worked and the assistant would cite confidently wrong sources.

This was measured on the pinned stack rather than reasoned about. Two documents
were indexed with fake embeddings placing "ferry" and "cargo" on orthogonal unit
axes, then queried with `"ferry"`:

| Collection space | Method | Ferry doc (correct) | Cargo doc (wrong) |
| --- | --- | --- | --- |
| `cosine` | `similarity_search_with_score` | **0.0** | 1.0 |
| `cosine` | `similarity_search_with_relevance_scores` | 1.0 | 0.0 |
| `l2` (Chroma default) | `similarity_search_with_score` | 0.0 | 2.0 |
| `l2` (Chroma default) | `similarity_search_with_relevance_scores` | 1.0 | **-0.414** |

Two traps, both confirmed:

1. `similarity_search_with_score` returns a **distance**. The correct match
   scores `0.0`. Sorting that descending, or applying a `RETRIEVAL_MIN_SCORE`
   floor to it, inverts relevance.
2. Chroma's default space is **Euclidean, not cosine**. On an `l2` collection
   LangChain's relevance conversion is `1 - distance/√2`, which returned
   `-0.414` for an orthogonal document — outside 0–1, and it emits a
   `UserWarning`. The default configuration cannot satisfy a 0–1 contract.

### Decision

1. Both collections are created with cosine space via
   `collection_configuration={"hnsw": {"space": "cosine"}}`. This is explicit,
   not inherited from Chroma's default.
2. `app.rag.store.search` calls **`similarity_search_with_score`** — the raw
   cosine distance — and normalises it in our own code:

   ```python
   score = max(0.0, min(1.0, 1.0 - distance))
   ```

   Cosine distance runs 0 (identical direction) to 2 (opposite), so `1 - d` is
   the similarity. The clamp only engages beyond 90°, which for text embeddings
   means "unrelated"; reporting `0.0` there is correct and keeps the range
   exact.
3. `search` returns `ScoredDocument` with a single `score` field — always a
   similarity, always 0–1, always sorted best-first. **No code outside
   `app/rag/store.py` may call a raw Chroma search method.**

`tests/test_store.py` asserts the direction with the two orthogonal documents,
and pins the inversion against Chroma's raw ordering. Reintroducing the bug
(`return distance`) was verified to fail 9 assertions.

### Alternatives considered

- **`similarity_search_with_relevance_scores`** — returns 0–1 already, so it
  looks like the obvious choice. Rejected: on the default `l2` space it produces
  negative values and a warning, so it is only safe *if* the cosine
  configuration is right. That makes correctness depend on a setting made
  elsewhere, silently. Doing the arithmetic in our own code keeps the guarantee
  local and testable.
- **Normalising as `1 - d/2`** to use the full 0–2 cosine range. Rejected: it
  compresses real text similarities into roughly 0.65–0.95, which would make the
  `RETRIEVAL_MIN_SCORE=0.30` default meaningless. `1 - d` matches the threshold
  the config already assumes.
- **Passing scores through untouched and documenting the direction.** Rejected
  outright: this is precisely the failure mode that produces confident wrong
  citations, and a comment does not prevent it.

---

## 0004 — Ingestion: full rebuild, hash-gated

**Date:** 2026-07-29
**Status:** Accepted

### Context

Embedding costs money per call. Re-embedding an unchanged CSV on every restart
is pure waste, but a stale index that silently misses a correction is worse.

### Decision

- **Cache key is a SHA-256 of the CSV bytes**, recorded in
  `data/index_meta.json`. If it matches and `--force` was not passed, the build
  is skipped and says so. Deliberately not mtime, which changes on every
  re-export even when the content is identical.
- **A rebuild is a full reset, not an upsert.** Rows get deleted from the
  spreadsheet; an upsert would leave those chunks in the index forever, so the
  assistant would keep citing a fact the researchers had already retracted.
- **`kb_updated_at` is the newest `as_of` among indexed rows**, not the build
  timestamp — it answers "how fresh is the knowledge", which is what a reader of
  `/api/health` actually wants. `index_built_at` answers "when did we last
  embed" separately.
- **`KB_CSV_PATH` is resolved before recording.** It may be a `latest.csv`
  symlink; the dated target is what gets written to `kb_csv_filename`, and
  `kb_version` is parsed from that dated filename.
- **A missing `index_meta.json` is a normal state**, not an error. `/api/health`
  reports `degraded` with an actionable message. Unknown fields are `null`
  rather than `0`, so "never built" is never mistaken for "built and empty".

### Alternatives considered

- **Per-row hashing with incremental upsert** — cheaper on a one-row edit.
  Rejected for now: it needs delete-detection to avoid stale rows, and at ~12
  to a few hundred rows a full rebuild costs cents. Revisit if the knowledge
  base reaches thousands of rows.
- **Storing the metadata inside Chroma** — one less file. Rejected: `/api/health`
  would then have to open the vector store, and a corrupt index would break the
  health check that is supposed to report it.

---

## 0005 — `langchain-text-splitters` is a separate dependency in v1

**Date:** 2026-07-29
**Status:** Accepted

### Context

`chunk_web_document` uses `RecursiveCharacterTextSplitter`. In LangChain v0 this
came along with `langchain`.

### Finding

It does not any more. `importlib.metadata.requires("langchain")` on the pinned
`langchain==1.3.14` shows **no text-splitter dependency**, and `langchain` ships
no splitter module of its own. The import failed at test time.

### Decision

Declare `langchain-text-splitters==1.1.2` explicitly in `pyproject.toml`. Noted
here because it is a v0→v1 packaging change that a tutorial-derived dependency
list would get wrong, in the same family as the `create_react_agent` rename in
entry 0001.
