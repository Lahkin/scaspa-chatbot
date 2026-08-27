# Deploying

Prompt 11 covers deployment properly. This is the first public deploy, so it is
deliberately minimal.

## Read this before you deploy

**Do not deploy with `sample_kb.csv`.**

That file is fixtures: invented fares, invented sailing times, invented phone
numbers. A public URL titled "SCASPA Assistant" that answers "the one-way fare
is XCD 44.44" is indistinguishable, to anyone who finds it, from real SCASPA
information. That is precisely what CLAUDE.md rule 5 forbids, and a traveller
acting on it could miss a sailing or arrive with the wrong paperwork.

Deploy only once `data/knowledge/` holds a real researcher export. If you need a
public URL before the researchers have delivered, deploy with an **empty**
index: `/api/health` will report `degraded` and every question returns the
no-answer message with SCASPA's real phone number. That is honest and safe.

## What you need

| Thing | Why |
| --- | --- |
| `OPENAI_API_KEY` | The agent cannot answer without it |
| A real knowledge-base CSV | See above |
| A host that supports SSE | Streaming needs unbuffered responses |

## Build the index at release time

The index is not baked into the image, so a redeploy cannot ship a stale one.

```bash
cd backend
uv run python scripts/build_index.py --csv ../data/knowledge/scaspa_kb_YYYY-MM-DD.csv
```

Ship `data/chroma/` and `data/index_meta.json` to the host's persistent volume,
or run the build as a release step against the mounted volume.

## Populate the operational store at release time

Separate from the index, and on the same volume. The knowledge base is prose in
Chroma; the cruise schedule is rows in `data/operational.sqlite3`, fetched from
SCASPA rather than built from the researchers' export.

```bash
cd backend
uv run python scripts/watchtower.py --force
```

The running application sweeps every six hours on its own, so this is not
strictly required — but a container that has just started waits a minute before
its first sweep, and a **brand new volume has nothing at all**. Without this
step the Vessels page correctly, and unhelpfully, tells the first visitors that
the published cruise schedule has not been retrieved.

`--force` overrides the six-hour interval, which is what you want once, at
release. It is not something to put on a timer.

## Docker

```bash
cd backend
docker build -t scaspa-chatbot .
docker run --rm -p 8000:8000 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e ALLOWED_ORIGINS="https://your-frontend.example.com" \
  -e ENV=prod \
  -v "$(pwd)/../data:/data" \
  scaspa-chatbot
```

## Fly.io

```bash
fly launch --no-deploy --name scaspa-chatbot
fly volumes create scaspa_data --size 1
fly secrets set OPENAI_API_KEY=sk-...
fly deploy
```

`fly.toml` is in `backend/`. It mounts a volume at `/data` for the Chroma index
and sets `ENV=prod`.

## Configuration checklist

Two services, and the pair is the point: the API and the client are deployed
separately, and most of what goes wrong is one of them not knowing about the
other.

### The API (Render reads `render.yaml`)

Four values are `sync: false` and must be set in the dashboard — they are the
only ones the blueprint cannot carry.

- [ ] `OPENAI_API_KEY` — a **secret**, never in the image or a committed file.
- [ ] `ADMIN_SECRET` — any long random string. Without it, `/api/admin/stats`
      does not exist at all, which is the safe default rather than a broken one.
- [ ] `ALLOWED_ORIGINS` — the **real frontend origin**, e.g.
      `https://scaspa-demo.vercel.app`. No trailing slash. A wildcard with
      `ENV=prod` makes the app refuse to boot, deliberately.
- [ ] `ELEVENLABS_API_KEY` — a **secret**. Without it `VOICE_PROVIDER=auto`
      falls back to OpenAI, which on this account has no speech models, and
      every press of the microphone fails.
- [ ] `ELEVENLABS_VOICE_ID` — not a secret, but it has no default on purpose:
      it is the voice every caller hears. Blank means transcription works and
      reading aloud is switched off, reported honestly by `/api/health`.

Carried by the blueprint, worth confirming after the first deploy:

- [ ] `ENV=prod`, `LOG_LEVEL=INFO`.
- [ ] The **disk is mounted at `/app/state`**. Everything that must survive a
      deploy lives there — the operational SQLite store, the question log, the
      TTS cache. Without it the cruise schedule is lost on every deploy and the
      Vessels page honestly reports it was never retrieved, for up to six hours,
      which looks exactly like an outage.
- [ ] The index is baked into the image, so `CHROMA_DIR` needs **no** volume —
      `decisions.md` 0017. `/api/health` must report `status: ok` and a row
      count.
- [ ] `watchtower_scheduler_started` appears in the boot log. If it does not,
      nothing refreshes the schedule and the "checked" date on screen quietly
      ages.

### The client (Vercel reads `frontend/vercel.json`)

- [ ] **Root directory: `frontend`.** The repository root builds the API, not
      the client; pointing the project at the root builds the wrong thing.
- [ ] `VITE_API_BASE_URL` — the **deployed API origin**, no trailing slash.
      This is the mirror of `ALLOWED_ORIGINS`, and the two have to name each
      other. It ships in the bundle and is public; there is no key in the
      client and never will be.
- [ ] `VITE_ENABLE_MOCKS` unset or false. The mock code is excluded from a
      production build entirely, but do not invite the question.
- [ ] HTTPS — both hosts give it free, and **the microphone does not work
      without it**. A page served over plain HTTP shows a microphone that
      silently never records.

Netlify or Cloudflare Pages work as well: build `npm run build` in `frontend`,
publish `dist`, and add a single SPA rewrite of `/*` to `/index.html`. The
framing headers in `vercel.json` then have to be reproduced by hand — see
`docs/embedding.md`, because the widget and the app need **opposite** policies.

## The one that catches everybody

`ALLOWED_ORIGINS` and `VITE_API_BASE_URL` point at each other, and if either is
wrong the client fails with no explanation: a browser will not tell JavaScript
that CORS was the cause, so it surfaces as a bare failed fetch while the API
answers `curl` perfectly.

Check it from the outside, the way a browser asks:

```bash
cd backend
uv run python scripts/preflight.py --url https://YOUR-API --origin https://YOUR-FRONTEND
```

That asserts the CORS reply names the origin, that the streaming POST survives
its preflight, that `Retry-After` is readable by the client, that voice is
available and which provider answered, and that Watchtower has actually
populated the store.

## Verify after deploying

```bash
curl -s https://YOUR-URL/api/health | jq '.status, .index.ready, .index.kb_version'

curl -N -X POST https://YOUR-URL/api/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"How much is a ferry ticket?"}'
```

Check that `x-accel-buffering: no` survives your proxy. If tokens arrive all at
once at the end, something upstream is buffering and streaming is doing nothing
for perceived performance.

Then confirm the refusals still hold in production:

```bash
for q in "where is my container?" "what's the radio frequency for berthing?"; do
  curl -s -X POST https://YOUR-URL/api/chat -H 'Content-Type: application/json' \
    -d "{\"message\":\"$q\"}" | jq '.refusal, .refusal_category'
done
```

## Cost

Every turn logs `agent_turn` with tool count, token counts and latency. Watch it
after the first public deploy — an agent that loops is capped at
`AGENT_MAX_TOOL_CALLS`, but the cap is a backstop, not a budget.
