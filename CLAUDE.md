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
   mistaken for a real SCASPA fact. Operational fixtures may be realistic in the
   fields that shape a layout — berths, gates, tariff codes, times, statuses — so
   that a screen can be built and checked against the shape it will really have.
   Every field a reader could write down and act on must be unmistakably
   synthetic: vessel and airline names, IMO numbers, flight numbers, and **every
   money amount without exception**. Full contract, including the render and
   deployment guards it depends on: docs/decisions.md 0032.
6. The system prompt lives in app/agent/prompts.py, never inline in a function.
7. Routers are thin: validate, call a service, return. Logic lives in agent/, rag/, voice/.
8. Only rows with confidence == "confirmed" are indexed for the live assistant.
9. Log question text and latency. Never log IP addresses, audio, or user identifiers.
10. Money and time values in an answer must appear verbatim in a retrieved chunk.

## Style
Python 3.11+, type hints everywhere, Pydantic v2 at every boundary, ruff-clean.
Small commits, each scoped to one milestone or one fix, on a feature branch —
so a milestone can be reverted as a unit. Record significant decisions in
docs/decisions.md with the alternatives considered and the reason.

Frontend and UI generation follows the design tokens, styling parameters and
structures in `design/`. Deviations are permitted only when recorded in
docs/decisions.md with the reason.

## Before you finish any task
Run: ruff check, ruff format, pytest. Update README.md if setup steps changed.
Update docs/api-contract.md if any endpoint or schema changed.
