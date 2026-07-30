/**
 * Stop a half-arrived citation marker from flashing on screen.
 *
 * ### The problem, precisely
 *
 * Tokens carry literal `[kb-014]` markers and a frame boundary can fall inside
 * one. The mock splits the first marker deliberately: one token ends
 * `...XCD 44.44 [kb-0` and the next begins `14].`. Rendered as they arrive, the
 * reader sees **`The fare is XCD 44.44 [kb-0`** for something between 20 and 40
 * milliseconds — long enough to be seen, short enough that nobody can explain
 * what they saw. It reads as a bug in the middle of the exact sentence the
 * product is asking to be trusted.
 *
 * ### The guard
 *
 * Hold back a short tail whenever the accumulated text ends with something that
 * *could* be the beginning of a marker. Release it the moment the next token
 * either completes the marker or proves it was never one.
 *
 * Two properties that matter:
 *
 * - **It is bounded.** At most `MAX_HELD` characters are ever withheld, so a
 *   stream of `[[[[[[` cannot stall the display. `[kb-0140]` is 9 characters, so
 *   12 leaves room without ever holding a visible amount of prose.
 * - **It is flushed unconditionally on `done`.** If the answer genuinely ends
 *   mid-marker — a truncated generation, a tool cap — the text still appears.
 *   Holding it forever would silently delete the end of an answer, which is worse
 *   than the flicker.
 */

/**
 * Matches a trailing fragment that could still become `[kb-…]`.
 *
 * `[`, `[k`, `[kb`, `[kb-`, `[kb-0`, `[kb-014` all match. `[kb-014]` does **not**
 * — the closing bracket completes it, so there is nothing left to wait for.
 * Neither does `[1`, because a marker's second character is always `k`.
 */
const PARTIAL_MARKER = /\[(?:k(?:b(?:-\d*)?)?)?$/;

/**
 * The longest fragment worth holding.
 *
 * A complete marker is 8 or 9 characters (`[kb-014]`, `[kb-0140]`). Twelve is
 * comfortably past that, and short enough that even a pathological hold is
 * invisible.
 */
export const MAX_HELD = 12;

export interface GuardedText {
  /** Safe to render now. */
  visible: string;
  /** Withheld until the next token resolves it. Never more than `MAX_HELD`. */
  held: string;
}

/**
 * Split accumulated answer text into what can be shown and what must wait.
 *
 * Operates on the **accumulated** text, not on a single token: a marker can span
 * more than two frames (`[`, `kb-`, `014]`), and only the accumulation knows
 * where it started.
 */
export function guardPartialMarker(text: string): GuardedText {
  if (text === '') return { visible: '', held: '' };

  // Only the last MAX_HELD characters can contain a partial marker, so the search
  // is bounded regardless of answer length.
  const window = text.slice(-MAX_HELD);
  const match = PARTIAL_MARKER.exec(window);
  if (!match) return { visible: text, held: '' };

  const heldLength = window.length - match.index;

  // A fragment longer than a marker cannot become one. Release it rather than
  // holding text the reader is waiting for.
  if (heldLength > MAX_HELD) return { visible: text, held: '' };

  return {
    visible: text.slice(0, text.length - heldLength),
    held: text.slice(text.length - heldLength),
  };
}
