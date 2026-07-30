# SCASPA Assistant API — contract

Base path `/api`. Interactive docs at `/docs`, machine-readable schema at
`/openapi.json`.

This file is the contract for the frontend team. If an endpoint or a schema
changes, this file changes in the same pull request.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/chat` | Ask a question, get one JSON response |
| `POST /api/chat/stream` | The same answer, streamed as Server-Sent Events |
| `GET /api/health` | Liveness, index state, configured models, uptime |
| `POST /api/stt` | Transcribe recorded audio to text |
| `POST /api/tts` | Synthesise text to MP3 audio |
| `POST /api/tts/preview` | Show what TTS would say, free |

**`/api/chat` and `/api/chat/stream` return identical content.** They share the
same retrieval, generation and verification path. Streaming changes *when* you
see the answer, never *what* it says.

---

## Conventions

**Request ids.** Every request is stamped. Send `X-Request-ID` to supply your
own, or one is generated. It comes back on the response header, in `meta.request_id`,
and in every server log line for that request. Quote it in bug reports.

**CORS.** Origins come from `ALLOWED_ORIGINS` (default `http://localhost:5173`).
Methods `GET, POST, OPTIONS`. Headers `Content-Type, Accept, X-Request-ID`. A
wildcard origin is rejected at boot when `ENV=prod`.

**Content type.** `application/json` in, `application/json` out, except the
stream, which is `text/event-stream`.

---

## Errors

Every non-2xx response has exactly this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "That question is too long. Please shorten it to 1000 characters or fewer.",
    "request_id": "fdc209ec9176465ba40df1523467bc3d"
  }
}
```

`message` is written for a traveller and is **safe to display as-is**. Every
message that represents a failure ends with the SCASPA phone number, so a user
standing at a terminal always has something to do next. Responses never contain
a stack trace, a filesystem path, a model name or any upstream provider detail.

Switch on `code`, never on `message`.

| `code` | HTTP | Meaning | Suggested client behaviour |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Message blank, or over 1000 characters | Show inline by the input; do not retry |
| `INDEX_MISSING` | 503 | The knowledge index has not been built | Show the message; retry later |
| `RETRIEVAL_EMPTY` | 503 | Index metadata exists but holds no rows | Show the message; retry later |
| `UPSTREAM_RATE_LIMITED` | 503 | The model provider is throttling us | Show the message; offer a retry button |
| `UPSTREAM_TIMEOUT` | 504 | The model did not answer in time | Show the message; offer a retry button |
| `NOT_FOUND` | 404 | No such route | — |
| `INTERNAL` | 500 | Anything else | Show the message; offer a retry button |

The server already applies a bounded retry with exponential backoff on 429 and
5xx before giving up, so by the time you see `UPSTREAM_*` it has genuinely
failed. An immediate client-side retry loop will not help; put it behind a
button.

### A no-answer is **not** an error

If the assistant has no verified information, that is a successful `200` with
`refusal: true` and a helpful message. Do not render it as a failure. Errors are
for when the *service* broke, not for when the *answer* is "I don't know".

---

## `POST /api/chat`

### Request

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `message` | `string` | yes | 1–1000 characters. Whitespace-only is rejected |
| `conversation_id` | `string \| null` | no | Omit on the first request; send back what you were given |
| `category` | `string \| null` | no | Optional retrieval filter: `ferry`, `cargo`, `cruise`, `airport`, `general` |

```bash
curl -X POST http://127.0.0.1:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "How much is a ferry ticket?"}'
```

### Response

| Field | Type | Notes |
| --- | --- | --- |
| `answer` | `string` | Verified text. Unverifiable citation markers already stripped |
| `conversation_id` | `string` | Send this on the next request |
| `grounded` | `boolean` | See the warning below |
| `refusal` | `boolean` | True when the assistant declined |
| `refusal_category` | `string \| null` | `vessel_or_aircraft_operations`, `personal_record`, or null |
| `citations` | `Citation[]` | Verified sources, built from stored metadata |
| `chart` | `ChartSpec \| null` | A chart to render, or null. Usually null |
| `tool_calls` | `ToolCall[]` | Tools the agent used this turn, in order |
| `meta` | `ResponseMeta` | Diagnostics |

`Citation`: `kb_id`, `category`, `subcategory`, `source_url`, `source_type`,
`as_of`, `confidence`.

`ResponseMeta`: `request_id`, `latency_ms`, `retrieved_count`, `best_score`,
`cited_ids`, `hallucinated_citations`, `unverified_figures`, `kb_version`.

`ChartSpec`:

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `"line" \| "bar" \| "area"` | Nothing else is supported |
| `title` | `string` | Short, factual |
| `x_label` | `string` | X axis label |
| `y_label` | `string` | Y axis label, including units |
| `series` | `ChartSeries[]` | 1–4 series |
| `caption` | `string` | **Always present.** States whether figures are official or illustrative |
| `source` | `string` | The single `kb-xxx` row every figure came from |

`ChartSeries`: `name`, `points[]`. `ChartPoint`: `x` (`string \| number`), `y`
(`number`). Maximum 40 points per series — beyond that it is unreadable on a
phone, which is where the users are.

**Render the `caption`.** It is mandatory server-side and it is the only way a
reader can tell a published tariff from an illustration. A chart is believed more
readily than a sentence, so a chart without its caption is worse than no chart.

Every numeric value in `series` has been checked against the text of the `source`
row before this object was built. The model describes a chart; it never draws one
and it cannot put a number in one that the knowledge base does not contain. See
`docs/decisions.md` 0014.

Example:

```json
{
  "type": "bar",
  "title": "Monthly cruise passengers",
  "x_label": "Month",
  "y_label": "Passengers",
  "series": [
    {
      "name": "Cruise passengers",
      "points": [
        { "x": "January", "y": 1111 },
        { "x": "February", "y": 2222 },
        { "x": "March", "y": 3333 }
      ]
    }
  ],
  "caption": "Illustrative sample figures, not official SCASPA statistics.",
  "source": "kb-101"
}
```

`ToolCall`: `name`, `summary`, `ms`. `summary` is written to be rendered
directly, e.g. `"Searching SCASPA knowledge base — ferry fares"`.

> ### What `grounded` actually means
>
> `grounded: true` means every `[kb-xxx]` marker and every money/time value in
> `answer` traces to a knowledge-base row that was really retrieved.
>
> **It does not mean the answer is correct.** A false claim carrying a valid
> citation still passes — see `docs/decisions.md` 0007. Do not present
> `grounded: true` to a user as a correctness guarantee. It is an internal
> integrity signal, useful for a debug panel and for logging.

### Sample — a normal cited answer

```json
{
  "answer": "The placeholder one-way fare is XCD 44.44 for an adult ticket [kb-008]. That was verified on 2026-04-01, so please confirm with SCASPA before you travel.",
  "conversation_id": "9131b944-2243-4d1e-8e87-1486a9d41f28",
  "grounded": true,
  "refusal": false,
  "refusal_category": null,
  "citations": [
    {
      "kb_id": "kb-008",
      "category": "ferry",
      "subcategory": "fares",
      "source_url": "https://example.invalid/ferry-terminal/fares",
      "source_type": "official-site",
      "as_of": "2026-04-01",
      "confidence": "confirmed"
    }
  ],
  "chart": null,
  "tool_calls": [
    {
      "name": "search_scaspa_knowledge",
      "summary": "Searching SCASPA knowledge base — ferry fares",
      "ms": 2
    }
  ],
  "meta": {
    "request_id": "ec970bed4d2b4a178f84a2f7a3619985",
    "latency_ms": 3,
    "retrieved_count": 5,
    "best_score": 0.5767650604248047,
    "cited_ids": ["kb-008"],
    "hallucinated_citations": [],
    "unverified_figures": [],
    "kb_version": "2026-06-01"
  }
}
```

The values above come from the fixture knowledge base, which is deliberately
fake. Real answers have the same shape.

### Sample — a refusal

Some questions never reach the model: vessel and aircraft operations, and
anything about a named person's container, shipment, booking or payment.

Request: `{"message": "where is my container?"}`

```json
{
  "answer": "That is not something I can advise on. Questions about customs, immigration, tax or legal matters, about a specific shipment, booking or payment, or about vessel, aircraft or vehicle operations need to go to SCASPA staff directly — they can see the details of your case, and I cannot.\n\nYou can reach SCASPA directly:\n  Telephone: 869-465-8121 / 2 / 3\n  Post: P.O. Box 963, Bird Rock, Basseterre, St. Kitts",
  "conversation_id": "1bb18aab-5160-4ef8-8e7c-6d177d17fece",
  "grounded": false,
  "refusal": true,
  "refusal_category": "personal_record",
  "citations": [],
  "chart": null,
  "tool_calls": [],
  "meta": {
    "request_id": "561bd4a3a2e1428bb81cf20abe944169",
    "latency_ms": 0,
    "retrieved_count": 0,
    "best_score": 0.0,
    "cited_ids": [],
    "hallucinated_citations": [],
    "unverified_figures": [],
    "kb_version": "2026-06-01"
  }
}
```

Render the answer text plainly. The phone number is already in it.

### Sample — a no-answer

When nothing retrieved clears `RETRIEVAL_MIN_SCORE`, the model is never called
and the assistant says so. Still **HTTP 200**.

Request: `{"message": "which beach should I go to?"}`

```json
{
  "answer": "I do not have verified SCASPA information that answers that, so I would rather not guess.\n\nYou can reach SCASPA directly:\n  Telephone: 869-465-8121 / 2 / 3\n  Post: P.O. Box 963, Bird Rock, Basseterre, St. Kitts",
  "conversation_id": "4e30517a-a204-4469-84ee-ee802fefbec4",
  "grounded": false,
  "refusal": true,
  "citations": [],
  "chart": null,
  "tool_calls": [],
  "meta": {
    "request_id": "3db59e011d9f4750a1e5328236561fac",
    "latency_ms": 2,
    "retrieved_count": 5,
    "best_score": 0.0,
    "cited_ids": [],
    "hallucinated_citations": [],
    "unverified_figures": [],
    "kb_version": "2026-06-01"
  }
}
```

Note `retrieved_count: 5` with `best_score: 0.0` — rows were considered and all
scored too low. That is the short-circuit working.

---

## `POST /api/chat/stream`

Same request body. Response is `text/event-stream` with `Cache-Control: no-cache`
and `X-Accel-Buffering: no` (some proxies otherwise buffer the whole stream and
defeat the point).

### Event sequence

```
event: meta        → { "conversation_id": "..." }
event: tool_start  → { "name", "summary" }
event: tool_end    → { "name", "summary", "ms" }
event: token       → { "text": "..." }              (repeated)
event: replace     → { "text": "..." }              (rare — see below)
event: citations   → { "citations": [ Citation ] }
event: chart       → ChartSpec                      (only when there is a chart)
event: done        → { "latency_ms", "grounded", "refusal", "kb_version" }
event: error       → { "code", "message", "request_id" }
```

### Tool events

The agent decides which tools to use, so `tool_start` / `tool_end` pairs appear
before and between tokens, and there may be several. `summary` is written to be
**rendered directly** — no formatting needed:

```
event: tool_start
data: {"name":"search_scaspa_knowledge","summary":"Searching SCASPA knowledge base — ferry fares"}

event: tool_end
data: {"name":"search_scaspa_knowledge","summary":"Searching SCASPA knowledge base — ferry fares","ms":2}
```

Match a `tool_end` to its `tool_start` by `name` plus order. `ms` is the measured
duration. Show these as they arrive — it is the only visible sign the assistant
is doing research rather than stalling.

The five tools, so you can pick an icon per `name`:

| `name` | What it means |
| --- | --- |
| `search_scaspa_knowledge` | Searching the verified knowledge base |
| `search_site_content` | Searching scaspa.com pages and PDFs |
| `make_chart` | Building a chart |
| `calculate` | Doing arithmetic on retrieved figures |
| `escalate_to_human` | Fetching SCASPA contact details |

### The `chart` event

Sent after `citations` and **always before `done`**, and only when the agent built
a chart. The payload is a complete `ChartSpec` — same shape as the `chart` field
on `POST /api/chat`. Most turns have no chart and no such event.

### The `replace` event

Rare. If the agent hits its tool-call cap, the tokens already streamed were an
internal message, not an answer. `replace` carries the text to show **instead**:
discard everything accumulated from `token` so far and render `replace.text`.
`done` will report `refusal: true`.

Guarantees:

- `meta` is **always first**, before any token, so you can attach state
  immediately.
- `citations` arrives **after the last token**. Citation validation needs the
  finished text, so it cannot come earlier.
- The stream always ends with `done` **or** `error`, never silence.

### Citation markers in the stream — important

Tokens stream **raw**, including `[kb-014]` markers, and a frame boundary can
fall **inside** a marker. You may receive `"...ticket [kb-0"` then `"08]. That"`.

Therefore:

1. **Accumulate token text before parsing.** Never parse markers per frame.
2. Render markers inline as chips as they appear, on accumulated text.
3. When `citations` arrives, **reconcile**: any marker in the text that is not in
   the `citations` array was not verified. Drop the chip or render it inert.

The server does not strip markers mid-stream because it cannot do so safely
across a frame boundary. The `citations` event is the authority, and the
non-streaming endpoint has already had unverifiable markers removed.

> This means a marker the server later rejects can be briefly visible during
> streaming. That is the accepted cost of streaming; the reconciliation step
> above is what closes it. If that is unacceptable for a given surface, use
> `POST /api/chat`, where the text is fully verified before it is sent.

### Errors mid-stream

Once headers are sent the status code is fixed at 200. A failure therefore
arrives as an `error` event and the connection closes. Handle `error` at any
point after `meta`.

Validation failures happen *before* streaming starts, so a bad body still gets a
normal `422` with the usual error envelope.

### Disconnect

Closing the connection cancels generation server-side. Nothing further is
charged. There is no need to send a cancel message.

### Trying it

```bash
curl -N -X POST http://127.0.0.1:8000/api/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message": "How much is a ferry ticket?"}'
```

Or with the bundled client, which prints timings:

```
$ uv run python scripts/stream_demo.py "How much is a ferry ticket?"
    58.7ms  meta      {"conversation_id": "4e30517a-..."}
   103.1ms  token     (first) 'The place'
   786.1ms  citations ['kb-008']
   786.7ms  done      {"latency_ms": 725, "grounded": true, "refusal": false, "kb_version": "2026-06-01"}
  time to first token : 103.1ms
```

---

## `GET /api/health`

No parameters, no auth.

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `"ok" \| "degraded"` | `degraded` when the index is missing or empty |
| `env` | `string` | From `ENV` |
| `version` | `string` | Backend version |
| `uptime_s` | `number` | Seconds since the process started |
| `request_id` | `string` | Matches the response header |
| `models` | `ModelNames` | `chat`, `embedding`, `transcribe`, `tts` |
| `index` | `IndexStatus` | Knowledge index state |

`IndexStatus`: `ready`, `kb_version`, `kb_rows`, `kb_rows_rejected`,
`kb_csv_filename`, `kb_updated_at`, `index_built_at`, `embedding_model`,
`web_docs`, `message`.

Unknown values are `null`, never `0` — a client must not read "never built" as
"built and empty".

```json
{
  "status": "ok",
  "env": "dev",
  "version": "0.1.0",
  "uptime_s": 8.209,
  "request_id": "0e82068ee0c442148571a61fe1f03562",
  "models": {
    "chat": "gpt-5.6-terra",
    "embedding": "text-embedding-3-large",
    "transcribe": "gpt-transcribe",
    "tts": "gpt-4o-mini-tts"
  },
  "index": {
    "ready": true,
    "kb_version": "2026-06-01",
    "kb_rows": 10,
    "kb_rows_rejected": 0,
    "kb_csv_filename": "sample_kb.csv",
    "kb_updated_at": "2026-06-01",
    "index_built_at": "2026-07-29T18:01:50.730567Z",
    "embedding_model": "text-embedding-3-large",
    "web_docs": 0,
    "message": null
  }
}
```

With no index built, `status` is `degraded`, `index.ready` is `false`, and
`index.message` explains it. Still HTTP 200.

`models` appears here and **only** here. It never appears in a chat response or
an error.


---

## Voice

Voice is **accessibility, not novelty**. A cruise passenger on the pier with a
phone in one hand and a bag in the other will talk to this long before they type,
and so will a driver at the cargo gate.

Both endpoints are enhancements. If either provider fails you get a clean error
and the text path is completely unaffected — never block the chat UI on voice.

### ⚠️ The microphone needs HTTPS

**`navigator.mediaDevices.getUserMedia` only works on a secure context: HTTPS,
or `localhost`.** On plain HTTP over a LAN address — `http://192.168.1.20:5173`,
the usual way you test on a phone — `mediaDevices` is `undefined` and the mic
**fails silently**. No prompt, no error dialog, nothing in the console unless you
check for it.

So:

- Local development on `http://localhost:5173` works.
- Testing on a phone against your laptop's IP over HTTP **will not work**, and it
  will look like a bug in this API. It is not.
- The deployed frontend **must** be served over HTTPS.

Guard for it and say so, rather than letting the button do nothing:

```js
if (!navigator.mediaDevices?.getUserMedia) {
  // Not a secure context, or no mic. Hide the mic button and keep typing.
  showTypeOnlyMode("Voice needs a secure (HTTPS) connection.");
}
```

### `POST /api/stt`

Multipart upload, field name **`audio`**.

| Constraint | Value |
| --- | --- |
| Formats | WebM, MP4, M4A, MPEG/MP3, WAV, OGG (parameters like `;codecs=opus` are fine) |
| Max size | 20 MB |
| Max duration | about 60 seconds |

```bash
curl -X POST http://127.0.0.1:8000/api/stt -F "audio=@question.webm;type=audio/webm"
```

**200**

```json
{ "text": "How much is a ferry ticket?" }
```

That is the whole response, deliberately. **Do not chain this straight into
`/api/chat`.** Put the transcript in the input box so the user can fix a misheard
terminal name or figure first — a confident answer to a misheard question is both
a bad experience and a bad demo moment.

**422** for an unsupported format, an empty upload, too large, or too long. The
`message` is written for a user and is safe to show as-is. **503** if the
transcription provider is unavailable.

Audio is processed in memory and discarded. Nothing is written to disk, and
neither the audio nor the transcript is ever logged.

### `POST /api/tts`

```json
{ "text": "The one-way fare is XCD 44.44 [kb-008]." }
```

Returns **`audio/mpeg`** bytes with `Cache-Control: public, max-age=3600` and an
`ETag`. Send `If-None-Match` on a repeat and you get a **304**. `X-TTS-Cache` is
`hit` or `miss` — server-side caching means the canned messages (refusal,
no-answer, greeting) are synthesised once, not once per rehearsal.

Send the **`answer` field verbatim**. The server sanitises it: markdown removed,
`[kb-xxx]` markers removed, URLs replaced, JSON and table pipes removed, phone
numbers and currency expanded. You do not need to pre-clean anything.

What sanitisation does, with the cases that matter:

| In | Spoken |
| --- | --- |
| `869-465-8121` | `8 6 9, 4 6 5, 8 1 2 1` |
| `869-465-8121 / 2 / 3` | the three numbers, each as digits |
| `XCD 44.44` | `44.44 East Caribbean dollars` |
| `**bold**`, `` `code` ``, `## head` | the words only |
| `[kb-008].` | removed, with no stray space before the full stop |
| `https://www.scaspa.com/x` | `the SCASPA website` |
| `\| Berth \| EC$100 \|` | `Berth, 100 East Caribbean dollars.` |

The phone number is the one that matters most: read as an integer it becomes
"eight hundred sixty-nine million…", which nobody can write down — and it ends
every refusal.

**422** if the text is empty, or empty once sanitised (e.g. only a citation
marker), or over 4000 characters after sanitisation. **503** if the provider is
unavailable.

### `POST /api/tts/preview`

Same body. Returns `{ "text": "..." }` — the sanitised text that *would* be
spoken, with **no provider call and no cost**. Useful for showing a caption, and
the fastest way to find a sanitisation bug.

---

## Conversations and privacy

`conversation_id` is a random UUID minted by the server on the first request.
Send it back to continue a conversation.

Conversation history lives **in the server process's memory only**. Nothing is
written to disk or to a database, and nothing survives a restart. The store
holds only question text, answer text and a timestamp. It holds no IP address,
no user agent, no account, no device identifier — there is no way to link a
conversation to a person.

History is capped at `MAX_HISTORY_TURNS` exchanges and expires
`CONVERSATION_TTL_MINUTES` after last use.

Two consequences for the client:

- Losing the `conversation_id` loses the conversation. There is no recovery, by
  design.
- With more than one server worker, a request may land on a process that has not
  seen the conversation. Treat history as best-effort.

Note: history is currently **stored but not fed back into the prompt**. Each
answer is produced from the current question alone. Wiring history into
generation is a deliberate, separately measured change.

---

## Not yet implemented

Voice endpoints (`app/routers/voice.py`) are placeholders and unregistered. This
file will carry their contract when they land.
