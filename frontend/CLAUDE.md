# SCASPA Chatbot Frontend — Standing Rules

## Absolute rules
1. There are no WebSockets. Streaming is SSE over HTTP POST.
2. There is no auth and no session token. `conversation_id` is an ephemeral,
   non-credential UUID. Never send an Authorization header. Never set a cookie.
3. Never use `new EventSource(...)`. It cannot POST. Use fetch + ReadableStream.
4. Never call `dangerouslySetInnerHTML`. Markdown renders through react-markdown
   with raw HTML disabled. Do not add rehype-raw.
5. Never write message content to localStorage, sessionStorage or IndexedDB.
   Only `conversation_id` may go to sessionStorage.
6. Never render a citation the backend did not send in the `citations` payload.
   An unmatched inline marker is stripped, not guessed at.
7. Every fetch lives in lib/api.ts. No component calls fetch directly.
8. Every backend response is parsed through a zod schema before it reaches state.
9. Never link to, iframe or reference pay.scaspa.com.
10. Every interactive element is keyboard reachable with a visible focus ring.
    Every numeric table cell uses tabular-nums.

## Style
React function components, TypeScript strict, no `any`. Tailwind utilities from
design tokens only — no arbitrary hex values in className. Components under ~150
lines; split when they grow. Record significant decisions in docs/decisions.md.

## Before finishing any task
Run lint, `tsc --noEmit`, tests, and a production build. Add or update the entry in
routes/dev.gallery.tsx for any new component state.
