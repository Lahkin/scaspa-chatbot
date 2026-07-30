/**
 * The composer draft, preserved across a route change.
 *
 * ### Why this is a module-level store and not sessionStorage
 *
 * **CLAUDE.md rule 5: never write message content to localStorage, sessionStorage
 * or IndexedDB. Only `conversation_id` may go to sessionStorage.** A half-typed
 * question is message content — arguably the most sensitive kind, since it is what
 * someone was about to ask and then thought better of. On a shared cruise-terminal
 * tablet, a draft surviving in storage is a privacy problem, not a feature.
 *
 * So it lives in a module variable: it survives navigating to /about and back,
 * because the module is not re-evaluated, and it does not survive a reload or a
 * new tab, because nothing was written anywhere. That is exactly the scope the
 * requirement asks for.
 *
 * React state alone would not do it — `/chat` and `/about` are different routes,
 * so the provider unmounts and remounts and the draft would be gone.
 */

let draft = '';
const listeners = new Set<() => void>();

export function getDraft(): string {
  return draft;
}

export function setDraft(next: string): void {
  if (next === draft) return;
  draft = next;
  for (const listener of listeners) listener();
}

export function subscribeToDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Server snapshot for `useSyncExternalStore`. There is no draft before hydration. */
export function getDraftServerSnapshot(): string {
  return '';
}

/** Test seam — the store outlives a component, so a suite would leak between cases. */
export function resetDraft(): void {
  draft = '';
  for (const listener of listeners) listener();
}
