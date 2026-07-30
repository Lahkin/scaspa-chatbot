/**
 * Server-Sent Events, parsed by hand.
 *
 * `EventSource` is not an option and never will be — CLAUDE.md rule 3. It issues
 * **GET only** and cannot carry a body; our endpoint is `POST /api/chat/stream`
 * with a JSON body. There is no workaround, and the lint config makes
 * `new EventSource(...)` an error so this is enforced rather than remembered.
 *
 * ### Where naive implementations break
 *
 * Every one of these is a real failure mode, and every one is silent:
 *
 * 1. **A chunk boundary can fall anywhere** — mid-frame, mid-field-name,
 *    mid-JSON, even between the two newlines that terminate a frame. So the
 *    parser is *stateful*: it keeps a buffer across chunks and only ever takes
 *    complete frames off it. Parsing per chunk produces a JSON error on the first
 *    token.
 * 2. **`data:` may appear on several lines** and must be joined with `\n` before
 *    `JSON.parse`. Taking only the last one silently truncates any payload the
 *    server chose to wrap.
 * 3. **Exactly one leading space is stripped** after the colon, per the spec —
 *    not `trim()`. `data:  {"text":"  indented"}` has a meaningful second space,
 *    and trimming eats leading whitespace inside the value.
 * 4. **Comment lines begin with `:`.** They are keepalives, sent precisely when a
 *    proxy would otherwise close an idle connection, and a parser that treats one
 *    as a field crashes at the worst moment.
 * 5. **`\r\n` happens.** Proxies rewrite line endings.
 * 6. **A malformed frame must not tear down the stream.** One bad frame is one
 *    lost event; throwing loses the whole answer.
 */

/** One parsed frame, before any schema validation. */
export interface RawFrame {
  /** The `event:` field. Empty when the server sent only `data:`. */
  event: string;
  /** Every `data:` line, joined with `\n`. */
  data: string;
}

/**
 * A stateful SSE frame reader.
 *
 * Feed it decoded text; it returns whatever complete frames that text completed
 * and keeps the remainder for next time.
 */
export class SseParser {
  /** The incomplete tail of the last chunk. This is the whole point of the class. */
  private buffer = '';

  /**
   * Push decoded text and take out any frames it completed.
   *
   * Frames are separated by a blank line. Anything after the last blank line is
   * an incomplete fragment and stays in the buffer.
   */
  push(chunk: string): RawFrame[] {
    this.buffer += chunk;
    const frames: RawFrame[] = [];

    for (;;) {
      // `\r?\n\r?\n` rather than a literal `\n\n`: a proxy that rewrites line
      // endings would otherwise make every frame boundary invisible and the
      // buffer would grow until the stream ended, delivering everything at once.
      const separator = /\r?\n\r?\n/.exec(this.buffer);
      if (!separator) break;

      const block = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator[0].length);

      const frame = parseBlock(block);
      if (frame) frames.push(frame);
    }

    return frames;
  }

  /**
   * Whatever is left when the stream ends.
   *
   * A well-behaved server terminates the last frame with a blank line, so this is
   * normally empty. It is drained anyway: a server that closes immediately after
   * the final `data:` line would otherwise have its `done` event dropped, and the
   * client would sit waiting for an event that has already been and gone.
   */
  flush(): RawFrame[] {
    if (this.buffer.trim() === '') {
      this.buffer = '';
      return [];
    }
    const frame = parseBlock(this.buffer);
    this.buffer = '';
    return frame ? [frame] : [];
  }

  /** Test seam: how much is being held. Should be small and bounded in practice. */
  get pending(): string {
    return this.buffer;
  }
}

/**
 * Parse one frame's worth of lines.
 *
 * Returns null for a frame carrying no data — a lone comment, or a stray blank
 * block from a doubled separator.
 */
function parseBlock(block: string): RawFrame | null {
  let event = '';
  const data: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    // A comment. Keepalives look like `: ping` and arrive exactly when a proxy
    // would otherwise drop an idle connection.
    if (line.startsWith(':')) continue;
    if (line === '') continue;

    const colon = line.indexOf(':');

    // A line with no colon is a field name with an empty value, per the spec.
    // `data` alone means an empty data line, which is meaningful in a multi-line
    // payload.
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);

    // Exactly one leading space, not `trim()`. The rest of the whitespace belongs
    // to the value.
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    // `id` and `retry` are spec fields this protocol does not use. Ignored rather
    // than rejected: a server adding one must not break a client.
  }

  if (data.length === 0 && event === '') return null;
  return { event, data: data.join('\n') };
}

/**
 * `JSON.parse`, but a bad frame costs one event rather than the whole answer.
 *
 * Warns in dev, because a malformed frame means the server is emitting something
 * it should not and that is worth knowing — but not at the cost of the reader's
 * remaining tokens.
 */
export function parseFrameData(frame: RawFrame): { ok: true; value: unknown } | { ok: false } {
  try {
    // A discriminated result rather than `unknown | undefined`: the payload may
    // legitimately *be* undefined-ish, and collapsing the two makes a valid
    // `null` payload indistinguishable from a parse failure.
    return { ok: true, value: JSON.parse(frame.data) };
  } catch {
    if (import.meta.env.DEV) {
      console.warn(
        `[sse] skipped a malformed frame (event: ${frame.event || '(none)'}). ` +
          `Payload was not valid JSON: ${frame.data.slice(0, 120)}`
      );
    }
    return { ok: false };
  }
}
