/**
 * SSE-over-POST engine: fetch + ReadableStream.
 *
 * Not implemented yet.
 *
 * `EventSource` is deliberately not used and must never be — CLAUDE.md rule 3.
 * It can only issue GET requests, and the chat endpoint is a POST with a JSON
 * body. The stream is therefore read manually from `response.body` and the
 * `event:` / `data:` frames parsed by hand.
 *
 * The lint config makes `new EventSource(...)` an error, so this is enforced
 * rather than remembered.
 */
export {};
