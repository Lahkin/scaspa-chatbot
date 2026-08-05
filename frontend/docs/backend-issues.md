# Issues raised with the backend team

Filed the way the researchers file a knowledge-base correction: the exact request,
the exact response, and the expected response. Verified against a locally running
backend on 2026-07-30.

Each entry says which **layer** is wrong, because the rule is to fix that layer
rather than to patch the frontend around it.

**All five are now closed**, and the entries are kept rather than deleted: the
reasoning is why the fixes look the way they do, and a closed issue with its
evidence intact is the cheapest way to stop the same thing being reintroduced.
Each carries a **Resolved** note naming what changed.

---

## #1 — `RATE_LIMITED` is emitted but not documented — ✅ resolved

**Layer at fault: the contract.** The backend's behaviour is correct and its
message is better than a generic one. `docs/api-contract.md` was incomplete.

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

### The problem

The contract's error table listed seven codes and **`RATE_LIMITED` was not among
them**. The nearest was `UPSTREAM_RATE_LIMITED`, documented as _"The model
provider is throttling us"_ on a **503** — a different cause entirely.
`app/errors.py` defines both, so the two are deliberately distinct in the backend
and only one reached the contract.

### Impact, before the fix

`RATE_LIMITED` failed the frontend's zod enum, so the envelope was rejected and
the generic fallback message was rendered instead — the user saw "Something went
wrong reaching SCASPA" for what is a completely ordinary, expected condition. The
429 status still mapped to a sensible kind, so the failure was silent, which is
what made it worth finding.

### Resolved

`docs/api-contract.md` now lists `RATE_LIMITED` (429) in the error table and
states plainly why it is not the same thing as `UPSTREAM_RATE_LIMITED`.
`backend/tests/test_contract.py` asserts the code set matches the documented one,
so a code added to `ErrorCode` without a contract entry now fails a test rather
than a user's answer.

The frontend keeps its **own** approved copy for it ("One moment — a lot of
questions have come from this connection just now"), which remains deliberate:
the client knows the countdown is on the Send button and can say so, where the
backend cannot.

---

## #2 — the `Citation` payload omits `volatility`, `label` and `snippet` — ✅ resolved

**Layer at fault: the contract and the backend response builder.**

All three are columns on every knowledge-base row (`app/rag/models.py`) and none
was exposed on the citation.

`volatility` was the one that mattered: it decides whether a source shows
"confirm with SCASPA before you travel" prominently or shows its date quietly,
which is the handbook's schedule rule made visible. Without it the frontend
treated every citation as **high** — the cautious default — so every source
carried the confirmation treatment and the distinction was dead code.

### Was

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

### Now

```json
{
  "kb_id": "kb-008",
  "…": "…",
  "volatility": "medium",
  "label": "How much is a ferry ticket?",
  "snippet": "SAMPLE DATA — not a real fare. Placeholder one-way fare is XCD 44.44…"
}
```

### Resolved, and two decisions worth knowing

`build_citations` in `app/rag/answer.py` now fills all three from the retrieved
chunk. No frontend change was needed: all three were already typed optional and
already rendered.

- **`volatility` is `null`, never guessed.** A row with nothing on record arrives
  as null and the client applies `high` itself. Defaulting server-side to `low`
  would have quietly downgraded a schedule nobody had classified.
- **`snippet` is cut only at whitespace.** Truncating `XCD 44.44` to `XCD 44.4`
  would put a wrong fare directly beneath an answer the reader has been asked to
  trust — the same class of failure as CLAUDE.md rule 10, one layer down. A
  scraped page carries no snippet at all rather than an arbitrary slice of
  itself.

`label` and `snippet` are read from the chunk text rather than from Chroma
metadata, which is why this needed no re-index: `build_kb_text` writes every row
in a fixed shape, so the two lines parsed back out are exactly the row's stored
`question` and `answer`.

---

## #3 — `refusal_category` is absent from the stream's `done` event — ✅ resolved

**Layer at fault: the stream serialiser.**

`POST /api/chat` returned `refusal_category`; the stream's `done` event carried
`latency_ms`, `grounded`, `refusal` and `kb_version` but not the category.

Consequence: a _streamed_ refusal could not pick its specific explanation, so a
boundary refusal ("I cannot look up your container") rendered with the generic
no-answer framing. Both showed the backend's own approved text and the contact
route, so the degradation was in framing only — but the two are meant to look
different.

### Resolved

`_done_payload` now includes `refusal_category`. The frontend carries it from
`onDone` into the reducer's `DONE` action, and the action field is **required**
so a transport cannot quietly forget to pass it.
`backend/tests/test_contract.py` asserts both endpoints report the same category
for the same question, and `npm run check:integration` asserts it against a
running server.

---

## #4 — the backend adopts a client-supplied `conversation_id` — ✅ resolved

**Layer at fault: mild, and mostly a question.**

`app/routers/chat.py` was `conversation_id = payload.conversation_id or store.new_id()`.
Sending `../../etc/passwd` returned that same string.

Harmless as far as anyone could tell — a conversation holds only question and
answer text, no identity — but a server that echoes back any string it is handed
invites someone to conclude otherwise.

### Resolved

`ConversationStore.adopt_or_mint` replaces anything that is not a well-formed
UUID with a fresh id.

**Membership is deliberately not the test.** The store is per-process, so an id
this worker has never seen may belong to a sibling; rejecting unknown ids would
break history behind more than one uvicorn worker. Shape is the only check that
is correct at both ends, and it is stated as a tidiness guarantee rather than a
security one, because that is what it is.

---

## #5 — `Retry-After` is not exposed to cross-origin JavaScript — ✅ resolved

**Layer at fault: the backend.** One line of CORS configuration.

`Retry-After` is **not** a CORS-safelisted response header. A browser will not
let JavaScript read it unless the server names it in
`Access-Control-Expose-Headers`. The backend exposed only `X-Request-ID`.

### Impact, measured

The server sent `Retry-After: 45` and the UI counted down from **30**, which is
the frontend's fallback when the header is unreadable. The countdown looks
completely normal while being a guess, so a user was invited to retry 15 seconds
early and collect another 429.

**This was invisible to server-side testing.** `npm run check:integration` read
the header without trouble because Node does not enforce CORS — the same trap
recorded in `decisions.md` F007. It only appeared in a browser, cross-origin.

### Resolved

`EXPOSED_HEADERS` in `app/main.py` is now
`X-Request-ID, Retry-After, X-TTS-Cache`. `X-TTS-Cache` went in at the same time:
the contract documents it as something a client may read, and it was not exposed
either.

Because the underlying bug cannot be reproduced from Node, both checks assert the
**advertisement** rather than the read —
`test_cors_actually_advertises_the_exposed_headers` in the backend suite, and a
`CORS exposed headers` block in the integration script. Neither would have caught
the original; both will catch its return.

The frontend keeps its conservative 30-second default and its dev-console warning
for the case where the header is still unreadable, since a proxy in front of the
API can reintroduce exactly this.
