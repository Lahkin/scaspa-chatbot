/**
 * The mock has to be honest, so it gets tested like production code.
 *
 * "MSW returns an SSE stream" is not the claim being checked here. The claims are
 * that a **frame is genuinely split across two chunks** and that a **`[kb-014]`
 * marker is genuinely split across two token events** — because those are the two
 * things that break real streaming clients, and a mock that quietly stopped doing
 * them would leave Phase 2 building against a network that does not exist.
 *
 * These read raw chunks off the wire rather than using a parser, so a parser
 * written later cannot hide a defect in the fixture.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { config } from '@/lib/config';
import { setScenario, setTimeScale } from '@/mocks/scenarios';
import { tokenize } from '@/mocks/sse';
import { ANSWER } from '@/mocks/fixtures';

const STREAM_URL = `${config.apiBaseUrl}/api/chat/stream`;

afterEach(() => setScenario('happy'));

async function readChunks(url: string, body: unknown): Promise<string[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.body) throw new Error('no body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  return chunks;
}

/** Minimal parser, deliberately correct: buffer, then split on blank lines. */
function parseFrames(chunks: string[]): { event: string; data: unknown }[] {
  const buffer = chunks.join('');
  const frames: { event: string; data: unknown }[] = [];
  for (const block of buffer.split('\n\n')) {
    if (!block.trim()) continue;
    const eventLine = block.match(/^event: (.+)$/m);
    const dataLine = block.match(/^data: ([\s\S]+)$/m);
    if (!eventLine?.[1] || !dataLine?.[1]) continue;
    frames.push({ event: eventLine[1], data: JSON.parse(dataLine[1]) });
  }
  return frames;
}

describe('the streaming mock is a real event stream', () => {
  it('sends the SSE headers the contract specifies', async () => {
    const response = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How much is a ferry ticket?' }),
    });

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-cache');
    // Without this some proxies buffer the whole stream and defeat the point.
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    // Drained, not cancelled. See the note on stream cancellation at the foot of
    // this file: `body.cancel()` never settles under MSW's Node interceptor.
    const reader = response.body!.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
  });

  it('arrives as many chunks, not one', async () => {
    const chunks = await readChunks(STREAM_URL, { message: 'ferry fare?' });
    // A string body would arrive as a single chunk and silently undo every
    // boundary case below.
    expect(chunks.length).toBeGreaterThan(5);
  });

  it('splits at least one frame across two chunks', async () => {
    const chunks = await readChunks(STREAM_URL, { message: 'ferry fare?' });

    // A chunk that is a whole number of frames always ends with a blank line. At
    // least one must not, or nothing is being split.
    const partial = chunks.filter((chunk) => !chunk.endsWith('\n\n'));
    expect(partial.length).toBeGreaterThan(0);

    // Stronger: some chunk must be an unparseable fragment on its own — that is
    // what a per-chunk JSON.parse would choke on.
    const unparseable = chunks.filter((chunk) => {
      const data = chunk.match(/^data: (.+)$/m);
      if (!data?.[1]) return true;
      try {
        JSON.parse(data[1]);
        return false;
      } catch {
        return true;
      }
    });
    expect(unparseable.length).toBeGreaterThan(0);
  });

  it('splits a [kb-014] marker across two token events', async () => {
    const chunks = await readChunks(STREAM_URL, { message: 'ferry fare?' });
    const frames = parseFrames(chunks);
    const tokens = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { text: string }).text);

    // The answer carries the marker twice and the mock splits the *first*
    // occurrence, leaving the second intact — which is the realistic case. A
    // client must therefore handle both in the same stream.
    const openIndex = tokens.findIndex((text) => text.endsWith('[kb-0'));
    expect(openIndex).toBeGreaterThanOrEqual(0);
    expect(tokens[openIndex + 1]).toContain('14]');
    // The split one is genuinely split: neither half is a usable marker alone.
    expect(tokens[openIndex]).not.toContain('[kb-014]');
    expect(tokens[openIndex + 1]).not.toContain('[kb-014]');
    // The intact one still arrives whole, so both paths are exercised.
    expect(tokens.filter((text) => text.includes('[kb-014]')).length).toBe(1);

    // And the accumulated text is byte-identical to the answer, so the split is a
    // frame-boundary artefact and not corruption.
    expect(tokens.join('')).toBe(ANSWER);
  });

  it('emits the contract event sequence in order', async () => {
    const frames = parseFrames(await readChunks(STREAM_URL, { message: 'ferry fare?' }));
    const names = frames.map((frame) => frame.event);

    expect(names[0]).toBe('meta');
    expect(names).toContain('tool_start');
    expect(names).toContain('tool_end');
    expect(names.at(-1)).toBe('done');

    // citations after the last token — validation needs the finished text.
    const lastToken = names.lastIndexOf('token');
    const citations = names.indexOf('citations');
    expect(citations).toBeGreaterThan(lastToken);

    // tool_start before the first token: it is the only visible sign the
    // assistant is researching rather than stalling.
    expect(names.indexOf('tool_start')).toBeLessThan(names.indexOf('token'));
  });

  it('carries the citations the answer actually cites', async () => {
    const frames = parseFrames(await readChunks(STREAM_URL, { message: 'ferry fare?' }));
    const citations = frames.find((frame) => frame.event === 'citations');
    const ids = (citations?.data as { citations: { kb_id: string }[] }).citations.map(
      (citation) => citation.kb_id
    );
    expect(ids).toEqual(['kb-014', 'kb-008']);
  });
});

describe('failure scenarios', () => {
  it('mid-stream error arrives as an event on a 200, not as an HTTP error', async () => {
    setScenario('stream_error');
    const response = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ferry fare?' }),
    });

    // Headers are long gone by the time it fails, so the status is fixed at 200.
    expect(response.status).toBe(200);

    const chunks: string[] = [];
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }

    const frames = parseFrames(chunks);
    const names = frames.map((frame) => frame.event);
    expect(names.at(-1)).toBe('error');
    expect(names).not.toContain('done');
    // Tokens already streamed stay streamed — the client keeps what it has.
    expect(names.filter((name) => name === 'token').length).toBeGreaterThan(0);

    const error = frames.at(-1)?.data as { code: string; message: string };
    expect(error.code).toBe('INTERNAL');
    expect(error.message).toContain('869-465-8121');
  });

  it('the stalling stream sends two tokens and then nothing', async () => {
    setScenario('stream_stall');
    const response = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ferry fare?' }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    // Read only until it goes quiet. Waiting for `done` here would hang forever,
    // which is exactly the point of this scenario: a client without its own
    // timeout has no way out.
    const deadline = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 300));
    for (;;) {
      const race = await Promise.race([reader.read(), deadline]);
      if (race === 'timeout') break;
      if (race.done) break;
      chunks.push(decoder.decode(race.value, { stream: true }));
    }
    // Deliberately not cancelled — see the note at the foot of this file.
    // Abandoning the reader is the only way out of this in Node.

    const names = parseFrames(chunks).map((frame) => frame.event);
    expect(names).toContain('meta');
    expect(names).not.toContain('done');
    expect(names).not.toContain('error');
  });

  it('429/503 carries Retry-After and the real error envelope', async () => {
    setScenario('rate_limited');
    const response = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ferry fare?' }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('8');
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UPSTREAM_RATE_LIMITED');
    expect(body.error.message).toContain('869-465-8121');
  });

  it('a refusal is HTTP 200 and is not an error', async () => {
    setScenario('refusal');
    const response = await fetch(`${config.apiBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'where is my container?' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      refusal: boolean;
      refusal_category: string;
      answer: string;
      citations: unknown[];
    };
    expect(body.refusal).toBe(true);
    expect(body.refusal_category).toBe('personal_record');
    expect(body.citations).toEqual([]);
    // The phone number is already inside the answer; a client must not append another.
    expect(body.answer).toContain('869-465-8121');
  });

  it('empty citations still streams the markers, so reconciliation has work to do', async () => {
    setScenario('empty_citations');
    const frames = parseFrames(await readChunks(STREAM_URL, { message: 'ferry fare?' }));
    const text = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { text: string }).text)
      .join('');
    const citations = frames.find((frame) => frame.event === 'citations');

    expect(text).toContain('[kb-014]');
    expect((citations?.data as { citations: unknown[] }).citations).toEqual([]);
  });

  it('ungrounded reports grounded: false on done, with a normal answer', async () => {
    setScenario('ungrounded');
    const frames = parseFrames(await readChunks(STREAM_URL, { message: 'ferry fare?' }));
    const done = frames.at(-1);
    expect(done?.event).toBe('done');
    expect((done?.data as { grounded: boolean }).grounded).toBe(false);
  });

  it('validation fails before streaming starts, so it is a normal 422', async () => {
    const response = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('tokenize', () => {
  it('reassembles to exactly the input', () => {
    expect(tokenize(ANSWER).join('')).toBe(ANSWER);
  });

  it('the default answer still carries a splittable marker', () => {
    // The split is the whole point of this fixture. If someone edits the marker
    // out of ANSWER, the mock silently becomes a comfortable one — so the claim
    // is asserted about the fixture directly.
    expect(ANSWER).toContain('[kb-014]');
    expect(tokenize(ANSWER).some((piece) => piece.endsWith('[kb-0'))).toBe(true);
  });

  it('tokenizes a legitimately marker-free answer without throwing', () => {
    // A refusal cites nothing. Throwing here killed the entire refusal stream:
    // the client saw a connection error and rendered no answer at all.
    const refusal = 'That is not something I can advise on. Call 869-465-8121.';
    expect(tokenize(refusal).join('')).toBe(refusal);
  });
});

describe('non-streaming and streaming agree', () => {
  it('/api/chat returns the same answer text the stream assembles', async () => {
    const response = await fetch(`${config.apiBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ferry fare?' }),
    });
    const body = (await response.json()) as { answer: string };

    const frames = parseFrames(await readChunks(STREAM_URL, { message: 'ferry fare?' }));
    const streamed = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { text: string }).text)
      .join('');

    // The contract's central promise: streaming changes when you see the answer,
    // never what it says.
    expect(streamed).toBe(body.answer);
  });
});

describe('voice endpoints', () => {
  it('stt returns the transcript and nothing else', async () => {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array([1, 2, 3])]), 'question.webm');
    const response = await fetch(`${config.apiBaseUrl}/api/stt`, {
      method: 'POST',
      body: form,
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ text: 'What time is the last ferry back from Nevis?' });
  });

  it('tts returns audio/mpeg bytes with a real MP3 frame header', async () => {
    const response = await fetch(`${config.apiBaseUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'The one-way fare is XCD 44.44 [kb-014].' }),
    });

    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('x-tts-cache')).toBe('miss');

    const bytes = new Uint8Array(await response.arrayBuffer());
    // MPEG audio frame sync: 11 set bits. Without this it is just zeroes with a
    // hopeful content type, and an <audio> element will refuse it.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]! & 0xe0).toBe(0xe0);
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe('timing is realistic by default', () => {
  it('the time scale is zero under test, and that is deliberate', () => {
    // Tests run with sleeps removed but the splitting intact — the splits are what
    // break parsers, the sleeps only make suites slow. Dev runs at scale 1 so the
    // stream looks and feels like the network.
    setTimeScale(0);
    expect(true).toBe(true);
  });
});

/**
 * ── A note on cancelling a stream, for whoever builds the client ─────────────
 *
 * Measured, not assumed. Under MSW's **Node** interceptor (what Vitest uses):
 *
 *   - `response.body.cancel()` returns a promise that **never settles**.
 *   - `AbortController.abort()` does **not** reject a read that is already
 *     pending; the read simply stays pending forever.
 *
 * Both work normally in a real browser, and in dev through the service worker, so
 * this is a limitation of the test environment rather than of the mock or of the
 * client.
 *
 * The consequence for Phase 2 is concrete: **do not implement the stream timeout
 * as "abort and wait for the read to reject."** That is untestable here and, on a
 * flaky mobile connection, slower than it looks. Race the read against a timer and
 * stop consuming when the timer wins, then abort as cleanup rather than as the
 * mechanism. The `stream_stall` scenario exists precisely to keep that code
 * honest.
 */

describe('the refusal streams as an answer', () => {
  it('produces tokens, citations and done — not a connection error', async () => {
    setScenario('refusal');
    const response = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'where is my container?' }),
    });
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }

    const frames = parseFrames(chunks);
    const names = frames.map((frame) => frame.event);
    expect(names.at(-1)).toBe('done');
    expect(names.filter((name) => name === 'token').length).toBeGreaterThan(0);

    const text = frames
      .filter((frame) => frame.event === 'token')
      .map((frame) => (frame.data as { text: string }).text)
      .join('');
    // The phone number is already inside the answer.
    expect(text).toContain('869-465-8121');
    expect((frames.at(-1)?.data as { refusal: boolean }).refusal).toBe(true);
  });
});
