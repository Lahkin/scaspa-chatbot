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

---

## F008 — The streaming client, rebuilt

**Date:** 2026-07-30
**Status:** Accepted

The highest-risk file in the frontend, split into three layers that fail
separately and are tested separately: `lib/sse.ts` (bytes to frames),
`features/chat/markerGuard.ts` (never show a half-arrived marker) and
`features/chat/reducer.ts` (a whole answer as replayable data).

### `@microsoft/fetch-event-source` was considered and not used

It supports POST, which is the reason `EventSource` is unusable — GET only, no
body. But the frame handling is the part that breaks, so it is written here where
it can be read and tested rather than trusted. `lib/sse.ts` is 160 lines and has
19 tests.

### A bug in my own reducer, found by the replay tests

`patchStreaming` finds the message by `state.streamingMessageId`. Every terminal
action — `DONE`, `ABORT`, `STREAM_ERROR`, `REQUEST_FAILED`, `FALLBACK_ANSWER` —
passed it a state object with that id **already nulled**, so the lookup failed and
the final patch was a **silent no-op**.

The visible consequence: the held tail was never flushed on `done`, so every
answer ending near a citation marker lost its last few characters, and `grounded`
/ `refusal` were never recorded. Nothing threw. It was caught within seconds of
writing the first replay test, which is precisely the argument for a pure reducer.
All five now patch first and clear second, and the helper says why.

### The marker guard

Tokens carry literal `[kb-014]` and the mock splits one deliberately. Without a
guard the reader sees `The fare is XCD 44.44 [kb-0` for 20–40ms — long enough to
notice, short enough that nobody can say what they saw, and in the middle of the
sentence the product is asking to be trusted.

Held-back tail, at most 12 characters, released the moment the next token
completes the marker or proves it was never one. Two properties that matter: it is
**bounded**, so a stream of `[[[[` cannot stall the display; and it is **flushed
unconditionally on `done`**, so a genuinely truncated answer still appears —
silently deleting the end of an answer is worse than the flicker.

**Verified in a browser**, not just in jsdom: the DOM was sampled every animation
frame through a whole answer — **139 frames, zero ending mid-marker, never a
broken `[kb-0`**.

### Cancellation does not rely on the read rejecting

Measured in F003 and still true: under MSW's Node interceptor an abort does not
reject a pending read. But this is not only a test concern — a reader part-way
through a buffered chunk keeps delivering what it already holds, so a user
pressing Stop would watch several more tokens arrive after they pressed it.

So the signal is checked at the top of each loop iteration and again after each
read. `reader.cancel()` is called in the `finally` (not awaited — under MSW-node it
never settles) because that is the half that reaches the backend, which explicitly
detects a live connection to decide whether to keep generating. A leaked reader
keeps burning tokens on an answer nobody is reading.

### Two deadlines, and a transparent fallback

`meta` is the first thing the server sends, so its absence means the stream never
started — usually a proxy buffering `text/event-stream`. That gets a short
6-second deadline because there is a working alternative and no reason to spend the
whole budget discovering it. Once `meta` arrives the deadline becomes
`VITE_STREAM_TIMEOUT_MS`, re-armed by every event.

On a stall — or on `NotAStream`, which is the same diagnosis arriving faster — the
same question is re-asked over `POST /api/chat`, transparently. **Measured:** with
a 2.5s timeout against the stalling mock, recovery took 3.35s and produced the
full 321-character answer rather than the two tokens that had stalled. Which path
answered is logged at `info`, because "the demo felt different on venue wifi" is
otherwise unanswerable.

### The content-type check distinguishes two very different problems

`application/json` means the backend returned an error envelope with a 200 —
parse it and throw a real `ApiError`. `text/html` means a proxy or captive portal
intercepted the request, and the body is somebody else's HTML that must never be
read or shown. Without the check both are fed to the frame parser, which finds no
`data:` lines and reports "an empty stream" — a symptom pointing nowhere near
either cause.

### Spec details that are not pedantry

Each of these is a real failure with a silent symptom, and each has a test:

- **One leading space stripped, not `trim()`.** Trimming eats meaningful leading
  whitespace inside a value.
- **Multi-line `data:` joined with `\n`.** Taking the last line truncates the
  payload.
- **`:` comments ignored.** Keepalives arrive exactly when a proxy would otherwise
  drop an idle connection — the worst possible moment to crash.
- **`\r\n` tolerated.** A proxy that rewrites line endings would otherwise make
  every frame boundary invisible and deliver the whole answer at once.
- **A malformed frame is skipped with a dev warning.** One bad frame costs one
  event; throwing costs the whole answer.
- **`TextDecoder` with `{ stream: true }`.** Tested with an em dash cut in half
  across a chunk: without it the answer renders `Basseterre ��� Charlestown`.

### Mutation-tested

Disabling the marker guard, parsing per chunk instead of buffering, using `trim()`
instead of stripping one space, and dropping the held tail on `done` each make a
test fail.

---

## F009 — Surviving a bad network, a stressed backend and a judge

**Date:** 2026-07-30
**Status:** Accepted

### The disabled button is not the guard

A double tap fires two `onClick`s in the same tick, before React has re-rendered
with `busy: true` — so a check against rendered state lets the second through.
**Mutation-tested: removing the in-flight ref produces two requests.** The disabled
button is the visible half; a ref, written synchronously, is the half that holds.

### Integration day found two real mismatches

**The backend emits `RATE_LIMITED` (429) and the contract does not document it.**
`app/errors.py` defines it distinctly from `UPSTREAM_RATE_LIMITED` (503, the model
provider throttling _us_) and only the latter reached the contract. The code
failed the frontend's zod enum, the envelope was rejected, and the generic
fallback message was rendered for a completely ordinary condition. The layer at
fault is the **contract**, so the frontend now accepts the code with its own
approved copy; filed as `backend-issues.md` #1.

**`Retry-After` is not exposed to cross-origin JavaScript.** It is not a
CORS-safelisted response header, and the backend's
`Access-Control-Expose-Headers` lists only `X-Request-ID`. Measured in a browser:
the server sent `Retry-After: 45` and the UI counted down from **30**, the
frontend's fallback. The countdown looked entirely normal while being a guess.

That one is a **backend** fix and is not worked around here — guessing a better
number would hide it. A dev-console warning now names the cause. It is also
**invisible to server-side testing**: `check:integration` reads the header without
trouble because Node does not enforce CORS, which is the F007 trap arriving from a
new direction.

### Slow 3G, measured

|         | first content | CLS    | overflow |
| ------- | ------------- | ------ | -------- |
| `/`     | 5.3s          | 0.0000 | none     |
| `/chat` | 6.2s          | 0.0000 | none     |

Zero layout shift is the number worth having: on a fast connection everything
arrives together and CLS is invisible, but on Slow 3G the CSS, font and JS land
seconds apart and content jumping under a thumb is how someone taps the wrong
thing.

`/chat` costs ~1s more than `/` because of the 75kB markdown chunk. **F004 deferred
that decision pending a measurement; this is the measurement, and the answer is to
leave it.** 6.2s clears the bar, deferring it risks a Suspense stall exactly when
the first token lands, and the real floor is the 97kB entry bundle rather than the
chunk. Splitting the vendor bundle is the change that would actually move it, and
that is a bigger one than this prompt should make. Recorded rather than done.

### The rate-limit path had to look deliberate

Several judges on one venue IP will trip a 15/minute limit, so this path fires in
the demo. The countdown is **on the Send button**, not beside a dismissed error: a
number in a panel with an enabled Send next to it is an invitation to make the
rate limit worse. Proven end to end against the live backend — real 429, button
reading "Wait 30s", ticking 30 → 28, disabled, composer still typable, no code or
status on screen.

The guard is enforced in the hook as well as the button, because the button can be
bypassed by a stale render or a keyboard Enter. That guard was **initially
untested** — a mutation removing it passed, because the disabled button masked it —
so a `renderHook` test now drives the hook directly and the mutation fails.

### The error boundary resets the chat, not just itself

Offering only "reload the page" is the common shape and wrong twice: a reload on
venue wifi is ten seconds of white, and it usually does not help, because the
state that caused the crash is frequently the conversation — and a reload restores
the `conversation_id` from sessionStorage and walks straight back into it. So
"Start a new conversation" clears the id and the draft before remounting. Reload
is offered second.

It is keyed on the pathname so navigating away from a crashed route clears the
boundary; otherwise the error screen follows the user to a page that works.

### The offline story promises nothing

Send is disabled; **the textarea is not**. Someone typing a question on a dead
connection should be able to finish the sentence, and losing a half-written
question to a dropped signal is the most annoying possible outcome. There is no
queue, no "will retry", no offline mode — asserted by a test that greps the
rendered text for those words. The assistant cannot function without the backend
and saying so beats a spinner that never resolves.

### Instrumentation that can be described truthfully

Time to first token, total latency, tool names and durations, and which transport
answered — to the **dev console only**, behind `import.meta.env.DEV`, so none of it
is in the production bundle. Nothing leaves the browser: no beacon, no cookie, no
fingerprint, no analytics dependency. Four tests assert that, including a grep of
every source file for cookie writes and analytics hostnames.

The answer's **length** is logged, never its text. That is what lets `privacy.tsx`
say truthfully that the frontend collects nothing, and it keeps the backend's
anonymised question log as the single sanctioned source if SCASPA later wants
usage insight.

### Two of my own test regexes matched prose, not code

`plausible` matched the English word in a fixture ("a plausible tariff"), and
`analytics` matched `telemetry.ts`'s own documentation explaining that it uses no
analytics. Both were tightened to hostnames and API calls. A test that fails on
its own explanation is a test people delete.

---

## F010 — Charts

**Date:** 2026-07-30
**Status:** Accepted

The model never draws a chart. It describes one, the backend validates every
figure in the specification against the text of the row it cites, and this renders
what survived. `ChartBlock` computes nothing, aggregates nothing and infers
nothing.

### ResponsiveContainer, and why the height is a token

The handbook's warning is right: the reason a chart is invisible is almost always
`ResponsiveContainer`. It measures its parent, and given `height="100%"` inside a
parent whose height is `auto`, the percentage resolves against nothing, the
container measures **zero**, and the chart renders at zero pixels — which looks
exactly like a failure to load.

The wrapper therefore has an **explicit height** from `--size-chart-h`, not a
percentage. It is a token rather than an arbitrary value specifically so nobody
later "tidies" it into `h-full` and reintroduces the bug.

**Verified at 320px first**, in a browser, because jsdom does no layout and would
report every chart as invisible whether or not it is:

| width | wrapper | svg     | ticks shown |
| ----- | ------- | ------- | ----------- |
| 320px | 220px   | 254×220 | 9 of 12     |
| 390px | 220px   | 324×220 | 11 of 12    |
| 768px | 300px   | 652×300 | all         |

### Three signals per series, not one

Colour, **stroke pattern**, and **marker shape or fill pattern**. Around one man in
twelve has a colour-vision deficiency, the leave-behind is printed in black and
white, and a projector in a bright room flattens the blue ramp into four greys.

Bars and areas use SVG `<pattern>` fills — solid, diagonal, dotted, cross-hatch —
because four translucent blues are four indistinguishable greys once colour is
gone. Lines use dash patterns and dot shapes. The first two styles are the most
distinct pair, since a two-series chart is the common case.

`--amber-board` is the single accent, used only for a highlighted series. It stays
a fill-and-dark-ground colour and never becomes text on a light surface.

### The caption is never truncated, and the source is a live chip

The backend refuses to emit a chart without a caption stating whether the figures
are official or illustrative. It renders at `text-small` rather than
`text-caption` — legible at arm's length on a phone, which caption-sized grey text
is not — and a test asserts it carries no `truncate` or `line-clamp`. A chart is
believed more readily than a sentence, so a chart whose provenance is clipped is
exactly the artefact that ends up in somebody's budget.

The source renders as a `CitationChip`, so the row behind the chart is one tap
away, plus screen-reader text so the id is announced even when the chip resolves
to nothing.

### A chart is data, so the data is always there

The data table is rendered **twice**: visually hidden, always, and visibly behind
a "View as table" toggle. The hidden copy is unconditional — a chart is data, and
the data must never be behind a button for someone who cannot see the drawing. The
visible copy is `aria-hidden`, or a screen reader reads the same table twice.

`aria-label` is computed from the numbers: what it measures, over what range,
which way it goes. A flat series is described as "unchanged" rather than as a
trend of size zero. Nothing is inferred and no adjective is used that the data
does not support.

**A missing point is a gap, not a zero** — in the rows Recharts gets (`null`,
`connectNulls={false}`) and in the table (an em dash). On a tonnage chart those
are very different claims.

### Charts are suppressed on an ungrounded answer

Same reasoning as the citation chips, and stronger: a chart is believed more
readily than a sentence, so drawing one from figures the backend could not verify
is the most emphatic possible version of the claim it has just declined to make.

### Recharts is lazy, and it is measured

`ChartCanvas` is the only module that imports Recharts and is reached only through
`React.lazy`. The result:

| chunk              | size  | gzip                |
| ------------------ | ----- | ------------------- |
| `ChartCanvas-*.js` | 403kB | 114kB               |
| entry              | —     | no recharts markers |

Two tests: one asserts the entry contains no Recharts markers, the other asserts
the chart chunk exists and contains them — without the second, deleting the chart
feature entirely would pass the first. The browser check confirms the chunk is not
fetched until a chart is actually needed, at every width.

**Slow 3G is unchanged**: 5249ms and 6239ms, against 5257ms and 6216ms before
Recharts existed. Adding a 400kB dependency cost the first paint nothing, which is
the whole point of the split.

Rollup did rebalance the other chunks — the entry grew 309→390kB while the
markdown chunk shrank 253→209kB. Checked rather than assumed: the entry's
sourcemap lists only router, query, zod, react-dom and `src`, and the markdown
pipeline is still in its own chunk. Same bytes, different distribution, loaded in
parallel, and the Slow 3G numbers confirm it cost nothing.

### Mobile decisions live in a pure module

`chartLayout.ts` imports no Recharts, so tick density, label shortening and the
horizontal-bar threshold are all testable in milliseconds. Months shorten to three
letters rather than rotating 45°; anything else truncates with an ellipsis rather
than being given an invented abbreviation. A bar chart with more than six
categories flips horizontal below 640px — measured from the **container**, not a
breakpoint, because the widget is 380px wide inside an iframe on a 1440px desktop
and has exactly the phone's problem.

---

## F011 — Voice

**Date:** 2026-07-30
**Status:** Accepted — with one gap stated plainly

Accessibility, not novelty. A passenger with a bag in one hand will talk to this
long before they type.

### The button is absent, not disabled, when it cannot work

`getUserMedia` exists only on HTTPS or `localhost`. Testing on a phone against a
laptop's LAN address — `http://192.168.x.x:5173`, the usual way — leaves
`mediaDevices` undefined and the microphone fails with **no prompt, no dialog and
nothing in the console**. It looks exactly like a bug in this code and is not.

So `detectVoiceCapability` resolves `isSecureContext`, `mediaDevices`,
`MediaRecorder` and format support before render, and the control renders
**nothing** when any of them fails, with a dev warning naming the cause and the
fix. A control that does nothing when tapped is worse than an absent one: the user
taps three times and concludes the product is broken. There is no layout hole
either — the composer's flex row simply has one fewer child.

### The format is negotiated, never assumed

`MediaRecorder.isTypeSupported` across a candidate list, in preference order,
every entry on the backend's whitelist. Chrome and Firefox take
`audio/webm;codecs=opus`; Safari falls through to `audio/mp4`. Sending something
off the list produces a clean 422 that reads exactly like a broken recorder and
costs an hour.

**Verified in two engines.** Chromium negotiates `audio/webm;codecs=opus`.
Playwright's WebKit was run with `isTypeSupported` narrowed to Safari's real
support and negotiated `audio/mp4` — the branch that matters.

⚠️ **Playwright's WebKit is not Safari here.** Its build _does_ support
`audio/webm`, which real Safari does not, so it cannot substitute for a device on
this specific question. The constraint was injected precisely because the default
would have tested the wrong branch and looked like a pass.

### The level meter is real audio, and that is the point

An `AnalyserNode` reading the actual stream, not a looping animation. **A fake
animation lies when the mic is muted**: the user sees confident movement, talks
for thirty seconds, gets nothing, and has no way to tell whether the fault was
theirs, the browser's or ours. A real meter that stays flat says "we are not
hearing you", which is the useful answer.

Measured in Chromium with a fake capture device: `0000000400000400000400000` —
all four bars tracking the device's periodic tone.

### Permission is asked on the tap, and only once

Never on load: a prompt on arrival arrives before any reason to trust the page and
gets denied _permanently_ for the origin. After a denial the control stops asking
for the session — the browser will not re-prompt anyway, so asking again only
wastes a tap — and the message says which browser control re-enables it.

### The transcript goes to the composer, never to the model

Hard rule from the backend spec, and the reason is one word: **"Nevis" versus
"never"**. A confident answer to a misheard question is both a bad experience and
a bad demo moment. Verified in a browser: the transcript lands in the box, focus
follows it, and nothing is sent.

### One audio element, and a bug the tests caught

Two answers talking over each other is a memorable failure and the _default_
outcome of giving each message its own player, so there is one element in a
module-level store and starting a playback stops the previous one. It is a store
rather than component state because a message can scroll out of the list while its
audio is still playing.

**Found by a test:** a TTS failure set `messageId: null` alongside the error, so no
speaker button matched it and the message was never displayed. The failure was
silent — which is the one thing a _contained_ failure must not be. The id is now
kept. Mutation-tested.

### iOS unlocking, which is the failure that only appears on stage

iOS Safari refuses programmatic playback not tied to a user gesture, and `play()`
rejects with `NotAllowedError` that nobody is watching for. TTS therefore works
through every round of desktop testing and does nothing on the presenter's iPhone.

An `AudioContext` is created and resumed inside the **first gesture anywhere in
the app**, capture-phase so a `stopPropagation` cannot swallow it, listeners
removing themselves afterwards. By the time anyone taps a speaker, the gesture
that unlocked audio was their tap on a suggested question.

### Failure is contained, by construction

Verified in a browser with the TTS-failure scenario: the error appears on the
speaker control, the answer text is byte-identical before and after, and the
composer stays usable. If the microphone fails mid-demo the presenter can carry on
without comment — which is a code property, not a presenting skill.

### ⚠️ What has NOT been verified

**No real iPhone.** The definition of done asks for "recording works in Chrome and
in Safari on a real iPhone". Chrome is fully verified end to end. iOS is verified
only as far as an emulated engine allows: WebKit renders the control, negotiates
`audio/mp4` under Safari's constraints, exposes `AudioContext`, and runs the text
path with no errors — but no recording was made on a real device, and the iOS
audio unlock has never faced the real restriction it exists for.

That is the single largest untested assumption in this feature and it needs ten
minutes with a phone on an HTTPS URL before anyone relies on it.

### Two test defects worth recording

A stub `AudioContext` written as `vi.fn(() => ({...}))` cannot be constructed —
`new (() => {})` throws — so `getAudioContext()` returned null and three unlock
tests failed for entirely the wrong reason. And a `await import('@/features/chat/draft')`
picked up a _fresh_ module instance because earlier tests in the file call
`vi.resetModules()`, so it wrote to a different store from the one the rendered
component was subscribed to.

---

## F012 — Finishing the product

**Date:** 2026-07-30
**Status:** Accepted — with two gaps named

### The landing page answers one question

"Will you make the last ferry?" — because that is what a visitor standing on a
pier actually wants to know. No stock gradient, no headline about the future of
AI, no robot. The hero shows a real answer _with a source under it_, because
seeing one does more for trust than any sentence claiming trustworthiness.

The example answer is static rather than a live call: the hero must not depend on
the backend being up, and a visitor who arrives to a spinner has already formed an
opinion. The figures are the obviously-placeholder fixture ones and the caption
says so.

The chips send the question on arrival, through an **in-memory** store rather than
a query string — a URL would put the question in history, in the address bar and
in every screenshot. A `useRef` guards StrictMode's double-invoked effect, or the
question would be asked twice in dev and once in production, which is the worst
kind of difference to debug.

The footer's "Information verified as of …" comes from the running backend's
`kb_updated_at`, not a build constant, and degrades to nothing when health is
unavailable.

### The streaming live-region bug, avoided and measured

Wrapping the transcript in `aria-live="polite"` announces its **entire** contents
on every change, and a streamed answer changes forty times a second. A
screen-reader user hears the answer restart from the beginning on every token and
never reaches the end of a sentence. It looks perfect in every visual test.

`AnswerAnnouncer` is a separate region holding only the newest **finished**
answer, derived rather than stored so it is stable throughout generation.
**Measured: one change across a full answer, carrying 304 characters.**

### A focus defect the audit found

Activating a citation chip was supposed to move focus into the source panel. It
did not — and the reason was a selector. `[data-kb-id]` matched the citation
**chip**, which carries the same attribute and comes first in the document, so the
code scrolled to and "focused" the element focus was already on, and reported
success. Now `li[data-kb-id]`: entries are list items, chips are buttons.

This is the second time a selector that matched the wrong element produced a
convincing false pass in this project. Both were found by asserting the _outcome_
(where is focus?) rather than the action.

### Escape did nothing inside the embedded widget

Found by the cross-browser check. `embed.js` listens for Escape on the **parent**
document, but once the panel opens focus is inside the iframe, so the parent never
sees the key. A keyboard user pressing the first key they would try had nothing
happen. The widget now listens for it itself and posts the close message —
skipped while the source sheet is open, since Escape there belongs to the sheet.

That test also surfaced a production trap worth knowing: if
`VITE_EMBED_ALLOWED_ORIGIN` does not match the site the snippet is pasted into,
the panel opens, the assistant works, and **the close button silently does
nothing** — the origin check refusing the message, correctly. It is in
`docs/embed.md` as a symptom to recognise.

### The performance budget, with numbers

|                   | measured        | budget         |
| ----------------- | --------------- | -------------- |
| Initial JS        | **119.5 kB gz** | 200 kB         |
| `embed.js`        | **2.84 kB gz**  | 3 kB           |
| Recharts in entry | no              | must be lazy   |
| Markdown in entry | no              | must be lazy   |
| Voice in entry    | no              | must be lazy   |
| MSW in entry      | no              | must be absent |

Wired into CI as a step that **fails the build**. A budget nobody enforces is a
preference. The negative checks matter as much as the number: without them,
deleting a feature would "improve" the budget.

Voice is route-lazy rather than component-lazy — it has no heavy dependency, so
the win is keeping it off the landing page, which the chat chunk already achieves.
Splitting the button itself would add a Suspense boundary to a control that should
simply be present.

### Cross-browser

Chromium, WebKit and Firefox, at 390 px and 1280 px, plus the embed snippet pasted
into a plain HTML page: landing renders, an answer streams, no horizontal
overflow, no page errors, launcher appears exactly once, `allow="microphone"` is
present, Escape closes, focus returns to the launcher. All three engines, all
green.

### ⚠️ Two gaps, named

**1. No physical iPhone.** The definition of done requires it, and it has not
happened. What _is_ verified: WebKit at an iPhone 13 profile keeps the composer
inside the viewport (the `100dvh` check), negotiates `audio/mp4` under Safari's
real format constraints, and renders with no overflow and no errors. What is
**not**: real `MediaRecorder` output, the real iOS audio-unlock restriction, real
safe-area insets, and the software keyboard. Four things this product depends on,
none of them confirmed on hardware. This needs twenty minutes with a phone on an
HTTPS URL and it is the single largest untested assumption in the frontend.

**2. Lighthouse did not run.** It hangs indefinitely in this environment on every
route and was killed with no output. axe-core — which is what Lighthouse runs
internally for accessibility, and a superset of its checks — did run: **zero
violations across five routes at two viewports**. Performance is covered by direct
measurement instead. Recorded in `docs/accessibility.md` rather than omitted.

### The drill is labelled, deliberately

`/dev/rehearsal` carries a visible amber "recorded, not live" banner that must not
be removed. Passing a replay off as a live answer is the one unrecoverable thing
to be caught doing in front of judges — and the audience already knows the wifi
has failed, so a labelled fallback reads as preparation rather than a cover-up.

It is dev-only, so the presenting machine must run `npm run dev`. That is a
deliberate trade: a recorded conversation on a public URL is a liability.

---

## F010 — The token file was replaced wholesale, and so were its tests

`tokens.css` opened by saying it was interim and would be "REPLACED WHOLESALE
WHEN THE DESIGNERS DELIVER". The design import is that delivery, and the product
went from a light theme to a dark one in one file.

**What made a sixty-file re-theme a one-file change.** Components reference
semantic aliases — `bg-surface`, `text-ink-muted`, `border-border` — rather than
ramp steps. Those names still read correctly in the new system, so they were
re-pointed instead of renamed: `--color-surface` now resolves to `#171A2B`
rather than white. The `ops-*` family, which used to be a second light palette
imported from a different design system, collapses into the same tokens; the
operations screens and the chat surface stop being two designs.

**The contrast test was rewritten, not adjusted.** It measured ink-on-white, an
amber that was a fill because it read 2.03:1 on white, and a brand blue that
vanished on navy. None of those pairings exists now. An assertion edited until
it passes has stopped being a check, so the file was replaced and the method
kept: parse the real token file, compute real ratios, assert the pairings the UI
actually puts on screen, and pin the numbers as well as the thresholds.

Two things it now catches that nothing else would:

- **The parser reads the `@theme` block, not the whole file.** `--color-border`
  and `--color-text-3` are re-declared under `prefers-contrast: more`. A
  whole-file scan takes the last declaration of each name, so every assertion
  would have measured the high-contrast palette, passed comfortably, and proved
  nothing about what almost everyone sees.
- **Three colours are asserted to FAIL**, on purpose, because each looks usable:
  `--color-critical` (4.42:1 — the enum hue, never its label), `--color-text-3`
  (3.74:1 — placeholder and disabled only), and `--color-brand-500` (1.82:1 — a
  fill; white goes on it).

### A defect in the spec, fixed rather than copied

The spec draws the "no feed" provenance badge as the family's near-black ink on
`#6E7490`. That measures **4.26:1** — under AA at 11px, and the spec's own
foundations board insists on "measured contrast, not claimed contrast".

Two ways out. Flipping that one badge to white ink clears it at 4.60:1 and costs
the family its single shared ink, which is most of what makes the badges read as
one family. Lifting the fill to `#7E84A0` keeps one ink everywhere and clears it
at 5.32:1 — and at luminance 0.252 it still sits below live, positive, caution
and critical, so it goes on reading as the muted one in a row of them.

The fill moved. The ink, the shape and the family did not. Recorded as
`--color-absent`, with the derivation next to it.

### Gradients are gone, not renamed

"Depth comes from surface lightness only. No drop shadows anywhere inside the
frame." The three navy gradients and the hairline glow were the light theme's
chrome; a lighter surface plus a 1px border does the same work. The tokens and
the utilities were deleted and `contrast.test.ts` asserts neither came back —
a gradient on a reading surface is the readability problem F-0025 existed to
prevent, since contrast against one changes down the paragraph.

`--shadow-card` is `none` rather than deleted, so `shadow-card` in a className
keeps compiling to a real rule instead of silently vanishing. The two floating
layers keep a shadow: a sheet and a popover are above the frame rather than
inside it, and on a dark ground there is no lighter step left to separate them.

### The one place the spec is not followed to the pixel

The spec draws input text at 14px. Mobile Safari zooms the viewport when a
focused input is under 16px and does not zoom back out, leaving someone
one-handed in a magnified layout — which is the exact reader this product is
for. Display text follows the spec at 14px; `input`, `textarea` and `select`
stay at 16px via a base-layer rule. It is a one-step difference nobody will see
and it is the difference between the composer working on a phone and not.

---

## F011 — Boards 16 to 22, and the three rules that shaped them

### Two emptinesses, told apart

Board 16's card keeps rendering at `total: 0` "so the meta strip is kept" —
dropping the block would silently lose the statement about where the emptiness
came from. But there are two emptinesses and they take different words:

- a feed that answered with **no rows** is a fact about today;
- a feed that is **not connected** is a fact about the service, and it is the
  production default.

Saying "nothing recorded for today" when no feed exists is a claim about the day
that nothing behind it supports. `EmptyBoard` keys on `source.kind`.

### Never invent an identifier

Board 16's airline avatar "falls back to an outline glyph when no code exists —
never to invented initials". Deriving `CH` from _Charter_ puts two letters that
look like an IATA code beside a flight number, in a product where a code means
something. The same rule is why the tariff table says "No source recorded"
rather than an em dash, and why the gate cell says "not reported" rather than
"TBD" — which sounds like the Authority has decided and is withholding.

### Only one notice in the product may be dismissed

Board 17: _"Only the live banner carries a dismiss control, and live is the one
kind that cannot currently occur. A notice that says the data is not real must
outlive the user's patience with it."_

So `SourceNotice` renders a close button for exactly one of its three kinds, and
`tests/matrix.test.tsx` holds the line from the other direction — a source scan
that fails if any component grows a way to hide a disclaimer, a caption or a
provenance notice. That guard needed its own self-test: the first version
matched the `text-caption` utility class and reported the dev gallery.

### The one empty state drawn in caution

Marine advisories, and nothing else. An empty list is **not** an all-clear:
"a quiet screen read as safety has physical consequences here" — someone decides
to sail. The panel is amber rather than grey, says what it does not know rather
than what is fine, and is asserted to contain no tick, no positive colour and
not the word "clear".

### Degraded is not a message

Board 20 splits the health banner in two. A missing index stops the **assistant**
and nothing else — vessels, flights and tariffs are a separate path with no
model, no embeddings and no index in it. A banner reading "the service is
degraded" would send someone away from three screens that would have answered
them.

---

## F013 — The foundations, and four values that compiled to nothing

The two entries above are numbered F010 and F011 and collide with the chart and
voice records of the same number. Left as they are rather than renumbered — a
decision record's number appears in commit messages and in code comments, and
moving one breaks every reference to it. This entry continues from the highest
number actually used.

### The radius scale had four of its nine values

`--radius-*` held panel, input, button and pill. The handoff names nine, and
each of the five missing ones had already been paid for somewhere: a segmented
control whose inner segment took the 10px button radius sits visibly wrong
inside a 12px track with 3px of padding, and only 9px keeps the two curves
concentric. A legend swatch at 10px is a lozenge; the handoff wants 3.

### Four utilities emitted no CSS at all, and this keeps happening

`w-sidebar` was the third instance of it and is documented above. This round
found a fourth, and it is the worst kind because the wrong thing still looked
deliberate:

> **`border-caution-edge` compiled to nothing**, so the pill fell back to
> `currentColor` — the right colour by accident on a caution pill and the wrong
> one on every other one.

The handoff draws a status pill as `1px solid <hue at 45%>` and a notice panel
as the same hue at 30–35%. No such token existed. They are declared now as solid
composites over surface-2 rather than as `rgba()`, for the same reason as the
12% tints: a contrast ratio cannot be computed against a translucent colour, so
an alpha border is a figure nobody has measured.

`tests/tokens-compile.test.ts` grew the new names — except the two notice edges,
which have no call site yet. Tailwind emits a utility only where the class
appears in source, so listing a correct-but-unused token would fail the test for
being right.

### The status pill was a fill and should have been an outline

"Outline pill with a leading dot. Sits in table cells by the hundred, so it must
not shout." Every variant carried a 12% fill. Exactly one is supposed to —
`urgent`, where the fill is the difference between an advisory a reader scrolls
past and one they stop at. A filled pill competes with the provenance badge
beside it, and provenance has to win: **a wrong status is a mistake and a wrong
source is a lie.**

### The seal had no plate at the size the handoff plates it

`LogoLockup` declined to draw the badge below 32px, reasoning that a circular
seal with an aircraft over a ship turns to mud at 24. The handoff's smallest
pairing **is** 24-inside-32, and it is required: "never use it without the plate
at any size". The two pairings are now an enum — 32-in-40 for the sidebar,
24-in-32 for the widget, the 404 and the mobile header — so a caller cannot
invent a third. The tagline prop went with it: the lockup is the seal and the
string `SCASPA Assistant`, and the strapline is a sentence about SCASPA that
belongs in the About panel's own prose.

### Four glyphs were drawn twice

`panel`, `copy`, `microphone` and `headset` each had their frame transcribed
**both** as a square-cornered `<path>` and as a rounded `<rect>`, and `Icon`
renders both lists. At 16px a sharp corner poking out from under a rounded one
reads as a rendering fault rather than as a glyph. Eleven glyphs the sprite has
and this set lacked were added at the same time — attach, edit, thumb, table,
file, waveform, play, pause, map, dollar, plus — each of them a control the
handoff specifies and none of which could be drawn before.

---

## F014 — Three places the handoff was not followed to the letter, and why

Two of them are the handoff disagreeing with itself, and the third is it
disagreeing with a project document. All three are recorded rather than quietly
resolved, because a silent deviation is indistinguishable from a mistake.

### 1. `--text-3` on a label a user is expected to read

§5.3 is unambiguous: `text-3` is "**Placeholders and disabled only** — never
body copy", at 3.74:1 on surface-2. §2.1 then sets the sidebar's group label,
its search glyph and the demonstration profile's second line in `--text-3`.
§7 calls the 4.5:1 requirement non-negotiable.

The requirement outranks the individual value, so every one of those labels is
`--text-2`. `--text-3` survives where it is genuinely a placeholder — the search
field's own placeholder text — and on the collapse glyph, where the 3:1 non-text
bar applies. This is the same shape as the `--color-absent` derivation recorded
in the entry two above: the handoff's own measured-contrast rule is used to
settle a case its value table gets wrong.

### 2. `volatility: null` — the one place following the handoff LOWERS a caution

`docs/api-contract.md` said "treat an absent or unrecognised value as `high`".
The handoff says, twice, that null renders as **`medium`** — "changes often",
never static, never low — with an extra ring so a reviewer can see the fallback
fired.

The handoff wins, and the contract paragraph was rewritten to match rather than
left contradicting the code. What protects the reader is unchanged:
`needsConfirmation` is true for `medium` as well as `high`, so a row with no
volatility on record still carries the confirm-before-you-rely-on-it line. And
the ring is a stronger signal than the word it replaced — it says the value was
_supplied_ rather than measured, which "check before use" never did.

**This is the only change in the whole pass that moves a safety signal down a
rung, and it is flagged here so that a reviewer who disagrees can find it.**

### 3. The recorded-questions fade is a mask, not a gradient

§2.1 draws it as `linear-gradient(to bottom, rgba(23,26,43,0), #171A2B 82%)`.
It ships as a `mask-image` instead. Same picture, and it keeps two other rules
intact: nothing is recoloured, so "no gradients inside the frame" survives, and
an alpha mask cannot swallow a click on the row beneath it the way an
absolutely-positioned overlay can.

---

## F015 — Boards 00a to 15, reverified line by line

Nothing was accepted because it already existed. Every board was re-read against
its handoff section and its screenshot before being touched, including the ones
an earlier pass had recorded as done — and several of those turned out to be the
ones with the most drift, because "implemented" had been recorded from the prose
without the board beside it.

### The board that disagrees with its own screenshot

**Board 07.** §1.2 Family B writes the status pill as `background: transparent —
or the 12% tint where noted`, and notes a background on exactly one variant.
Read alone, every other pill is a transparent outline, and the previous pass
implemented it that way.

The board draws them all filled, and its own ANATOMY panel states the rule
without the qualifier: _"26px tall · 12px side padding · full pill / 7px dot ·
7px gap · 12/16 medium label / **fill at 12%** · dot and label at full
strength."_

**Reported rather than resolved by preference.** What ships is the intersection:
the 45% edge the prose specifies and the 12% fill the board draws. Neither
document shows a pill with an edge and no fill, so nothing there is invented.
`absent` stays unfilled under both readings — a fill would make an absence look
like a value.

### Four things that were drawn but not wired

- **No streaming cursor at all.** §3.5 specifies `8px × 16px`, `--brand-200`,
  `vertical-align: -3px`. Without it a stream that paused mid-answer looked
  identical to one that had finished. Gated on `useReducedMotion`, per §7.
- **The composer was a field and a button**, not the handoff's single box. §3.2
  draws one container holding the field and the control row; the send control
  read as belonging to the page rather than to the question. It is now a 34px
  circle that is _blocked, never hidden_ — the first line of the board — and the
  edge carries states 2 to 4.
- **The counter appeared at 900 characters.** The board draws `42/1000` in the
  ordinary typing state. A counter that appears at 900 arrives as a warning to
  someone who never knew a cap existed.
- **The source list was a different design.** §3.7's chip is a title, a
  volatility badge, a verified-date badge, a snippet in quotes and a meta line.
  What was there escalated by volatility into an amber panel with a phone
  number. The instinct was right and the vocabulary was not the product's: a
  reader who has learnt that a filled uppercase pill means provenance should not
  have to learn a second language in the source list.

### The one that was a permanent alarm

`DataSourceCard` drew `unavailable` as a solid red dot reading "Data
unavailable". §5.4 is explicit — _"a feed that was never connected is a known
state, not a failure … copy for this state is 'No feed connected', never
'Error'"_ — and it is the **production default**, so what that card says is what
every user sees on every visit. A red alarm that is always on is how a warning
stops being read. It is now a hollow neutral ring.

### Two systematic errors the token file had been hiding

`rounded-md` aliases `--radius-input` at 12px, so **every button in the product**
was two pixels rounder than the 10px §1.3 gives it. And `min-h-touch` at every
width made inputs, primary buttons and icon buttons taller than the 40/36/28 the
handoff draws — the 44px minimum belongs at ≤640px, which is what §7 actually
says. Both are now `h-11 sm:h-<designed>`.

### Additions removed, and the standard applied to all of them

A per-turn timestamp, a permanent "Enter to send, Shift + Enter" caption, a
footer link on the location card, a noun in the pagination readout, and
"Estimated" in front of the quote's total. Each was defensible on its own and
none is drawn by the handoff. The timestamp is the one worth naming: a clock
beside every turn is the strongest possible hint that the transcript is a thread
being kept, in a product whose greeting exists to stop that expectation forming.

### The contrast rule keeps overruling the value table, and that is not drift

§5.3 says `--text-3` is "placeholders and disabled only" at 3.74:1; §7 calls the
4.5:1 requirement non-negotiable; and §2.1, §2.7 and §3.7 then set readable
labels in `--text-3` anyway. The requirement wins each time, exactly as it did
for `--color-absent`. Where the token is genuinely on a glyph — the ghost icon
button at rest, the search placeholder — it stays, because the 3:1 non-text bar
is what applies there, and `tests/contrast.test.ts` now names that exemption
rather than pattern-matching it.

---

## F016 — Closing boards 00 to 15, and how the board 07 conflict was settled

### The conflict, and how it was adjudicated

The question asked was not "which treatment appears more often" but **"does
board 07 define a different component or a special state, or is it simply
inconsistent?"** Four checks against the exported source, and all four say
inconsistent:

1. **It defines no distinct component.** Both boards' chips are
   `inline-flex; gap:7px; height:26px; padding:0 12px; border-radius:999px`
   wrapping a 7px dot and a `500 12px/16px` label. Identical markup. Board 07
   introduces no new element, no modifier class and no second geometry — only
   the container's fill and edge differ.
2. **Same surface.** Both boards' panels are `#171A2B`. Nothing about the ground
   could justify a different treatment.
3. **No label, note or metadata declares a special state.** Board 07's subtitle
   is "The full enumerations, including the values today's fixtures never
   produce" — a claim about COVERAGE — and its two section headings are
   "Anatomy" and "Why unknown is drawn, not guessed". Nothing reads "shown
   filled", "in context", "on a light surface" or "alternative".
4. **It is a subset of what board 00c already draws.** 00c's "Operational family
   — 5 enums" renders all twenty variants (Vessel 5, Flight 6, Gate 4, Severity
   3, Health 2); board 07 re-draws nine of them with explanatory captions. It
   adds explanation, not treatment.

It also diverges on **three unrelated axes plus a label**, which is drift rather
than design: hued chips filled instead of outlined, `departed`/`scheduled`
gaining a `#1E2137` fill, the absent chip dashed in `--border` instead of
`--text-3`, and the vessel `unknown` chip labelled "Unknown" where §1.2, §5.4
and board 00c all say "not reported". A deliberate variant would be coherent.

**Board 00c is canonical and nothing was changed to accommodate board 07.** The
inconsistency is documented here and guarded by five assertions in
`tests/boards.test.tsx`, so reading board 07 on its own cannot quietly flip the
family back.

Two of our own variants had already drifted toward board 07 and were corrected
in the process: `settled` carried a `--surface-3` ground it should not have, and
the absent chip's dash was `ink-subtle` (text-2) rather than `--text-3`.

### The supporting count

§1.2 Family B writes the status pill as an outline — `border: 1px solid <hue at
45%>`, `background: transparent`, "or the 12% tint where noted", noted on one
variant. Board 07 draws every chip **filled and borderless**, and its anatomy
panel says "fill at 12%" with no qualifier.

README §4 sets the tie-break — "where this document and the file disagree, the
file wins" — which appeared to hand it to board 07. Counting every pill in the
source says otherwise, because the disagreement is not prose-versus-file. It is
**one board against the rest of the same file**:

| Where                              | Outline | Filled |
| ---------------------------------- | ------- | ------ |
| board 00c — the badge-family board | 18      | 0      |
| in context — 00b, 14, 17, 20       | 12      | 0      |
| board 07 — the enumeration         | 0       | 7      |

And §5.12, which is board 07's own prose, opens **"Full spec in
`01-foundations.md` §1.2. Anatomy, for the record"** and restores the qualifier
the panel dropped: "fill at 12% **(where used)**". Board 07 is a restatement
that defers to §1.2, and it is the outlier on three counts at once — it also
draws the absent chip's dash in `--border` where §1.2 and board 00c both use
`--text-3`, and labels it "Unknown" where §1.2 and §5.4 both say "not reported".

**Recommendation, and what shipped: the outline.** A filled pill also breaks the
hierarchy the whole badge system exists to hold — provenance is the loud family
because "a wrong status is a mistake and a wrong source is a lie", and a filled
status pill competes with the provenance badge beside it in every table row.
The 12% fill survives where the handoff notes it: `urgent`, and the "Not priced"
line in a tariff quote.

### Two things that were not blocked and had been treated as though they were

**The replace handler.** §3.5 says the superseded tokens are struck through with
"Rewriting with the published figures…" beneath them, and **"do not silently
swap the text"**. The `replace` event has been on the wire and in the reducer
the whole time — and the reducer discarded the accumulated text, which is the
exact thing the sentence forbids. The draft is now kept on `superseded`, drawn
struck through for the rest of the stream, and cleared on `done` where the
settled correction notice takes over. The struck text is `aria-hidden`: reading
a discarded draft aloud word by word would announce the very figures the backend
had just refused to stand behind.

**The grounding indicator.** §3.8's four states are derived from the same
reconciliation pass that numbers the chips, so the badge and the chips cannot
disagree about which markers matched. `partial` is the state only reconciliation
can know — a single `grounded` boolean flattens it.

### The diagnostics panel, and the one row that IS blocked

§3.14 has three rows. Two are available and shipped: `latency_ms` off the
response for "Answer time" — what the **server** measured, because a stopwatch
started in the browser would include the reader's own network — and
`index.kb_rows` for "Records searched", rendering "unknown" and never `0`.

The third is **blocked on a named dependency**: `tracked_clients` is computed by
`backend/app/ratelimit.py` but returned only from `/admin/stats`, behind the
administrator secret. This panel sits beside an ordinary answer. The row is
built and gated on the field, per `08-blocked-and-forbidden.md`, and its
footnote travels with it because the footnote exists to qualify that one figure.

### Three of the eight error envelopes were wrong or missing

- **404 carried the 500 copy** — "Something went wrong … that is our problem,
  not yours" — which §3.11 forbids by name: "Never a generic 'something went
  wrong' for a code that knows better." It now reads "Page not found", byte
  identical to `NotFound`'s own wording, because §2.8 ships one 404.
- **422 was generic.** §3.11 requires it to name "the field and the actual limit
  it hit". It names the 1,000-character cap.
- **400 had no copy at all** and fell through to `INTERNAL`. `ErrorCode` is the
  wire contract and has no 400, so `BAD_REQUEST` is a client-side kind alongside
  `OFFLINE`, reached from the status only when the body did not classify itself.

### The speak button was three emoji

🔊, ⏸ and ■ — and no icon rule can govern an emoji, which the platform renders
in its own font at its own colour, so "waveform in `--text-3`" was not
expressible. All seven states of §3.13 now draw real sprite glyphs, including
**voice off**, which used to render nothing at all. A control that vanishes is
one the user has to remember existed.

---

## F017 — Board 16, and the shared provenance card it forced

### The card the handoff asked for twice

Implementation requirement #2: "Make the provenance card a single shared
component. Meta strip, mandatory notice, body slot, optional footer link. **Every
operations block on every screen is an instance of it.** This is what stops the
rule eroding over time." It did not exist. Each block drew its own box, and the
rule had already eroded: the inline cards had a `<h3>` title where the meta strip
belongs, a 12px radius instead of 16, and `--surface-3` where the handoff says
`--surface-2`.

`ProvenanceCard` now takes `source` as a **required** prop with no way to
suppress the strip, so a caller cannot render operations data without saying
where it came from — the type system refuses. There is no `dismissible` prop
either; the one notice in the product that may be dismissed is the `live`
banner, which is a different component precisely so this one cannot grow the
control by accident.

### The chart data table broke two rules at once

§4.3: "a real equivalent, not a fallback. Always in the DOM … **do not hide it
behind a toggle that defaults to off**." §7.7: "do not `aria-hidden` the chart
and duplicate it, and do not hide the table behind a toggle."

It rendered the table **three times**: an `sr-only` copy, a toggle defaulting to
closed, and an `aria-hidden` visible copy behind it. Now: one table, visible,
always. A sighted reader who cannot judge a shallow slope on a projector gets the
figures without hunting for a control, and nobody hears the same numbers twice.

### Two cards were carrying figures the assistant chose

§4.6 is unambiguous — the calculator card "**carries no figures at all — not
even a prefilled quantity** … a prefilled quantity would read as a quote the
Authority had made". It was a working calculator with a units field defaulting
to **1**, a storage-days field and an inline total. The placeholders are now
drawn and inert, and the button goes to the real calculator.

§4.7's ticket card is a subject field and a way out. It was the entire enquiry
form, submitting inline and rendering its own receipt — and the real form has a
4000-character details field and a transcript checkbox whose consequence line is
load-bearing (§6.5), none of which fits or belongs inside a chat turn.

### The chart's meta strip is blocked, and is not fabricated

§4 opens: "Every block in this chapter is an operations payload, so every one
carries a meta strip", and the board draws the chart card with a SAMPLE DATA
strip reading `Vessel calls fixture · as of 06:10 AST`.

`ChartSpec` carries `source: string` — a single `kb-xxx` citation — and **no
`DataSource`**. A citation is not a provenance record: no kind, no label, no
`as_of`, no notice. Composing one here would be inventing the exact claim the
strip exists to make truthfully, so the card, title, plot, table and caption are
all built and the strip is not.

**Waiting on:** `source: DataSource` on `ChartSpec`. When it lands the figure
becomes a `ProvenanceCard` and nothing else changes.

---

## F018 — Board 17, and a screen that had no table on it

### The Vessels screen was a card list at every width

§5.1 requires real `<table>` semantics; §5.8 puts the card treatment **below
640px only**. `/vessels` rendered `VesselCard` in a `<ul>` at every width, so
nothing above the rows said what the values were — a screen-reader user got six
unlabelled strings per vessel, and a sighted one got no column to scan down.

It also had three metric tiles that were not the handoff's four, no status
filter, no density toggle and no pagination.

Both screens are now built on `OpsTable`, which carries §5.1's primitives in one
place: the 16px container, the 12px/20px toolbar, the 11px eyebrow column heads,
44px/36px rows, the hairline dividers and the `--surface-3` hover. Row height,
hairline weight and hover fill all derive from the sidebar's nav row, which is
what makes six dense tables read as the same product as the chat.

Both the table and the card list are rendered, with CSS choosing. A width read
in JavaScript is wrong on first paint, wrong after a rotation until the listener
fires, and wrong in every print stylesheet.

### `VesselCard` and `FlightCard` are deleted, not left lying about

The rebuild left both with no callers. A dead component with passing tests is
worse than no component: it reads as covered. The **rules** they carried are now
asserted against the cells that carry them — `EstimatedTime`, `ActualTime`,
`FlightTime`, `GateCell`.

### The metric tile, and the most dangerous default in the product

> "Rendering 0 in the occupancy tile would say the port is empty. **That is the
> single most dangerous default in the product.**"

The null handling was already right and stays right. What was wrong was
everything around it: an uppercase letter-spaced label (the 11px eyebrow, which
§5.3 does not use here), a 24px value where the handoff says `600 30/38`, a 12px
radius, and the whole tile drawn in the legacy `ops-*` aliases from the
operations screens' second palette. The handoff has one palette.

The second line is now "not reported" — §5.3's own words — rather than "Not
reported by this source".

### Two figures that are derived, and why that is not a recount

§9.5 forbids deriving a count **from the visible rows**. "Alongside of expected"
is `vessels_at_berth / (vessels_at_berth + arrivals_next_24h)` — arithmetic on
two server figures, which is what produces the board's own `4 / 11` — and it
renders `—` if either operand is null, because half a ratio is a stronger claim
than none.

The status filter is applied in the client because the endpoint takes no status
parameter, and `total` therefore stays the **server's** figure. A recount there
would drop to zero under a filter and lie.

### The tile the handoff labels and the wire does not quite carry

"Expected today" reads `arrivals_next_24h` — a rolling 24-hour window rather
than a calendar day. The label is the handoff's shipping string and the field is
the nearest figure on the wire; the mismatch is small, real, and recorded rather
than hidden. It is the one item on this board that would be closed by a backend
field (`arrivals_today` on `VesselMetrics`) rather than by client work.

### Times were being written in the browser's own format

`SourceNotice`'s stamp was `toLocaleString()`, which on a US-configured browser
renders `8/1/2026, 6:10:00 AM` — a 12-hour clock with no zone, on a banner read
by agents who work in AST whatever their laptop is set to. §10 fixes the form:
24-hour with the zone. Same correction as `DataSourceCard`'s.

---

## F019 — Board 17 re-verified, and the components that were right on screens that were not

F018 built board 17's components and every one of them was tested. This pass
rendered the **screens**, and found eight deviations that the component tests
could not see — because no test had ever mounted `/vessels` or `/flights`.

That is the finding behind all the others. `tests/operations.test.tsx` now renders
both routes through the real route tree.

### The banner said it twice

`OpsPage` renders §5.2's source notice for every operations screen — "far more
reliable when it is the shell's job than when it is each page's", which is right.
Both screens then rendered a second one as their first child, so the same
provenance badge, the same sentence and the same timestamp appeared twice in a
row above the tiles.

§5.2 draws one. A warning shown twice is a warning being used as decoration, and
this is the one warning on the screen that carries the whole product's honesty
claim. The duplicates are gone; the shell's stays.

### The status filter filtered the page, not the table

The route said, in a comment, that "the endpoint takes no status parameter". It
does — `GET /api/vessels?status=`, applied by `filter_vessels`, with `total`
counted after it — and `VesselQuery.status` was already in the client's own API
module.

Filtering in the client filtered the twenty-five rows of the **current page**
while the readout went on reading `Showing 1–25 of 100`. A status with two
matches on page 3 looked like a status with none, and the pagination underneath
described a result set that no longer existed. Both filters now go to the server
and `total` comes back matching them, which is what §9.5 asks for in the first
place: the count is the server's, and nothing is recounted from the rows.

The mock handler ignored `status` too, which is what let the client-side filter
look correct in development.

### A rate limit was being rendered as an empty filter result

`vessels` is `[]` on **any** failure, so a 429 and a 500 both fell through to
"No movements match these filters" — an offer to clear filters the reader may
never have set, over data that was never fetched.

§5.7 draws the rate limit its own card and `RateLimitedState` had been built to
it — with no caller. §7.1 gives every other code the shared envelope, "so the
same event never gets two treatments across screens". Both now go through one
`TableError`, so the third operations screen does not have to re-derive which
failures are special.

The 429 card also **counts down and hands the button back at zero**, which is
§1.3's retry control. A frozen `Refresh in 0:18` says the wait ends in eighteen
seconds and then never says anything again, so the reader reloads to find out.
When `Retry-After` is absent there is no countdown at all rather than a default:
a made-up wait is a made-up number, and §7.2 allows exactly one figure here.

### The flights tiles were the wrong three, and one of them was wrong

§5.3: "**Flights — three tiles**: Arrivals today · Departures today · Delayed."

`FlightMetrics` carries `total_flights`, `on_time_percent`, `gates_active` and
`gates_total`. **None of them is one of those three.** The screen rendered
`total_flights` under the label "Arrivals today" and relabelled the same figure
"Departures today" when the direction toggle flipped — and `total_flights` counts
the whole feed in both directions, so on the sample feed it read **4 arrivals
where there are 3**.

A wrong number under the handoff's label is worse than the handoff's label with
no number, and §5.3 already draws the second: "any null takes the em-dash
treatment". So the three tiles are the three the handoff names, each gated on its
own field, each reading `—` and "not reported" until the wire carries it. The two
figures that were standing in are gate and punctuality statistics, which the
handoff puts on the Console (§6.7–6.13).

This is the same shape as F018's "Expected today", and the opposite conclusion,
for a reason worth writing down: `arrivals_next_24h` is the same _quantity_ as
"expected today" over a slightly different window, so it is an approximation.
`total_flights` is a different quantity that includes departures, so under
"Arrivals today" it is not an approximation but a wrong answer.

### §5.6's advisory panel existed and no screen rendered it

`OperationalAdvisoryPanel` had no callers at all — the same dead-component state
that got `VesselCard` and `FlightCard` deleted in F018. `FlightSchedulesResponse`
carries `advisory`, so the panel is now on the flights screen.

**Its caution fill is gated on attribution.** §5.6: "Always attributed to whoever
published it, with a time", and the fill is what claims a named authority
published this — drawing it over unattributed text is the panel implying the
forecast is ours, which is the one thing the section exists to prevent.
`OperationalAdvisory` carries no publisher and no time, so the panel renders in
§5.6's neutral fill until `published_by` and `published_at` land. Absent stays
absent: no empty container in that position.

### The table cells were writing the browser's own clock

F018 fixed `toLocaleString()` in the source banner. `TimeCell` — the ETA, ATA,
gate and revised-time cells that board 17 is actually _about_ — was still calling
`toLocaleTimeString([], …)`, which renders **`06:40 AM`** on a US-configured
browser, in a column §5.4 draws as `06:40`, underneath a banner that says
`as of 06:10 AST`. Same correction, same constant as `CardBlock`'s row clock.

`SourceAge` was the third instance and sits directly above the banner, so the two
were writing the same instant in two formats on every operations screen.

### Three measurements that were not the handoff's

- **The density toggle is 26px.** §5.1 says so and the exported spec draws the
  track at 10px with 8px segments and a 12/16 label; ours was board 00d's 32px
  form control. `Segmented` has a size now, because §4.5 draws the card's
  direction toggle the same way — one control, two rows it can sit in.
- **The vessels columns are `1.5fr 0.9fr 0.8fr 1fr 1fr 1fr`.** The table laid out
  automatically, so it sized its columns from whatever text happened to be in
  them: the same table drew differently on page 1 and page 2, and a reader
  scanning the ETA column lost it every time they paged.
- **Three tiles do not go in a four-column grid.** `MetricRow` was fixed at four,
  so the flights screen drew a quarter of its row empty.

### The skeleton ignored the density toggle

§7.5: "Rows keep their **real** height (44px/36px)." Switching to compact and
refetching moved every row twice — once as the skeleton drew tall, once as the
real rows came back short. "No layout shift in any loading state" is the rule
being kept.

### The flights no-feed state told a passenger to ring the harbour

`NoFeedState` took a noun and nothing else, so §5.7's vessel copy — "Telephone
**Marine Operations** on 869 465 8121" — was what an empty arrivals board said.
The department is a prop now, and flights name Airport Operations. Both are on
§1.4's published department list; neither is invented, and the switchboard number
is the same either way.

### The toolbar control never grew for a thumb

`Segmented` was the one control in the product with no touch treatment — 32px at
every width, and 26px once §5.1's size was applied. §7 is not ambiguous: "Touch
targets are 44px minimum … at ≤640px they grow to 44px", and F013 already made
`Button`, `Input`, `IconButton` and `Textarea` `h-11 sm:h-<designed>` for exactly
this. It now does the same, so the density and direction toggles are 44px on a
phone and the handoff's 26px above 640.

`npm run check:responsive` named it at 320 and 390. That harness is otherwise
stricter than the handoff — it applies the 44px floor at every width, so it flags
the 34px suggestion chips and 36px toolbar select the handoff draws — but this
one was a real failure at a real breakpoint.

### And one thing the tests changed back

The route-level tests were briefly written against `export function VesselsRoute`.
The router plugin cannot code-split a route file's extra exports, and both screens
silently folded into the entry chunk — 433 kB became 469 kB. The tests go through
the real route tree instead. **A test harness does not get to change what ships.**

---

## F020 — Board 18, and a date that printed a day early

`/tariffs` was the pre-handoff screen throughout: a navy-headed zebra table with
an amber rate column borrowed from a departure board, one cargo calculator, and
a quote rendered as a four-column spreadsheet. All of it in the legacy `ops-*`
palette. §5.9 to §5.11 draw something else, in two steps.

### A verification date that was a day early for every reader in the Caribbean

`TariffRow.as_of` is a **plain date** — "ISO date the rate was verified". The
cell printed it raw (`Checked 2026-01-01`), so the first fix was §10's dense-row
form, `1 Jan 2026`. That is when the real defect appeared: a date-only string
parses as **UTC midnight**, so formatting it in the reader's own zone moves it
back a day anywhere west of Greenwich. `2026-01-01` rendered as
**`Checked 31 Dec 2025`** in AST — the zone this port is in, and the zone nearly
every reader of this table is in.

The formatter is pinned to UTC. A verification date is not an instant and has no
zone to convert to; it is the same day everywhere. `DataSource.as_of` in the meta
strip above it is the opposite case — a real moment, correctly shown in the
reader's zone with the zone named — and the two now say so in their own comments,
because the difference is invisible and the failure is silent.

### The table had no meta strip at all

An operations payload rendering with no statement of where it came from, which
the definition of done forbids outright: "No operations payload renders anywhere
without a meta strip." It is a `ProvenanceCard` now, like every other operations
block, which also gives it the mandatory sample-data notice it never had.

`OpsTable` grew a `bare` prop for this — the primitives (column heads, 44px rows,
hairlines, hover, the ≤640px row cards) stay in one component while the card
chrome comes from `ProvenanceCard`. Drawing both would be a card inside a card.

### The rate is printed, not computed

§5.9: "Rendered exactly as published — `186.00 per container`, `0.42`,
`37.50 per day`. No rounding, no conversion, no normalised unit column."

`toFixed(2)` would round a rate published to three decimal places, so the figure
goes through `Intl.NumberFormat` with a **minimum** of two fraction digits and no
maximum. The basis stays in the cell with the amount: "per container" is part of
the published rate, not metadata about it, and a tidy unit column would be a
different claim.

### The source cell, and a link with nowhere to go — BLOCKED

§5.9 draws a citation link labelled with the source's title, beside a
verified-date badge. `TariffRow` carries `kb_id` and nothing else: **no title to
label it with, and no route in this product that renders a knowledge-base row.**

"Never a link to nowhere" is the rule the `kb_id: null` case exists to keep, and
a `--brand-200` label with no destination breaks it from the other side — it
looks clickable. So a sourced row names the feed in ordinary text and carries the
badge, which is real; the link ships unchanged the day the row carries a title
and a href. Every fixture row is `kb_id: null` today, so what is actually on
screen is "No source recorded", which is the honest answer.

### The verified-date badge says what kind of date it is

Board 18 draws the badge reading `1 APR 2026`. §1.2 gives the same badge the
label `CHECKED 1 APR 2026`, and the export itself renders it that way **twice
elsewhere** — including in the same compact 20px form board 18 uses. One board
against the rest of the file is the shape §4.1 already adjudicated, and the word
does real work here: a bare date beside a source, in a column headed SOURCE,
reads just as easily as the rate's effective date, which is a different and
materially important fact.

### Two calculators, and the one that did not exist

There was one cargo form. §5.10 draws two, "deliberately unlike each other …
a user must never fill in the wrong one by muscle memory" — and the wire has
supported both all along: `TariffQuoteRequest` carries `vessel_type`,
`length_ft`, `stay_days`, `container_size`, `units` and `storage_days`, with
exactly the ranges §5.10 prints (0–2000, 0–365, 0–10,000).

The surfaces swap all the way down, including the inner field backgrounds, so
the two never read as one form with two halves.

**Vessel type is BLOCKED and drawn disabled.** `build_quote` never reads it — the
maritime lines are dockage (length × stay), pilotage and harbour dues, none of
which varies by type — and no list of vessel types is published anywhere in the
handoff or the API. Inventing four would be inventing SCASPA's tariff structure.
An enabled select that changed nothing would be the product implying a rule it
does not apply, so the control is drawn, disabled, and carries a note saying what
the estimate actually uses.

**Currency is a fixed label, not a select**, per §5.10 and §1.4's ninth input:
`--canvas`, 1px dashed, not focusable, with the inline note. The API validates
`XCD` and refuses anything else, because converting a published fee applies a
rate of exchange nobody published — with more authority than a sentence.

### The quote was a spreadsheet, and its disclaimer was drawn in red

Four failures in one component:

- **No meta strip.** It is a `ProvenanceCard` now, with the `CALCULATED` badge
  **beside** the source-kind badge rather than instead of it. A quote worked out
  from sample rates is both derived and sample data, and dropping the second to
  make room for the first hides the more important of the two.
- **`XCD` on every figure.** §10: "Currency is `XCD 9,288.00` in totals, bare
  `9,288.00` in line items under an XCD-labelled total." Repeating it is how a
  breakdown starts reading like an invoice.
- **The disclaimer sat on `--color-ops-alert-fill`** — a full-strength critical
  fill with near-black ink. §5.11 draws it in `--caution-fill` with `--text-1`.
  The single most important string on the screen was styled as an error.
- **The incomplete-quote banner sat below the total it contradicts.** §5.11 puts
  it **above**: a warning under a figure is read after the figure has been
  believed, which is the whole failure it exists to prevent.

The zero-line variant keeps its meta strip, where the board draws a plain card.
The definition of done is unconditional, and a quote worked out from sample rates
is still worked out from sample rates when it comes to nothing.

**The unpriced line's charge name is BLOCKED.** §5.11 draws the row with the
charge's own label ("Berthage") above the code. `TariffQuote.unpriced` is
`list[str]` — codes and nothing else — and by definition the code is absent from
the tariff table, so there is no row to read a name from either. The code stands
in until the wire carries a name.

### The toolbar disappeared on the click that used it

§5.9 puts the search box and the category chips **inside** the table's card. A
filter change is a new `queryKey`, so it is a new query with no data and
`isPending` is genuinely true — which dropped the whole card to the skeleton and
took the control the user was operating with it. The chips vanished on the click
that selected one.

`placeholderData: keepPreviousData` on `useTariffs`. The previous rows stay until
the new ones arrive, which is also the honest picture: they are rates, just not
yet the filtered ones.

This is the same defect as the open item recorded against the vessels and flights
tables, met from a different direction. It is fixed here because the control that
vanishes is one this board draws; the other two screens are board 17's and still
carry it.

### And the screen said "sample data" twice

`OpsPage` renders §5.2's screen banner for the tables that have no meta strip of
their own — vessels and flights. Every payload on this screen has one, so passing
the source to the shell as well put the same sentence on screen twice, one line
above the card that was already saying it. The shell no longer gets it.

---

## F021 — Board 19, and four finished components nobody could reach

The support screen was the pre-handoff design in the legacy `ops-*` palette: the
emergency notice as a red paragraph, locations as unstyled list items, no privacy
notice, no transcript control, and a receipt that was a heading and two rows.

**Every component §6.1–6.6 asks for already existed.** `EmergencyStrip` was built
to §6.1 exactly. `ContactCard` had been verified against board 08. `EnquiryReceipt`
had been verified against board 11. `ContactPointRow` handled all five kinds.
**None of the four had a caller outside its own tests** — the route imported none
of them.

That is the third pass in a row where the components were right and the screen
was not, and the reason is always the same: the suite renders components.

### The row the two boards draw differently

§6.2 writes each contact row as "16px glyph `--brand-300` (3px top offset) + a
**label/value stack**" and gives both label styles. Board 08 draws exactly that —
`Telephone` above `+1 869 465 8121`. **Board 19's five location cards draw the
value alone**, with no label.

Kept the label, on the evidence and on what it carries:

- §6.2's prose specifies it, with measurements, for two row kinds.
- Board 08 renders it that way; board 19's five cards are the only instances
  without.
- The label is the **feed's** word, not the kind's. Four of the five locations
  send `"Via SCASPA"` — a fact about how to reach a terminal with no line of its
  own, which the phone glyph cannot carry and which board 19's own example data
  never had to show, because its five cards each have a number of their own.

Board 19 omits a label that would have read "Telephone" five times. That is not a
different component.

### The telephone is a link, not a 44px button

Both boards draw the contact row's number as `500 14/22 --brand-200` tabular
text. `ContactCard` was rendering `TapToCall` — §1.3's 44px bordered control,
which the handoff uses in the escalation block — so every contact row was a
button where the handoff draws a link, and the card grew its own row markup to
fit it.

The rows are `ContactPointRow` now, in one place, drawn as specified. The anchor
takes `min-h-touch` below 640px and nothing above it, per §7: the type is exactly
what §6.2 gives, and the hit area grows on touch like every other control. It
also carries `aria-label="<label> — call <number>"`, because a link announced as
seven digits gives a screen-reader user no idea what pressing it does. WCAG 2.5.3
is satisfied — the accessible name contains the visible text.

### "never `--critical-fill`/`--critical-text`" is a treatment, not a prohibition

§6.3's state-tag line reads: "populated `--positive-fill`/`--positive`, TODO and
not-populated `--caution-fill`/`--caution`, never `--critical-fill`/
`--critical-text`." Read as a prohibition, the extension row has no tag colour at
all.

The export settles it: the extension row's tag is `rgba(217,86,75,0.12)` with
`#E4736A` and reads **"Never"**. The sentence lists three treatments, and the
third is named for the row it belongs to.

### The row types that will never be populated are drawn now

`08-blocked-and-forbidden.md` #7: "Draw the row types. None is populated." The
component returned `null` for a valueless row — correct for a screen, and it
meant the email, extension and web rows existed in a `Record` of glyph names and
nowhere else. Three row types with no rendering are three row types nobody has
looked at.

`ContactPointCatalogue` draws all five with their state tags. It is not a screen
component: nothing in the product renders an unpopulated row and the wire never
sends one. It exists in the gallery and in the tests, which is what the blocked
list asks for.

The email glyph was `receipt` — the tariff calculator's mark. §6.3's table says
**file**.

### The status row, and a sentence that reads two ways

§6.2: "`status: ""` is **always empty** on every location. Design the card so the
absent status collapses cleanly — **there is no status row in the shipping markup
at all**, and no code path that renders an empty one."

The first clause forbids the row; the second forbids rendering an _empty_ one. The
board's own annotation is the narrower: `status: "" — element not rendered`.

Kept the narrow reading. It satisfies the wide one for the data that exists —
`status` has never been non-empty, so nothing renders — while still saying
something if a feed ever fills it, and it keeps a guard that already had a test.
Deleting the path would have cost a regression test and bought nothing.

### The transcript, and the difference between two facts

§6.5: "**The UI reflects the response, not the request.** … The box shows what
the server did. A tick that means 'we tried' is a lie."

The form had no transcript control at all, and the receipt reported
`transcript_included` as a `Conversation attached: Yes/No` detail row — which is
neither of §6.5's two drawn renderings, and is not among §6.6's three rows
(Department · Telephone · Sent).

Now: the form offers §1.4's checkbox with its consequence line, **and only when
this session has a conversation to attach** — a tick that would attach nothing is
the same lie from the other end. The receipt draws §6.5's two states from
`transcript_included`, and renders nothing at all when the transcript was never
requested. There is no third rendering on the board, and "you did not ask for
this" is not news.

### The receipt's timestamp, for the third time

`sentAt.toLocaleString()` renders `8/1/2026, 2:32:00 PM` on a US-configured
browser — on a receipt whose entire purpose is to be quoted down a telephone.
Same correction as F018's banner and F019's table cells: 24-hour, with the zone.

The copy button was 36px at every width; §6.6 gives it 44px at ≤640px.

### Both fields show their cap

§6.5 caps the subject at 200 and the details at 4000, and §1.4 draws a counter on
each. Subject had `maxLength` and no counter — a field that silently refuses the
201st character and explains nothing — and Details had neither. `Textarea` now
takes the same `counter` prop `Input` has, with the same at-limit treatment, so a
form carrying both fields does not show the cap two ways.

### What the wire publishes, and what the handoff draws

Two data differences, recorded rather than papered over. Neither is a client
defect: rendering the handoff's values instead of the feed's would be this client
inventing SCASPA's published contact details.

- **§6.2's five locations** are Deep Water Port, Port Zante, R. L. Bradshaw,
  Vance W. Amory and Charlestown, with **five distinct telephone numbers**. The
  feed sends five different names, all on the switchboard number, four with no
  address. The count matches and the empty-address collapse is exercised by four
  of them.
- **§1.4's seven departments** are Marine Operations, Airport Operations, Cargo
  and Warehousing, Finance and Billing, Security, Cruise and Port Zante, General
  enquiries. The backend publishes seven different names. `department` is free
  text on the wire, so sending the handoff's would be accepted — and would route
  a ticket to a department nobody handles.

---

## F022 — Board 20, the panels that existed twice, and the screen that is not built

### Two marine advisory panels, with two different empty states

The one empty state in the product where a wrong sentence has physical
consequences — a skipper reading it decides whether to sail — **shipped in two
implementations with two different sentences**:

| Where                                 | Empty state                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `console/SidePanels` (on the console) | "No notice has been published to this assistant. That is not a statement that conditions are safe — this assistant does not carry official marine warnings…" in a neutral panel |
| `ops/AdvisoryPanel` (no caller)       | §6.9's copy, in `--caution-fill`, **missing the telephone number**                                                                                                              |

§6.9 is explicit: "**No notice has been published to this assistant.** That is
not confirmation that conditions are normal. Telephone Marine Operations on
869 465 8121 before sailing", in the only empty state the product draws in
caution rather than neutral.

There is one panel now, it is the one the handoff draws, and it carries the
number — "telephone Marine Operations" without one is advice a reader cannot act
on from the screen they are looking at. The "Not an official notice to mariners"
footnote is kept from the panel that was deleted: §6.9 does not draw it, and a
populated list is exactly where a reader might mistake this for the official
notice.

The console's copies of the position map and the gate panel went the same way,
and the components are **deleted** rather than left behind — a dead component
with passing tests reads as covered, which is what got `VesselCard` deleted on
board 17. Their tests were rewritten against the components that carry the rules
now, not dropped.

### The console printed a prediction and a record in one column

Flagged on board 17 and owned by this one: `/ops/vessels` had a single
**"Arrival"** column printing whichever of `ata` and `eta` existed, with
`Actual` / `Estimated` captioned beneath the figure.

Global rule 2: "**ETA and ATA are visually distinct.** … One is a prediction, one
is a record; that distinction is the entire point of having two fields." A
caption under a figure is read after the figure has been believed, and it is the
first thing lost when a column is narrow. Two columns, drawn by `EstimatedTime`
and `ActualTime` — the components that already existed for exactly this.

### "Chunks" was showing a different quantity

§6.12's index panel lists Documents · Chunks · Built · Version. `IndexStatus`
carries `kb_rows` and `web_docs`, and **`web_docs` is not chunks** — it counts
web documents, which under this label reads as a chunk count. The first build of
the panel wired it anyway and the screen printed "Chunks 0", which is worse than
nothing: §6.12's whole rule is "**Every field reads 'unknown', never 0**. Zero
documents is a fact about an index that was built; this index has not reported at
all."

Chunks is blocked and reads `unknown`. Same class of error as board 17's
`total_flights` under "Arrivals today", caught this time before it shipped.

### Health: three states, and only one of them existed

§6.11 draws ok, degraded-search and degraded-voice. `shells/HealthBanner` drew
one — a dismissible bar over the chat when the index is missing — and no voice
state at all, though `VITE_ENABLE_VOICE` is a client-side switch and needs no
field from the server.

`ops/HealthPanel` is the console's, with all three. The chat banner is left
alone: it interrupts a conversation only when something is wrong, and a
permanent green "all parts of the service are responding" bar over a chat is
furniture. The `ok` state renders where "is everything up?" is the question the
reader came with.

### The operator profile card was two emoji and a legacy palette

§6.10 draws a 32px circle with an anchor glyph, the name, the `DEMO ONLY` badge
and a 2×2 legend of active × verified. The screen drew 👤 in a 48px circle, two
sentence-long "sample" chips and four read-only fields the section does not have,
all in the `ops-*` aliases. Board 00 already removed emoji from the speak button
for the reason that applies here too: no icon rule can govern an emoji.

`profile: null` returns **nothing** from the card — "the card is not rendered, no
placeholder, no 'sign in' prompt, no silhouette avatar" — and that null case
lives in the component rather than at the call site, because a caller that
forgets is a caller that ships a silhouette.

### §6.13's admin screen is NOT built, and here is why

**This is a conflict between the handoff and this project's own standing rules,
and it is recorded rather than resolved by preference.**

§6.13 draws a secret gate ("Administrator key", a 38px field of mono dots, a
Continue button), a models panel and a config summary. `GET /admin/stats` exists,
takes `X-Admin-Secret`, and returns everything the panels need — including
`tracked_clients`, which is _not_ blocked behind that header.

Against it:

- **`frontend/CLAUDE.md` rule 2**, first sentence: "**There is no auth and no
  session token.**" Building the gate puts an operator credential into a browser
  SPA and holds it in memory to authorise fetches. That is a security decision
  about how SCASPA's operator secret is handled, not a UI gap.
- **§2.8 makes not building it a designed, shipping-valid state.** Its three
  states are A (present, authenticated), B (present, unauthenticated → the
  ordinary 404) and **C (absent → the ordinary 404, and no entry point
  anywhere)**. The product is in State C today, board 04 already ships the 404 it
  requires, and `08-blocked-and-forbidden.md` requires `/admin/stats`
  unauthenticated and `/adnim` to be byte-identical — which they are, because
  neither exists in the client.

**Recommendation, for whoever owns the security decision:** if the gate is
wanted, the secret must never be persisted (rule 5 permits two storage keys and
this is neither), the route must be reachable only by typing the address (no nav
item, no link, no sidebar search result), and a wrong key must return the
ordinary 404 rather than an error — all three of which §6.13 and §2.8 already
specify. Until that decision is made, State C is not a gap; it is one of the
three states the handoff draws.

**§6.14's spend panels are blocked with it.** `SpendSummary` was verified against
§6.14 on board 10 and has no caller, because the only source of spend figures is
`/admin/stats` — behind the secret. It is left built and unreachable rather than
fed invented figures.

### The grid on the position plot is a pattern, not a gradient

§6.7 draws the empty plot with two `linear-gradient`s at `32px 32px` — 1px grid
lines. The product's rule is "no gradients inside the frame", and this is the
same class of exception as the recorded-questions fade that ships as a mask:
nothing shades. Every pixel is either `--surface-2` or the plot ground.

The plot's ground is the one place the export and the prose disagree: §6.7 says
`--canvas`, the export draws `#10121F` (`--surface-1`). One instance each, no
tiebreaker, so README §4's rule applies — **the file wins** — and it is raised
here. It is the opposite call from the currency label (§4.6), where _two_ doc
sections agreed against one export instance.

---

## F023 — Board 21, and three emoji in the one control that has to work one-handed

### The record button drew emoji, and none of its six states

🎙, ■ and ✕, on a `rounded-md` box that turned **red** while recording. §6.15
draws a 44px circle with six states, and the listening fill is `--brand-500`.

No icon rule can govern an emoji — the platform renders it in its own font at
its own colour — so "mic in `--text-2`" was not expressible, and the hover,
permission-denied and voice-off treatments could not exist at all. Exactly the
correction board 15 made to the speak button, on the control that matters most
to the reader this product is for: a passenger with a phone in one hand and a
bag in the other, or a driver at the cargo gate with the engine running.

All six now: idle, hover, recording with `Recording 0:12`, the caution fill from
45 seconds with the elapsed clock **inside the button** and `7 seconds left`
beside it, the permission-denied treatment with §6.15's message, and voice off.

The captions sit **beside** the button rather than beneath it. §6.15 draws them
stacked because that is how a swatch grid is laid out; the composer's control row
is horizontal, and §3.2 does not enumerate that row while recording.

### The eight-state transcription panel had no caller

`TranscriptionResult` was built to §6.16 — every state, every real limit — and
**nothing rendered it**. The button showed two sentences of its own instead:
"Nothing was heard" and "That could not be transcribed. Please type your question
instead."

So the screen never said what §6.16 exists to say. "That recording is 26.4 MB.
The limit is 20 MB" tells someone what to do; "that could not be transcribed"
tells them they failed. The fourth dead component this project has found, after
`VesselCard`, `FlightCard` and the four on board 19.

The measured figures are carried through rather than the status code alone: the
blob's own size for the 413, and the recorder's cap for the duration 422. The
API answers both "wrong container" and "too long" with a 422, so the two are told
apart before a sentence is chosen.

### Voice off is drawn; a browser that cannot record still renders nothing

Two different causes, and only one of them is a state:

- **`disabled`** — the deployment switched voice off. §6.15 draws it as a dashed
  outline, inert. A control that vanishes is one the user has to remember
  existed. Board 15 already made this call for the speak button.
- **anything else** — `getUserMedia` undefined on plain HTTP, no recorder, no
  supported format. Nothing is drawn: "a control that does nothing when tapped is
  worse than an absent one; the user tries three times and concludes the product
  is broken."

The test asserting an empty container for _both_ was updated to assert the drawn
state for the first. The second still pins the empty container.

### Paused looked exactly like never-started

`SpeechStatus` has had `paused` all along and `SpeakButton` mapped it to `idle`,
so a paused answer drew the resting waveform while its own label read "Resume
reading this answer". §6.17 draws Paused — `1px solid --brand-500`, play
`--brand-200` — and that is what it draws now.

A control that says one thing and draws another is the failure both §3.13 and
§6.17 are arranged against.

### §3.13 and §6.17 describe one control two ways

|         | §3.13 (chat chapter)      | §6.17 (voice chapter)                            |
| ------- | ------------------------- | ------------------------------------------------ |
| Size    | 28–32px ghost icon button | 36px circle                                      |
| At rest | waveform `--text-3`       | play `--text-2`                                  |
| States  | 7, no paused, no finished | 9, incl. paused, finished and three cache states |

**§3.13 governs the message-row control**: it is the chapter describing the
control in its context, and §1.3's "ghost icon button (message actions)" is 28px
with `speak` last in its row order — two sections agreeing against one. §6.17's
**paused** is taken because it is a state, not a size, and the store already had
it.

**The three cache states are not placed.** The signal exists — the backend sends
`X-TTS-Cache: hit|miss`, lists it in `EXPOSED_HEADERS`, and 304s on a matching
ETag — so this is not a wire gap. But "Cached · instant" is a diagnostic caption,
and the only surface for one is the operator screen §6.13 draws, which is not
built (see the progress doc's §4.10). Recorded rather than pinned onto a control
in a conversation.

**Finished** is not built either: the speech store resets to idle when playback
ends, and §3.13 — the section that governs this control — does not draw a
finished state.

### §6.18's speech preview is admin only

`padding: 12px 14px; --surface-3`, a 28px `--brand-500` circle, "Preview the
voice" and an `ADMIN ONLY` tag. It belongs to the operator screen, blocked with
§6.13 for the reason recorded in §4.10 — not built, not approximated, and not
placed somewhere it does not belong.

---

## F024 — Board 22, and three events that were being answered twice

`07-feedback-and-states.md` is the only chapter that is entirely cross-cutting,
and its first line is the whole board:

> "One grid, so the same event never gets two treatments across screens. **Build
> these as shared components and reference them everywhere; do not re-solve
> 'empty table' per screen.**"

So this was a verification pass, not a build. It found three events with two
treatments each, and two states with none.

### The advisory empty state was written twice, and the softer one was on a screen

The one empty state in this product a reader can act on **to their harm**: a
skipper who reads it decides whether to sail.

| Where                         | What it said                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ops/AdvisoryPanel` (console) | §6.9's: "No notice has been published to this assistant. That is not confirmation that conditions are normal. Telephone Marine Operations on 869-465-8121 before sailing", in `--caution-fill` |
| `/profile`'s "System updates" | "No notices have been published to this assistant. That is not a statement that there is nothing to know — it means nothing has been sent here", in neutral                                    |

The second is not wrong, exactly — it is softer, in a quieter colour, and it does
not give the number. §7.4 marks this the **only** empty state drawn in caution
rather than neutral, and §6.9 spends a paragraph on why. `/profile` renders the
one panel now.

### Every error was followed by a re-typed escalation block

§7.1: "**Every error is followed by the escalation block**
(`03-chat.md` §3.10)." `EscalationBlock`'s own docstring says the same thing from
the other side: "one component used by every refusal and every error, rather than
the same three lines re-typed in five places where they would drift."

`ErrorState` re-typed them — its own panel, its own heading ("Reach SCASPA
directly"), the three phone lines and the postal address inline. `NoAnswerCard`
and `StepLimitCard` used the shared one. Three renderings of one dead end.

### A table loading looked two different ways

§7.5: "Skeleton table — **column headers stay so the shape is stable.** Rows keep
their real height." That is `TableSkeleton`, and the vessels, flights and tariffs
screens use it.

The **console** screens drew three blank 96px cards with no headings instead —
the treatment §7.5 exists to replace, because a table that dissolves entirely and
reappears has moved every column twice and the reader re-finds the one they were
reading each time. `OpsListState` takes the headings now and hands them to the
one skeleton.

### The error envelope had no status and no fills

§7.1 gives the shell — "code at `600 12px/20px` tabular in the leading slot",
`--caution-fill` for 4xx and `--critical-fill` for 5xx — and §3.11 gives the code
its colour. **Two sections agreeing**, and §6.16's transcription rows have drawn
their codes (`422`, `413`, `429`, `503`) since board 21. The chat's envelope drew
every failure in one neutral panel with no code at all, so a 422 the reader could
fix and a 500 that is ours read as the same event.

This overturned a documented decision — `errorCopy.ts` opened "never an error
code" — and the file says why it changed: a three-digit number beside a plain
sentence is what a caller reads out to the switchboard, and `UPSTREAM_TIMEOUT` is
what nobody can. The `request_id`, the stack and the internal code name are still
dev-console only.

### The copy toast did not exist

§7.6 draws it and §7.3 does not list it, which is the tell that it is a
confirmation rather than a notice: `padding 12px 16px`, a 20px `--positive-fill`
tile with a 12px check, "Copied to the clipboard". The receipt's copy button
announced itself to a screen reader and to nobody else — and a copy is the one
action in this product with **no visible result**, because the clipboard is
invisible. Without it the reader presses the button, sees the page do nothing,
and presses it again.

It appears with the originating button's `Copied` state, which §1.3 had already
built and §7.6 requires to be simultaneous.

### The one loading state with nothing to produce it

§7.5's fifth is "**Progressive rows** — `12 of 25 loaded`". Nothing in this
product loads rows progressively: every list is paged with `limit`/`offset` and
arrives whole, and the chat's inline cards cap at three with §4.4's `Showing 3 of
12`, which is a count row rather than a loading state.

So it is **not built** — not blocked on a field, and not approximated. A
component with no caller is what this project has deleted four times (`VesselCard`,
`FlightCard`, the console's three panels, and the ones board 19 found), and the
right time to build this one is when an endpoint streams.

### What was already right

§7.2's three copies were correct in all three places and share one module —
"Send again in 0:42", "Record again in 0:26", "Refresh in 0:18" — and there is no
remaining-quota figure anywhere, which §7.2 and `08` both forbid. §7.3's six
mandatory notices each have exactly one home and `tests/matrix.test.tsx` already
proved none can be dismissed. §7.7's announcer is checked by the a11y harness's
two manual checks on every run.

The board's own rule is now a **source scan** in `tests/matrix.test.tsx`: the
advisory sentence, the escalation block and the skeleton each have to resolve to
one file. It is a scan rather than a component test because the failure is
invisible in any single component — each copy is correct on its own screen, and
only reading two screens together shows the same event answered twice.
