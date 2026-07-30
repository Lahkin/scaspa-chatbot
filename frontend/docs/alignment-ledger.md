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
index built and no `OPENAI_API_KEY` set. Automated rows are re-checkable with
`npm run check:integration` (64 assertions).

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

| #   | Row                                                  | Status | Evidence                                                                                                                                          |
| --- | ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Whitespace-only message → 422 `VALIDATION_ERROR`     | ✅     | verified                                                                                                                                          |
| 12  | Over 1000 characters → 422 `VALIDATION_ERROR`        | ✅     | verified                                                                                                                                          |
| 13  | Unknown route → 404 with an envelope                 | ✅     | verified                                                                                                                                          |
| 14  | No stack trace, path or model name in any error body | ✅     | asserted across three failures                                                                                                                    |
| 15  | Rate limit returns 429 with `Retry-After`            | ✅     | `retry-after: 45`                                                                                                                                 |
| 15a | `Retry-After` is **readable by the browser**         | ⚠️     | **No.** Not in `Access-Control-Expose-Headers`, so the countdown falls back to a guess. `backend-issues.md` #5 — invisible to server-side testing |
| 16  | The rate-limit **code** matches the contract         | ⚠️     | **Backend sends `RATE_LIMITED`; the contract documents only `UPSTREAM_RATE_LIMITED`.** See `backend-issues.md` #1                                 |
| 17  | Validation happens before streaming starts           | ✅     | 422 with `application/json`, not an error event                                                                                                   |

## Conversation

| #   | Row                                            | Status | Evidence                                                                                                  |
| --- | ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| 18  | A known `conversation_id` is echoed back       | ✅     | verified                                                                                                  |
| 19  | An unknown id does not error                   | ✅     | 200                                                                                                       |
| 20  | An expired id is replaced with a fresh one     | ⚠️     | **It is adopted, not replaced** — `payload.conversation_id or store.new_id()`. See `backend-issues.md` #4 |
| 21  | Only `conversation_id` is stored on the device | ✅     | asserted in tests; `sessionStorage` holds exactly one key in a browser run                                |

## Citations and safety

| #   | Row                                                                                                       | Status | Evidence                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| 22  | Every `[kb-xxx]` in the answer has a matching citation                                                    | ✅     | asserted against the live backend                                                        |
| 23  | A citation carries `kb_id`, `category`, `subcategory`, `source_url`, `source_type`, `as_of`, `confidence` | ✅     | verified                                                                                 |
| 24  | A citation carries `volatility`                                                                           | ⚠️     | **Absent.** Frontend defaults to `high`. `backend-issues.md` #2                          |
| 25  | A citation carries `label` and `snippet`                                                                  | ⚠️     | **Absent.** Label derived from category+subcategory; snippet omitted, never invented. #2 |
| 26  | `refusal_category` is available on both endpoints                                                         | ⚠️     | **Missing from the stream's `done`.** `backend-issues.md` #3                             |
| 27  | An unmatched marker never reaches the user                                                                | ✅     | client-side reconciliation, mutation-tested                                              |

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

- **Row 10 — identical content from both endpoints.** Both were exercised and both
  return the documented shape, but with no `OPENAI_API_KEY` the backend
  short-circuits to a no-answer refusal, so the two were compared on identical
  _refusals_, not on identical generated answers. The contract's central promise
  is unverified against real generation.
- **Voice (`/api/stt`, `/api/tts`).** `/api/stt` correctly rejects an empty upload
  with a 422. `/api/tts` returns 500 without an API key, so the audio path and its
  sanitisation are unverified end to end.
- ~~Real rate-limit copy in the UI.~~ **Now proven.** A browser run against the
  live backend tripped the real per-IP limiter: the Send button showed a
  countdown, ticked 30 → 28, stayed disabled, the composer stayed typable, and no
  code or status leaked. It also found #5 — the countdown was a guess, because
  `Retry-After` is not exposed cross-origin.
- **A physical device.** Slow 3G is Chromium's emulation and the touch behaviour
  was checked on an emulated iPhone 13. No real phone, and no real venue wifi.

## Standing limitation

There is still **no `OPENAI_API_KEY`**. Every shape in this ledger is verified;
no real model call has been made by any prompt in this project. That has been the
position since the backend was built and it has not changed.
