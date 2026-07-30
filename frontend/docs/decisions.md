# Frontend decisions

Significant decisions, the alternatives considered, and the reason. Newest last.

---

## F001 — Toolchain verification, and why "latest" was the wrong answer four times

**Date:** 2026-07-30
**Status:** Accepted

Every claim below was checked against current documentation or the published
package, not recalled.

### Tailwind is CSS-first — this decides where tokens live

**Tailwind 4.3.3 uses CSS-first configuration with `@theme`. There is no
`tailwind.config.js`.**

```css
@import 'tailwindcss';
@theme {
  --color-brand-600: oklch(0.47 0.14 240);
}
```

A token declared in `@theme` becomes both a CSS variable _and_ a utility class, so
`--color-brand-600` yields `bg-brand-600`, `text-brand-600`, and so on. That is why
the designers' deliverable is `src/styles/tokens.css` and not a JavaScript file —
had this been checked wrongly, the whole token pipeline would have been built in
the wrong place and the designers handed the wrong artefact.

### TanStack Router: the plugin name has changed

`@tanstack/router-plugin` exports **`tanstackRouter`** from
`@tanstack/router-plugin/vite`. Confirmed by reading the published `vite.d.ts`.

Most existing material shows `TanStackRouterVite`, which is the older name. The
plugin must be listed **before** `@vitejs/plugin-react`, because it generates
`routeTree.gen.ts` that React's transform then needs to see.

### TanStack Query v5: object syntax

`useQuery({ queryKey, queryFn })` with `QueryClientProvider`. Confirmed.

Defaults set for this audience: `refetchOnWindowFocus: false`. The users are on
metered roaming data, and re-fetching on tab focus spends their money to replace
something already on screen.

### Four version conflicts, none of which "install latest" would have survived

The npm `latest` tag is per-package. Across a toolchain the binding constraint is
the peer-dependency graph, and four pins had to move:

| Package                  | `latest` | Pinned     | Why                                                                                                                                                                   |
| ------------------------ | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **typescript**           | 7.0.2    | **6.0.3**  | No stable `typescript-eslint` supports TS 7 — it declares `typescript: ">=4.8.4 <6.1.0"`, and so does its canary. Pinning latest would have broken linting on day one |
| **@vitejs/plugin-react** | —        | **6.0.5**  | v5.1.1 peers `vite ^4 \|\| ^5 \|\| ^6 \|\| ^7`; only v6.x supports Vite 8                                                                                             |
| **eslint**               | 10.8.0   | **9.39.5** | `eslint-plugin-jsx-a11y` caps at ESLint 9. Accessibility linting is a standing rule (rule 10), so the plugin stays and ESLint moves                                   |
| **jsdom**                | 30.0.1   | **29.1.1** | v30 requires Node `^24.15.0`; CI and this machine run 24.11.1. Would have been a latent test failure                                                                  |

The general point, worth remembering for the next dependency added: _verify the
peer range, not the version number._

### ESLint + typescript-eslint over Biome

Biome would have avoided the TypeScript-7 constraint entirely and is much faster.
Rejected because it does not do **type-aware** linting, and this is a streaming
codebase. `no-floating-promises` and `no-misused-promises` catch a dropped promise
in a stream reader, which presents as a hang with no error — the hardest kind of
bug to find. Being able to lint on types is worth pinning TypeScript one major
behind.

### The standing rules are enforced by the linter, not by review

Several of the absolute rules in `CLAUDE.md` are mechanical, so they are checked
mechanically rather than remembered:

- `new EventSource(...)` — an error (rule 3).
- `dangerouslySetInnerHTML` as a JSX attribute — an error (rule 4).
- `localStorage` — an error (rule 5).
- `fetch` outside `lib/api.ts` and `lib/stream.ts` — an error (rule 7).
- Any string containing `pay.scaspa.com` — an error (rule 9).

A rule that only lives in a document gets broken by whoever has not read it.

### `react-refresh/only-export-components` is off for `src/routes/**`

Turned off in that directory only, and this is a deliberate call rather than
noise-suppression.

Every TanStack file route must define a component and export only `Route`, which
is exactly the shape the rule objects to. `allowExportNames: ['Route']` does not
suppress it, because the component itself is not exported. The rule is about
hot-reload ergonomics, not correctness, and it cannot be satisfied without
abandoning file-based routing.

The alternative was six permanent warnings, which teaches everyone to ignore
warnings. `npm run lint` therefore runs with `--max-warnings 0`: a warning that is
allowed to persist is not a warning.

Also relaxed there: `@typescript-eslint/only-throw-error`, because
`throw redirect()` and `throw notFound()` are how the router does control flow and
they are not `Error` subclasses.

### `baseUrl` removed from tsconfig

TypeScript 6 deprecates it with an error. `paths` resolves relative to the
tsconfig without it, so it was removed rather than silenced with
`ignoreDeprecations`.

### Notes for later prompts

- `msw` is a dev dependency and lives in `src/mocks/`. It is never imported by
  production code. `vitest.setup.ts` sets `onUnhandledRequest: 'error'`, so a test
  that quietly reaches the network fails loudly here rather than mysteriously in
  CI, where no backend exists.
- `public/embed.js` is a placeholder so the path in the deploy story is real
  rather than a 404 found later. The loader is built in F11.
- The API contract has not been modified and nothing in it has been worked around.
  Nothing in it looked wrong at this stage; the only observation, to raise when the
  client is built, is that a streamed `[kb-xxx]` marker can be briefly visible
  before the `citations` frame arrives — the contract already documents this and
  tells the client to reconcile, so it is a known cost rather than a defect.

---

## F002 — The design-system layer, and four things that looked fine and were not

**Date:** 2026-07-30
**Status:** Accepted

No chat features. This prompt builds tokens, type, primitives, the accessibility
baseline and the gallery — the layer everything later sits on.

### Tokens are interim, and the file says so in a banner

`src/styles/tokens.css` opens with a header saying it will be **replaced
wholesale** when the designers deliver, not edited in place. That is a real
constraint on how everything else is written: components reference semantic
aliases (`--color-ink-muted`, `--color-border-strong`) rather than ramp steps, so
a handover moves an alias instead of finding every usage.

Two ambers, deliberately:

| Token                 | Value     | Use                                       |
| --------------------- | --------- | ----------------------------------------- |
| `--color-amber-board` | `#F5A623` | **Fill only.** 2.03:1 on white.           |
| `--color-amber-text`  | `#8A5A00` | The readable one, for text on a light bg. |

Reaching for the brighter one is the natural mistake, so `tests/contrast.test.ts`
asserts it specifically — the 2.03 figure is pinned, and a grep across `src/`
fails if `text-amber-board` appears anywhere.

### The contrast test found three defects in my own tokens

It reads the real token file rather than a copy of the values, computes WCAG 2.1
relative luminance, and it failed on first run:

| Token                   | Was       | Measured                                                       | Now                   |
| ----------------------- | --------- | -------------------------------------------------------------- | --------------------- |
| `--color-ink-subtle`    | `#6B7887` | 4.50 on white, **4.27** on neutral-50, **4.00** on neutral-100 | `#5C6875`             |
| `--color-border-strong` | `#C2CCD8` | **1.63:1** — an interactive boundary needs 3:1                 | neutral-400 `#87929F` |

Both were fixed by changing the **tokens**, not the thresholds. A threshold that
moves to accommodate a colour is not a test.

### Two utilities compiled to nothing at all, and nothing said so

This is the finding worth carrying forward. `min-h-touch-min` and `duration-fast`
type-checked, linted, appeared in the rendered DOM, and produced **no CSS
whatsoever**:

- `min-h-*` resolves against Tailwind's **spacing** scale, not the `--size-*`
  namespace. `--size-touch-min` gives `size-touch-min` (which is why `IconButton`
  was fine) but never `min-h-touch-min`. **Every `Button`, `Input` and `Chip` had
  silently lost its 44px minimum touch target** — the exact requirement the class
  was added to satisfy.
- `duration-*` reads `--transition-duration-*`. A token named `--duration-fast`
  compiles to nothing.

Neither is visible in jsdom, which does no layout and applies no stylesheet, so no
component test could have caught it. The only place the truth exists is the built
CSS. `tests/tokens-compile.test.ts` now asserts every token-derived utility emits a
real rule, reading `dist/assets/*.css`, and includes a negative control so a broken
matcher cannot report a clean sheet forever. `npm run verify` was reordered to
build **before** test, because a test that skips for a missing artefact is a test
that never runs.

Explicit `@utility min-h-touch / min-w-touch / touch-target` declarations replaced
the namespace guesswork.

### `Button` was replacing its visible label while loading

Caught by the gallery test, not the accessibility test. `<Button loading
loadingLabel="Asking">Ask SCASPA</Button>` rendered "Asking" — contradicting the
component's own header comment, which says the label stays because swapping it
reflows the row and moves whatever is next to it under the user's thumb.

The accessibility test had asserted `toHaveTextContent('Ask')`, which **substring
matches** and is satisfied by "Asking". It now pins the visible span exactly and
asserts the announcement separately. `loadingLabel` is now announcement-only: with
several buttons on screen, "Asking" also loses which action is pending, where
"Ask SCASPA" still says.

### `useReducedMotion` uses `useSyncExternalStore`

`useState` + `useEffect` reads matchMedia one render too late: the component
renders once with motion enabled and again with it disabled — a cascading render
(flagged by `react-hooks/set-state-in-effect`) and a visible flash of the
animation the user explicitly asked not to see. matchMedia is an external store,
so it uses the hook for external stores.

Motion is gated twice: the CSS media query in `tokens.css` collapses durations,
and JS animations check the hook. The CSS alone is not enough — a transition with
a 0.01ms duration is still a transition that fires and still runs its callbacks.

### `Tooltip` handles Escape on the document

`onKeyDown` on the wrapper `<span>` was flagged by
`jsx-a11y/no-static-element-interactions`, correctly. Rather than silence the rule,
the listener moved to the document while open — which also **fixed a real bug**: a
keydown bound to the wrapper only fires while focus is still inside it, so Escape
did nothing the moment focus moved on, leaving the tooltip open.

Standing limitation, documented in the component: **a tooltip is never the only
place information lives.** It is unreachable by touch, which is how most of these
users browse.

### One font file, not four

The four Inter weight files downloaded were **byte-identical** (one md5) because
Inter is a variable font. Consolidated to a single `inter-latin-variable.woff2`:
194KB → 48KB. "Preload only the body weight" therefore collapses into "preload the
one file", which `index.html` does with `crossorigin` — required even same-origin,
because a font is fetched in CORS mode and without it the browser downloads it
twice.

Self-hosted, no font CDN. Users are on metered roaming data and a third-party DNS

- TLS round trip before first paint is a cost avoided by not incurring it. Asserted
  in `tests/no-arbitrary-values.test.ts`.

### The gallery ships as a chunk in production, and that is a deliberate trade

`routes/dev.gallery.tsx` 404s in production via `beforeLoad` (asserted against a
non-dev config, not by reading the source). But with `autoCodeSplitting` it is
still emitted as a separate 19KB chunk that gets deployed.

Excluding it properly means `routeFileIgnorePattern` gated on mode, which breaks
`npm run build` — that script runs `tsc --noEmit` **before** `vite build`, so the
next typecheck would run against a route tree missing a route the source still
references. The chunk is lazy, the route 404s before it is ever fetched, and no
user downloads it. Revisit if the gallery grows.

### Accessibility baseline

Skip link first in the DOM (asserted: it is `document`'s first focusable element,
and `#main` actually exists), one `banner`/`main`/`contentinfo` per page, per-route
`<title>` and description via TanStack Router's `head` + `<HeadContent />`, and the
phone number in the footer of every page — when the assistant cannot help, the
fallback must already be on screen rather than something to go and find.

The `head` mechanism was mutation-tested: removing `head` from the index route
makes the title test fail rather than silently inheriting the root default. So was
`Sheet`'s focus trap and its focus restoration — both mutations are caught.

One test was rewritten because it was a tautology: it set `document.documentElement.lang`
and then asserted it. For a client-rendered app `<html lang>` can only come from the
static shell, so it now reads `index.html` from disk.

---

## F003 — Contract types, an honest mock, and the two shells

**Date:** 2026-07-30
**Status:** Accepted

The point of this prompt was that Phases 1 and 2 can be built with no backend. So
the mock is treated as production code and tested like it.

### Field names are the contract's

`lib/types.ts` is transcribed from `docs/api-contract.md` verbatim. `x_label`
stays `x_label`, `uptime_s` stays `uptime_s`. Every rename would be a mapping, and
every mapping is a place the two sides drift — invisibly, until integration day,
where it presents as an `undefined` in a component nobody touched.

**Two things raised rather than worked around:**

1. **`replace` is in the contract and was not in this prompt's event list.** It is
   in the union anyway. Omitting it would not stop the server sending it; it would
   make the client render an internal tool-cap control message to a user as though
   it were the answer. The contract says to discard accumulated tokens and render
   `replace.text` instead.
2. **`refusal_category` is inconsistent in the contract itself.** The response
   table lists it; the no-answer sample at line 264 omits the key entirely. Typed
   optional so a missing key cannot throw. Worth a one-line fix in the contract.

### The mock is deliberately hostile

Two things it does that a convenient mock never would, both from the contract:

- **A frame is split across two chunks**, cut mid-JSON. A parser that assumes one
  chunk is one frame fails on the very first token.
- **A `[kb-014]` marker is split across two `token` events** — `...44.44 [kb-0`
  then `14].`. The answer carries the marker twice and only the first is split, so
  a client meets both cases in one stream.

Both are mutation-tested: removing either makes a test fail. Timing is real
(`tool_start` at ~150ms, tokens 20–40ms apart, measured at 151/301ms in a real
browser); tests set `timeScale = 0`, which removes the sleeps and **keeps the
splitting**, because the splits are what break parsers and the sleeps only make
the suite slow.

### Measured limitation: stream cancellation is untestable under MSW-node

Under MSW's Node interceptor, `response.body.cancel()` returns a promise that
**never settles**, and `AbortController.abort()` does **not** reject a read that is
already pending. Both work in a real browser and in dev through the service
worker, so this is the test environment, not the mock.

The consequence is concrete for Phase 2: **do not implement the stream timeout as
"abort and wait for the read to reject."** Race the read against a timer, stop
consuming when the timer wins, and abort as cleanup rather than as the mechanism.
The `stream_stall` scenario exists to keep that honest.

### The failure toggles

Nine scenarios, on a floating dev control and in the gallery. A failure you have
to edit a file to reproduce is a failure nobody reproduces, and every one of these
is a state a passenger on hotel wifi will actually hit. Error bodies are the real
envelope and every message ends with the phone number, because the real ones do —
a mock that returns a bare "Internal error" trains the UI to render something the
server never sends.

### `dvh`, and why the composer is not sticky

`h-dvh`, never `h-screen`. On iOS Safari `100vh` is the viewport height _with the
toolbar hidden_, which is taller than what is visible — so a `100vh` column puts
the composer behind the browser chrome. It looks correct on desktop and on
Android and fails for every cruise passenger on an iPhone.

The composer needs no `position: sticky`: the document never scrolls. The shell is
a fixed `dvh` flex column and only the transcript scrolls. `min-h-0` on the flex
row is load-bearing — without it the child never shrinks, `overflow-y-auto` never
engages, and the composer is pushed off screen.

That is also the whole layout contract for `ChatCore`: **it fills its parent, and
the parent must be a fixed-height flex box.** Which is why both shells mount it
unchanged — 100dvh minus a header in one, 600px minus a header in the other, and
neither difference reaches the component.

### `/chat` and `/widget` opt out of the root chrome

Both are application shells, not documents. Wrapped in the marketing chrome they
would have two `<main>` landmarks and two `id="main"` elements — so the skip link
jumps to whichever the browser finds first — plus a document-level scroll that
undoes the `dvh` layout.

### ⚠️ Framing policy cannot be set from a `<meta>` tag

This prompt asked for "X-Frame-Options-friendly meta". There is no such thing:
`X-Frame-Options` has never been supported as a `<meta>` element, and CSP's
`frame-ancestors` is **explicitly ignored** when delivered by `<meta>`.

A tag would have looked like a control and enforced nothing — worse than none,
because it closes the checklist item while leaving the site framable by any
phishing page that wants to wrap a real SCASPA assistant in a fake SCASPA layout.

So `index.html` carries a comment where the tag would go, and `docs/embedding.md`
has the actual headers, per-platform config, and the `curl` that verifies them.
The widget's close message posts to `config.embedAllowedOrigin` and **never
`'*'`** — asserted in a test.

### Responsive verification is done in a real browser

jsdom does no layout: every element is zero-width there, so "nothing overflows at
320px" is not a claim it can check, and asserting it in jsdom would produce a
passing test that measures nothing.

`scripts/responsive-check.mjs` drives headless Chromium against the production
build at 320/390/768/1024/1440 for both routes, and names the offending element
rather than just reporting that something overflowed. It found one real defect:
**at 320px the phone-call link was flex-shrunk to 43×44 (chat) and 41×44
(widget)** — `size-touch-min` sets a width, and flexbox is free to shrink it
below. Fixed with `shrink-0`.

It is a separate script, not part of `npm test`, because CI has no browser. Run
`npm run build && npm run check:responsive` before shipping a layout change.
**Not yet checked on a physical phone with a software keyboard open** — the `dvh`
reasoning is sound and Chromium agrees, but that is the one test a real device
gives you and this has not had one.

### The gallery no longer ships, which also closed an F002 trade-off

`tests/mocks-not-in-production.test.ts` greps the built assets, and it caught a
real leak: the gallery's scenario picker pulled mock scenario labels into the
deployed `dev.gallery` chunk.

F002 had accepted that chunk as a known cost because excluding it via
`routeFileIgnorePattern` breaks `npm run build` (it typechecks before generating
the route tree). The fix was the pattern already used for `MockControls`: the
route file is now a stub, and the gallery body lives in `src/dev/Gallery.tsx`
behind `import.meta.env.DEV ? lazy(() => import(...)) : null`. `DEV` is a
build-time literal, so the branch folds and Rollup never follows the import.

**The chunk went from 19.2KB to 152 bytes and every mock string is gone.** Both
guards are mutation-tested: a static `@/mocks/*` import in production code fails
the test.

---

## F004 — The conversation surface

**Date:** 2026-07-30
**Status:** Accepted

Runs entirely against MSW. Six components, and four findings worth carrying.

### The security position on markdown, stated once

**react-markdown escapes raw HTML by default. That default is the protection.**
`<script>` in an answer arrives as the literal characters. The way it gets lost is
by adding `rehype-raw`, which exists precisely to turn embedded HTML back into
live nodes — and in a component rendering text derived from retrieved documents,
that is a stored-XSS sink: a knowledge-base row, or a scraped page, becomes
script on the SCASPA origin.

So **no `rehype-raw`, ever**, and no `dangerouslySetInnerHTML` anywhere.
`rehype-sanitize` is defence in depth, not the mechanism — it is the second lock,
so that a plugin added in a hurry a year from now fails closed. `href` protocols
are narrowed to http/https/mailto (the hast default also permits `irc`, `ircs`
and `xmpp`, none of which a SCASPA answer needs).

Tested: a `<script>`, an `<img onerror>` and a `javascript:` link are all inert.
There is a test asserting `rehype-raw` is not a dependency and must not become
one.

### A no-op override silently disabled the whole table treatment

The finding of this prompt. `Markdown` supplied pass-through components for
`thead`/`tbody`/`tr`/`th`/`td` — each rendering exactly the element it replaced,
apparently harmless.

`ScheduleTable` identifies the header row with `section.type === 'thead'`, which
only matches an **intrinsic** element. With the overrides in place the type was
the override _function_, so the header never matched: the header row was parsed
as data, every column therefore contained its own heading, every column
classified as text, and **the right-alignment, the tabular figures and the amber
quantity column all quietly disappeared.** The table still rendered, and looked
approximately fine.

Caught because the tests assert alignment rather than existence. The pass-throughs
are gone and a comment says why they must not come back.

### Column type is read from the cells, never the header

A column headed "Fee" might hold "On application"; a column headed "Berth" might
hold "40". Guessing from the header is guessing from a label a model wrote.

A column is numeric only when **every** cell carrying content is a figure — not a
majority. One "On application" in a fee column means it is not a clean set of
quantities, and right-aligning the rest would imply a precision the data does not
have. Blanks and dashes are ignored rather than counted against. "Bay 4" and
"Berth 2" are labels containing digits and are deliberately not matched.

The quantity column — the one that gets the amber — is the **last** numeric
column, because tables read left to right from identifier to value.

### The amber rule had to become a rule about pairing

F002 asserted `text-amber-board` appeared in **no** source file. That was right
while nothing used it. The departure-board treatment then made amber-on-navy the
intended emphasis, where it measures 6.1:1 — so the blanket ban would have been
banning the correct usage.

The rule is about the _pairing_, not the string. The contrast test now checks that
any file using amber as text also establishes a navy ground, and that nothing
pairs it with a light surface on the same element; `chat-rendering.test.tsx` goes
further and resolves the ancestor background in the rendered DOM, which a grep
cannot do.

### Streaming: two different problems

**Throttling is a cost problem.** Tokens land every 20–40ms; parsing each one runs
the full remark/rehype pipeline ~40 times a second over a growing document, on the
main thread, at a cost quadratic in answer length. Refreshed on a ~50ms timer
instead. Measured with fake timers: 40 tokens produce 40 distinct parses without
it and fewer with — and removing the throttle makes that test fail.

**Safe-point splitting is a correctness problem**, and the one that shows. Markdown
parsed mid-construct is not slightly incomplete, it is a _different document_: a
table missing its delimiter row is a paragraph of pipes that becomes a grid two
tokens later; an open code fence swallows the rest of the answer.
`splitAtSafePoint` holds the unterminated tail back and renders it as plain text.
The tail is always on screen — nothing is buffered out of sight, which would
defeat the point of streaming.

**Measured** (`npm run check:streaming`), at 390px under 6x CPU throttling:

|                                       |                         |
| ------------------------------------- | ----------------------- |
| Long tasks                            | 2 (71ms, 57ms)          |
| Total blocking time                   | 28ms over a 4.6s stream |
| Table shapes observed while streaming | `5x5` only              |

That last row is the anti-flicker result: the DOM was sampled every 16ms and the
table was **never** painted with fewer than its final five columns.

⚠️ **This is an emulation, not a device.** 6x CDP throttling is the usual stand-in
for a mid-tier Android; no physical phone has been tested. Read the numbers that
way.

### Scroll, and the rule about not yanking the reader

Auto-scroll follows the newest message until the user scrolls up, then stops
completely and offers "jump to latest". It is **never** re-enabled by a message
arriving — only by the user returning to the bottom or pressing the button. Losing
your place matters more here than in most chat apps, because what is being read is
a fee table someone is copying down.

`hasUnseen` is _derived_ from comparing the content signature against the one
recorded when the user left the bottom, rather than stored as a flag. A flag would
have to be set from the layout effect that handles new content — a setState inside
an effect, costing an extra render per token — and it goes stale.

### Two jsdom gaps, and what they mean

jsdom implements neither `ResizeObserver` nor `Element.scrollTo`, both of which
this surface uses. Stubbed in `vitest.setup.ts` as no-ops, because without layout
a faithful implementation would have nothing to report. The behaviour they drive —
overflow and scroll position — is measured for real in the browser scripts. Worth
knowing that a green jsdom suite says nothing about either.

### A guard in the wrong place broke the entire refusal stream

Found by driving the real UI, not by a test. The mock's `tokenize` threw when it
could not find a `[kb-014]` marker to split — a guard against someone quietly
editing the marker out of the fixture and making the mock comfortable.

But a **refusal cites nothing**. So the throw killed the refusal stream: the
client saw a connection error, dropped the empty bubble, and rendered no answer
at all. The one thing that must never be shown as a failure — the contract is
explicit that a refusal is a successful 200 — was being shown as a failure.

It survived because the prompt-15 tests exercised the refusal only on
`/api/chat`, never on `/api/chat/stream`. The guard now lives in a test asserting
that ANSWER still carries a splittable marker, which is where a claim about a
fixture belongs, and there is a test for the streaming refusal path.

### `aria-busy` is not a "stream finished" signal

Worth recording because it made a verification lie. The agent-status list
unmounts when it collapses, which happens at the **first token** — so waiting for
`aria-busy` to clear measures the first fraction of a stream and reports it as the
whole thing. It made the first smoke run report a 29-character answer for a
300-character one. Both browser scripts now wait on the composer swapping Stop
back to Send, which is driven by `busy`.

### Bundle cost, stated rather than hidden

The markdown pipeline (react-markdown + remark-gfm + rehype-sanitize) is
**75 kB gzipped**, code-split so only `/chat` and `/widget` pay it — the landing,
about and privacy pages do not. `/chat` is therefore ~173 kB gzipped total.

For an audience on metered roaming data that is not nothing. It is kept eager
because a user on `/chat` needs it within seconds and a lazy load risks stalling
the first token. Moving it behind a dynamic import prefetched when the composer is
focused is a real option — but it should be made on a measurement, not on a guess,
so it is recorded here rather than done speculatively.

---

## F005 — Citations, and a contract request

**Date:** 2026-07-30
**Status:** Accepted — with two items needing the backend team

### ⚠️ Three fields the UI needs and the contract does not carry

`volatility`, `label` and `snippet` are all columns on every knowledge-base row
(`backend/app/rag/models.py`, `data/knowledge/sample_kb.csv`) and **none of them
is on the `Citation` payload** in `docs/api-contract.md`.

| field        | KB column           | why the UI wants it                                                                                              |
| ------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `volatility` | `low\|medium\|high` | Decides whether a source shouts "confirm before you travel" or shows its date quietly. This is the safety story. |
| `label`      | `question`          | A human name for the source. Without it the panel composes one from `category` + `subcategory`.                  |
| `snippet`    | excerpt of `answer` | Lets a reader judge the source without leaving the page.                                                         |

All three are typed optional, so the UI lights up the moment they arrive and needs
no change when they do. **None is fabricated client-side.** `label` falls back to
`Ferry — schedule`, composed only from fields that _are_ sent; `snippet` is
omitted rather than invented — deriving an "excerpt" from the answer text would be
the UI manufacturing evidence for itself.

`refusal_category` is a fourth, smaller gap: it is on `POST /api/chat` but not on
the stream's `done` event, so a streamed refusal cannot pick its specific
explanation. The card falls back to the backend's own refusal text, which is
approved copy.

### A missing volatility is treated as `high`

The cautious default, deliberately. A stale ferry departure shown quietly is the
harm the handbook's schedule rule exists to prevent; an unnecessary confirmation
line on a low-volatility row is mild noise. Given the field is absent today, **every
source currently shows the confirmation treatment** — which is both safe and
usefully uncomfortable: it keeps the missing field visible instead of letting it be
forgotten.

Deriving volatility from `category`/`subcategory` was considered and **rejected on
the data**: the KB shows no such mapping. `ferry/schedule` is high but `ferry/fares`
is medium and `ferry/luggage` is low; `general/contact` is low. A category-based
guess would be confidently wrong, and wrong in a safety-relevant place.

### The brief's volatility grouping disagrees with the knowledge base

The brief describes high volatility as "schedules, fees, contact details". The
knowledge base says otherwise:

- **high** — `cruise/arrivals`, `ferry/schedule`
- **medium** — `ferry/fares`, `cargo/tariffs`, `airport/parking`, `cargo/hours`, `cruise/taxis`
- **low** — `general/contact`, `ferry/luggage`, `cargo/customs`, `cruise/facilities`, `airport/departures`

So fees are _medium_ and contact details are _low_.

Followed the brief's **intent** rather than its wording: `high` **and** `medium`
both get a confirm line, because a fare is exactly the kind of figure someone
budgets against; `high` additionally gets the prominent amber treatment and a
`tel:` link. `low` shows its date quietly. If everything shouted, nothing would.

### Markers are parsed on the AST, and that is not fussiness

A string replace before parsing corrupts the document in ways that reach the user:
a literal `[kb-014]` inside a code fence (an answer explaining the citation format)
gets rewritten into a chip; `[kb-014](https://…)` is link syntax and replacing the
label destroys the link. `rehypeCitations` runs over hast text nodes, after the
parser has already decided what is code and what is prose, and skips any node
under `code`, `pre` or `a`. All three are tested.

It runs **after** `rehype-sanitize`, because the nodes it creates would otherwise
be stripped as unknown markup. Safe, because each element is built here from a
strictly-matched id (`kb-` + 3–4 digits) — no attacker-controlled string reaches an
attribute, and the text was sanitised before this ran.

### A silent flatten was deleting citations inside tables

Found by the test for a marker in a table cell. `ScheduleTable` read its cells
through `textOf()` to classify columns and then rendered _that text_, discarding
the React tree — so a chip inside a fee table vanished completely, **chip and
marker both**, leaving a bare figure with no attribution in the one place
attribution matters most.

A cell now carries `{ text, node }`: text drives classification (and correctly
ignores the chip, so `44.44 [kb-014]` still reads as a figure), node is rendered.

### The reconciliation rule has two halves, and the second is the easy one to get wrong

Never render a chip the backend did not vouch for — _and_ never render the raw
`[kb-047]` either. Falling back to the literal marker feels honest and is not: it
exposes an internal row id inside an answer someone is being asked to trust, and
looks like a bug. The marker is deleted; the sentence around it survives.

Mutation-tested: rendering the raw marker, defaulting volatility to `low`, and
letting an unmatched marker resolve to some citation each make a test fail.

### The refusal must not look like an error

`EscalationCard` has no `alert` role and no danger styling — asserted. A refusal is
a successful 200 and the system working exactly as designed. Styling it as a
failure teaches a judge that the product breaks when pushed; styling it as a
deliberate handoff says the boundary was designed.

The three phone lines are **three separate `tel:` links**. "8121 / 2 / 3" as a
single link dials nothing at all.

The email slot is rendered and visibly marked _pending from SCASPA_ rather than
omitted. scaspa.com obfuscates the address and it **must not be guessed** — a wrong
address sends a cargo query into a void and the sender never learns it did not
arrive. Visible-and-marked keeps it a standing question at every demo; omitted, it
is invisible to whoever has to chase it.

### `grounded` only ever removes confidence

There is no "verified ✓" badge anywhere, and there will not be. The contract is
explicit that `grounded: true` is not a correctness guarantee — a false claim
carrying a valid citation still passes. So the signal is used in one direction
only: `false` suppresses every chip and adds the confirmation note. Asserted.

### One dev warning per event, not four

The dropped-marker `console.warn` fired four times per answer: `reconcile` runs
from two `useMemo`s (the bubble and the session context) and StrictMode
double-invokes both. Four lines for one event is how a warning gets ignored — the
same lesson as the MSW request noise in F003. Deduped, with a reset seam for tests.

---

## F006 — The unhappy paths

**Date:** 2026-07-30
**Status:** Accepted

Every state a user actually hits and nobody demos.

### Error copy is data, in one file

`features/chat/errorCopy.ts` holds one approved string per code. In one place so
the whole set can be read and signed off together — the alternative is a sentence
written inline wherever it was needed and eight slightly different apologies
nobody has ever seen side by side.

The rule it enforces: **never a code, a `request_id`, an HTTP status, a stack or a
model name.** A traveller cannot act on `UPSTREAM_TIMEOUT`, and reading it makes a
working system look broken. The `request_id` is logged to the dev console and
nowhere else — the compromise that keeps a bug report actionable without putting
internals on someone's screen. Asserted against the copy table itself, not just a
rendered instance.

`RETRIEVAL_EMPTY` is routed to the calm no-answer treatment rather than an error
panel. From the service's side it is a fault; from the user's it is
indistinguishable from the assistant not knowing, and an error framing implies
they hit a bug.

### A test regex that matched correct copy

The "nothing technical" test used `/\b[45]\d\d\b/` for an HTTP status. It matched
**465** — inside `869-465-8121`. It would have failed on copy that was entirely
right, and the fix for a false positive like that is usually to weaken the test.
Replaced with an explicit status list.

### One fake-timer test took ten others down

A countdown test failed part-way and left `vi.useFakeTimers()` installed. Every
later test that awaited anything then hung on a clock that never advanced — ten
timeouts, none of them a real defect, all pointing at the wrong place.
`vi.useRealTimers()` now runs unconditionally in `afterEach`. Worth remembering:
a fake-timer leak presents as failures in unrelated tests.

### The draft is in memory, deliberately not sessionStorage

**CLAUDE.md rule 5**: never write message content to localStorage, sessionStorage
or IndexedDB. A half-typed question is message content — arguably the most
sensitive kind, being what someone was about to ask and thought better of. On a
shared cruise-terminal tablet a surviving draft is a privacy problem, not a
feature.

So it is a module-level store: it survives a client-side route change because the
module is not re-evaluated, and does not survive a reload because nothing was
written. Verified in a browser — `/about` → `/chat` via a real `Link` preserves it.
React state alone would not, since the provider unmounts on a route change.

### Rule 5 was being broken by the router, not by us

The browser check found `tsr-scroll-restoration-v1_3` in sessionStorage. TanStack
Router's `scrollRestoration: true` writes it.

A scroll offset is **not** message content, so this is not the leak the rule was
written to prevent. But the rule is narrow on purpose — _only_ `conversation_id`
may go there — and it is absolute, so scroll restoration is off. The cost is close
to zero: `/chat` and `/widget` never scroll at the document level (the transcript
scrolls inside a `dvh` flex column, which this could not restore anyway) and the
marketing pages are a screen long. One line to reverse if the team decides a
scroll offset is out of scope for rule 5. There is now a test asserting
sessionStorage holds nothing but `conversation_id`.

### The offline copy was making a promise the app broke

"Nothing you typed has been lost" — while the composer sat empty, because the
draft was cleared on send. The question _was_ recoverable via Retry, so nothing
was technically lost, but an empty box reads as exactly the loss the sentence
denies. A failed send now puts the question back in the composer, which also lets
someone edit a long question before retrying.

### Offline cannot be tested through MSW, and that is not a bug

With the service worker active, every request is answered locally, so a
browser-level offline switch is invisible to the app. Verified with
`VITE_ENABLE_MOCKS=false` instead, and both paths work:

- **Unreachable backend, `navigator.onLine === true`** → offline copy. This is the
  captive-portal case, and the reason the rejected-fetch signal is primary:
  `navigator.onLine` false is conclusive, true proves nothing.
- **Browser offline** → offline copy.

### The counter makes the 422 unreachable

Appears at 900, red at 1000, send disabled above it. `maxLength` is deliberately
_not_ set on the textarea: a hard truncate silently eats characters as they are
typed, which is more confusing than a visible count and a disabled button.
`VALIDATION_ERROR` copy exists, but if a human sees it the counter has a bug.

### Enter is different on a touch device, and it is not a detail

Physical keyboard: Enter sends, Shift+Enter newlines. Touch: **Enter newlines** and
the send button is the only way to send. On a phone the on-screen return key is
where you reach for a new line, there is no Shift, and every attempt at a second
sentence would fire off a half-finished question.

Detected with `(pointer: coarse)`, not a width breakpoint — a narrow desktop
window still has a real keyboard. Also guarded on `isComposing`, so an IME Enter
confirming a candidate does not send a half-typed word. Verified on an emulated
iPhone 13: `"line one\nline two"`.

### Health is an ops endpoint turned into an honesty feature

Polled every five minutes. Two levels, deliberately different in weight:
**degraded** is a dismissible warning with the phone number (a banner that cannot
be dismissed gets ignored rather than obeyed); **stale** is a quiet note giving the
last-verified date, because the information may be perfectly current and a date is
a fact to weigh, not an alarm. Neither shows `status`, `kb_rows` or any other
diagnostic.

Adding it gave the shells a hard dependency on `QueryClientProvider`, which broke
eleven existing tests that rendered a shell bare. Fixed with a `renderWithProviders`
helper rather than by making the component tolerate a missing provider — a missing
provider is a bug, and swallowing it would hide a real one later.

### The empty state has no robot and no AI badge

Asserted, including no `<img>` and no `<svg>`. A visitor standing on a pier does
not care what the thing is built from; they care whether they will make the last
ferry. A badge spends the most valuable space on screen saying something that
helps nobody.

---

## F007 — Wired to the real backend

**Date:** 2026-07-30
**Status:** Accepted

Both halves ran together for the first time. The integration script ends
**64 passed, 0 failed, 1 skipped** against a locally running backend, and
non-streaming chat works end to end in a browser.

### What the real backend actually did

Two behaviours differ from the assumptions this prompt was written against, and
both were found by running it rather than by reading it.

**1. The backend adopts a client-supplied `conversation_id`.** The brief says an
expired id "gets replaced with a fresh one". The code is
`payload.conversation_id or store.new_id()` — it takes any id you send and only
mints one when none arrives. Sending `00000000-0000-4000-8000-000000000000` gets
that same id back.

The client's rule — always overwrite the stored value with whatever comes back —
is unchanged and is currently a no-op. It stays because it is the behaviour that
survives the backend changing its mind, and because with more than one worker
history is best-effort anyway. Worth confirming with the backend team that
adopting an arbitrary id is intended; the client validates the stored value is a
UUID before sending, so it never contributes a malformed one.

**2. `/api/tts` 500s without an `OPENAI_API_KEY`.** Expected — it is the standing
project state — but the first version of the check reported it as a contract
failure. A check that cries wolf on a known condition gets ignored, so it now
distinguishes _provider unavailable_ from _wrong shape_ and reports it as a skip.
The first run also passed by accident on a warm TTS cache; it now sends a unique
string.

### The CORS lesson, confirmed the hard way

The browser check failed with no assistant message at all. The cause was CORS: the
dev server was on `:4350` and the backend's `ALLOWED_ORIGINS` defaults to
`http://localhost:5173`.

Worth recording precisely, because it is the intended trap:

- **The integration script passed while the browser failed.** Node does not
  enforce CORS. A green script proves the _shapes_ agree, not that a browser will
  accept the response. The script now says so at the top, and its first check is
  an origin preflight.
- **A CORS failure reaches the client as "You appear to be offline."** The browser
  refuses to tell JavaScript why a cross-origin request failed — the reason exists
  only in the console. For a _user_ that copy is right: they can act on neither
  cause. For a _developer_ it is actively misleading.

So `unreachable()` now logs a dev-only hint when the fetch failed while
`navigator.onLine` is true, naming CORS as the first suspect, naming the current
origin, and saying plainly that **the fix is in the backend** and that no fetch
option can change it.

### zod at the boundary, and a legible failure

`parseOrThrow` throws `SchemaMismatch` — deliberately not an `ApiError`, because
it is not a failure of the service. The server answered, with a 200, and the shape
was wrong; that is two halves drifting apart and it needs a different message and
a different place to look. The message names the field, the path and the expected
type, and points at `docs/api-contract.md`.

Schemas are **not** strict about extra keys. A backend adding a field is not a
reason to refuse an answer to someone standing at a ferry terminal. A missing or
wrong-typed field is a different matter and does fail.

### The retry policy, in one function

`shouldRetry` is used by the QueryClient defaults for both queries and mutations,
so there is one answer rather than one per call site.

- **Never a 429.** Retrying a rate limit is how you extend one: the window slides,
  the counter climbs, and the client trying hardest to recover is kept out
  longest. Same for a 503 carrying `Retry-After` — the server has said when to
  come back.
- **Never a 422.** The request was wrong and will be wrong again; the only result
  is two identical lines in the server log.
- **Never a `SchemaMismatch`.** Re-fetching returns the same wrong shape.
- Two attempts, not five: the backend already applies its own bounded retry with
  backoff, so an `UPSTREAM_*` code means it has genuinely failed.

### The content-type guard was untestable until it was made testable

Mutation-testing found this: deleting the guard did **not** fail the HTML-error-page
test, because `response.json()` throwing lands in the same fallback. The guard was
therefore real but unproven.

Two changes. The test now asserts `json()` is _never called_ on a non-JSON body,
and there is a second case the throw cannot cover — a `text/plain` body that is
valid JSON containing a filesystem path, which without the guard would be read as
ours and rendered. Both fail when the guard is removed.

### Measured limitation: a multipart body cannot be read under MSW-node

`request.text()` and `request.formData()` both hang on a `FormData` body in MSW's
Node interceptor. So the `audio` field name cannot be asserted through the network
in Vitest. It is checked against the real backend by the integration script
instead, which is the right place for it — a field name is exactly the kind of
thing only the real server can confirm.

### Non-streaming is a first-class path, not a fallback

`VITE_USE_STREAMING=false` switches the whole app to `POST /api/chat`. The
contract offers it deliberately: its text is fully verified before it is sent,
with unverifiable markers already stripped, so a surface where a briefly-visible
unverified marker is unacceptable should use it.

Verified in a browser against the real backend: answer rendered, `conversation_id`
stored and reused across turns, "Start again" clearing both the id and the
transcript, and `sessionStorage` holding exactly one key.

### Standing limitation, unchanged

There is still **no `OPENAI_API_KEY`**. The backend runs, every shape is verified,
and `/api/chat` returns a well-formed **no-answer refusal** — because retrieval
scores zero without embeddings and the short-circuit fires. So the integration is
proven; a real generated answer is not. Voice is skipped for the same reason.
