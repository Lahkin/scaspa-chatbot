# SCASPA Assistant API — contract

Base path `/api`. Interactive docs at `/docs`, machine-readable schema at
`/openapi.json`.

This file is the contract for the frontend team. If an endpoint or a schema
changes, this file changes in the same pull request.

| Endpoint                     | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| `POST /api/chat`             | Ask a question, get one JSON response            |
| `POST /api/chat/stream`      | The same answer, streamed as Server-Sent Events  |
| `GET /api/health`            | Liveness, index state, configured models, uptime |
| `POST /api/stt`              | Transcribe recorded audio to text                |
| `POST /api/tts`              | Synthesise text to MP3 audio                     |
| `POST /api/tts/preview`      | Show what TTS would say, free                    |
| `GET /api/vessels`           | Vessel arrivals and berth occupancy              |
| `GET /api/cruise-schedule`   | Cruise calls as SCASPA publishes them            |
| `GET /api/flights`           | Flight arrivals and departures                   |
| `GET /api/tariffs`           | Published schedule of port charges               |
| `POST /api/tariffs/quote`    | Estimate charges from published rates            |
| `GET /api/support/directory` | Published contact routes                         |
| `POST /api/support/ticket`   | Raise a ticket, get a reference                  |

**`/api/chat` and `/api/chat/stream` return identical content.** They share the
same retrieval, generation and verification path. Streaming changes _when_ you
see the answer, never _what_ it says.

---

## Conventions

**Request ids.** Every request is stamped. Send `X-Request-ID` to supply your
own, or one is generated. It comes back on the response header, in `meta.request_id`,
and in every server log line for that request. Quote it in bug reports.

**CORS.** Origins come from `ALLOWED_ORIGINS` (default
`http://localhost:5173,http://127.0.0.1:5173` — a browser treats those two as
different origins). Methods `GET, POST, OPTIONS`. Request headers
`Content-Type, Accept, X-Request-ID`. A wildcard origin is rejected at boot when
`ENV=prod`.

**Readable response headers.** Only `X-Request-ID`, `Retry-After` and
`X-TTS-Cache` are named in `Access-Control-Expose-Headers`. Everything else is
invisible to cross-origin JavaScript no matter what the server sends — that is
the browser, not this API. `Retry-After` matters most: without it a client
counts down from a guess that looks exactly like a real countdown. Note that
this is invisible to server-side testing, because Node does not enforce CORS.

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

| `code`                  | HTTP | Meaning                                                       | Suggested client behaviour                                                     |
| ----------------------- | ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`      | 422  | Message blank, over 1000 characters, or an unknown `category` | Show inline by the input; do not retry                                         |
| `RATE_LIMITED`          | 429  | **This client** has sent too many requests                    | Show the message, count down `Retry-After`, disable send. **Never auto-retry** |
| `INDEX_MISSING`         | 503  | The knowledge index has not been built                        | Show the message; retry later                                                  |
| `RETRIEVAL_EMPTY`       | 503  | Index metadata exists but holds no rows                       | Show the message; retry later                                                  |
| `UPSTREAM_RATE_LIMITED` | 503  | The model provider is throttling us                           | Show the message; offer a retry button                                         |
| `UPSTREAM_TIMEOUT`      | 504  | The model did not answer in time                              | Show the message; offer a retry button                                         |
| `NOT_FOUND`             | 404  | No such route                                                 | —                                                                              |
| `INTERNAL`              | 500  | Anything else                                                 | Show the message; offer a retry button                                         |

`RATE_LIMITED` and `UPSTREAM_RATE_LIMITED` are **different things** and deserve
different copy. The first is this client being limited by us, on a 429, and the
user can fix it by waiting. The second is the model provider throttling _us_, on
a 503, and the user can do nothing about it. Treating them as one is how someone
gets told to slow down when the fault is entirely ours.

The server already applies a bounded retry with exponential backoff on 429 and
5xx before giving up, so by the time you see `UPSTREAM_*` it has genuinely
failed. An immediate client-side retry loop will not help; put it behind a
button.

### A no-answer is **not** an error

If the assistant has no verified information, that is a successful `200` with
`refusal: true` and a helpful message. Do not render it as a failure. Errors are
for when the _service_ broke, not for when the _answer_ is "I don't know".

### A greeting is **not** a refusal

`hi`, `hello`, `thanks` and the like are answered directly, before retrieval, on
both `/api/chat` and `/api/chat/stream`. They return `200` with:

```
refusal: false      grounded: true      citations: []
```

**`refusal` is `false`** — nothing was declined. Filing a greeting as a refusal
would make the refusal rate meaningless and tell the client the assistant would
not help.

**`grounded` is `true` with no citations**, which looks contradictory and is the
correct answer to the question the field asks: _every id and figure traces to a
retrieved row_. A greeting contains no id and no figure, so every one of them
traces, vacuously. The message states no fee, time or statistic, so there is
nothing to cite and nothing to withdraw.

> It was `false` first, on the reasoning that nothing had been retrieved — a
> different question, and answering it here put an amber _"I could not fully
> verify this — please confirm with SCASPA"_ under the word "hello". `grounded`
> is only ever used to **take confidence away**, never to add it (there is no
> "verified" badge in this product, by design), so `true` is safe in the one
> direction that matters.

Clients should render it as an ordinary answer with an empty sources panel, no
verification notice, and no escalation block: ending "hello" with a telephone
number reads as being shown the door.

Anything containing a question is **not** a greeting, however politely it opens —
`"hi, how much is a 40ft container?"` is retrieved and answered normally.

---

## `POST /api/chat`

### Request

| Field             | Type             | Required | Notes                                                                                                                                                        |
| ----------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `message`         | `string`         | yes      | 1–1000 characters. Whitespace-only is rejected                                                                                                               |
| `conversation_id` | `string \| null` | no       | Omit on the first request; send back what you were given. Anything that is not a well-formed UUID is replaced with a fresh id                                |
| `category`        | `string \| null` | no       | Optional retrieval filter: `ferry`, `cargo`, `cruise`, `airport`, `general`, `marine`, `payments`, `access`, `jobs`, `corporate`. Anything else is a **422** |

**About `category`.** It is a hard constraint, not a hint. It restricts
retrieval to rows in that area and it **overrides** the category the agent would
have chosen for itself — a widget embedded on the airport page is asking not to
be answered from ferry rows, and it knows that better than a classifier reading
the question does. Omit the field entirely if you do not mean it; sending an
area you did not intend produces a confident "I do not have that" for a question
the knowledge base answers. An unknown value is rejected rather than applied,
for the same reason: a filter that matches no row is indistinguishable from an
empty knowledge base.

```bash
curl -X POST http://127.0.0.1:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "How much is a ferry ticket?"}'
```

### Response

| Field                | Type                    | Notes                                                                  |
| -------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `answer`             | `string`                | Verified text. Unverifiable citation markers already stripped          |
| `conversation_id`    | `string`                | Send this on the next request                                          |
| `grounded`           | `boolean`               | See the warning below                                                  |
| `refusal`            | `boolean`               | True when the assistant declined                                       |
| `refusal_category`   | `string \| null`        | `vessel_or_aircraft_operations`, `personal_record`, or null            |
| `question_sanitised` | `string \| null`        | The question as actually sent, when input safety changed it. See below |
| `answer_replaced`    | `boolean`               | The draft was discarded as ungrounded and rewritten. See below         |
| `step_limit_reached` | `boolean`               | The agent ran out of tool calls. **Not** the same as "not in our data" |
| `citations`          | `Citation[]`            | Verified sources, built from stored metadata                           |
| `chart`              | `ChartSpec \| null`     | A chart to render, or null. Usually null                               |
| `card`               | `AssistantCard \| null` | An interactive card to render below the answer, or null                |
| `tool_calls`         | `ToolCall[]`            | Tools the agent used this turn, in order                               |
| `meta`               | `ResponseMeta`          | Diagnostics                                                            |

`ResponseMeta`: `request_id`, `latency_ms`, `retrieved_count`, `best_score`,
`cited_ids`, `hallucinated_citations`, `unverified_figures`, `kb_version`.
`kb_version` is `string | null` — an index built before versions were recorded
has none. Do not require it.

### `Citation`

| Field         | Type                                  | Notes                                                                                                 |
| ------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `kb_id`       | `string`                              | The row id, matching the `[kb-xxx]` marker                                                            |
| `category`    | `string`                              | `ferry`, `cargo`, `cruise`, `airport`, `general`, `marine`, `payments`, `access`, `jobs`, `corporate` |
| `subcategory` | `string`                              | Narrower topic, e.g. `fares`                                                                          |
| `source_url`  | `string`                              | The published source                                                                                  |
| `source_type` | `string`                              | `official-site`, `official-pdf`, `client-interview`, `press`, `regulator`                             |
| `as_of`       | `string`                              | ISO date a researcher verified the fact                                                               |
| `confidence`  | `string`                              | Always `confirmed` for an indexed row                                                                 |
| `volatility`  | `"low" \| "medium" \| "high" \| null` | How fast the fact goes stale                                                                          |
| `label`       | `string \| null`                      | The row's own question — a readable name for the source                                               |
| `snippet`     | `string \| null`                      | Short excerpt of the row's stored answer                                                              |

Every field is copied from the stored metadata of a row that was really
retrieved. **None of it is model output**, and none of it is inferred.

> **`volatility` is `null` when the row has none, and that is not the same as
> `low`.** Render an absent or unrecognised value as `medium` — "changes often"
> — and mark it as defaulted rather than reported. The failure that matters here
> is a stale ferry departure shown quietly as a confident fact, so the unknown
> case has to be a cautious one, and it must still carry the
> confirm-before-you-rely-on-it line. Do not let a missing field downgrade a
> schedule to `low` or to `static`.
>
> This paragraph said `high` until the design handoff landed. The handoff names
> the rendering explicitly in two places — §1.2 Family A and §3.7 — and adds the
> signal the stricter rule never had: a ring around the badge, so a reviewer can
> see that the value was supplied by the fallback rather than measured.

`snippet` is truncated server-side at 180 characters and **only ever cut at
whitespace**, so a figure is never split — `XCD 44.44` cannot arrive as
`XCD 44.4`. A source with no curated answer (a scraped page or a PDF) carries no
snippet at all rather than an arbitrary slice of itself, and its `label` is the
page title.

`ChartSpec`:

| Field     | Type                        | Notes                                                                   |
| --------- | --------------------------- | ----------------------------------------------------------------------- |
| `type`    | `"line" \| "bar" \| "area"` | Nothing else is supported                                               |
| `title`   | `string`                    | Short, factual                                                          |
| `x_label` | `string`                    | X axis label                                                            |
| `y_label` | `string`                    | Y axis label, including units                                           |
| `series`  | `ChartSeries[]`             | 1–4 series                                                              |
| `caption` | `string`                    | **Always present.** States whether figures are official or illustrative |
| `source`  | `string`                    | The single `kb-xxx` row every figure came from                          |

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

> ### `answer_replaced` and `step_limit_reached`
>
> Both are computed on every turn. Both used to be dropped at the wire boundary,
> which left a client able to see that _an_ answer came back but not that it had
> been rewritten, nor that it stopped early.
>
> **`answer_replaced`** is true when the drafted answer carried a money or time
> value that could not be matched to a retrieved row, so the draft was thrown
> away and the answer rebuilt from published figures. The user is reading
> something different from what was written, and a client that says so on every
> answer is lying while one that says so on none is hiding a correction. Show the
> notice on exactly these.
>
> **`step_limit_reached`** is true when the agent hit its tool-call cap before
> finishing. It is a different failure from "we do not hold that", and it takes
> different copy: _"ask for one thing at a time"_ resolves this one and sends the
> other group round in circles, because no amount of simplifying reaches a fact
> the knowledge base does not contain. When it is true, `replace` has already
> carried the text to show (streaming) and `refusal` is `true`.
>
> Both default to `false`. A client parsing a response from a build that predates
> them gets the behaviour it had before they existed.

> ### `question_sanitised` — when the user's own words changed
>
> Input safety neutralises instruction-override phrasing rather than rejecting
> it, because _"ignore the sign at the gate"_ is a reasonable thing for a
> traveller to type. The matched span is replaced **in place** with the literal
> marker `[instruction-like text removed]`, so the position in the sentence
> survives.
>
> This field carries the resulting text, and is `null` when nothing changed —
> which is almost always. It rides on `meta` in the stream rather than on `done`,
> because it describes what was **sent**: the correction belongs on screen before
> the answer starts arriving, not after it has finished.
>
> Two obligations for a client:
>
> 1. **Show it instead of the draft the user typed.** Rendering the original
>    while the assistant answered something else is the interface lying about
>    what it sent.
> 2. **Never reconstruct the removed text.** Only the marker crosses the wire.
>    Echoing an injection attempt back into the DOM shows the next person exactly
>    which wording to try.

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
      "confidence": "confirmed",
      "volatility": "medium",
      "label": "How much is a ferry ticket?",
      "snippet": "The placeholder one-way fare is XCD 44.44 for a fictional adult ticket."
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
event: meta        → { "conversation_id": "...", "question_sanitised": null }
event: tool_start  → { "name", "summary" }
event: tool_end    → { "name", "summary", "ms" }
event: token       → { "text": "..." }              (repeated)
event: replace     → { "text": "..." }              (rare — see below)
event: citations   → { "citations": [ Citation ] }
event: chart       → ChartSpec                      (only when there is a chart)
event: card        → AssistantCard                  (only when there is a card)
event: done        → { "latency_ms", "grounded", "refusal", "refusal_category",
                       "answer_replaced", "step_limit_reached", "kb_version" }
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

| `name`                    | What it means                                  |
| ------------------------- | ---------------------------------------------- |
| `search_scaspa_knowledge` | Searching the verified knowledge base          |
| `get_cruise_schedule`     | Reading the published SCASPA cruise schedule    |
| `search_site_content`     | Searching scaspa.com pages and PDFs            |
| `make_chart`              | Building a chart                               |
| `calculate`               | Doing arithmetic on retrieved figures          |
| `escalate_to_human`       | Fetching SCASPA contact details                |
| `show_card`               | Attaching an interactive card below the answer |

### The `chart` event

Sent after `citations` and **always before `done`**, and only when the agent built
a chart. The payload is a complete `ChartSpec` — same shape as the `chart` field
on `POST /api/chat`. Most turns have no chart and no such event.

### The `replace` event

Rare. If the agent hits its tool-call cap, the tokens already streamed were an
internal message, not an answer. `replace` carries the text to show **instead**:
discard everything accumulated from `token` so far and render `replace.text`.
`done` will report `refusal: true`.

### The `done` event

Same fields the non-streaming response carries, including `refusal_category`,
`answer_replaced` and `step_limit_reached`, so a streamed answer loses no
distinction by being streamed. `kb_version` and `refusal_category` are both
nullable; the two booleans default to `false`. **Parse `done` tolerantly**: it is
the last event, so a client that rejects it has no later event to recover on and
the answer stays stuck mid-stream forever.

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

Validation failures happen _before_ streaming starts, so a bad body still gets a
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
   786.7ms  done      {"latency_ms": 725, "grounded": true, "refusal": false, "refusal_category": null, "kb_version": "2026-06-01"}
  time to first token : 103.1ms
```

---

## `GET /api/health`

No parameters, no auth.

| Field        | Type                 | Notes                                         |
| ------------ | -------------------- | --------------------------------------------- |
| `status`     | `"ok" \| "degraded"` | `degraded` when the index is missing or empty |
| `env`        | `string`             | From `ENV`                                    |
| `version`    | `string`             | Backend version                               |
| `uptime_s`   | `number`             | Seconds since the process started             |
| `request_id` | `string`             | Matches the response header                   |
| `models`     | `ModelNames`         | `chat`, `embedding`, `transcribe`, `tts`      |
| `index`      | `IndexStatus`        | Knowledge index state                         |

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

| Constraint   | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Formats      | WebM, MP4, M4A, MPEG/MP3, WAV, OGG (parameters like `;codecs=opus` are fine) |
| Max size     | 20 MB                                                                        |
| Max duration | about 60 seconds                                                             |

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

| In                                  | Spoken                                            |
| ----------------------------------- | ------------------------------------------------- |
| `869-465-8121`                      | `8 6 9, 4 6 5, 8 1 2 1`                           |
| `869-465-8121 / 2 / 3`              | the three numbers, each as digits                 |
| `XCD 44.44`                         | `44.44 East Caribbean dollars`                    |
| `**bold**`, `` `code` ``, `## head` | the words only                                    |
| `[kb-008].`                         | removed, with no stray space before the full stop |
| `https://www.scaspa.com/x`          | `the SCASPA website`                              |
| `\| Berth \| EC$100 \|`             | `Berth, 100 East Caribbean dollars.`              |

The phone number is the one that matters most: read as an integer it becomes
"eight hundred sixty-nine million…", which nobody can write down — and it ends
every refusal.

**422** if the text is empty, or empty once sanitised (e.g. only a citation
marker), or over 4000 characters after sanitisation. **503** if the provider is
unavailable.

### `POST /api/tts/preview`

Same body. Returns `{ "text": "..." }` — the sanitised text that _would_ be
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

## `AssistantCard`

A structured card rendered beneath an answer. Discriminated on `kind`:
`vessel_arrivals`, `flight_schedules`, `tariff_calculator`, `support_ticket`.

Arrives on the `card` field of `POST /api/chat`, and as a `card` **event** on the
stream — after `citations` and any `chart`, always before `done`. Same payload
either way.

> ### The model requests a card. It never fills one in.
>
> The `show_card` tool takes a kind and, at most, a filter. **There is no
> parameter for a vessel name, an ETA, a berth, a status, a rate or a total**, so
> the model cannot put one there. Every row is read from the operational feed
> after the answer is written, and the card carries that feed's `DataSource`.
>
> This is why an answer can say _"I cannot see live vessel movements"_ and carry
> an arrivals board in the same breath, without contradicting itself. The
> sentence is the assistant, bound by its rules. The board is the feed, labelled
> as such.
>
> Two obligations for a client:
>
> 1. **Render `source.notice` on a data card**, exactly as on the standalone
>    panels. A board without it is indistinguishable from a live one.
> 2. **Do not gate the card on `grounded`.** A chart is gated, because its
>    figures come from cited rows. A card's provenance is its own `DataSource`,
>    so hiding it when the prose failed verification would withhold the
>    better-sourced of the two.
>
> An unrecognised `kind` should drop the **card**, not the answer.

`tariff_calculator` and `support_ticket` carry **no figures and no identity** —
they are empty forms the user drives. The calculator's total comes from
`POST /api/tariffs/quote` with its mandatory disclaimer; the ticket posts to
`POST /api/support/ticket`, which accepts no name or email.

---

## Operations: vessels, flights and tariffs

`GET /api/vessels` · `GET /api/flights` · `GET /api/tariffs`
`GET /api/ops/positions` · `GET /api/ops/gates` · `GET /api/ops/advisories` ·
`GET /api/ops/profile`

**These are not the assistant, and that separation is the point.** The system
prompt forbids the assistant from claiming live status — it cannot see whether a
berth is occupied or a flight is delayed, and it may not infer either from a
published schedule. These endpoints are a plain data path with no model in them:
a feed comes in, it is validated, and it goes out saying where it came from.

So a panel may show "EN ROUTE" — because a named feed said so at a stated time —
while the assistant continues to decline to say it in a sentence. Both are true
at once, and the `source` object is what makes that so.

### The four `/api/ops/*` endpoints

Added so the design's map, gate and advisory panels have something behind them.
All four return an **empty result on every source without that feed**, which is
every real one today, and the panels render their "not connected" state from it.

| Endpoint                  | Returns                      | Notes                                                                                                              |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/ops/positions`  | `positions[]`, `total`       | Each carries `reported_by`: `ais`, `manual` or `estimated`. `speed_knots` is **null when not reported**, never `0` |
| `GET /api/ops/gates`      | `gates[]`, `active`, `total` | `active` is counted **server-side** from the gates, so it cannot disagree with the flight screen's tile            |
| `GET /api/ops/advisories` | `advisories[]`, `total`      | Notices to mariners, passed through verbatim. **An empty list is not an all-clear** — see below                    |
| `GET /api/ops/profile`    | `profile` or `null`          | A demo card. **Not authentication** — see below                                                                    |

**`/api/ops/advisories` carries the only fake datum in this API that a reader
could act on.** Marine safety information is different in kind from a fabricated
berth number: a swell warning can be believed and acted on, and a quiet panel
can be read as permission to sail. So the fixture names `Placeholder Port`, says
"sample" in its own headline, is always the lowest severity, and mentions no
real SCASPA facility — asserted in `test_a_sample_marine_advisory_cannot_be_mistaken_for_a_real_one`.
Clients must render the empty state as a statement that nothing was published,
never as a tick, a green chip or the word "clear".

**`/api/ops/profile` is not an authentication endpoint and must not become
one.** There is no sign-in in this product, no session and no user record. The
endpoint reads nothing about the caller — no header, no cookie — and returns the
same invented card to everyone; `test_the_profile_endpoint_reads_nothing_about_the_caller`
pins that by sending an `Authorization` header and a `Cookie` and asserting the
response is byte-identical. `profile` is `null` on every source but the fixture
one, and the boot guard already refuses to start with fixtures when `ENV=prod`,
so the one way this reaches a real user is a deployment that is already refusing
to boot. `profile.is_demo` is a required literal `true` and `profile.notice` is
required non-empty; a client must render that notice at least as prominently as
the card.

### Filtering and paging on the three list endpoints

Every filter below is applied **server-side**, and `total` is the count of
matching records **after** filtering and **before** paging. That is what makes
the range readout (`Showing 1–25 of 100`) true, and it is why a client must not
filter the rows it was handed: filtering a page while quoting the unfiltered
total describes a result set that does not exist.

| Endpoint           | Filters                                                                                          | Paging                                |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `GET /api/vessels` | `q` (name or IMO, substring, case-insensitive) · `vessel_type` · `berth` · `status` · `facility` | `limit` 1–100, default 25 · `offset`  |
| `GET /api/flights` | `q` (flight number or port) · `airline` · `status` · `direction` (`arrival` / `departure`)       | `limit` 1–100, default 25 · `offset`  |
| `GET /api/tariffs` | `q` (code or description) · `category` · `facility`                                              | `limit` 1–100, default 100 · `offset` |

### `facility` — the four sites, on the record and as a filter

`VesselArrival`, `GateAssignment` and `TariffRow` each carry
`facility: "deep_water_harbour" | "port_zante" | "basseterre_ferry_terminal" | "rlb_airport" | null`.

**`null` means the feed did not say**, and it is never inferred. Before this
field existed, a vessel carried `berth` and nothing else, so Deep Water Harbour
and Port Zante were distinguishable only by whether the sample data happened to
say `"Berth 1"` or `"Pier 1"` — on a product whose entire subject is four
facilities.

The two filters behave **differently on purpose**:

| Endpoint           | `?facility=port_zante` returns                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/vessels` | Only records attributed to that facility. An unattributed record is **excluded** — being handed movements that might be anywhere is the failure the field exists to prevent.                       |
| `GET /api/tariffs` | Facility-specific rates **and** rates with `facility: null`. A charge published for the whole port applies at the facility being asked about, and dropping it would understate what a caller owes. |

`GET /api/ops/gates` carries the field but takes **no** `facility` parameter: it
returns the complete set with a total, like positions and advisories.

`metrics` on `/api/vessels` and `/api/flights` describes **the feed, not the
query**: it is unaffected by every parameter above, including `direction`. So
`FlightMetrics.total_flights` counts arrivals and departures together whatever
`direction` was asked for, and it is not a count of either one. A client that
labels it "Arrivals today" is publishing a wrong figure under a right-looking
label.

**The tiles have their own fields now.** `FlightMetrics` carries
`arrivals_today`, `departures_today` and `delayed`, and `VesselMetrics` carries
`arrivals_today` — a **calendar day**, which `arrivals_next_24h` is not. The two
agree at midday and diverge every evening, so they answer different questions
and a tile labelled "today" reads the calendar-day field. All four are `int |
null` and are **null until a feed supplies them**; null renders as the em dash,
never as `0`. A screen that wants a figure under one of these labels waits for
the field rather than substituting the nearest available number.

**Positions, gates and advisories take no parameters at all** — they return the
complete set with a total. Do not send `limit` or `offset` to them.

### `DataSource`, on every operations response

| Field    | Type                                   | Notes                                                   |
| -------- | -------------------------------------- | ------------------------------------------------------- |
| `kind`   | `"live" \| "published" \| "fixture" \| "unavailable"` | Which of the four you are looking at        |
| `label`  | `string`                               | Human-readable origin, safe to render                   |
| `as_of`  | `string \| null`                       | When the data was produced. **Not** when you fetched it |
| `notice` | `string \| null`                       | **Render this whenever present**                        |

> **`notice` is mandatory to display.** It is non-null for every `fixture` and
> `unavailable` source and the server will not build one without it. A table of
> vessel arrivals is believed on sight, and nothing in the rows tells a reader
> whether they are looking at a real feed or at development sample data. This
> string is the only thing that does.

#### `kind: "published"` — official information, fetched periodically

Official SCASPA information that this service **retrieved at a stated time** —
the cruise schedule, today. It is deliberately neither of the two things it
would otherwise have to pretend to be:

- **not `live`.** A page fetched every six hours is a snapshot, and calling a
  snapshot live is the claim that makes every other claim on the screen worth
  less. Never label it LIVE in a UI.
- **not `fixture`.** This is real SCASPA data, and dressing it in the
  sample-data warning teaches readers to ignore that warning.

`as_of` is **mandatory** for this kind and is when Pilot last fetched it — the
server refuses to build a `published` source without it. Render it: "Checked 27
Aug 2026 at 05:12 UTC" is the honest label, and a published snapshot with no
date on it is indistinguishable from a live feed.

`notice` is null, because there is nothing to warn about.

`kind: "unavailable"` is the **production default** and is a **200 with an empty
list**, not an error. SCASPA has published no feed; that is a fact about the
world, not a failure, and a 503 would put a red error panel in front of someone
over a feature that was never switched on. Render your empty state.

`kind: "fixture"` is obviously-fake development data and is **refused at boot**
when `ENV=prod`.

Every metric (`vessels_at_berth`, `on_time_percent`, …) is nullable. **Null is
not zero**: "0 vessels at berth" describes an empty port, which is a completely
different statement from "this feed does not report occupancy".

`VesselArrival` carries `eta` and `ata` as **separate fields**. An ETA is a
prediction and an ATA is a record. Do not collapse them into one "time" column —
that is how a guess gets read as a fact by someone deciding whether to drive to
the port.

---

## `POST /api/tariffs/quote`

Applies published rates to the quantities you send and totals them.

> ### The total is derived, and it must never appear without its disclaimer
>
> Every `rate` in `line_items` is a published SCASPA figure, quoted exactly.
> **The total is not.** It is arithmetic this API did, and it appears in no
> published source — which is why the assistant itself is forbidden from
> producing such a figure at all.
>
> Three things make that exception safe, and a client must preserve all three:
>
> 1. **Show every line.** Each carries its code, rate, quantity and amount, so
>    the arithmetic can be checked by hand. The lines always add up to the total
>    exactly — each is rounded before summing.
> 2. **Do not style it as a charge.** It is an estimate, not an invoice line.
> 3. **Render `disclaimer` in full**, next to the total, never truncated and
>    never behind a "show more".
>
> `derived` is always `true` and `disclaimer` is always non-empty. Treat both as
> required: a quote arriving without them is a contract violation, and rendering
> a bare total is worse than rendering nothing, because someone will budget a
> shipment against it.

> ### `unpriced` — the total that is short by a whole charge
>
> `unpriced` lists codes that **applied to this movement and have no published
> rate**. They appear in no `line_items` entry and in no figure, so nothing else
> in the response reveals that anything is missing: a quote with a dropped charge
> is byte-for-byte as tidy as a complete one.
>
> When `unpriced` is non-empty the total is not the amount payable, and the three
> rules above are not enough on their own — the disclaimer covers _"confirmed on
> invoice"_, which is about rounding and revision, not about a charge that was
> never counted. So a client must additionally:
>
> 1. Label the figure **"Total so far"**, not "Total".
> 2. Name what is missing, by code, in the lines where it would have appeared.
> 3. Say that the amount payable is higher and point at the department.
>
> The array is empty on a complete quote, which is the overwhelmingly common
> case. A silently dropped charge is the worst outcome this endpoint can produce,
> and it was previously only visible in a server log line.

Only `XCD` is accepted. Converting a published fee applies an exchange rate
nobody published — a **422**, not a silent conversion.

---

## Support

`GET /api/support/directory` returns published contact routes and the department
values the ticket form accepts.

`POST /api/support/ticket` takes `department`, `subject`, `details`, and
optionally `include_transcript` with a `conversation_id`.

> ### It takes no name, no email, no phone number and no attachment
>
> Not an oversight. `docs/privacy.md` states that nothing in this service can
> link a conversation to a person, and a ticket carrying an email address would
> make that false. Sending those fields anyway is harmless and pointless — they
> are ignored, never stored and never echoed.
>
> The exchange is inverted instead: the user gets a `reference` to quote when
> **they** contact SCASPA. **Always render `next_step`.** Nobody will make
> contact first, and a receipt that omits that reads as "we'll be in touch".

---

## Rate limits by scope

Three budgets, split by what a request costs rather than by which router it is
in:

| Scope   | Endpoints                          | Limit                                               |
| ------- | ---------------------------------- | --------------------------------------------------- |
| `chat`  | `/api/chat`, `/api/chat/stream`    | `RATE_LIMIT_PER_MINUTE`                             |
| `voice` | `/api/stt`, `/api/tts`             | a third of it — billed per second and per character |
| `ops`   | vessels, flights, tariffs, support | four times it — no model, no embedding              |

The `ops` split matters to a client: browsing an arrivals board is naturally
several requests, and if they came out of the chat budget then paging through
vessels would leave someone unable to ask a question, having spent their
allowance on page views they never thought of as requests.

---

## Not in this API

Everything documented above is implemented and registered, voice included — the
"not yet implemented" note that used to close this file was left behind by the
prompt that added the voice endpoints, and `npm run check:integration` exercises
them.

Two things a client should not go looking for:

- **`GET /api/admin/stats`** exists, but it is an operator endpoint behind
  `X-Admin-Secret` and the route is **absent entirely** unless `ADMIN_SECRET` is
  configured. It is not part of this contract and no browser client should call
  it: doing so would mean shipping the secret in a bundle, which is worse than
  having no stats page. Read it with `curl` from somewhere that already holds
  the secret.
- **Model names.** They appear in `GET /api/health` and nowhere else — never in
  a chat response and never in an error.

### If voice returns 503

Voice is an enhancement and every failure in it is contained: the text path is
completely unaffected. A 503 from `/api/stt` or `/api/tts` has two causes that
look identical from the client, and both are configuration rather than code:
`OPENAI_API_KEY` is unset, or the project behind the key has no access to the
configured `OPENAI_TRANSCRIBE_MODEL` / `OPENAI_TTS_MODEL`. The backend log line
`tts_failed` / `stt_failed` carries the provider's own reason. Do not block the
chat UI on either.
