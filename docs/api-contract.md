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
| `status` | `"ok" \| "degraded"` | Overall service health |
| `env` | `string` | From `ENV` |
| `version` | `string` | Backend version |
| `request_id` | `string` | Matches the `X-Request-ID` response header |
| `index` | `IndexStatus` | Knowledge index state |

`IndexStatus`:

| Field | Type | Notes |
| --- | --- | --- |
| `ready` | `boolean` | Whether retrieval can be served |
| `document_count` | `integer \| null` | Indexed chunks, null if unknown |
| `collection` | `string \| null` | Chroma collection name |
| `built_at` | `datetime \| null` | Last rebuild, null if never |

Example:

```json
{
  "status": "ok",
  "env": "dev",
  "version": "0.1.0",
  "request_id": "7a1c6f7e5b604b8095241ed8f7ed0964",
  "index": { "ready": false, "document_count": null, "collection": null, "built_at": null }
}
```

> The `index` fields are placeholders while the RAG layer is unbuilt. They
> report an unbuilt index rather than falsely claiming readiness.

---

## Not yet implemented

`POST /api/chat` and the voice endpoints are planned but intentionally absent.
Their routers exist as placeholders and are not registered. This section will
carry their full contract when they land — do not build a client against a
shape guessed from the placeholder files.
