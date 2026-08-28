# Found during build

Things noticed while implementing a milestone that are **out of that milestone's
scope**. Recorded rather than fixed, so the next session inherits the evidence
instead of the surprise.

Every entry carries `file:line` or a reproducible command.

---

## Day-of talking points

Answers to have ready, so a scoping decision is not mistaken for a gap.

### "What about Nevis? Vance W. Amory, Charlestown?"

> We scoped the demonstration to the four St. Kitts facilities — Deep Water
> Harbour, Port Zante, the Basseterre Ferry Terminal and R. L. Bradshaw. Vance
> W. Amory and Charlestown Port extend the `Facility` enum in one line and the
> filters need no change; we left them out to keep the demo's data set to sites
> we could populate properly.

**Deliberate, not an oversight.** Both appear in the design's own §6.2 location
list, and both are absent from `backend/app/schemas.py`'s `Facility`. Adding
them is a one-line enum change plus fixture rows — the filters, the query
parameters and the client types all key off the enum and follow automatically.

### "Is the data real?"

No, and it is built so it cannot be mistaken for real — see `docs/decisions.md` 0032. Berths, gates, times and statuses are realistic because the screens have
to behave correctly; **every vessel name, IMO, carrier code and money amount is
synthetic**, the source notice is enforced by the schema rather than by
convention, and the service refuses to boot with this data when `ENV=prod`.

### "Can it show US dollars?"

> The tariffs are published in XCD, and that is what the schedule shows. The USD
> peg is already in our knowledge base as a confirmed, cited fact — USD 1.00 to
> XCD 2.70 — so showing dollars is a display change rather than a data question.
> We left it out deliberately: the schedule you are looking at shows exactly what
> SCASPA publishes, unconverted.

**A scoping decision, and the analysis exists** — see entry 20 below for the
contract shape, the sourcing and the design deviation it would need.

---

## From the operations pages (Watchtower, Vessels, Airport, Cargo)

Findings from building `/vessels`, `/flights` and `/cargo` against the real
SCASPA site and the real knowledge base.

### 1. SCASPA's cargo FAQ points at a table the page does not contain

`scaspa.com/cargo.html`, inspected in a browser for the `/cargo` build (a second
look after the one recorded in `decisions.md` 0039, which reached the same
conclusion from the served HTML).

The page's own FAQ asks **"How do I Check my Cargo Status"** and answers:

> If you know the agent or name of the vessel, you can conduct a search in the
> search field located at the top right of the Cargo Info table.

**There is no Cargo Info table on that page.** Measured in the live DOM: five
`<table>` elements, every one a Weebly `wsite-multicol-table` layout block with
no `<th>` and no data rows; zero `<input>`, `<select>` or `<textarea>`; no
`<iframe>`; no embedded JSON; 1,156 characters of body text in total. The only
XHR calls are the site platform's own `CustomerAccounts` and `Membership` RPCs.

Its second FAQ question, **"Is the information updated regularly"**, has no
answer at all — the field is empty.

So a shipping agent following the Authority's own published instructions reaches
a dead end. **A question for the client**: was the Cargo Info table removed, is
it behind a login, or was it never deployed? Pilot's `/cargo` page says plainly
that cargo status is not published online and routes the reader to the
telephone, which is the honest thing to do in the meantime — but it is the
Authority's own page that is currently misleading, and only SCASPA can fix that.

**Re-verified 2026-08-28 in a browser: unchanged, and still a live dead end.**
`scaspa.com/cargo.html` serves five `<table>` elements, all of them Weebly
`wsite-multicol-table` layout blocks — none with a `<th>`, only one with more
than a single row — plus zero `<input>`, `<select>` and `<textarea>`, no
`<iframe>`, and 1,138 characters of body text. The FAQ still names a "Cargo Info
table" and a "search field located at the top right" of it, and its "Is the
information updated regularly" answer is still empty.

**This one cannot be answered from here, and is not ours to answer.** The three
possibilities carry different fixes and only SCASPA knows which applies: if the
table was removed, the FAQ text should go with it; if it is behind a login, the
FAQ should say so and link the login; if it was never deployed, the FAQ is
describing an intention. Pilot's `/cargo` page already states that cargo status
is not published online and routes the reader to the telephone, so the product
is honest either way — but a shipping agent following the Authority's own
instructions is still sent to a table that is not there.


### 2. The public email address is readable on the site after all

`frontend/src/lib/scaspa-facts.ts` carries a **PENDING CLIENT ITEM** saying the
email "cannot be read off the site" because scaspa.com obfuscates it against
scrapers, and `SCASPA_EMAIL` is `null` so that `AboutScaspa` omits the row
rather than inventing a plausible `info@` that might bounce. That reasoning was
right when it was written.

It is now readable. The cargo page's footer renders **`info@scaspa.com`** in
plain text once Cloudflare's `email-decode.min.js` has run — which is to say,
for any ordinary visitor with JavaScript on.

The blocker was "we cannot verify it without guessing", and that no longer
holds: it is on the page, in the footer, on the Authority's own site. Setting
`SCASPA_EMAIL` is a one-line change and nothing else has to move.

**Resolved — the address is `info@scaspa.com`, and it is now set.**

Re-verified 2026-08-28, and more strongly than the original finding: rather than
reading one rendered page, every `data-cfemail` attribute on the site was
decoded. The homepage, `/contact.html` (twice), `/airport-about.html` and
`/cargo.html` all decode to that one string, and **the site carries no other
email address anywhere**. `/contact.html` lists it under "Contact Information"
beside the switchboard lines, and the footer labels it "email:", so it is the
general enquiries route rather than a department's.

The obfuscation is confirmed as the cause of the original blocker: the served
HTML contains a `data-cfemail` attribute, `email-decode.min.js`, and zero plain
occurrences of the address. Fetching the page never revealed it; a browser with
JavaScript on always did. The caution was right when written and is now spent.

Two things moved that the entry did not predict:

- **There were two `SCASPA_EMAIL` constants, not one.** The second, in
  `features/chat/contact.ts`, had no importers and a comment claiming its slot
  was "rendered and visibly marked as pending" — describing a screen that never
  existed and contradicting `AboutScaspa`, which omits the row. The dead copy is
  removed; `lib/scaspa-facts.ts` is the single source, guarded by
  `tests/scaspa-facts.test.ts`.
- **An existing test broke, correctly.** `getByRole('link', { name: /scaspa\.com/ })`
  was unambiguous only while the email row did not exist; `info@scaspa.com`
  matched it too and `getByRole` throws on two matches. The query is anchored to
  `/^scaspa\.com/` now.

The constant stays typed `string | null` and the row stays conditional, so
withdrawing the address if SCASPA asks is one line and the row disappears rather
than rendering `mailto:null`.


**Not done here**, because it touches the Support and About screens rather than
cargo, and because the researchers may prefer to confirm the address is
monitored before the product starts sending people to it — which was the
original worry, and is a different question from whether it can be read.

---

## From M5

### 28. Answer register — **THE FIRST POST-DEMO ITEM. Do not touch it before the demo.**

The factual answers read closer to _"you may only ask these"_ than to an
assistant. That is a real observation and worth fixing. It should not be fixed
two days out, and the reasoning is worth keeping because it will come up again.

**What it would involve.** The register lives in `app/agent/prompts.py`'s system
prompt, and the prompt is load-bearing for three things that have nothing to do
with tone:

| Rule                                 | What it holds up                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| cite every factual claim             | `verify_citations` strips uncited markers, but nothing makes the model cite in the first place — the prompt does |
| rule 4, never convert a currency     | the `_only_xcd` validator guards the calculator; assistant prose is guarded by the prompt alone                  |
| rule 10, verbatim money and time     | `find_unverified_figures` catches violations _after_ generation; the prompt is what prevents them                |
| the escalation and no-answer wording | shared with the deterministic gates, so a reworded prompt can leave two voices in one product                    |

So it is not one edit. It is an edit, plus a re-run of the eval set, plus a read
of every canned message for consistency of voice, plus a judgement about whether
the softer wording has loosened rule 10 in a way no test can see.

**What the eval set would and would not catch.** It is **15 cases**
(`evals/stress_test_sample.csv`): 10 `answer`, 3 `escalate`, 1 `refuse`, 1
`correct_premise`. Baseline `m1-corrected-baseline`, hit@1 **73%**, hallucinated
citations **0**.

- **Would catch:** a prompt that stops the model citing, that answers something
  it should escalate (4 of 15 cases are behavioural), or that drops an expected
  fact. Those are exactly the failures that matter most, and that is genuinely
  reassuring.
- **Would not catch:** the register itself. `score_facts` is substring matching
  on `expected_facts` — a warmer prompt still containing "ferry operators" and
  still citing `kb-182` scores identically. **There is no tone metric, and 15
  cases is a thin net for a change that touches every answer.** A regression in
  voice, or a subtle loosening that only shows on the 16th question, passes.

**One correction to the precedent, because it changes the argument slightly.**
The fabricated ferry citation was **not** a prompt regression. It was a
hardcoded string in `routes/index.tsx`, written against the sample fixtures and
never rechecked when the real corpus landed (entry 24) — the prompt was never
involved, and no amount of prompt discipline would have prevented it.

The conclusion is unchanged, and arguably stronger: that defect showed that the
things guarding factual claims are **narrower than they look**, and survived
every gate for weeks. Widening the register is precisely the kind of change whose
failure mode is invisible to the gates that exist. Two days out, with a rehearsed
and frozen build, the asymmetry is stark — the upside is that answers read more
warmly, and the downside is a citation defect on stage.

**Do it post-demo, with a bigger eval set first.** The right order is: grow the
15 cases toward 40 with explicit register expectations, establish a baseline,
then change the prompt — not the reverse.

### 26. The backend was serving the 10-row sample KB, and health called it `ok`

Found at the start of the T-23 rehearsal, and it would have been found on stage
otherwise. `/api/health` reported:

```
status: ok    ready: true
kb_csv_filename: sample_kb.csv    kb_rows: 10    kb_version: 2026-06-01
```

**The configuration was correct.** `KB_CSV_PATH` resolves to
`data/knowledge/scaspa_kb_2026-07-31.csv` and the file exists — the blank
`KB_CSV_PATH=` in `.env` falls through to M1's default as intended. What was
stale was the **persisted Chroma index** in `data/chroma`, built from the sample
corpus in an earlier session and _loaded_ rather than rebuilt. Health reports the
metadata stored with the index, so it described the stale build accurately and
still said `ok`.

Rebuilt with `scripts/build_index.py` — 115 indexed, 4 rejected, matching M1.

**This is the third stale-state defect this project has hit** — a stale uvicorn
holding `:8000` with old config, a stale vite serving an old module graph, and
now a stale index. All three present as a configuration bug and are not one.
`demo-day.md` §8 now says to check `kb_csv_filename` on `/api/health` before
presenting.

Worth considering post-demo: health could compare the indexed filename against
`settings.kb_csv_path.name` and degrade when they disagree. The information to
catch this is already in the response; nothing compares the two.

**It happened again, later in the same session, and the cause was not found.**
The index was rebuilt to 115 rows at 12:03 and verified; by 12:52 `index_meta.json`
had been rewritten from `sample_kb.csv` again, with a fresh Chroma collection at
the same minute. What was ruled out, empirically rather than by reading:

```
build_index.py  → 115 rows        # rebuilt, confirmed
uv run pytest   → still 115 rows  # conftest.py:82 isolates CHROMA_DIR to tmp_path
```

Twelve test modules call `build_kb_index`, which made the suite the obvious
suspect, and it is not the culprit. Nothing else in the session touched the
backend between those times. **Recorded as unreproduced rather than explained** —
the same discipline as the playwright disappearance, and for the same reason: a
guessed cause is worse than a known gap, because it stops the next person
looking.

What follows from that is not a fix but a habit: the check is now the **first
line** of `scripts/preflight-frontend.md` and the first thing in `demo-day.md`
§8, and the corpus filename is on screen at `/ops/vessels`. A defect that cannot
be prevented can at least be made impossible to miss.

### 27. Wiring the facility filter surfaced a dead end in every filtered table

Adding the control (M5) made an existing hazard reachable. **The toolbar lives
inside `OpsTable`**, so when no row matches, `FilteredOutState` replaces the
table and takes every control with it — and its `onClear` reset only the search
box. A facility matching no row therefore stranded the reader on an empty screen
whose only remedy was a page reload.

`/flights` reaches it in two clicks: every flight is at R. L. Bradshaw, so any
other facility empties the table.

Fixed on both routes — the panel now lists the facility as a removable filter and
`onClear` resets it. Worth noting the shape for future filters: **any control
that can empty the table must appear in that panel**, because the panel is the
only thing on screen once it does. `/vessels` already did this for status, which
is why the gap was invisible until a second filter arrived.

### 25. There was no facility filter in the interface — **CLOSED**

`GET /api/vessels?facility=` and `/api/flights?facility=` both filter correctly —
that was T-06 and M4a, and it was verified at the API. **No control reaches it.**

- `features/ops/queries.ts` contains **no reference to `facility`**;
- neither do `routes/vessels.tsx`, `routes/flights.tsx` or anything in
  `components/ops/`.

`/vessels` offers "Filter by status" and a density toggle; `/flights` offers
Direction and density. Both have search. Neither has facility.

So the field is reachable by curl and by nothing else. It is not WIRED-EMPTY in
the audit's sense — it is **not wired at all**, which the audit's own category
would have missed the same way F-23 did (entry 18).

**Wired in M5** after sizing it at well under an hour — the pieces were all in
place. `Facility` already existed as a client type and was already on every row
type; `queryString(params)` serialises whatever it is given, so the API side was
two lines; and the MSW handlers had filtered on `facility` since M4c, because
`applyEquals` was written generically. What was missing was a `<select>` and the
parameter, on two screens.

The options live in `features/ops/facilities.ts`, shared rather than declared per
route — two copies would drift the moment a fifth facility is added, which is the
defect T-16 merged away one component over.

Verified against the fixture distribution rather than asserted: `/vessels` Deep
Water Harbour 5, Port Zante 3, Basseterre Ferry Terminal 2, All 11; `/flights`
R. L. Bradshaw 7, Port Zante 0. `'all'` sends **no parameter** rather than
`facility=all`, which would match no row and empty the table on the option named
"All facilities" — tested in both directions.

It also surfaced entry 27, which is the more useful finding of the two.

### 24 (continued below). Also worth noting from the same pass

`No source recorded` renders on **all 30 tariff rows** and on every calculator
line item. That is F-22 behaving correctly — the `kb_id` mapping is blocked on
SCASPA — but it is the most repeated string on the tariffs screen and it will be
read as a defect unless it is named first. `demo-day.md` §2 says the data line
before the screen is shown.

### 23. Telephone format — **POST-DEMO**, and it is a different task than it looked

`design/README.md:303`: _"Telephone numbers render `869 465 8121` in UI and
`+1 869 465 8121` in contact cards."_ The product renders `869-465-8121` in most
places and the spaced form in five files, so it is written two ways today.

Scoped as 43 frontend call sites. **It is 78, and it crosses into the backend:**

|                                                                                  | sites |
| -------------------------------------------------------------------------------- | ----- |
| Frontend `src/` display strings (excluding `tel:+1869` hrefs, which are correct) | 29    |
| Frontend tests                                                                   | 19    |
| Backend `app/`                                                                   | 10    |
| Backend `tests/`                                                                 | 20    |

**A frontend-only sweep makes it worse, not better.** `app/agent/prompts.py:20`
`SCASPA_PHONE`, `app/routers/support.py:56` and `app/ops/fixtures.py:673` are
assistant and API copy that the client only renders. Change one half and the
number appears on one screen in two formats.
`design/IMPLEMENTATION_PROGRESS.md:716` called this in advance — _"a product-wide
decision, not a board-17 edit, and fixing it on this board alone would leave the
number written two ways."_

Two things checked that make the eventual sweep safer than it looks:

- **Voice is unaffected.** `app/voice/tts.py`'s `_SCASPA_MULTI` and `_PHONE` are
  both `[-.\s]` — they already accept a space. No regex needs touching, and
  `test_voice.py`'s guard against "eight hundred sixty-nine million" still holds.
- **The knowledge base is already spaced.** All 232 rows use `1 869 465 8121`;
  **zero** are hyphenated. The code is the outlier, not the corpus. Note that
  `app/rag/hybrid.py:41` justifies its tokeniser by saying `869-465-8121` "must
  survive as single tokens" — a form its own corpus does not contain, and
  `_TOKEN` splits the spaced form into three tokens regardless.

**Dropped for the demonstration deliberately.** It is cosmetic, nobody in the
room will notice two phone formats, and a 78-site sweep touching the system
prompt on the last working day risks a regression in the assistant — which
everybody would notice.

### 24. How did a fabricated citation reach the landing page? — **POST-DEMO**

Fixed in T-18; the question of how it got there is not answered, and that is the
part worth an hour.

`routes/index.tsx` rendered _"the last placeholder sailing back from Nevis on a
weekday is 18:00"_ under a source line reading _"Ferry — schedule · Official
SCASPA website · Verified on 2026-04-01"_. **That row does not exist.** The
corpus holds no ferry departure time at all, and `kb-192` — the row that does
answer the question — is annotated _"ROUTING ROW … Never state a sailing time."_

That is **CLAUDE.md absolute rule 4** — never a citation the backend has not
verified against a retrieved row — broken on the first screen a visitor sees. It
is also rule 5: invented knowledge-base content that a reader could mistake for a
real SCASPA fact.

Two questions to answer, neither of which the fix answers:

1. **How did it get there?** The likeliest account is that it predates the real
   232-row corpus: `kb-008` and `2026-04-01` are the _sample_ knowledge base's
   ids and dates, still used throughout `src/mocks/` and `src/dev/`. The landing
   page appears to have been written against those fixtures and never rechecked
   when the real KB landed in M1. If that is right, **the reindex invalidated
   more than the `SMP-*` tariff codes**, and only the tariff codes were chased.
2. **What else predates the reindex with no test?** The landing page had no test
   at all, which is why every gate stayed green over a fabricated citation. The
   sweep to run: every hardcoded citation-shaped string in `src/` — a `kb-0NN`
   id, an `as_of` date, a source label — checked against the real corpus.

Related and already known: the same invented `18:00` and `kb-008` live in
`src/dev/rehearsedConversation.ts`, which is **the fallback shown to the client
if the network fails**, and in `src/mocks/`. Those are marked "placeholder" and
sit behind `import.meta.env.DEV`, so they are a lesser problem than the landing
page was — but they are the same defect, from the same source, and they are shown
to the client at the worst possible moment.

## From the pre-M5 pass

### 20. Currency — **POST-DEMO**, analysis complete so it need not be redone

Investigated before M5 and deliberately not built. Recorded in full because when
SCASPA asks for it, the work should start from this rather than from scratch.

**What is citable.** Exactly one rate, and it is a `confirmed` knowledge-base row
like any other claim in the product:

- `kb-009` — "The official currency is the Eastern Caribbean Dollar (XCD). US
  Dollars are widely accepted across terminals and services in St. Kitts."
- `kb-010` (`as_of` 2026-07-31) — "The Eastern Caribbean Dollar is pegged to the
  US Dollar at a fixed rate of USD 1.00 to XCD 2.70. Retailers and exchange
  bureaux may apply their own slightly different rates."

`kb-010`'s **second sentence is the caveat the UI must carry** next to any
converted figure. SCASPA hedging their own peg is better copy than anything we
would write, and it is already cited.

**Which currencies.** One: USD. XCD is the currency of all eight ECCU members, so
there is nothing to convert for the rest of the Eastern Caribbean. Everything
else splits into _real peg, uncitable_ (BBD, BSD, BZD, KYD, AWG — no KB row) and
_floating, needs an FX feed we do not have_ (TTD, JMD, DOP, GYD, HTG). We show
none of them, and say so.

**Why it is not a frontend constant.** `src/lib/scaspa-facts.ts:10-14` forbids
"fees, fares, tariffs, charges, **rates**" in client constants, without
exception. An FX rate is a rate. So `2.70` cannot be hardcoded in the client — it
has to arrive over the wire carrying its `kb_id` and `as_of`, like every other
figure in the product. That is what makes this a contract change rather than a
display tweak, and it is what took the estimate from one session to roughly two:

|                                                                                                                                                       | sessions |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `FxRate` model + field on `TariffTableResponse` (and `TariffQuote` if the total converts)                                                             | 0.2      |
| Backend constant sourced to `kb-010`, **plus a test asserting it still matches the KB row** — otherwise the peg silently drifts from its own citation | 0.3      |
| TS types, zod, MSW mirror                                                                                                                             | 0.2      |
| The control, plus converted display across 30 rows                                                                                                    | 0.4      |
| Quote total                                                                                                                                           | 0.2      |
| Provenance line + `kb-010`'s caveat                                                                                                                   | 0.2      |
| Decision record for the deviation below                                                                                                               | 0.2      |
| Tests: primary never converted, control never changes the request, caveat always present                                                              | 0.4      |

**≈ 2.1 sessions**; table-only, leaving the quote in XCD, gets it to ~1.5.

**The deviation that needs a decision record.** `design/` §5.10 is explicit —
_"Currency is a fixed label, **not a select** — the schedule is published in XCD
only"_ — and `TariffCalculators.tsx:366-380` implements exactly that, with the
reasoning in a comment. A subordinate `≈ USD` line is arguably outside that rule.
**A labelled XCD/USD control is visually the thing §5.10 forbids**, on the screen
showing SCASPA's fee schedule. That is the finding that decided this: it is
defensible, but only with a recorded deviation and copy that makes display-only
unmistakable — SCASPA invoices in XCD.

Existing guards that would need updating rather than deleting:
`backend/tests/test_operations.py:644 test_currency_conversion_is_refused`,
`frontend/tests/operations.test.tsx:1333` ("states the currency rather than
offering to change it"), and `backend/app/schemas.py:790` `_only_xcd`.

### 21. `/dev/rehearsal` does not exist in a production build — the documented fallback

`scripts/preflight-frontend.md` step 7 and its failure table both send the
presenter to `/dev/rehearsal` as the last resort: _"Anything unrecoverable →
`/dev/rehearsal`, and the sentence from step 7."_

It is dev-only, twice over:

- `src/routes/dev.rehearsal.tsx:14` — `import.meta.env.DEV ? lazy(...) : null`,
  a build-time literal, so **the production build emits no chunk for it**;
- `src/routes/dev.rehearsal.tsx:27` — `beforeLoad` throws `notFound()` when
  `!config.isDev`.

Both are correct decisions on their own terms — a recorded fake conversation
should not ship to a production origin. The defect is the **contradiction with
the runbook**, which tells the presenter to open the deployed URL (step 1) and
then to reach a route that 404s there.

It works if the demo is presented from `npm run dev`. It does not if presented
from a deployed production build, and the preflight does not say which is
assumed. **Settle which one the demo runs on, then fix whichever side is wrong.**

### 22. `scaspa-facts.ts` claims a test enforces the no-rates rule; the test does not exist

`src/lib/scaspa-facts.ts` documents that `tests/scaspa-facts.test.ts` "fails on a
currency symbol, a clock time or a bare figure". **There is no such file.** The
rule that would catch a hardcoded rate is documented and unenforced.

The pass came back clean, which is why this is a small job rather than a
discovery: in production source (excluding `src/mocks/`, `src/dev/`, tests) there
are **zero** hardcoded clock times and **zero** hardcoded money amounts. Every
currency hit is a doc comment, a type literal (`currency?: 'XCD'`), a column
regex, or the `XCD` label §5.10 requires.

## From M4c

### 19. `CLAUDE.md` has silently reverted twice — do not restore a third time blind

Twice now, uncommitted edits to `CLAUDE.md` have disappeared from the working
tree between sessions:

| When       | What was lost                                                                                                                     | Recovered from                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Before M1  | Absolute rule 3 (pay.scaspa.com)                                                                                                  | Restored by the owner            |
| Before M4c | **All four changes in `86ae726`** — rule 5's 0032 deferral, rule 9's logging rule, the commit-scope wording, rule 11's formatting | `git checkout HEAD -- CLAUDE.md` |

The second is the instructive one. `86ae726` **did land** — `git show 86ae726 --
CLAUDE.md` shows the diff going in — and the working tree later held the
pre-commit text for all four hunks. HEAD was never wrong; the file on disk was.

**Both times the loss was invisible until something depended on it.** Rule 5's
reversion surfaced only because M4b was actively writing realistic fixture
values against it, and rule 9's blanking surfaced only because a commit was
about to sweep it in.

**If it happens again, diagnose before restoring.** A fourth silent revert during
a milestone that depends on the reverted rule would be worse than the drift:

```bash
git log --all --oneline -- CLAUDE.md      # every commit that has touched it
git reflog                                 # whether a checkout/reset moved it
git fsck --lost-found                      # dangling objects, if a commit vanished
```

…and check the editor's local history. **Something is writing that file**, and
restoring a third time without knowing what would be treating the symptom.

---

## From M4b

### 18. Audit correction — F-23 checked the chips' wiring and never their values

`docs/data-audit.md` F-23 classified the tariff category chips **`WIRED-EMPTY`**:
_"Computed server-side from the whole table; empty under `none`."_ That is true
and it is beside the point.

**The enum never matched the design.** `TariffCategory` was
`maritime, aviation, cargo, passenger` — four values — while
`05-operations.md` §5.9 names five chips: _Cargo · Vessel dues · Storage ·
Passenger · Security_. Only `cargo` and `passenger` overlapped. And there was no
bridge: `TariffTable.tsx`'s `categoryLabel` title-cases the wire value and its
own comment says _"the wire's own value, never a renaming"_, so the chips could
only ever display what the enum held.

Nothing in the audit would have found this, because **every question it asked
about the chips was about the chain rather than the contents** — does the client
re-derive them, does the server compute them from the whole table, are they
empty when the feed is. All four answers were correct. The values were wrong.

**The lesson for the rest of the audit:** `WIRED-EMPTY` means "the chain works
and there is nothing in it". It does not mean "what will flow through it is
right". Any finding carrying that label is a candidate for the same miss —
`F-23` was caught only because a milestone tried to populate it.

Resolved in M4b by extending the enum to six: §5.9's five plus `aviation`, which
§5.9 omits because its five are seaport categories and dropping it would leave
R. L. Bradshaw with no fees in the table.

---

## From M4a (T-09, T-10)

### 17. `Flight` had no `facility`, and passing one was silently discarded — **CLOSED**

T-06 added `facility` to `VesselArrival`, `GateAssignment` and `TariffRow`.
**Not to `Flight`** — the plan's task named three models and that is what
shipped.

M4a's flight fixtures were written with `facility="rlb_airport"` on all twelve
constructors anyway. Pydantic's default is `extra="ignore"`, so every one was
**accepted without error and thrown away**:

```python
>>> Flight(id='x', flight_no='ZZ 1', facility='rlb_airport')
>>> 'facility' in f.model_dump()
False
```

Nothing caught it. Not `ruff`, not `pytest`, not the typechecker — the model
takes the keyword and drops it. It surfaced only when the per-facility
distribution was actually counted rather than assumed, which is the argument for
counting it.

**Resolved: the field was added.** It was one field, one filter branch and the
type mirrors — the same shape T-06 had already done three times — and the
failure mode was worse than a missing feature. FastAPI **ignores an undeclared
query parameter**, so:

```
BEFORE   /api/vessels?facility=port_zante   11 -> 3    filtered
         /api/flights?facility=port_zante   12 -> 12   FILTER IGNORED
         /api/flights?facility=nonsense     12 -> 12   also ignored

AFTER    /api/vessels  all=11  ?port_zante=3  ?rlb_airport=0
         /api/flights  all=12  ?port_zante=0  ?rlb_airport=12
```

"Show me the airport" is the same move as "show me Port Zante", and a screen
showing both would have disagreed with itself while returning `200` throughout.
Two tests now pin it, one on the filter and one end to end through the router,
because the gap was in the router signature rather than in the data.

**Two things that came out of it and are still open:**

- **The `Facility` enum has four values; SCASPA's published location list has
  five sites.** `06-support-console-voice.md` §6.2 names Vance W. Amory
  International on Nevis and Charlestown Port, and neither is in the enum. Not a
  problem while every movement is at RLB, Deep Water Harbour, Port Zante or the
  ferry terminal — but "a second airport is hypothetical" is the assumption that
  made this bug reasonable-looking, and it is not true.
- **A wrong keyword to any Pydantic model in this codebase is silent.** No model
  sets `extra="forbid"` except `KBRow` (`app/rag/models.py:51`), which is the one
  place someone thought about it. Worth considering repo-wide: it is what turned
  a missing field into twelve constructors that looked correct.

---

## From M3 (T-15)

### 16. `check:a11y` was runnable only by luck — **CLOSED**, and the diagnosis failed

**Resolved: both dependencies are saved devDependencies**, pinned exactly
(`playwright@1.56.1`, `@axe-core/playwright@4.11.0`).

The entry below said `npm ci` or a fresh clone would lose them. That was true and
too generous: **they disappeared three times in a single working session**,
without a clone, a `npm ci`, or any install other than the `--no-save` ones that
put them there.

**Ten minutes of diagnosis did not find the cause, and the negative result is
worth keeping.** None of these evicts an unsaved package — each was tested
directly, with the package present before and after:

```
npx prettier · npm run typecheck · npm run build
npm run test · npm run check:budget · npm run lint · npm run format:check
```

There is no `preinstall`, `postinstall` or `prepare` hook in `package.json`, and
no script in `frontend/scripts/` runs `npm ci`, `npm prune` or `npm install`.
`npm`'s own log directory keeps only ten files and had already rotated past the
evidence, so the invocation that did it is not recoverable. The likeliest
remaining explanation is an install run outside the automated loop — which is an
entirely ordinary thing to do and exactly why the dependency should not have
been fragile.

**The original reasoning was half right.** `--no-save` was chosen so `npm ci`
would not fetch 300MB of browsers. But the npm packages fetch no browsers:
`playwright` ships no install scripts, and `@axe-core/playwright`'s `prepare`
runs only for git and local installs, never a registry tarball. The 300MB was
always behind an explicit `npx playwright install`. Saving both costs CI about
26MB, cannot reach the bundle — verified, `check:budget` unchanged at 133.8 kB
gzipped — and makes the gate reproducible from a clean checkout for the first
time.

**The lesson worth carrying:** a gate that must be reinstalled before every use
is not a gate. It reported green each time it ran; what it could not do was fail
when it was missing.

**This also closes reconciliation finding 0.20**, open since before M1.
`design/IMPLEMENTATION_PROGRESS.md` §8 claimed "a11y 0 axe violations", and the
M1 reconciliation downgraded that to `PARTIAL — not reproducible from a clean
checkout`, because the harness needed two unsaved dependencies and a manual
install. It is reproducible now: a plain `npm install` restores both, verified by
deleting `playwright`, `playwright-core` and `@axe-core/playwright` and running
it. The §8 claim can be read at face value from this commit onward — though the
gate is still **not in CI**, so it is green-when-run rather than enforced.

---

<details>
<summary>The original entry, kept for the reasoning</summary>

### 16 (original). `check:a11y` passes in this working copy only, and `npm ci` loses it

M3 reports **0 axe violations across 26 route × viewport combinations**, and
that result is real — it was run, not assumed. But it is **not reproducible from
a clean checkout**, and should not be read as though it were.

The harness needs two dependencies that are deliberately **not saved**
(`scripts/a11y-check.mjs:11-28` explains why: CI has no browsers and `npm ci`
should not download hundreds of megabytes of them):

```bash
npm i -D --no-save playwright@1.56.1 @axe-core/playwright@4.11.0   # one command
npx playwright install chromium
```

They are installed in this working copy now. **`npm ci`, a fresh clone, or a
second `--no-save` install all remove them** — the last because `--no-save`
rewrites `node_modules` from `package.json`, which is why both must go in one
command. It also needs the backend running, and the harness serves on `:4400`,
so that origin must be in `ALLOWED_ORIGINS`.

So the gate is **runnable on demand and green when run**, not continuously
enforced. It is absent from `.github/workflows/frontend.yml`, which runs build,
lint, format:check, typecheck, test and check:budget. Whoever picks this up
should either save the dependencies and accept the CI cost, or keep it as a
release-time check that someone is accountable for running — but it should not
appear in a status table beside gates that CI actually enforces.

Not this week's fix.

</details>

_It became this week's fix. The "save the dependencies and accept the CI cost"
option above is the one taken — and the cost turned out to be 26MB rather than
the 300MB everyone had been avoiding._

---

## From the M2 session (formatting fix, eval correction, M2 proper)

### 12. Query rewrite drops the ellipsis follow-up — the one false refuse

Eval case 6, _"what about the other one?"_ with history
`How much is airport parking?|Is there a cheaper option?`, retrieves at **0.436**
— comfortably above `RETRIEVAL_MIN_SCORE` (0.30) — and then does **not** answer.

So it is not a threshold problem. The rewrite in
`backend/app/rag/rewrite.py:102` is meant to make an elliptical follow-up
standalone by borrowing the previous topic, and `_REFERENTIAL`
(`rewrite.py:36-43`) matches `what about`. Something between the rewrite and the
answer gate is losing it. **Query rewrite is not this week's work** — recorded
so it is not rediscovered.

### 13. `tests/contrast.test.ts` is incompatible with running Prettier over the source

The scan at `frontend/tests/contrast.test.ts:769-794` reads source **one line at
a time** and cross-pairs every `bg-*` with every `text-*` on that line. Two
components deliberately split ternary branches across lines so the two halves are
never measured against each other; `prettier --write` collapsed both and the
suite reported contrast failures for pairs that **never render together**.

Restored with `// prettier-ignore` at `frontend/src/components/ui/Segmented.tsx`
and `frontend/src/components/ops/TariffCalculators.tsx`, each carrying the
reason.

Two traps for whoever touches this next:

- **The scan reads comment lines as readily as code.** A comment explaining the
  hazard, if it names both utilities on one line, trips the scan itself. That
  happened while fixing it.
- **The real fix is in the scanner**, which should understand that a ternary's
  branches are alternatives. Adding entries to the `ICON_ONLY` exemption list
  instead would mask genuine regressions.

### 14. `CLAUDE.md` rule 9 is blank in the working tree

HEAD (`587ee94`) and the index both carry:

> 9. Log question text and latency. Never log IP addresses, audio, or user identifiers.

The working tree has a bare `9.` with nothing after it. **Six source files cite
rule 9 by number** — `backend/app/ratelimit.py:115`, `observability.py:11,93`,
`schemas.py:610,819`, `main.py:70` — so the rule they defer to currently reads as
empty in the file that governs the project.

Rule 11 diverges the other way: the working tree's `design/` is correct, while
the index names `design/SCASPA Assistant Component Spec.dc.spec.html`, a file
that does not exist (the real one has no `.spec`).

**`CLAUDE.md` was deliberately excluded from checkpoint `fb37852`** for this
reason — mixed, and an owner's decision rather than a checkpoint's. It remains
uncommitted.

### 15. The eval's answer-matching varies run to run; retrieval does not

Two `evaluate.py` runs over an identical corpus and an identical question set:
retrieval was **bit-identical** (hit@1 73%, hit@3/5 82%, MRR 0.773 both times),
while case 8 _"What time does the port open?"_ went PASS → FAIL on
`expected_facts` alone, having retrieved `kb-016` at rank 1 both times.

`CHAT_TEMPERATURE` defaults to `0.0` (`backend/app/config.py:137`), so this is
generation variance in how a figure is worded (`8:00 am` versus `8am`), not a
retrieval change. **Read retrieval metrics as stable and answer-text metrics as
noisy** at this sample size — 15 rows against 115 indexed.

---

## From M1 (T-02, T-01 + T-01a + T-01b, T-03, T-04)

### 1. SCASPA publishes no fixed ferry timetable — client conversation item

`kb-192` is `confirmed` and answers _"What time does the ferry to Nevis leave?"_
with:

> Ferry departure times vary by operator and by day, so SCASPA publishes them
> through a live vessel schedule rather than a fixed timetable.

`kb-182` is the same shape for fares: SCASPA operates the terminal but does not
set them.

**This is a gap in SCASPA's own published information, not a defect in ours.**
The assistant's honest answer to the single most likely demo question is "that is
not published, ask the operator". Worth raising with them directly — it is the
kind of gap only they can close.

The landing page headline is _"Will you make the last ferry?"_
(`frontend/src/routes/index.tsx:58`), which now sits above an assistant that
cannot say. **Folding the re-caption into T-18 at M5**, which already touches
that file — per the decision at the M1 kick-off.

### 2. `kb-143` makes eval case 15 a refusal-policy question

`evals/stress_test_sample.csv` case 15 — _"What is the radio frequency for
berthing at the Deep Water Harbour?"_ — expects `escalate` with a blank
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

**Resolved — but the workaround outlived the finding, and that was the real
cost.** The whitespace churn predicted here never happened: `git ls-files --eol`
showed 436 of the 438 tracked text files were *already* stored LF, so the noise
was purely a Windows **checkout** artefact, not a repository one.
`.gitattributes` fixes it without touching content (decisions.md 0049).

What this entry did not foresee is that a gate reporting 39 false positives does
not get run — it gets replaced. It was replaced by
`prettier --check "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"`, which is quiet,
useful, and blind to every other file type. A hand-written `frontend/vercel.json`
went in unformatted, CI ran `prettier --check .`, and `main` was red from PR #21
until #22. `npm run format:check` now passes locally and means what CI means.

### 6. The payment portal survives in prose on two rows

T-01b removes the _link_ — `source_url` is blanked on all five portal rows, and a
live request for "Can I pay SCASPA fees online?" now returns `kb-225` with
`source_url: ""`. Verified end to end.

**`kb-075` and `kb-225` still mention `pay.scaspa.com` in their answer text.**
Bare hostnames with no scheme and no `www.`, so `remark-gfm` will not autolink
them and nothing renders as an anchor — but the assistant will still _say_ the
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

**Update — the loss is now visible to users.** When this was written the only
consequence was one row missing from the index, which showed up as the assistant
being unable to answer a question nobody might ask. `GET /api/guide` now renders
confirmed rows straight onto the Airport Information page, so the airport
section shows **18 answers where the export contains 19 confirmed rows**, and
the missing one is "What is the airport code for St. Kitts?" — a question a
traveller is quite likely to have, on a page that otherwise looks complete.

Nothing about the diagnosis changes: the enum is right to refuse a Wikipedia
source, and widening it to admit `reference` would let third-party content onto
a page badged **PUBLISHED**, which is worse than the gap. The fix is still the
researchers': find `SKB`/`TKPK` on an official page and re-source the row.

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
_"Is the ferry to Nevis running right now?"_ It expects `escalate`; the pipeline
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
