import { useEffect, useState } from 'react';

/**
 * The current time, as state that refreshes.
 *
 * Two reasons this exists rather than a `Date.now()` where it is needed.
 *
 * **Purity.** `Date.now()` called during render is an impure read: React may
 * render twice and get two answers, and the lint rule that flags it is right to.
 * Reading the clock is exactly the kind of external state a hook is for.
 *
 * **Correctness of the thing it feeds.** The activity feed says "12 minutes
 * ago". Without a tick that stays "12 minutes ago" for as long as the tab is
 * open, which is worse than showing no relative time at all — a stale relative
 * time is actively misleading in a way a stale absolute one is not.
 *
 * The default minute interval matches the coarsest thing the feed prints.
 * Anything faster re-renders a list to change nothing.
 */
export function useNow(intervalMs = 60_000): number {
  // Lazy initialiser: evaluated once, on mount, rather than on every render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
