/**
 * Text to speech, through **one** audio element for the whole app.
 *
 * Two answers talking over each other is a memorable failure and an easy one to
 * ship: a per-message `<audio>` gives every speaker button its own player, and
 * tapping a second one leaves the first running. So there is exactly one element,
 * a module-level store, and starting a playback stops whatever was playing.
 *
 * It is a store rather than React state because the element outlives any
 * component — a message can scroll out of the list while its audio is still
 * playing, and unmounting the button must not stop the sound.
 */

import { synthesiseSpeech } from '@/lib/api';
import { getAudioContext, unlockAudio } from './audioUnlock';

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'paused';

export interface SpeechState {
  /** Which message is speaking, or null. */
  messageId: string | null;
  status: SpeechStatus;
  /** Contained here so a failure never reaches the text path. */
  error: string | null;
}

let state: SpeechState = { messageId: null, status: 'idle', error: null };
const listeners = new Set<() => void>();

let element: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let inFlight: AbortController | null = null;

export function getSpeechState(): SpeechState {
  return state;
}

export function subscribeToSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Server snapshot for `useSyncExternalStore`. */
export function getSpeechServerSnapshot(): SpeechState {
  return IDLE;
}

const IDLE: SpeechState = { messageId: null, status: 'idle', error: null };

function set(next: SpeechState): void {
  state = next;
  for (const listener of listeners) listener();
}

function audio(): HTMLAudioElement {
  if (element) return element;
  element = new Audio();
  element.preload = 'auto';
  element.addEventListener('ended', () => {
    revoke();
    set({ messageId: null, status: 'idle', error: null });
  });
  element.addEventListener('pause', () => {
    // `pause` also fires on `ended` and on a deliberate stop; only report a real
    // user pause.
    if (element && !element.ended && state.status === 'playing') {
      set({ ...state, status: 'paused' });
    }
  });
  element.addEventListener('play', () => {
    if (state.status !== 'playing') set({ ...state, status: 'playing' });
  });
  return element;
}

function revoke(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

/** Stop whatever is playing and forget it. */
export function stopSpeech(): void {
  inFlight?.abort();
  inFlight = null;
  const player = element;
  if (player) {
    player.pause();
    player.removeAttribute('src');
    player.load();
  }
  revoke();
  set(IDLE);
}

/**
 * Speak an answer.
 *
 * The text is sent **verbatim** — the backend strips markdown, citation markers,
 * URLs and JSON, and expands phone numbers and currency, so pre-cleaning here
 * would only diverge from what it does.
 *
 * Every failure is contained: it sets `error` on this store and nothing else. The
 * text path is completely unaffected, which is the property that lets a demo carry
 * on without comment when the mic or the provider fails.
 */
export async function speak(messageId: string, text: string): Promise<void> {
  // Same message, already speaking: treat the tap as a toggle.
  if (state.messageId === messageId && state.status === 'playing') {
    audio().pause();
    return;
  }
  if (state.messageId === messageId && state.status === 'paused') {
    void audio()
      .play()
      .catch(() => {});
    return;
  }

  stopSpeech();
  // The tap is a gesture; use it, because iOS will refuse playback otherwise.
  unlockAudio();
  void getAudioContext()
    ?.resume()
    .catch(() => {});

  set({ messageId, status: 'loading', error: null });

  const controller = new AbortController();
  inFlight = controller;

  let blob: Blob;
  try {
    blob = await synthesiseSpeech(text, { signal: controller.signal });
  } catch {
    if (controller.signal.aborted) return;
    inFlight = null;
    // The id is KEPT. Clearing it here meant no button matched the error and it
    // was never displayed — the failure was silent, which is the one thing a
    // contained failure must not be.
    set({
      messageId,
      status: 'idle',
      error: 'The spoken version is not available just now. The answer above is unchanged.',
    });
    return;
  }

  if (controller.signal.aborted) return;
  inFlight = null;

  objectUrl = URL.createObjectURL(blob);
  const player = audio();
  player.src = objectUrl;

  try {
    await player.play();
    set({ messageId, status: 'playing', error: null });
  } catch {
    // NotAllowedError on iOS when no gesture has unlocked audio. Says what to do
    // rather than failing silently, which is the whole iOS trap.
    revoke();
    set({
      messageId,
      status: 'idle',
      error: 'Playback was blocked by the browser. Tap the speaker again to start it.',
    });
  }
}

export function clearSpeechError(): void {
  if (state.error) set({ ...state, error: null });
}

/** Test seam. */
export function resetSpeech(): void {
  inFlight?.abort();
  inFlight = null;
  element = null;
  revoke();
  state = IDLE;
  listeners.clear();
}
