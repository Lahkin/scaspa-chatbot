# Security

This is a student project built for the St. Christopher Air & Sea Ports Authority
(SCASPA). It is written plainly because a plain description is more useful than a
confident one.

## Reporting a problem

Open a GitHub issue, or contact the team directly. If the issue involves user data
or a way to make the assistant state something false as fact, say so in the title
and we will treat it first.

## The absolute rules

These are enforced in code and covered by tests, not just documented.

### `pay.scaspa.com` is never touched

It is a live payment portal. Any URL matching `SCRAPER_BLOCKLIST` **raises an
exception** — it is never quietly skipped, because a skip is a decision code makes
silently and an exception is one a person has to look at. Enforced at every fetch
entry point (`app/scraper/site.py`, `app/scraper/pdfs.py`) and covered by
`tests/test_scraper.py`.

### No secret is committed

`.env` is gitignored and was gitignored in the first commit that created the repo.
Only `.env.example` is committed, with empty values. `OPENAI_API_KEY` and
`ADMIN_SECRET` come from the environment and appear in no file in this repository.

### No number reaches a user unverified

After generation, every currency amount, time of day, date and phone number in the
answer is checked against the text of the rows actually retrieved for that turn. A
figure that cannot be traced does not get a warning label — **the answer is
discarded** and replaced with a message pointing at the source and the phone
number. See `app/rag/grounding.py`.

Related: citation markers are validated against retrieved ids and stripped if
invented, and chart figures are checked against their source row before a chart
object exists.

### Nothing internal reaches a client

No stack trace, no filesystem path, no model name, no upstream provider message.
Every error is one envelope shape with a stable code and a message written for a
traveller. Full detail goes to the server log against the request id.

## Input handling

| Control | Where |
| --- | --- |
| Length cap (`MAX_MESSAGE_CHARS`, default 1000) | `app/safety.py` |
| Control characters, zero-width and bidi overrides stripped | `app/safety.py` |
| Long combining-mark runs collapsed (Zalgo payloads) | `app/safety.py` |
| Unicode NFKC normalisation before pattern matching | `app/safety.py` |
| Audio format whitelist, 20 MB and ~60 s caps | `app/voice/stt.py` |

### Prompt injection

Two halves, and the second is the one that holds.

**Pattern neutralising** replaces obvious instruction-override phrasings in user
input. It is deliberately *neutralising, not rejecting* — "should I ignore the sign
at the cargo gate?" is a reasonable question and refusing it would be a worse
failure. This half is defence in depth and will always trail whatever someone
tries next.

**Structural separation** is the real control. Retrieved rows, scraped pages and
PDFs are inserted into the prompt inside explicit `<<<SOURCE ...>>>` fences, and the
system prompt states that anything inside a fence is quoted data even if phrased as
a command. **Scraped web text is untrusted input**: anyone who can edit a web page
could otherwise write an instruction into it and have the model obey. See
`app/agent/prompts.py`.

## Abuse and cost

- **Rate limiting** per client on `/api/chat`, `/api/chat/stream`, `/api/stt` and
  `/api/tts`, from `RATE_LIMIT_PER_MINUTE`. Voice gets a stricter cap because it
  is billed per second and per character. Returns `429` with `Retry-After`.
- **The client IP is a key, never a record.** It is hashed with a random
  per-process salt, used as a dictionary key, and discarded. It is never logged,
  never persisted, never returned.
- **Output and loop caps.** `MAX_OUTPUT_TOKENS` bounds every answer;
  `AGENT_MAX_TOOL_CALLS` bounds the tool loop via middleware, and hitting it
  returns the no-answer message rather than a partial answer.
- **A daily spend estimate** accumulates token counts and warns past
  `DAILY_SPEND_WARN_USD`.

> ### The spend estimate is not the safety net
>
> It counts only what the application saw. It cannot stop spend from a bug that
> bypasses it, a second deployment, or a script run with the same key.
>
> **Set a hard monthly spending cap on the OpenAI account itself.** That is the
> actual control. The estimate is the early-warning light, not the fuse.

## The admin route

`GET /api/admin/stats` is **not registered at all** unless `ADMIN_SECRET` is set.
Absence is the default: a route that checks a secret it does not have is one
refactor away from checking nothing. With a secret set, it requires an
`X-Admin-Secret` header compared with `secrets.compare_digest`, and returns `404`
— not `401` — for a wrong or missing secret, so it does not confirm it exists.

This is a shared bearer token with no rotation and no audit trail. It is adequate
for an operator stats page and is not pretending to be more.

## Transport

The deployed frontend **must** be served over HTTPS. Browser microphone access
requires a secure context, so on plain HTTP the mic fails silently. CORS origins
come from `ALLOWED_ORIGINS`, and a wildcard with `ENV=prod` makes the application
**refuse to boot**.

## Known limitations, stated plainly

- **A false claim carrying a valid citation is not detected.** The backend
  verifies that a cited row exists and that every figure traces to it. It does not
  verify that a sentence *follows* from the row. Only the system prompt defends
  that, and no real model has been tested against it. See `docs/decisions.md` 0007.
- **Rate limits and conversation state are per process.** With multiple workers the
  effective limit is multiplied by the worker count. Fixing it means external
  storage keyed by client, which is the record we are deliberately not keeping.
- **The spend estimate resets on restart.**
- **Prompt-injection pattern matching is incomplete by nature.**
