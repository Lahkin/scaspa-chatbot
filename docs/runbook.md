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
3. All green → you are ready. Any red → find its section below.
4. Open the app in the browser now and leave the tab open. It stays warm.
5. Ask one question by hand. Do not present on an untested tab.

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

1. Microphone button does nothing → not a secure context. See §5 step 4.
2. `/api/stt` or `/api/tts` returns 503 → provider is down. **Keep going on text.**
   Do not comment on it.
3. Audio sounds wrong (a phone number read as a huge integer):
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
