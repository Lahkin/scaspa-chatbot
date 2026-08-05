# 08 — Blocked components and the do-not-build list

Screenshot: `26-out-of-scope.png` (plus the caution-tinted annotations on boards 10, 15, 18, 19, 20)

---

## Part 1 — Build these, but keep them behind the field each is waiting on

Seven components are designed and specified in full. **Implement them; do not enable them.** Each names the backend field that unblocks it. When the field lands, the component ships unchanged — no redesign, no follow-up ticket.

Render the blocked annotation in `--caution` during development so it is visible in review builds.

### 1 — Ungrounded-figure notice
**Waiting on:** `answer_replaced` on `ResponseMeta`
**Spec:** `03-chat.md` §3.9 card 5

The client can currently only detect a replaced figure by string-matching the message, which is fragile. Showing the note on every answer would be a lie; showing it on none hides the correction.

### 2 — Tool-cap vs low-confidence no-answer
**Waiting on:** a distinct `refusal_category` value, or a `hit_tool_limit` flag
**Spec:** `03-chat.md` §3.9 cards 3 and 4

These two arrive **byte-identical** today. Until they can be told apart, the UI cannot offer "try a simpler question" instead of "we don't have that" — and telling a user to simplify a question the product simply does not cover sends them round in circles.

### 3 — Unpriced tariff lines
**Waiting on:** `unpriced: list[str]` on `TariffQuote`
**Spec:** `05-operations.md` §5.11

`build_quote` computes unpriced codes and **discards them**, so a total can be quietly missing its largest component while looking clean. The standard "confirmed on invoice" disclaimer does not cover a figure that is wrong by a whole charge.

The label changes from "Total" to "Total so far" **only when the flag is present**. Do not infer the state by string-matching or by comparing line counts.

### 4 — `live` data source
**Waiting on:** the live feed itself; only `none` and `fixture` are implemented
**Spec:** `02-shell-and-navigation.md` §2.2, `05-operations.md` §5.2

`live` is in the type but unreachable. Design and build the state — the badge, the banner, the status card, the dismiss control that only this kind gets. **Expect fixture and unavailable in testing.**

### 5 — Four-series chart legend
**Waiting on:** nothing in the client; `make_chart` only builds 1 series
**Spec:** `04-structured-blocks.md` §4.2

The schema allows four. **The schema is the contract** — build the legend for four, with the full palette, and let it render one until the generator catches up.

### 6 — Enum values absent from every fixture
**Waiting on:** production data
**Spec:** `01-foundations.md` §1.2 Family B

- `FlightStatus.arrived`
- `VesselStatus.departed`
- `VesselStatus.unknown`

All three are real and will fire in production. Build them at full fidelity and include them in visual tests. **A chip that has never been rendered is a chip nobody has checked.**

### 7 — Email, extension and web contact rows
**Waiting on:** a published email address (open TODO). Extension: **never**.
**Spec:** `06-support-console-voice.md` §6.3

Draw the row types. None is populated. The published email is an open TODO; a staff extension directory will not be built at all, because a caller routed to the wrong security-gate extension is worse off than one who was never offered the number.

---

## Part 2 — Do not design or build these

Each has no backend behind it. Including any of them would promise something the product cannot deliver.

| Not built | Why |
|---|---|
| **Any sign-in, session, account or current-user affordance** | The backend has no accounts and never knows who is asking. `OperatorProfile` carries an always-true `is_demo` literal precisely so it cannot become a real identity later. |
| **An admin "rebuild index" button** — or any trigger, progress bar or job-status view for the offline scripts | Their only UI trace is `index.*` on the health screen. The version string is the whole feature. |
| **A per-endpoint spend breakdown** | Three categories exist: chat, embedding, voice. Legend rows are not links. |
| **A "questions remaining this minute" counter or quota meter** | `Decision.remaining` is computed and dropped. Only `Retry-After` survives, and only on a 429. |
| **Pagination on positions, gates or advisories** | They return everything with a total and accept no `limit` or `offset`. Use the ops list header — total count plus a client-side filter. |
| **A ticket status lookup** | `SC-4821` is for quoting on the telephone. There is no route to check it. No status tracker, no "check my ticket" field, no progress steps. |
| **Any UI promising conversational memory** | History is recorded but never fed back into the prompt, so follow-ups will not resolve pronouns. No "continue where we left off", no restored history after reload, no "clear this conversation" control. The greeting and empty copy are written so a user never forms the expectation. |
| **A softer 404** | No lock, no sign-in prompt, no "you may not have access", no redirect to a login page. One 404, byte for byte, for both the unauthenticated route and the mistyped URL. |

---

## Part 3 — Review checks tied to this chapter

- [ ] Grep for `remaining`, `quota`, `sign in`, `log in`, `account`, `session`, `my ticket`, `rebuild`, `continue where` — none should appear in shipped strings.
- [ ] `/admin/stats` unauthenticated and `/adnim` return byte-identical responses, including status code and headers that could differ.
- [ ] No `limit` or `offset` query parameter is ever sent to positions, gates or advisories.
- [ ] The chat history list has no affordance that implies a thread.
- [ ] The seven blocked components exist in the codebase, are covered by tests, and are gated on a named field — not commented out and not deleted.
