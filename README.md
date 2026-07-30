# SCASPA Assistant — Backend

An AI assistant for the **St. Christopher Air & Sea Ports Authority**, the
statutory body running the Deep Water Harbour (cargo), Port Zante (cruise), the
Basseterre Ferry Terminal and R.L. Bradshaw International Airport in St. Kitts. It
answers questions about those four facilities from verified SCASPA information,
cites a source for every factual claim, and is built so that it **cannot state a
fee, time or phone number that does not appear in a retrieved source** — if a
figure cannot be traced, the answer is discarded rather than shown with a warning.

This repository is the **backend only**. The React frontend is owned by a separate
team. The contract for them is [docs/api-contract.md](docs/api-contract.md).

---

## Contents

- [Quick start](#quick-start-under-10-minutes) · [Environment](#environment-variables)
- [Build the index](#build-the-index) · [Run](#run-the-server) · [Evaluate](#run-the-evaluation)
- [Deploy](#deploy) · [Keep warm](#keep-warm) · [Before a demo](#before-a-demo)
- [Architecture](#architecture) · [Project structure](#project-structure)
- [Non-goals](#non-goals) · [Docs](#documentation) · [Credits](#credits)

---

## Quick start (under 10 minutes)

### Prerequisites

| Need | Check | If missing |
| --- | --- | --- |
| Python 3.11+ | `python3 --version` | uv installs it for you (below) |
| **uv** | `uv --version` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` then restart your shell |
| git | `git --version` | [git-scm.com](https://git-scm.com) |
| An OpenAI API key | — | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

> If `uv` is "command not found" after installing, it went to `~/.local/bin`. Run
> `export PATH="$HOME/.local/bin:$PATH"` and add that line to your shell profile.

### Steps

```bash
git clone <repo-url>
cd scaspa-chatbot/backend

uv sync --group dev            # creates .venv, installs pinned deps (~2 min first time)

cp ../.env.example .env        # then open .env and paste your OPENAI_API_KEY
uv run pytest                  # 482 tests, no API key needed — should be all green
uv run uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000/docs>.

`/api/health` will say **`"status": "degraded"`** and that is correct — you have no
index yet.

Building one **calls the OpenAI embeddings API, so it needs your key in `.env`**:

```bash
uv run python scripts/build_index.py --csv ../data/knowledge/sample_kb.csv
```

No key yet? This validates the CSV and prints the full report without spending
anything, and is the right way to check your data:

```bash
uv run python scripts/build_index.py --csv ../data/knowledge/sample_kb.csv --dry-run
```

Now ask it something:

```bash
curl -X POST http://127.0.0.1:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "How much is a ferry ticket?"}'
```

> ### `sample_kb.csv` is fake on purpose
>
> Every figure in it is invented (`XCD 44.44`, `01:01`) and every source URL points
> at `example.invalid`. It exists so tests and local runs have something to chew
> on. **Never use it for a demo** — serving it to anyone would be inventing a fee,
> which this project exists to prevent. Replace it with a real researcher export
> (`scaspa_kb_YYYY-MM-DD.csv`) first.

---

## Environment variables

`.env` lives in `backend/` and is gitignored. Only `.env.example` is committed,
with every key documented inline. In production, set these in the platform
dashboard — never in the repo.

**Required**

| Variable | Where to get it |
| --- | --- |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

**Required in production**

| Variable | Notes |
| --- | --- |
| `ENV=prod` | Enables production checks |
| `ALLOWED_ORIGINS` | Your frontend's exact origin. A wildcard with `ENV=prod` makes the app **refuse to boot** |
| `ADMIN_SECRET` | Any long random string. If unset, `/api/admin/stats` **does not exist** |

**Worth setting**

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_CHAT_MODEL` | `gpt-5.6-terra` | Model ids from [the OpenAI models page](https://developers.openai.com/api/docs/models) |
| `RATE_LIMIT_PER_MINUTE` | `15` | Voice endpoints get a third of this |
| `PRICE_*_PER_MTOK` | `0.0` | Set from current pricing so the spend estimate means something |
| `DAILY_SPEND_WARN_USD` | `5.0` | Logs a warning past this |

> ### Set a hard monthly cap on the OpenAI account
>
> The in-app spend estimate only counts what the application sees. It cannot stop
> spend from a bug that bypasses it, a second deployment, or a script run with the
> same key. **Set the provider-level cap** on the OpenAI billing page. That is the
> real control; the estimate is the warning light.

---

## Build the index

The researchers export a Google Sheet to `data/knowledge/` with a dated filename.

```bash
cd backend
uv run python scripts/build_index.py --dry-run    # validate only; no API calls, no cost
uv run python scripts/build_index.py --csv ../data/knowledge/scaspa_kb_2026-08-04.csv
uv run python scripts/build_index.py --force      # re-embed an unchanged CSV
uv run python scripts/build_index.py --all        # knowledge base + scraped web content
```

The build prints every rejected row with its line number and reason, counts by
category / confidence / volatility, and what was withheld.

- **Only `confidence == "confirmed"` rows are indexed.** Others are counted and
  reported, never indexed.
- **An unchanged CSV is not re-embedded** — the build hashes it and skips, because
  embedding costs money. `--force` overrides.

Optional, to add scraped site content:

```bash
uv run python scripts/crawl_site.py     # polite crawl: robots.txt, sitemap, ~1 req/sec
uv run python scripts/build_index.py --web
```

The crawl writes `data/scraped/flagged_for_client.md` — things a human must
resolve, including the homepage statistics, which are JavaScript counters that
fetch as **zero** and are never indexed.

---

## Run the server

```bash
cd backend
uv run uvicorn app.main:app --reload
```

- Interactive docs — <http://127.0.0.1:8000/docs>
- Health — <http://127.0.0.1:8000/api/health>

```bash
# Ask, streamed, with timings
uv run python scripts/stream_demo.py "How much is a ferry ticket?"

# Retrieval only — see what search returns, no model call
uv run python scripts/search.py "how much is a ferry ticket?"

# Voice end to end: audio in, answer, MP3 out
uv run python scripts/voice_smoke.py question.wav
```

> **The microphone needs HTTPS.** `getUserMedia` only works on a secure context —
> HTTPS or `localhost`. On a LAN address over plain HTTP it fails **silently**: no
> prompt, no console error. The deployed frontend must be on HTTPS.

---

## Run the evaluation

```bash
cd backend
uv run python scripts/evaluate.py --label baseline
uv run python scripts/evaluate.py --no-query-rewrite --no-category-filter
uv run python scripts/evaluate.py --sweep-min-score
```

Writes `evals/runs/eval_<timestamp>.json`, appends to `evals/history.csv`
(append-only — the accuracy-over-time line cannot be rebuilt later) and rewrites
`evals/latest.md` with every failure, ready to file as issues.

Retrieval is scored **separately** from answers, because most failures are
retrieval failures and looking only at final answers means tuning prompts to fix a
search problem.

---

## Deploy

The container is defined at the **repository root** (the build needs both
`backend/` and `data/knowledge/`).

### Render (from GitHub)

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** → select the repo. It reads `render.yaml`.
3. In the dashboard, set these (they are `sync: false`, so they are never in git):
   - `OPENAI_API_KEY`
   - `ADMIN_SECRET` — any long random string
   - `ALLOWED_ORIGINS` — your frontend origin, e.g. `https://scaspa-demo.vercel.app`
4. **Deploy.** The build embeds the knowledge base into the image, so it takes a
   few minutes.
5. Verify: `uv run python scripts/preflight.py --url https://YOUR-URL`

### Locally with Docker

```bash
# From the repository root, not backend/
DOCKER_BUILDKIT=1 docker build -t scaspa-chatbot \
  --secret id=openai_key,env=OPENAI_API_KEY .

docker run --rm -p 8000:8000 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e ALLOWED_ORIGINS="http://localhost:5173" \
  scaspa-chatbot
```

The API key is passed as a **BuildKit secret**, never an `ARG` — an `ARG` is
recorded in image history and `docker history` would print it.

### The index in production

**It is baked into the image at build time.** So: *"the researchers updated the
sheet — how fast is it live?"* → **one rebuild and redeploy, a few minutes.** Not
instant, and deliberately so. Reasoning and the rejected alternative are in
[docs/decisions.md](docs/decisions.md) 0017.

---

## Keep warm

Free tiers sleep when idle, and a cold start in front of a judge is a bad look.

1. **An external pinger.** Point [UptimeRobot](https://uptimerobot.com) (free) or
   [cron-job.org](https://cron-job.org) at `https://YOUR-URL/api/health` every
   5 minutes. `/api/health` is cheap — it reads one JSON file and makes no model
   call — so pinging it costs nothing.
2. **Measure your cold start:**
   ```bash
   uv run python scripts/preflight.py --url https://YOUR-URL --warm-only
   ```
   It prints the number and tells you how early to open the app.
3. **Open the app before the judges arrive** and leave the tab open.

---

## Before a demo

```bash
cd backend
uv run python scripts/preflight.py --url https://YOUR-URL --kb-version 2026-08-04
```

One command, pass/fail per line, non-zero exit on any failure. It checks the API is
reachable, the index version and row count, four demo questions (correct, cited,
within a latency budget), that the refusal question still refuses, the chart
question, both voice endpoints, and that rate limiting is active.

**When something is red, go to [docs/runbook.md](docs/runbook.md).** It is written
for someone nervous and in front of an audience: numbered steps, exact commands,
no prose.

---

## Architecture

```
   Browser
     │  POST /api/chat  or  /api/chat/stream (SSE)
     ▼
   FastAPI ── request id · rate limit · input safety
     │
     ├── refusal gate ──────────► decline (model never called)
     ├── score probe too low ───► no-answer (model never called)
     │
     ▼
   Agent (LangChain v1 create_agent, capped tool loop)
     │   search_scaspa_knowledge · search_site_content
     │   make_chart · calculate · escalate_to_human
     ▼
   Chroma  scaspa_kb (curated CSV) · scaspa_web (scraped site + PDFs)
     │
     ▼
   VERIFICATION  citations checked against retrieved ids
                 every number checked against retrieved text
                 unverifiable → the answer is DISCARDED
     │
     ▼
   ChatResponse { answer, citations[], chart, tool_calls[], meta }
```

Full version, including **the known limitations stated plainly**, in
[docs/architecture.md](docs/architecture.md).

---

## Project structure

```
scaspa-chatbot/
├── Dockerfile · .dockerignore · render.yaml   deploy from the repo root
├── CLAUDE.md              standing rules for anyone working here
├── SECURITY.md
├── data/
│   ├── knowledge/         the researchers' CSV exports (source of truth)
│   ├── scraped/           crawl output + flagged_for_client.md
│   └── chroma/            the built index (gitignored)
├── docs/
│   ├── api-contract.md    hand this to the frontend team
│   ├── architecture.md    the system, and its limitations
│   ├── decisions.md       every significant decision and why
│   ├── deploy.md · runbook.md · privacy.md
├── evals/
│   ├── stress_test_sample.csv   15 seeded failure modes
│   ├── history.csv              append-only accuracy over time
│   └── latest.md               failures, ready to file as issues
└── backend/
    ├── app/
    │   ├── main.py        app, middleware, error handlers, routers
    │   ├── config.py      all configuration, from env
    │   ├── schemas.py     every request/response model
    │   ├── safety.py · ratelimit.py · costs.py · observability.py · errors.py
    │   ├── routers/       health · chat · voice · admin
    │   ├── agent/         graph · prompts · tools · memory
    │   ├── rag/           retriever · answer · grounding · store · ingest · …
    │   ├── voice/         stt · tts
    │   └── scraper/       site · pdfs
    ├── scripts/           build_index · evaluate · preflight · crawl_site ·
    │                      search · chat_repl · stream_demo · voice_smoke ·
    │                      reconcile · export_questions · pdf_bakeoff
    └── tests/             482 tests, none needing an API key
```

---

## Non-goals

Deliberately out of scope. Each was considered and declined.

- **No booking, payment or ticketing.** `pay.scaspa.com` is a live payment portal
  and the code **raises an exception** rather than fetching it.
- **No live operational data.** No berth status, no flight status, no vessel
  tracking. The assistant says it cannot see live operations and gives the phone
  number.
- **No advice.** No customs, immigration, tax or legal guidance; no clearing
  instructions for a shipment; no operational guidance to vessels, aircraft or
  drivers. These route to SCASPA staff.
- **No personal records.** No access to anyone's container, booking or payment, and
  it must not appear to have any.
- **No general tourism.** Hotels, restaurants, tours and beaches are redirected.
- **No user accounts, no analytics, no tracking.** See
  [docs/privacy.md](docs/privacy.md).
- **No frontend.** Owned by another team.
- **No horizontal scaling.** One instance, one worker, on purpose — see the
  architecture doc.

---

## Documentation

| Document | For |
| --- | --- |
| [docs/api-contract.md](docs/api-contract.md) | The frontend team |
| [docs/architecture.md](docs/architecture.md) | How it works, and its limits |
| [docs/decisions.md](docs/decisions.md) | Every decision, the alternatives, the reasons |
| [docs/runbook.md](docs/runbook.md) | When something breaks mid-demo |
| [docs/deploy.md](docs/deploy.md) | Deployment detail |
| [docs/privacy.md](docs/privacy.md) | What is stored; what is never collected |
| [SECURITY.md](SECURITY.md) | Controls, and known limitations |
| [CLAUDE.md](CLAUDE.md) | The rules this codebase is held to |

---

## Credits

Built for the St. Christopher Air & Sea Ports Authority.

- **Team** — _add names and roles here._
- **Coach** — _add name here._
- **Client** — St. Christopher Air & Sea Ports Authority.
- Backend engineering assisted by Claude Opus 5.

Knowledge-base content is researched and verified by the team's researchers. Every
factual claim the assistant makes is traceable to a row they signed off, with a
source and a verification date.
