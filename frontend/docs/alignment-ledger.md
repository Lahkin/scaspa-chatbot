# Alignment ledger

> **A note on provenance.** The prompt this was built against refers to "the
> alignment ledger from the project plan". **No such document exists in this
> repository** — there is no project plan committed anywhere, and I have not
> invented rows to match a document I cannot read.
>
> What follows is a ledger built from the two artefacts that _are_ authoritative
> for alignment: `docs/api-contract.md`, which is the agreement between the two
> halves, and `frontend/CLAUDE.md`, which is the standing rules. If the real plan
> has rows beyond these, they need adding — and this file is the right shape to
> add them to.

Walked row by row against a **locally running backend** on 2026-07-30, with the
index built. Re-walked on the same day against a real `OPENAI_API_KEY` and a real index — see "Standing limitation" at the foot. Automated rows are re-checkable with
`npm run check:integration` (91 assertions).

Legend: ✅ verified · ⚠️ deviation, documented · ⏭️ cannot verify here, and why.

---

## Transport and shapes

| #   | Row                                                          | Status | Evidence                                                                              |
| --- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------- |
| 1   | `POST /api/chat` returns the documented `ChatResponse` shape | ✅     | integration check, 8 top-level fields + 8 `meta` fields                               |
| 2   | `POST /api/chat/stream` is `text/event-stream`               | ✅     | `text/event-stream; charset=utf-8`                                                    |
| 3   | `X-Accel-Buffering: no` is set                               | ✅     | present                                                                               |
| 4   | `meta` is always the first event                             | ✅     | `meta, token, citations`                                                              |
| 5   | The stream always ends `done` or `error`                     | ✅     | ends `done`                                                                           |
| 6   | `citations` arrives after the last token                     | ✅     | `citations@2 > lastToken@1`                                                           |
| 7   | `GET /api/health` returns the documented shape               | ✅     | all 7 top-level, 4 model, 10 index fields                                             |
| 8   | Unknown index values are `null`, never `0`                   | ✅     | asserted                                                                              |
| 9   | Every non-2xx carries the error envelope                     | ✅     | 422 and 404 checked                                                                   |
| 10  | Both endpoints return identical content                      | ⚠️     | Same _shape_ verified. Identical _text_ not verified — see "What could not be proven" |

## Errors

| #   | Row                                                  | Status | Evidence                                                                                                                                    |
| --- | ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Whitespace-only message → 422 `VALIDATION_ERROR`     | ✅     | verified                                                                                                                                    |
| 12  | Over 1000 characters → 422 `VALIDATION_ERROR`        | ✅     | verified                                                                                                                                    |
| 13  | Unknown route → 404 with an envelope                 | ✅     | verified                                                                                                                                    |
| 14  | No stack trace, path or model name in any error body | ✅     | asserted across three failures                                                                                                              |
| 15  | Rate limit returns 429 with `Retry-After`            | ✅     | `retry-after: 45`                                                                                                                           |
| 15a | `Retry-After` is **readable by the browser**         | ✅     | Now in `Access-Control-Expose-Headers` with `X-TTS-Cache`. Asserted on the advertisement, not the read — Node cannot see the bug. #5 closed |
| 16  | The rate-limit **code** matches the contract         | ✅     | `RATE_LIMITED` is in the contract's table; `test_contract.py` pins the whole code set against it. #1 closed                                 |
| 17  | Validation happens before streaming starts           | ✅     | 422 with `application/json`, not an error event                                                                                             |

## Conversation

| #   | Row                                            | Status | Evidence                                                                                                                                                                                 |
| --- | ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | A known `conversation_id` is echoed back       | ✅     | verified                                                                                                                                                                                 |
| 19  | An unknown id does not error                   | ✅     | 200                                                                                                                                                                                      |
| 20  | A malformed id is replaced with a fresh one    | ✅     | `adopt_or_mint` mints unless the id is a well-formed UUID. An unknown-but-valid id is still adopted, deliberately — the store is per-worker, so membership cannot be the test. #4 closed |
| 21  | Only `conversation_id` is stored on the device | ✅     | asserted in tests; `sessionStorage` holds exactly one key in a browser run                                                                                                               |

## Citations and safety

| #   | Row                                                                                                       | Status | Evidence                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 22  | Every `[kb-xxx]` in the answer has a matching citation                                                    | ✅     | asserted against the live backend                                                                                      |
| 23  | A citation carries `kb_id`, `category`, `subcategory`, `source_url`, `source_type`, `as_of`, `confidence` | ✅     | verified                                                                                                               |
| 24  | A citation carries `volatility`                                                                           | ✅     | Sent, and `null` rather than guessed when a row has none. Frontend still defaults an absent value to `high`. #2 closed |
| 25  | A citation carries `label` and `snippet`                                                                  | ✅     | Sent. Snippet truncated only at whitespace, so a figure cannot be cut in half. #2 closed                               |
| 26  | `refusal_category` is available on both endpoints                                                         | ✅     | On `done` now, and both endpoints asserted to agree. #3 closed                                                         |
| 27  | An unmatched marker never reaches the user                                                                | ✅     | client-side reconciliation, mutation-tested                                                                            |

## Frontend standing rules (`CLAUDE.md`)

| #   | Row                                                | Status | Evidence                                                                      |
| --- | -------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| 28  | No WebSockets; SSE over POST                       | ✅     | `lib/stream.ts`                                                               |
| 29  | No `EventSource`                                   | ✅     | ESLint `no-restricted-syntax`                                                 |
| 30  | No `dangerouslySetInnerHTML`                       | ✅     | ESLint + a test                                                               |
| 31  | No message content in any browser storage          | ✅     | a test asserts `sessionStorage` holds only `conversation_id`                  |
| 32  | No citation rendered the backend did not vouch for | ✅     | mutation-tested                                                               |
| 33  | Every fetch in `lib/api.ts` or `lib/stream.ts`     | ✅     | ESLint `no-restricted-globals`                                                |
| 34  | Every response parsed through zod                  | ✅     | `parseOrThrow`, mutation-tested                                               |
| 35  | No link to `pay.scaspa.com`                        | ✅     | ESLint                                                                        |
| 36  | Keyboard reachable with a visible focus ring       | ✅     | a11y tests + the responsive check                                             |
| 37  | Numeric cells use tabular figures                  | ✅     | asserted in the built CSS                                                     |
| 38  | No Authorization header, no cookie                 | ✅     | asserted on a real request                                                    |
| 39  | Nothing sent to any third party                    | ✅     | tests assert no beacon, no cookie, no analytics host, no analytics dependency |

## Resilience

| #   | Row                                         | Status | Evidence                                                                    |
| --- | ------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 40  | Usable on Slow 3G                           | ✅     | first content 5.3s (`/`) and 6.2s (`/chat`), CLS 0.0000, no overflow        |
| 41  | 429 shows a countdown and blocks sending    | ✅     | tested at the composer and at the hook                                      |
| 42  | A 429 is never auto-retried                 | ✅     | mutation-tested                                                             |
| 43  | A double tap fires one request              | ✅     | mutation-tested — the disabled button alone fires two                       |
| 44  | A thrown render never leaves a white screen | ✅     | boundary per route, recovery resets the chat                                |
| 45  | Offline is detected and stated honestly     | ✅     | verified with mocks off, both `navigator.onLine` false and a rejected fetch |
| 46  | The stream falls back when it stalls        | ✅     | measured: recovered in 3.35s with the full answer                           |
| 47  | No horizontal overflow at 320–1440px        | ✅     | `npm run check:responsive`                                                  |

---

## What could not be proven here, and why

Stated rather than quietly ticked.

- **Row 10 — identical content from both endpoints.** Both were exercised against
  real generation and both return the documented shape, and the two now provably
  agree on `refusal_category` for the same question. They have **not** been
  compared token-for-token on the same generated answer: the model is
  non-deterministic across two separate calls even at temperature 0, so equality
  of text is not a property that can be asserted this way. What is asserted is
  that both funnel through one `finalise_answer`, which is where the promise
  actually lives.
- **Voice (`/api/stt`, `/api/tts`).** Still unverified end to end, and now for a
  different reason. A key is configured, but the OpenAI project behind it has no
  access to any speech model — `/api/tts` returns a clean 503 with the text path
  entirely unaffected, which is the designed behaviour and is itself worth having
  seen. The audio path and its sanitisation remain unexercised against a real
  provider. `/api/tts/preview` **is** verified: it needs no provider, and its
  output is correct including the phone-number expansion.
- ~~Real rate-limit copy in the UI.~~ **Now proven.** A browser run against the
  live backend tripped the real per-IP limiter: the Send button showed a
  countdown, ticked 30 → 28, stayed disabled, the composer stayed typable, and no
  code or status leaked. It also found #5 — the countdown was a guess, because
  `Retry-After` is not exposed cross-origin.
- **A physical device.** Slow 3G is Chromium's emulation and the touch behaviour
  was checked on an emulated iPhone 13. No real phone, and no real venue wifi.

## Standing limitation — lifted

**This no longer applies, and the change is large enough to record rather than
edit away.** For every prompt up to this one the position was: no
`OPENAI_API_KEY`, so every shape verified and no real model call ever made.

A key is now configured, the index has been rebuilt with real embeddings —
retrieval scored 0.0 against it until then, because the vectors had been written
by the test fake — and the assistant answers from the knowledge base end to end:
real embeddings, real agent, real tool calls, a grounded citation, and the
verification chain doing its job on real output.

Two things only that first real call could have found, both now fixed:

- The configured chat model is a reasoning model, and OpenAI refuses **function
  tools with reasoning** on `/v1/chat/completions`. Every request 500'd. No fake
  model could have surfaced this, because the fakes never talk to OpenAI.
- The request's `category` filter lost to the category the model passes itself,
  so an explicit filter silently did nothing. The unit test passed either way —
  the fake model sends no category, and the real one always does.

What remains unverified: **voice against a real provider**, and the deployed
build on a physical device over real venue wifi.
