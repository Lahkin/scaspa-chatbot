# SCASPA Chatbot — Standing Rules

## Product
Assistant for SCASPA: Deep Water Harbour (cargo), Port Zante (cruise),
Basseterre Ferry Terminal, RLB International Airport. Answers only from
verified SCASPA information, cites every factual claim, never invents a
schedule, a fee or a rule.

## Absolute rules
1. Never commit a secret. `.env` is gitignored. Only `.env.example` is committed.
2. Never hardcode an OpenAI model name in source. Always `settings.OPENAI_*_MODEL`.
3. Never fetch, test against, or link to pay.scaspa.com. It is a live payment portal.
4. Never let the LLM produce a citation the backend has not verified against a
   retrieved knowledge-base row.
5. Never invent knowledge-base content in code, fixtures or seed data that could be
   mistaken for a real SCASPA fact. Test fixtures use obviously-fake values.
6. The system prompt lives in app/agent/prompts.py, never inline in a function.
7. Routers are thin: validate, call a service, return. Logic lives in agent/, rag/, voice/.
8. Only rows with confidence == "confirmed" are indexed for the live assistant.
9. Log question text and latency. Never log IP addresses, audio, or user identifiers.
10. Money and time values in an answer must appear verbatim in a retrieved chunk.

## Style
Python 3.11+, type hints everywhere, Pydantic v2 at every boundary, ruff-clean.
Small commits. Every change is a pull request. Record significant decisions in
docs/decisions.md with the alternatives considered and the reason.

## Before you finish any task
Run: ruff check, ruff format, pytest. Update README.md if setup steps changed.
Update docs/api-contract.md if any endpoint or schema changed.
