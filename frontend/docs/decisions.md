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
