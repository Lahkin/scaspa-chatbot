# API contract

Base path: `/api`. Interactive docs at `/docs`, schema at `/openapi.json`.

Update this file whenever an endpoint or schema changes — CLAUDE.md.

## Conventions

**Request IDs.** Every request is stamped with an id. Send `X-Request-ID` to
supply your own, or one is generated. It is echoed on the response and appears
in every server log line for that request.

**Errors.** Failures return an `ErrorResponse`:

| Field | Type | Notes |
| --- | --- | --- |
| `detail` | `string` | Human-readable message |
| `request_id` | `string \| null` | For log correlation |

**CORS.** Origins come from `ALLOWED_ORIGINS` (default
`http://localhost:5173`).

---

## Implemented

### `GET /api/health`

Liveness and index readiness. Takes no parameters and requires no auth.

**200 — `HealthResponse`**

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `"ok" \| "degraded"` | `degraded` when the index is missing or empty |
| `env` | `string` | From `ENV` |
| `version` | `string` | Backend version |
| `request_id` | `string` | Matches the `X-Request-ID` response header |
| `index` | `IndexStatus` | Knowledge index state |

`IndexStatus` — read from `data/index_meta.json`, written by
`scripts/build_index.py`:

| Field | Type | Notes |
| --- | --- | --- |
| `ready` | `boolean` | Whether retrieval can be served |
| `kb_version` | `string \| null` | Knowledge-base version, usually the export date |
| `kb_rows` | `integer \| null` | Confirmed rows indexed |
| `kb_rows_rejected` | `integer \| null` | Rows rejected at the last build |
| `kb_csv_filename` | `string \| null` | Resolved filename of the indexed CSV |
| `kb_updated_at` | `date \| null` | Newest `as_of` among indexed rows |
| `index_built_at` | `datetime \| null` | When the index was last built |
| `embedding_model` | `string \| null` | Model used to embed the index |
| `web_docs` | `integer \| null` | Scraped web chunks indexed |
| `message` | `string \| null` | Why the index is not ready |

Healthy:

```json
{
  "status": "ok",
  "env": "dev",
  "version": "0.1.0",
  "request_id": "ef85b7aa9f5e4892abd402d7460f4a41",
  "index": {
    "ready": true,
    "kb_version": "2026-06-01",
    "kb_rows": 10,
    "kb_rows_rejected": 0,
    "kb_csv_filename": "sample_kb.csv",
    "kb_updated_at": "2026-06-01",
    "index_built_at": "2026-07-29T17:20:01.373968Z",
    "embedding_model": "text-embedding-3-large",
    "web_docs": 0,
    "message": null
  }
}
```

No index built yet — still **200**, never a 500:

```json
{
  "status": "degraded",
  "env": "dev",
  "version": "0.1.0",
  "request_id": "…",
  "index": {
    "ready": false,
    "kb_version": null,
    "kb_rows": null,
    "kb_updated_at": null,
    "index_built_at": null,
    "message": "No index metadata at …/data/index_meta.json. The index has not been built — run scripts/build_index.py."
  }
}
```

> Unknown values are `null`, never `0`. A client must not read "never built" as
> "built and empty".

---

## Not yet implemented

`POST /api/chat` and the voice endpoints are planned but intentionally absent.
Their routers exist as placeholders and are not registered. Do not build a
client against a shape guessed from the placeholder files.

### Planned `ChatResponse` shape

The answer chain already exists as library code (`app.rag.answer.AnswerResult`)
and is exercised through `scripts/chat_repl.py`. The eventual `ChatResponse`
will map onto it directly, so the shape is recorded here in advance:

| Field | Type | Notes |
| --- | --- | --- |
| `answer` | `string` | Post-processed. Unverifiable citation markers already stripped |
| `grounded` | `boolean` | Every id **and** figure traces to a retrieved row |
| `refusal` | `boolean` | True when the chain declined without calling the model |
| `refusal_category` | `string \| null` | Which deterministic gate fired |
| `citations` | `Citation[]` | Built from stored metadata, never from model text |
| `cited_ids` | `string[]` | Verified ids only |
| `hallucinated_citations` | `string[]` | Ids the model invented; stripped from `answer` |
| `unverified_figures` | `string[]` | Money/time values found in no retrieved chunk |
| `best_score` | `number` | Top retrieval similarity, 0–1 |
| `model` | `string \| null` | Null when the model was never called |
| `latency_ms` | `integer` | |

`Citation`: `kb_id`, `category`, `subcategory`, `source_url`, `source_type`,
`as_of`, `confidence`.

> `grounded: true` means every id and figure in the answer traces to a retrieved
> row. It does **not** mean the answer is correct — a false claim carrying a
> valid citation still passes. See `docs/decisions.md` 0007. A client should not
> present `grounded: true` to a user as a correctness guarantee.
