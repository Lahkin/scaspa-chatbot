import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** Server and pre-hydration default: motion is opt-out, not flashed off then on. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the user has asked their OS for reduced motion.
 *
 * The CSS media query in tokens.css already collapses durations, but that is not
 * enough on its own: a transition with a 0.01ms duration is still a transition
 * that fires, still schedules work, and still runs its callbacks. Anything that
 * animates in JS — a sheet sliding up, an auto-scroll, a typing indicator —
 * checks this and does the static thing instead.
 *
 * `useSyncExternalStore`, not `useState` + `useEffect`. matchMedia is an external
 * store, and reading it in an effect means rendering once with the wrong answer
 * and then again with the right one — a cascading render, and a visible flash of
 * the animation the user asked not to see.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
