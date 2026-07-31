/**
 * The highest-risk code in the frontend.
 *
 * Three layers, tested separately because they fail separately:
 *
 *   `lib/sse.ts`            — bytes to frames. Every chunk-boundary case.
 *   `markerGuard.ts`        — never show a half-arrived `[kb-0`.
 *   `reducer.ts`            — a whole answer replayed as pure data.
 *
 * The replay tests are the point: a full recorded sequence, including a split
 * marker, a mid-stream error and an abort, run in milliseconds with no network,
 * no timers and no React.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { config } from '@/lib/config';
import { SseParser, parseFrameData } from '@/lib/sse';
import { NotAStream, streamMessage, type StreamHandlers } from '@/lib/stream';
import { ApiError } from '@/lib/api';
import { MAX_HELD, guardPartialMarker } from '@/features/chat/markerGuard';
import { chatReducer, initialMachineState, type ChatAction } from '@/features/chat/reducer';
import { setScenario } from '@/mocks/scenarios';
import { ANSWER, CITATIONS } from '@/mocks/fixtures';

const BASE = config.apiBaseUrl;

afterEach(() => {
  server.resetHandlers();
  setScenario('happy');
  vi.restoreAllMocks();
});

// ── Task 2: the frame parser ─────────────────────────────────────────────────

describe('SseParser', () => {
  it('parses a simple frame', () => {
    const parser = new SseParser();
    expect(parser.push('event: token\ndata: {"text":"hi"}\n\n')).toEqual([
      { event: 'token', data: '{"text":"hi"}' },
    ]);
  });

  it('survives a boundary in the middle of the JSON', () => {
    const parser = new SseParser();
    // The mock does exactly this to the first token frame.
    expect(parser.push('event: token\ndata: {"te')).toEqual([]);
    expect(parser.push('xt":"hi"}\n\n')).toEqual([{ event: 'token', data: '{"text":"hi"}' }]);
  });

  it('survives a boundary in the middle of a field name', () => {
    const parser = new SseParser();
    expect(parser.push('eve')).toEqual([]);
    expect(parser.push('nt: token\nda')).toEqual([]);
    expect(parser.push('ta: {"text":"hi"}\n\n')).toEqual([
      { event: 'token', data: '{"text":"hi"}' },
    ]);
  });

  it('survives a boundary between the two terminating newlines', () => {
    const parser = new SseParser();
    // The nastiest one: the frame looks complete but is not.
    expect(parser.push('event: token\ndata: {"text":"hi"}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'token', data: '{"text":"hi"}' }]);
  });

  it('delivers several frames arriving in one chunk', () => {
    const parser = new SseParser();
    const frames = parser.push(
      'event: meta\ndata: {"conversation_id":"a"}\n\nevent: token\ndata: {"text":"x"}\n\n'
    );
    expect(frames.map((f) => f.event)).toEqual(['meta', 'token']);
  });

  it('joins multi-line data with a newline', () => {
    const parser = new SseParser();
    // Taking only the last line would silently truncate the payload.
    const [frame] = parser.push('event: token\ndata: {"text":\ndata: "hi"}\n\n');
    expect(frame?.data).toBe('{"text":\n"hi"}');
    expect(parseFrameData(frame!)).toEqual({ ok: true, value: { text: 'hi' } });
  });

  it('strips exactly one leading space, not all whitespace', () => {
    const parser = new SseParser();
    // `trim()` would eat the meaningful second space and corrupt the value.
    const [frame] = parser.push('event: token\ndata:  {"text":"x"}\n\n');
    expect(frame?.data).toBe(' {"text":"x"}');
  });

  it('handles a value with no space after the colon', () => {
    const parser = new SseParser();
    const [frame] = parser.push('event:token\ndata:{"text":"x"}\n\n');
    expect(frame).toEqual({ event: 'token', data: '{"text":"x"}' });
  });

  it('ignores comment keepalives without crashing', () => {
    const parser = new SseParser();
    // These arrive precisely when a proxy would otherwise drop an idle connection.
    expect(parser.push(': keepalive\n\n')).toEqual([]);
    const frames = parser.push(': ping\nevent: token\ndata: {"text":"x"}\n\n');
    expect(frames).toEqual([{ event: 'token', data: '{"text":"x"}' }]);
  });

  it('handles CRLF line endings', () => {
    const parser = new SseParser();
    const frames = parser.push('event: token\r\ndata: {"text":"x"}\r\n\r\n');
    expect(frames).toEqual([{ event: 'token', data: '{"text":"x"}' }]);
  });

  it('does not grow its buffer once a frame is taken', () => {
    const parser = new SseParser();
    parser.push('event: token\ndata: {"text":"x"}\n\nevent: tok');
    expect(parser.pending).toBe('event: tok');
  });

  it('drains an unterminated final frame on flush', () => {
    const parser = new SseParser();
    // A server that closes right after the last data line would otherwise have
    // its `done` dropped, and the client would wait for an event already gone.
    expect(parser.push('event: done\ndata: {"grounded":true}')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'done', data: '{"grounded":true}' }]);
    expect(parser.flush()).toEqual([]);
  });

  it('skips a malformed payload with a warning rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // One bad frame is one lost event; throwing loses the whole answer.
    expect(parseFrameData({ event: 'token', data: '{"text":' })).toEqual({ ok: false });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('malformed'));
  });

  it('distinguishes a valid null payload from a parse failure', () => {
    // `unknown | undefined` would have collapsed these two.
    expect(parseFrameData({ event: 'x', data: 'null' })).toEqual({ ok: true, value: null });
    expect(parseFrameData({ event: 'x', data: 'nope' })).toEqual({ ok: false });
  });
});

// ── Task 4: the partial marker guard ─────────────────────────────────────────

describe('guardPartialMarker', () => {
  it('holds back every prefix of a marker', () => {
    for (const partial of ['[', '[k', '[kb', '[kb-', '[kb-0', '[kb-01', '[kb-014']) {
      const { visible, held } = guardPartialMarker(`The fare is XCD 44.44 ${partial}`);
      expect(held, partial).toBe(partial);
      expect(visible, partial).toBe('The fare is XCD 44.44 ');
    }
  });

  it('releases the moment the marker completes', () => {
    const { visible, held } = guardPartialMarker('The fare is XCD 44.44 [kb-014]');
    expect(held).toBe('');
    expect(visible).toBe('The fare is XCD 44.44 [kb-014]');
  });

  it('releases as soon as the fragment proves it is not a marker', () => {
    // `[1` cannot become `[kb-…`, so there is nothing to wait for.
    expect(guardPartialMarker('see note [1').held).toBe('');
    expect(guardPartialMarker('an [x').held).toBe('');
  });

  it('leaves ordinary prose entirely alone', () => {
    const text = 'The last sailing back from Nevis is 18:00.';
    expect(guardPartialMarker(text)).toEqual({ visible: text, held: '' });
  });

  it('never holds more than the cap', () => {
    // A stream of open brackets must not be able to stall the display.
    const { held } = guardPartialMarker(`prose ${'['.repeat(50)}`);
    expect(held.length).toBeLessThanOrEqual(MAX_HELD);
  });

  it('loses nothing: visible + held always reconstructs the input', () => {
    for (const text of ['', 'a', 'x [kb-0', '[kb-014] done', 'ends with [', 'plain']) {
      const { visible, held } = guardPartialMarker(text);
      expect(visible + held, text).toBe(text);
    }
  });

  it('replays the mock’s real split without ever exposing a partial marker', () => {
    // The exact case: one token ends `[kb-0`, the next begins `14].`.
    const tokens = ['The fare is XCD 44.44 ', '[kb-0', '14]. Confirm before you travel.'];
    let accumulated = '';
    const rendered: string[] = [];

    for (const token of tokens) {
      accumulated += token;
      const { visible, held } = guardPartialMarker(accumulated);
      rendered.push(visible);
      accumulated = visible + held; // what the reducer keeps
    }

    // Not one frame of `[kb-0` on screen.
    expect(rendered.some((frame) => /\[kb-0(?!14])/.test(frame))).toBe(false);
    expect(rendered.at(-1)).toBe('The fare is XCD 44.44 [kb-014]. Confirm before you travel.');
  });
});

// ── Task 1: streamMessage ────────────────────────────────────────────────────

function collect(): { handlers: StreamHandlers; log: string[]; text: () => string } {
  const log: string[] = [];
  let text = '';
  return {
    log,
    text: () => text,
    handlers: {
      onMeta: (d) => log.push(`meta:${d.conversation_id}`),
      onToken: (d) => {
        text += d.text;
        log.push('token');
      },
      onToolStart: (d) => log.push(`tool_start:${d.name}`),
      onToolEnd: (d) => log.push(`tool_end:${d.name}`),
      onCitations: (d) => log.push(`citations:${d.citations.length}`),
      onChart: () => log.push('chart'),
      onReplace: () => log.push('replace'),
      onDone: () => log.push('done'),
      onError: (d) => log.push(`error:${d.code}`),
    },
  };
}

describe('streamMessage against the hostile mock', () => {
  it('dispatches the documented sequence and reassembles the answer exactly', async () => {
    const { handlers, log, text } = collect();
    const result = await streamMessage({ message: 'ferry fare?' }, handlers);

    expect(log[0]).toMatch(/^meta:/);
    expect(log).toContain('tool_start:search_scaspa_knowledge');
    expect(log.at(-1)).toBe('done');
    // citations after the last token — validation needs the finished text.
    expect(log.lastIndexOf('token')).toBeLessThan(log.findIndex((e) => e.startsWith('citations')));
    // Byte-identical despite the split frame and the split marker.
    expect(text()).toBe(ANSWER);
    expect(result.completed).toBe(true);
  });

  it('adopts conversation_id before any token arrives', async () => {
    const seen: string[] = [];
    await streamMessage(
      { message: 'x' },
      {
        onMeta: (d) => seen.push(`meta:${d.conversation_id}`),
        onToken: () => seen.push('token'),
      }
    );
    // So state is correct even if the user navigates away mid-answer.
    expect(seen[0]).toMatch(/^meta:/);
    expect(seen.indexOf('token')).toBeGreaterThan(0);
  });

  it('stops at a mid-stream error and reports it', async () => {
    setScenario('stream_error');
    const { handlers, log } = collect();
    const result = await streamMessage({ message: 'x' }, handlers);

    expect(log.at(-1)).toBe('error:INTERNAL');
    expect(log).not.toContain('done');
    expect(result.errored).toBe(true);
    // Tokens already delivered stay delivered.
    expect(log.filter((e) => e === 'token').length).toBeGreaterThan(0);
  });

  it('throws ApiError when the backend answers with JSON instead of a stream', async () => {
    server.use(
      http.post(`${BASE}/api/chat/stream`, () =>
        HttpResponse.json(
          { error: { code: 'UPSTREAM_TIMEOUT', message: 'Too slow.', request_id: 'r' } },
          { status: 200 }
        )
      )
    );
    const thrown = await streamMessage({ message: 'x' }, {}).catch((e: unknown) => e);
    // A 200 carrying an envelope is still an error, and must not reach the frame
    // parser as "an empty stream".
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('UPSTREAM_TIMEOUT');
  });

  it('throws NotAStream when a proxy returns HTML', async () => {
    server.use(
      http.post(`${BASE}/api/chat/stream`, () =>
        HttpResponse.html('<html><body>Captive portal</body></html>')
      )
    );
    const thrown = await streamMessage({ message: 'x' }, {}).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(NotAStream);
    // The body is somebody else's HTML and is never read or shown.
    expect((thrown as NotAStream).message).not.toContain('Captive portal');
  });

  it('throws before streaming on a 422, because validation runs first', async () => {
    const thrown = await streamMessage({ message: '   ' }, {}).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('VALIDATION_ERROR');
  });

  it('ignores an unknown event rather than tearing down the stream', async () => {
    const encoder = new TextEncoder();
    server.use(
      http.post(`${BASE}/api/chat/stream`, () => {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('event: meta\ndata: {"conversation_id":"a"}\n\n'));
            // A backend is allowed to add events; a client that throws on one it
            // has not been taught breaks on the next deploy.
            controller.enqueue(encoder.encode('event: telemetry\ndata: {"x":1}\n\n'));
            controller.enqueue(encoder.encode(': keepalive\n\n'));
            controller.enqueue(
              encoder.encode(
                'event: done\ndata: {"latency_ms":1,"grounded":true,"refusal":false,"kb_version":"v"}\n\n'
              )
            );
            controller.close();
          },
        });
        return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
      })
    );

    const { handlers, log } = collect();
    const result = await streamMessage({ message: 'x' }, handlers);
    expect(log).toEqual(['meta:a', 'done']);
    expect(result.completed).toBe(true);
  });

  it('does not corrupt a multi-byte character split across chunks', async () => {
    const encoder = new TextEncoder();
    server.use(
      http.post(`${BASE}/api/chat/stream`, () => {
        // "Basseterre — Charlestown": the em dash is three UTF-8 bytes.
        const frame = encoder.encode('event: token\ndata: {"text":"Basseterre — Charlestown"}\n\n');
        const cut = 40; // lands inside the em dash
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(frame.slice(0, cut));
            controller.enqueue(frame.slice(cut));
            controller.close();
          },
        });
        return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
      })
    );

    const { handlers, text } = collect();
    await streamMessage({ message: 'x' }, handlers);
    // Without `{ stream: true }` this is "Basseterre ��� Charlestown".
    expect(text()).toBe('Basseterre — Charlestown');
  });
});

// ── Task 5: cancellation ─────────────────────────────────────────────────────

describe('cancellation', () => {
  it('an already-aborted signal never opens the stream', async () => {
    const controller = new AbortController();
    controller.abort();
    const { handlers, log } = collect();

    await streamMessage({ message: 'x' }, handlers, controller.signal).catch(() => undefined);
    expect(log).toEqual([]);
  });

  it('aborting mid-stream stops delivering events', async () => {
    const controller = new AbortController();
    const log: string[] = [];
    let tokens = 0;

    await streamMessage(
      { message: 'x' },
      {
        onMeta: () => log.push('meta'),
        onToken: () => {
          tokens += 1;
          log.push('token');
          // Cancel as soon as the answer starts.
          if (tokens === 2) controller.abort();
        },
        onDone: () => log.push('done'),
      },
      controller.signal
    ).catch(() => undefined);

    // The whole answer is ~60 tokens; stopping at 2 means the reader really stopped.
    expect(tokens).toBeLessThan(10);
    expect(log).not.toContain('done');
  });
});

// ── Task 7: the reducer, replayed ────────────────────────────────────────────

const AT = new Date('2026-04-01T14:30:00Z');

function replay(actions: ChatAction[]) {
  return actions.reduce(chatReducer, initialMachineState);
}

const send: ChatAction = {
  type: 'SEND',
  userId: 'u1',
  assistantId: 'a1',
  at: AT,
  text: 'How much is a ferry ticket?',
  transport: 'stream',
};

describe('reducer: a full recorded sequence', () => {
  it('replays a complete answer including a split marker', () => {
    const state = replay([
      send,
      { type: 'META', conversationId: 'conv-1' },
      { type: 'TOOL_START', name: 'search_scaspa_knowledge', summary: 'Searching — fares' },
      { type: 'TOOL_END', name: 'search_scaspa_knowledge', summary: 'Searching — fares', ms: 148 },
      { type: 'TOKEN', text: 'The fare is XCD 44.44 ' },
      // The split. Neither half is a usable marker on its own.
      { type: 'TOKEN', text: '[kb-0' },
      { type: 'TOKEN', text: '14]. Confirm before you travel.' },
      { type: 'CITATIONS', citations: CITATIONS },
      { type: 'DONE', grounded: true, refusal: false, refusalCategory: null },
    ]);

    expect(state.conversationId).toBe('conv-1');
    expect(state.status).toBe('idle');
    expect(state.streamingMessageId).toBeNull();
    expect(state.heldText).toBe('');
    expect(state.messages).toHaveLength(2);

    const assistant = state.messages[1]!;
    expect(assistant.text).toBe('The fare is XCD 44.44 [kb-014]. Confirm before you travel.');
    expect(assistant.streaming).toBe(false);
    expect(assistant.grounded).toBe(true);
    expect(assistant.citations).toEqual(CITATIONS);
    expect(assistant.activity).toEqual([
      expect.objectContaining({ name: 'search_scaspa_knowledge', ms: 148, done: true }),
    ]);
  });

  it('never exposes a partial marker at any step of the replay', () => {
    const actions: ChatAction[] = [
      send,
      { type: 'META', conversationId: 'c' },
      { type: 'TOKEN', text: 'Fare XCD 44.44 ' },
      { type: 'TOKEN', text: '[kb-0' },
      { type: 'TOKEN', text: '14]. Done.' },
      { type: 'DONE', grounded: true, refusal: false, refusalCategory: null },
    ];

    let state = initialMachineState;
    for (const action of actions) {
      state = chatReducer(state, action);
      const text = state.messages.find((m) => m.id === 'a1')?.text ?? '';
      // The whole point: `[kb-0` must never be renderable, at any intermediate step.
      expect(text.endsWith('[kb-0'), `after ${action.type}`).toBe(false);
      expect(/\[kb-\d{1,2}$/.test(text), `after ${action.type}`).toBe(false);
    }
  });

  it('flushes a held tail on done, so a truncated answer is not silently shortened', () => {
    const state = replay([
      send,
      { type: 'TOKEN', text: 'The fare is XCD 44.44 [kb-0' },
      { type: 'DONE', grounded: false, refusal: false, refusalCategory: null },
    ]);
    // Holding it forever would delete the end of an answer, which is worse than
    // the flicker the guard exists to prevent.
    expect(state.messages[1]!.text).toBe('The fare is XCD 44.44 [kb-0');
    expect(state.heldText).toBe('');
  });

  it('replays a mid-stream error, keeping the text that arrived', () => {
    const state = replay([
      send,
      { type: 'META', conversationId: 'c' },
      { type: 'TOKEN', text: 'The fare is ' },
      {
        type: 'STREAM_ERROR',
        error: { code: 'INTERNAL', message: 'Something went wrong.', request_id: 'r' },
      },
    ]);

    const assistant = state.messages[1]!;
    // It was real, and discarding it wastes the wait.
    expect(assistant.text).toBe('The fare is ');
    expect(assistant.streaming).toBe(false);
    expect(assistant.error?.code).toBe('INTERNAL');
    expect(state.status).toBe('idle');
    expect(state.streamingMessageId).toBeNull();
  });

  it('replays an abort mid-answer, keeping what had arrived', () => {
    const state = replay([
      send,
      { type: 'META', conversationId: 'c' },
      { type: 'TOKEN', text: 'The fare is XCD 44.44 [kb-0' },
      { type: 'ABORT' },
    ]);

    const assistant = state.messages[1]!;
    // The user asked to stop, not to lose what they had already read — and the
    // held tail is flushed rather than dropped.
    expect(assistant.text).toBe('The fare is XCD 44.44 [kb-0');
    expect(assistant.streaming).toBe(false);
    expect(state.status).toBe('idle');
  });

  it('removes the placeholder when aborted before anything arrived', () => {
    const state = replay([send, { type: 'ABORT' }]);
    // An empty bubble is something the user has to look at and cannot act on.
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.role).toBe('user');
  });

  it('drops the empty bubble when the request fails before any token', () => {
    const state = replay([
      send,
      {
        type: 'REQUEST_FAILED',
        failure: {
          kind: 'UPSTREAM_TIMEOUT',
          message: 'Too slow.',
          requestId: 'r',
          retryAfterS: null,
          question: 'How much is a ferry ticket?',
        },
      },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(state.status).toBe('error');
    expect(state.error?.kind).toBe('UPSTREAM_TIMEOUT');
  });

  it('discards everything streamed when replace arrives', () => {
    const state = replay([
      send,
      { type: 'TOKEN', text: 'Internal reasoning that is not an answer [kb-0' },
      { type: 'REPLACE', text: 'I could not complete that. Please call SCASPA.' },
      { type: 'DONE', grounded: false, refusal: true, refusalCategory: null },
    ]);
    // The tokens were an internal message, not an answer.
    expect(state.messages[1]!.text).toBe('I could not complete that. Please call SCASPA.');
    expect(state.messages[1]!.refusal).toBe(true);
  });

  it('records which transport answered', () => {
    expect(replay([send]).transport).toBe('stream');
    const fellBack = replay([
      send,
      {
        type: 'FALLBACK_ANSWER',
        text: 'The fare is XCD 44.44 [kb-014].',
        citations: CITATIONS,
        chart: null,
        grounded: true,
        refusal: false,
        refusalCategory: null,
        toolCalls: [],
        conversationId: 'conv-2',
      },
    ]);
    expect(fellBack.transport).toBe('fetch');
    expect(fellBack.conversationId).toBe('conv-2');
    expect(fellBack.messages[1]!.text).toBe('The fare is XCD 44.44 [kb-014].');
    expect(fellBack.status).toBe('idle');
  });

  it('moves through thinking then streaming', () => {
    let state = chatReducer(initialMachineState, send);
    // Sent, nothing back yet — a different state from an answer being written.
    expect(state.status).toBe('thinking');
    state = chatReducer(state, { type: 'META', conversationId: 'c' });
    expect(state.status).toBe('thinking');
    state = chatReducer(state, { type: 'TOKEN', text: 'The' });
    expect(state.status).toBe('streaming');
  });

  it('is pure: the same actions always give the same state', () => {
    const actions: ChatAction[] = [
      send,
      { type: 'META', conversationId: 'c' },
      { type: 'TOKEN', text: 'a [kb-0' },
      { type: 'TOKEN', text: '14] b' },
      { type: 'DONE', grounded: true, refusal: false, refusalCategory: null },
    ];
    expect(replay(actions)).toEqual(replay(actions));
  });

  it('does not mutate the state it was given', () => {
    const before = chatReducer(initialMachineState, send);
    const snapshot = structuredClone({
      ...before,
      messages: before.messages.map((m) => ({ ...m, at: m.at.toISOString() })),
    });
    chatReducer(before, { type: 'TOKEN', text: 'x' });
    const after = {
      ...before,
      messages: before.messages.map((m) => ({ ...m, at: m.at.toISOString() })),
    };
    expect(after).toEqual(snapshot);
  });

  it('RESET clears everything', () => {
    const state = replay([
      send,
      { type: 'META', conversationId: 'c' },
      { type: 'TOKEN', text: 'x' },
      { type: 'RESET' },
    ]);
    expect(state).toEqual(initialMachineState);
  });
});
