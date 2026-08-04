# Found during build

Things noticed while implementing a milestone that are **out of that milestone's
scope**. Recorded rather than fixed, so the next session inherits the evidence
instead of the surprise.

Every entry carries `file:line` or a reproducible command. Nothing here has been
acted on.

---

## From M1 (T-02, T-01 + T-01a + T-01b, T-03, T-04)

### 1. SCASPA publishes no fixed ferry timetable — client conversation item

`kb-192` is `confirmed` and answers *"What time does the ferry to Nevis leave?"*
with:

> Ferry departure times vary by operator and by day, so SCASPA publishes them
> through a live vessel schedule rather than a fixed timetable.

`kb-182` is the same shape for fares: SCASPA operates the terminal but does not
set them.

**This is a gap in SCASPA's own published information, not a defect in ours.**
The assistant's honest answer to the single most likely demo question is "that is
not published, ask the operator". Worth raising with them directly — it is the
kind of gap only they can close.

The landing page headline is *"Will you make the last ferry?"*
(`frontend/src/routes/index.tsx:58`), which now sits above an assistant that
cannot say. **Folding the re-caption into T-18 at M5**, which already touches
that file — per the decision at the M1 kick-off.

### 2. `kb-143` makes eval case 15 a refusal-policy question

`evals/stress_test_sample.csv` case 15 — *"What is the radio frequency for
berthing at the Deep Water Harbour?"* — expects `escalate` with a blank
`expected_kb_id`. That was right when the corpus was a 12-row fixture.

The delivered corpus has **`kb-143` "What VHF channels does the port use?",
`confirmed`**. So the KB now holds the answer, and whether the assistant should
give it or route the caller to Port Control is a **safety-policy decision**, not
a re-key. Left exactly as it was.

### 3. Two confirmed rows carry named individuals' work email addresses

`kb-214` → `calvin.duggins@scaspa.com` (Chief Operations Officer)
`kb-221` → `ludel.harvey@scaspa.com` (marine and passenger operations)

Both are `confirmed` and both are now indexed and quotable. Presumably public on
scaspa.com, but "published on a website" and "repeated by an assistant to anyone
who asks" are different exposures. A client question, and one `docs/privacy.md`
may want an opinion on.

### 4. The published email address exists after all — F-31 partially closes

`docs/data-audit.md` F-31 records the public email as an open TODO, and
`frontend/src/lib/scaspa-facts.ts:65` holds `SCASPA_EMAIL = null` because the
website obfuscates it.

**`kb-005` and `kb-013` both give `info@scaspa.com`**, confirmed, sourced. The
constant can be populated whenever someone wants the contact row back — one line,
and `AboutScaspa` already renders the row when it is non-null.

### 5. `npm run format:check` is red, and was before M1

39 files fail Prettier. **None is a file M1 touched** — verified with
`npx prettier --check src/lib/types.ts src/features/chat/suggestions.ts`, which
passes. The list includes `src/components/ops/*`, `src/routes/*` and eight test
files from the board 17–22 work.

This gate **is in CI** (`.github/workflows/frontend.yml`, "Format check"), so
frontend CI is currently failing independently of this milestone.
`IMPLEMENTATION_PROGRESS.md` §8 never claimed it — its green list is build,
typecheck, lint and tests.

Fix is `npx prettier --write .`, deliberately not run here: 39 files of
whitespace churn would have buried the M1 diff.

### 6. The payment portal survives in prose on two rows

T-01b removes the *link* — `source_url` is blanked on all five portal rows, and a
live request for "Can I pay SCASPA fees online?" now returns `kb-225` with
`source_url: ""`. Verified end to end.

**`kb-075` and `kb-225` still mention `pay.scaspa.com` in their answer text.**
Bare hostnames with no scheme and no `www.`, so `remark-gfm` will not autolink
them and nothing renders as an anchor — but the assistant will still *say* the
host aloud when asked about paying.

Left deliberately, per the M1 decision: whether the assistant should route
someone to a payment portal is SCASPA's policy call, not a side effect of a CSV
field. If the answer is no, the same `redact_blocked_links` hook is the place —
`backend/app/rag/ingest.py`.

### 7. Four rows are rejected by the loader, and the rejection is correct

```
line 46 (kb-045): source_type: Input should be 'official-site', 'official-pdf', …
line 73 (kb-072): …
line 74 (kb-073): …
line 81 (kb-080): …
```

All four use `source_type: reference` or `directory`, and their sources are
**Wikipedia** and **findyello.com** — third-party, not SCASPA. The `SourceType`
enum (`backend/app/rag/models.py:37`) rightly refuses them, and CLAUDE.md's whole
premise is "verified SCASPA information".

Only one, `kb-045` ("What is the airport code for St. Kitts?"), is `confirmed`,
so exactly one confirmed row is lost. **A question for the researchers**: source
that fact from an official page, or accept the loss.

### 8. The plan's `kb_rows_indexed == 116` gate was arithmetically wrong

I derived 116 in `docs/implementation-plan.md` from a naive `csv.DictReader`
count of `confidence == confirmed`, which does not apply the loader's validation.
The correct figure is **115** — 116 minus `kb-045` from item 7.

The gate was run against 115 and passes. The plan's stated figure is wrong and
should be corrected if that document is revised.

### 9. "When is the cargo gate open?" has no answer in the corpus

Eval case 4 was re-keyed to `kb-016` (SCASPA's opening hours) as the nearest
confirmed row, and it **fails retrieval**: the classifier sends the question to
`cargo` on the word "cargo", so `kb-016` — which is `general` — is filtered out,
and five cargo rows come back instead.

Both halves are behaving correctly. **There is no confirmed cargo-gate-hours row
in the corpus**, which is the real finding. Either the researchers add one, or
this case should expect a no-answer.

### 10. Eval false-accept: one live-operations question is answered, not escalated

`REFUSALS false accept 20%` in the M1 baseline is a single case — number 13,
*"Is the ferry to Nevis running right now?"* It expects `escalate`; the pipeline
retrieved `kb-192` at rank 1 and answered from it.

`app/agent/prompts.py` rule 10 is explicit that the assistant "cannot see live
operations" and must say so. Retrieving the schedule row and answering is
arguably compliant — `kb-192` itself says times are not published — but the
harness counts it as a false accept, and a live-status question resolving to an
answer is worth a look before the demo. **Prompt behaviour, not M1's scope.**

### 11. `IndexStatus.kb_rows` is a chunk count wearing a row label

`backend/app/rag/ingest.py` sets `kb_rows_indexed=len(documents)`, and
`documents` comes from `chunk_kb_rows`. Today that is one-for-one
(`chunking.py:96` — "`len(output) == len(input)`, always"), so the two numbers
coincide and nothing is visibly wrong.

They stop coinciding the moment anything splits a row. Relevant to
`docs/data-audit.md` **F-37**, which blocks §6.12's "Chunks" row on a field that
does not exist — and the field it is waiting for is arguably this one, correctly
named.
