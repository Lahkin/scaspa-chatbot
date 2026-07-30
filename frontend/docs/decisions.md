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
