# Run book

For someone who is nervous and in front of an audience. Short steps. Do them in
order. Do not debug — recover.

Set this once per session:

```bash
export URL=https://YOUR-DEPLOYED-URL
cd scaspa-chatbot/backend
```

---

## 0. Before every demo (5 minutes)

1. `uv run python scripts/preflight.py --url $URL --warm-only`
2. `uv run python scripts/preflight.py --url $URL --kb-version YYYY-MM-DD`
3. `uv run python scripts/watchtower.py --status` — check `last checked` is
   within six hours. The Vessels page prints that date on screen, so a stale one
   is visible to anybody watching. `--force` refreshes it in seconds.
4. All green → you are ready. Any red → find its section below.
5. Open the app in the browser now and leave the tab open. It stays warm.
6. Ask one question by hand. Do not present on an untested tab.

**If preflight says RATE LIMITED:** wait 60 seconds and rerun. That is not a bug —
the preflight used its own quota.

---

## 1. The API is down / nothing responds

1. `curl -s -o /dev/null -w "%{http_code}\n" $URL/api/health`
2. If it hangs 30–60 s then answers: cold start. Wait, it is waking. Go to §4.
3. If it returns nothing at all, check the platform dashboard for a crashed
   deploy. Redeploy the **last known good** commit — do not fix forward.
4. If the platform is down: **present from localhost.**
   ```bash
   uv run uvicorn app.main:app --port 8000
   uv run python scripts/preflight.py --url http://127.0.0.1:8000
   ```
5. Say to the room: "we're running the same build locally." That is all. Do not
   explain the outage.

---

## 2. OpenAI returns 429 mid-demo

The backend already retries 429 with backoff and then returns a clean error, so
the user sees a readable message, not a crash.

1. Pause. Say: "the model provider is rate limiting us, one moment."
2. Wait 20 seconds. Ask the **same** question again — the retry usually clears it.
3. Still failing → switch to a question you have already asked this session. TTS
   answers are cached, and repeats are cheaper and faster.
4. Check `curl -s -H "X-Admin-Secret: $ADMIN_SECRET" $URL/api/admin/stats | jq .today`
   — if `over_threshold` is true you are near the daily estimate.
5. Do not raise limits mid-demo. Finish on text-only questions.

---

## 3. The index is missing or stale

**Symptom:** `/api/health` shows `"status": "degraded"`, or `index.ready` is false,
or answers refuse everything.

1. `curl -s $URL/api/health | jq '.index'`
2. `ready: false` → the image shipped without an index. Redeploy with the index
   built (see README, "Deploy"). There is no live fix; the index is baked in.
3. Wrong `kb_version` → the deploy is older than the sheet. Either redeploy, or
   **present on the version you have** and say so:
   > "This is the knowledge base as verified on <date>."
   That is a better answer than a scramble.
4. Local fallback:
   ```bash
   uv run python scripts/build_index.py --csv ../data/knowledge/scaspa_kb_YYYY-MM-DD.csv --force
   uv run uvicorn app.main:app --port 8000
   ```

---

## 3b. The cruise schedule is stale, or the Vessels page says it was never retrieved

**Symptom:** the Vessels page reads *"The published cruise schedule could not be
retrieved"*, or the PUBLISHED badge carries a **checked** date that is more than
six hours old.

Those are two different faults and the first command tells them apart.

```bash
uv run python scripts/watchtower.py --status
```

Read the two dates carefully — they are not the same fact:

| Line | What it means when it is old |
| --- | --- |
| `last checked` | **Nobody has looked.** The scheduler is not running, or is not winning the lease. This is our fault. |
| `last changed` | SCASPA has not edited the schedule. Entirely normal — it can sit for weeks. Not a fault at all. |

Then:

1. **`last checked` is `never`** — a fresh deployment that has not swept yet, or
   `WATCHTOWER_ENABLED=false` with nothing else running. Populate it now:
   ```bash
   uv run python scripts/watchtower.py --force
   ```
2. **`last checked` is hours old and the app is up** — look for
   `watchtower_scheduler_started` in the boot log. If it is absent, the
   scheduler is switched off; if it is present but no `watchtower_sweep` line
   has appeared, check `lease:` in the status output. A lease held by a worker
   that no longer exists blocks the others until it expires, which takes ten
   minutes at most.
3. **`status` is `fetch_failed`** — the endpoint is flaking. This is *expected
   occasionally*: SCASPA's Apps Script redirects to a one-time
   `googleusercontent` URL and that hop returns 404 unpredictably. The monitor
   retries three times before giving up, and the previous schedule stays on
   screen. If several consecutive sweeps failed, run `--force` and watch:
   ```bash
   uv run python scripts/watchtower.py --force
   ```
4. **`status` is `parse_failed`** — this is the serious one. SCASPA changed the
   shape of what the endpoint returns. **The stored schedule is kept and is
   still being served**, so nothing on screen is wrong; it is simply frozen at
   the last good fetch. The fix is a code change to
   `app/watchtower/parsers.py`, not a restart. Say so plainly if asked:
   > "The schedule shown was verified on <date>. We are checking the source."

**What you must not do:** empty the table to "clear" a bad state. An empty
schedule renders as "SCASPA has published no calls", which tells a passenger no
ships are coming. Failure deliberately keeps the last good data — see
`app/watchtower/monitor.py`.

---
## 4. Cold start / first question is slow

1. Expected on a free tier after idling. Measure it:
   `uv run python scripts/preflight.py --url $URL --warm-only`
2. Open the app **that many minutes plus one** before you present.
3. Keep the tab open. The keep-warm pinger handles the rest (README, "Keep warm").
4. If a judge is waiting: ask a question you asked earlier. It will be faster.

---

## 5. The venue blocks the API domain

1. Test before presenting: open `$URL/api/health` on the **venue** wifi, not your
   phone hotspot.
2. Blocked → tether to a phone hotspot, reconnect, rerun preflight.
3. Hotspot also blocked → **run locally**:
   ```bash
   uv run uvicorn app.main:app --port 8000
   ```
   and point the frontend at `http://localhost:8000`.
4. **The microphone will not work over plain HTTP on a LAN address** — it needs
   HTTPS or `localhost`. On localhost it works. Over a LAN IP, do not attempt
   voice; use text and do not mention it.

---

## 6. A demo question suddenly returns the wrong answer

1. Do not retry it in front of the audience. Move to the next question.
2. Afterwards:
   ```bash
   uv run python scripts/search.py "the question that failed"
   ```
   If the right row is not in the top three, it is a **retrieval** problem, not a
   prompt problem.
3. Check whether it was replaced rather than wrong:
   ```bash
   curl -s -X POST $URL/api/chat -H 'Content-Type: application/json' \
     -d '{"message":"the question"}' | jq '{answer, grounded, meta}'
   ```
   `grounded: false` with an "I could not verify one of the figures" answer means
   **the grounding gate did its job.** The assistant refused to state a number it
   could not trace. That is a good outcome and worth saying out loud.
4. File it: the question, what was retrieved, what was expected. `evals/latest.md`
   is formatted for exactly this.

---

## 7. Voice fails

Voice is an enhancement. The text path is unaffected by any voice failure.

**Ask health first — it now knows:**

```bash
curl -s $URL/api/health | jq .voice
```

`provider` tells you which service to go and look at — `openai` or
`elevenlabs`, with `VOICE_PROVIDER=auto` already resolved. Establish that first;
the rest depends on it.

| `voice` says | What it means |
| --- | --- |
| `checked: true`, both **true** | Voice should work. A failure now is a provider problem; see step 3. |
| `stt: true`, `tts: false`, provider `elevenlabs` | Reachable, but no voice chosen — or `ELEVENLABS_VOICE_ID` names one this account does not have. **The microphone works and reading aloud does not.** Fix: `cd backend && uv run python scripts/voice_smoke.py --voices`, then set the id in `backend/.env`. |
| `checked: true`, both **false**, provider `openai` | This OpenAI project has no speech-model entitlement. `detail` names the models. **An account change, not a deployment** — redeploying will not fix it, and the controls are already hidden, so there is nothing to do live. |
| `checked: false` | The backend could not find out. The controls stay visible on purpose, so voice may or may not work. |

1. Microphone button is greyed with "Asking by voice is switched off" → either
   `VITE_ENABLE_VOICE=false` in the build, or health says the models are not
   available. The table above tells you which. **This is the designed state, not
   a fault** — do not try to fix it during a demonstration.
2. Microphone button does nothing at all → not a secure context. See §5 step 4.
3. `/api/stt` or `/api/tts` returns 503 → provider is down. **Keep going on text.**
   Do not comment on it.
4. Audio sounds wrong (a phone number read as a huge integer):
   ```bash
   curl -s -X POST $URL/api/tts/preview -H 'Content-Type: application/json' \
     -d '{"text":"THE ANSWER TEXT"}' | jq -r .text
   ```
   That shows exactly what will be spoken, free.

---

## 8. Something is on fire and none of the above applies

1. Stop debugging. You have a working local copy.
2. `uv run uvicorn app.main:app --port 8000` and present from it.
3. If even that fails, present the architecture, `evals/latest.md` and the
   decisions log. **The engineering process is the substance.** A judge who hears
   an honest account of what broke and why learns more than one watching a demo.

---

## The demo failure drill (frontend)

**If the venue wifi dies mid-presentation, switch to `/dev/rehearsal` and keep
going.**

It renders a recorded four-exchange conversation from a local fixture with **no
network at all** — no fetch, no stream, no mock worker. It covers the four things
worth showing: a cited answer, a fee table, a chart, and the refusal.

### Before the session

- Have the tab **already open in the background**. Typing a URL in front of an
  audience is the part that looks like panic.
- Confirm it renders once, as part of `frontend/scripts/preflight-frontend.md`.
- Say the line out loud once: *"the venue wifi has gone — here is the same
  conversation recorded earlier."*

### Why it is labelled

The page carries a visible amber banner reading **"Rehearsed conversation —
recorded, not live"**. That is deliberate and must not be removed. Passing a
replay off as a live answer is the one unrecoverable thing to be caught doing in
front of judges; the audience already knows the wifi has failed, and showing a
prepared fallback reads as preparation rather than as a cover-up.

### It is dev-only

`/dev/rehearsal` is behind `import.meta.env.DEV`, so the production build emits no
chunk for it and the route 404s. **The presenting machine must therefore be
running `npm run dev`, not a production build**, for the drill to be available.
That is a deliberate trade: a recorded conversation on a public URL is a liability,
and the drill is for the presenter's machine.

Composure beats perfection. Having a rehearsed second option is what produces
composure.
