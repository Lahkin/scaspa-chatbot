import { useEffect, useState } from 'react';

/**
 * `value`, but only after it has stopped changing for `delayMs`.
 *
 * For search boxes whose term is part of a query key. Without it every keystroke
 * is a new key, a new request and a rate-limit slot — and `shouldRetry` is
 * shared with the chat path deliberately, so a field that fires per letter
 * spends the budget the user's next question needs.
 *
 * ## It is not what keeps the field focused
 *
 * Worth stating, because the two fixes landed together and the debounce looks
 * like the cure. It is not. The focus loss came from the screen swapping
 * `<OpsTable>` — which *contains* the toolbar and its input — for the skeleton
 * whenever `isPending` went true, and `placeholderData: keepPreviousData` is
 * what stops that. Debouncing alone would have reduced the remounts from one
 * per letter to one per pause, which is quieter and still wrong.
 *
 * ## The leading value is not delayed
 *
 * The first render returns `value` immediately, so a screen does not begin its
 * life waiting on a timer for a term that is empty anyway.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    // Cleared on every change, so the timer only fires once typing stops —
    // and on unmount, so a settled value is never written to a gone component.
    return () => clearTimeout(timer);
  }, [value, settled, delayMs]);

  return settled;
}
