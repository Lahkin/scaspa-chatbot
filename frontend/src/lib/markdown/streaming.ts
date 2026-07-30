/**
 * Making markdown safe to parse *while it is still arriving*.
 *
 * The problem is specific. Tokens arrive mid-construct, and markdown parsed
 * mid-construct is not "slightly incomplete" — it is a different document. A
 * table whose header separator has not arrived yet is a paragraph of pipe
 * characters. Two rows later it becomes a table. The reader watches text turn
 * into a grid, and a half-open code fence swallows the rest of the answer into a
 * code block until the closing fence lands.
 *
 * So this splits the accumulated text into:
 *   - `stable`   — everything up to the last point where the document is
 *                  syntactically closed. Safe to hand to the markdown parser.
 *   - `tail`     — the unterminated remainder, rendered as **plain text**.
 *
 * The tail still appears on screen the instant it arrives — nothing is hidden,
 * which matters because latency is the thing streaming exists to disguise. It
 * simply appears as the characters that were actually sent, rather than as a
 * guess at what they will eventually mean.
 */

/** A fence is ``` or ~~~ with at least three markers, optionally indented. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** A table row is a line whose first non-space character is a pipe. */
const TABLE_ROW = /^ {0,3}\|/;
/** The delimiter row: | --- | :---: | ---: | */
const TABLE_DELIMITER = /^ {0,3}\|?[\s:|-]+\|[\s:|-]*$/;

export interface SplitMarkdown {
  /** Syntactically closed prefix. Safe to parse. */
  stable: string;
  /** Unterminated remainder. Render as plain text. */
  tail: string;
}

/**
 * Split accumulated markdown at the last safe parse point.
 *
 * Line-based rather than character-based: markdown's block constructs are all
 * line-oriented, and a character-level scanner would have to model inline
 * emphasis, which flickers far less and is not worth the complexity. An
 * unterminated `**bold` renders as literal asterisks for a few hundred
 * milliseconds; an unterminated table restructures the whole answer.
 */
export function splitAtSafePoint(text: string): SplitMarkdown {
  if (!text) return { stable: '', tail: '' };

  const lines = text.split('\n');

  let fenceOpenAt: number | null = null;
  let fenceMarker = '';
  let tableStartedAt: number | null = null;
  let tableHasDelimiter = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    // ── code fences ──────────────────────────────────────────────────────────
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] ?? '';
      if (fenceOpenAt === null) {
        fenceOpenAt = index;
        fenceMarker = marker[0] ?? '`';
      } else if (marker[0] === fenceMarker) {
        // A closing fence takes no info string; if it has one it opens a new
        // block instead. Treating it as closing is the common case and the
        // forgiving one.
        fenceOpenAt = null;
        fenceMarker = '';
      }
      continue;
    }

    // Everything inside an open fence is literal, including pipes.
    if (fenceOpenAt !== null) continue;

    // ── tables ───────────────────────────────────────────────────────────────
    if (TABLE_ROW.test(line)) {
      if (tableStartedAt === null) {
        tableStartedAt = index;
        tableHasDelimiter = false;
      } else if (!tableHasDelimiter && TABLE_DELIMITER.test(line)) {
        tableHasDelimiter = true;
      }
      continue;
    }

    // A non-pipe line ends the table. If the delimiter never arrived it was
    // never a table at all, just paragraph text that happened to start with a
    // pipe — which GFM renders as-is, so nothing is pending.
    tableStartedAt = null;
    tableHasDelimiter = false;
  }

  // An open fence is unterminated from the fence line onward.
  if (fenceOpenAt !== null) {
    return {
      stable: lines.slice(0, fenceOpenAt).join('\n'),
      tail: lines.slice(fenceOpenAt).join('\n'),
    };
  }

  // A table still being written is unterminated. Held back from the first row —
  // partly written rows are the flicker this exists to prevent.
  //
  // A table *with* its delimiter row is held back too: appending one row at a
  // time reflows column widths on every token, which is its own kind of jitter.
  // It lands complete instead.
  if (tableStartedAt !== null) {
    return {
      stable: lines.slice(0, tableStartedAt).join('\n'),
      tail: lines.slice(tableStartedAt).join('\n'),
    };
  }

  // A trailing list item mid-word is harmless — a list grows downward without
  // restructuring what is above it — but a bare list marker with nothing after
  // it renders as an empty bullet that then fills in. Hold just that line.
  const last = lines[lines.length - 1] ?? '';
  if (/^ {0,3}([-*+]|\d+[.)])\s*$/.test(last) && lines.length > 1) {
    return {
      stable: lines.slice(0, -1).join('\n'),
      tail: last,
    };
  }

  return { stable: text, tail: '' };
}

/**
 * Roughly 50ms between markdown re-parses while streaming.
 *
 * Tokens arrive every 20–40ms. Parsing on each one means ~40 full
 * remark/rehype passes per second over a document that keeps growing — the cost
 * is quadratic in answer length, and it is paid on the main thread. On a
 * mid-range Android it is the difference between text appearing and text
 * stuttering.
 *
 * 50ms is chosen because it is under the ~100ms at which a change stops reading
 * as "immediate", so nothing feels withheld, while cutting the parse count by
 * about half.
 */
export const STREAM_PARSE_INTERVAL_MS = 50;
