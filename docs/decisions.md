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
