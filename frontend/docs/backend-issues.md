# Issues raised with the backend team

Filed the way the researchers file a knowledge-base correction: the exact request,
the exact response, and the expected response. Verified against a locally running
backend on 2026-07-30.

Each entry says which **layer** is wrong, because the rule is to fix that layer
rather than to patch the frontend around it.

---

## #1 — `RATE_LIMITED` is emitted but not documented

**Layer at fault: the contract.** The backend's behaviour is correct and its
message is better than a generic one. `docs/api-contract.md` is incomplete.

### Request

```
POST http://127.0.0.1:8000/api/chat
Content-Type: application/json

{"message": "ferry fare?"}
```

Sent repeatedly until the per-IP limiter trips (default 15/minute).

### Actual response

```
HTTP/1.1 429 Too Many Requests
retry-after: 45
content-type: application/json

{"error":{"code":"RATE_LIMITED","message":"You have sent a lot of questions in a short time. Please wait a moment and try again. If you need an answer now, call SCASPA on 869-465-8121 / 2 / 3.","request_id":"266e41c7c5664c3f822960593a8a0c7f"}}
```

### Expected, per `docs/api-contract.md`

The contract's error table lists seven codes and **`RATE_LIMITED` is not among
them**. The nearest is `UPSTREAM_RATE_LIMITED`, documented as _"The model provider
is throttling us"_ on a **503** — a different cause entirely. `app/errors.py`
defines both, so the two are deliberately distinct in the backend and only one
reached the contract.

### Impact, before the fix

`RATE_LIMITED` failed the frontend's zod enum, so the envelope was rejected and
the generic fallback message was rendered instead — the user saw "Something went
wrong reaching SCASPA" for what is a completely ordinary, expected condition. The
429 status still mapped to a sensible kind, so the failure was silent, which is
what made it worth finding.

The frontend now recognises the code and renders **its own** approved copy for it
("One moment — a lot of questions have come from this connection just now"),
which is deliberate: the client knows the countdown is on the Send button and can
say so, where the backend cannot. The backend's sentence remains the fallback for
any code the frontend does not know.

### Asked for

Add to the contract's error table:

| `code`         | HTTP | Meaning                                     | Suggested client behaviour                                                      |
| -------------- | ---- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| `RATE_LIMITED` | 429  | This client (IP) has sent too many requests | Show the message, count down `Retry-After`, disable send. **Never auto-retry.** |

No backend change requested.

### Frontend, meanwhile

`RATE_LIMITED` is accepted in `lib/types.ts` and `lib/schemas.ts`, has its own
approved copy (the cause is different from provider throttling, so the sentence
is too), sets the composer cooldown, and is on the never-retry list. Marked in
`types.ts` as not-yet-in-the-contract so it is not mistaken for a transcription.

---

## #2 — the `Citation` payload omits `volatility`, `label` and `snippet`

Raised in `docs/decisions.md` F005 and still open. All three are columns on every
knowledge-base row (`app/rag/models.py`, `data/knowledge/sample_kb.csv`) and none
is exposed on the citation.

**Layer at fault: the contract and the backend response builder.**

`volatility` is the one that matters: it decides whether a source shows
"confirm with SCASPA before you travel" prominently or shows its date quietly,
which is the handbook's schedule rule made visible. Without it the frontend treats
every citation as **high** — the cautious default — so every source currently
carries the confirmation treatment.

### Request

```
POST /api/chat
{"message": "How much is a ferry ticket?"}
```

### Actual (a citation, abridged)

```json
{
  "kb_id": "kb-008",
  "category": "ferry",
  "subcategory": "fares",
  "source_url": "…",
  "source_type": "official-site",
  "as_of": "2026-04-01",
  "confidence": "confirmed"
}
```

### Expected

```json
{
  "kb_id": "kb-008",
  "…": "…",
  "volatility": "medium",
  "label": "How much is a ferry ticket?",
  "snippet": "The placeholder one-way adult fare is XCD 44.44…"
}
```

All three are typed optional in the frontend, so no frontend change is needed the
day they arrive.

---

## #3 — `refusal_category` is absent from the stream's `done` event

**Layer at fault: the contract, or the stream serialiser — the team's call.**

`POST /api/chat` returns `refusal_category`; the stream's `done` event carries
`latency_ms`, `grounded`, `refusal` and `kb_version` but not the category.

Consequence: a _streamed_ refusal cannot pick its specific explanation, so a
boundary refusal ("I cannot look up your container") renders with the generic
no-answer framing. Both show the backend's own approved text and the contact
route, so the degradation is in framing only — but the two are meant to look
different.

### Asked for

Add `refusal_category` to the `done` payload, or state in the contract that a
streaming client cannot distinguish the two and should not try.

---

## #4 — the backend adopts a client-supplied `conversation_id`

**Layer at fault: probably nothing — raised for confirmation.**

`app/routers/chat.py:142` is `conversation_id = payload.conversation_id or store.new_id()`.
Sending `00000000-0000-4000-8000-000000000000` returns that same id rather than a
freshly minted one.

Harmless as far as anyone can tell — a conversation holds only question and answer
text, no identity, and the ids are random UUIDs — but it means an expired id is
reused rather than rotated, which is not what the prompt this was built against
assumed. The frontend validates that the stored value is a UUID before sending, so
it never contributes a malformed one, and it overwrites its stored value with
whatever comes back regardless.

**Question for the team:** is adopting an arbitrary well-formed id intended?

---

## #5 — `Retry-After` is not exposed to cross-origin JavaScript

**Layer at fault: the backend.** One line of CORS configuration.

`Retry-After` is **not** a CORS-safelisted response header. A browser will not let
JavaScript read it unless the server names it in `Access-Control-Expose-Headers`.
The backend currently exposes only `X-Request-ID`.

### Request

```
POST http://127.0.0.1:8000/api/chat
Origin: http://localhost:5173
Content-Type: application/json

{"message": "x"}
```

(after the per-IP limiter has tripped)

### Actual response headers

```
HTTP/1.1 429 Too Many Requests
retry-after: 11
access-control-allow-origin: http://localhost:5173
access-control-allow-credentials: true
access-control-expose-headers: X-Request-ID
```

### Expected

```
access-control-expose-headers: X-Request-ID, Retry-After
```

### Impact

Measured in a browser against the live backend: the server sent `Retry-After: 45`
and the UI counted down from **30**, which is the frontend's fallback when the
header is unreadable. The countdown looks completely normal while being a guess,
so a user is invited to retry 15 seconds early and collect another 429.

**This is invisible to server-side testing.** `npm run check:integration` reads the
header without trouble because Node does not enforce CORS — the same trap recorded
in `decisions.md` F007. It only appears in a browser, cross-origin.

### Not worked around

The frontend keeps its conservative 30-second default and now emits a dev-console
warning naming the cause when a 429 arrives with no readable `Retry-After`.
Guessing a better number would hide the bug; the fix belongs in the backend.

### Also worth exposing

`X-TTS-Cache` is documented in the contract as something the client may read, and
it is not in the expose list either. It is not currently used, so this is a
heads-up rather than a defect.
