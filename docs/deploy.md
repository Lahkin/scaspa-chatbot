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

- [ ] `OPENAI_API_KEY` set as a **secret**, never in the image or a committed file.
- [ ] `ALLOWED_ORIGINS` set to the real frontend origin. A wildcard with
      `ENV=prod` makes the app refuse to boot — that is intentional.
- [ ] `ENV=prod`.
- [ ] `CHROMA_DIR` on a persistent volume, or the index is lost on restart.
- [ ] `LOG_LEVEL=INFO`.
- [ ] Index built and `/api/health` returns `status: ok`.

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
