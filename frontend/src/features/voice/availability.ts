import { useSyncExternalStore } from 'react';
import { config } from '@/lib/config';
import type { VoiceStatus } from '@/lib/types';

/**
 * Whether to offer a voice control at all — the one rule, asked in two places.
 *
 * ── TWO GATES, AND THEY ANSWER DIFFERENT QUESTIONS ───────────────────────────
 *
 * `config.features.voice` is **may we**: a build-time switch, so voice can be
 * turned off an hour before a demonstration without a code change.
 *
 * `health.voice` is **can we**: the backend looked at the OpenAI project and
 * reported whether the configured speech models are reachable at all.
 *
 * Only the first existed, it defaults to true, and it is set by whoever builds
 * the frontend while the entitlement belongs to whoever holds the API key. On
 * this project they disagree — there is no speech model on the key — so the
 * microphone was rendered for every user and failed on every press, after a
 * round trip and a wait.
 *
 * A control that always fails is worse than an absent one. It is a promise the
 * product cannot keep, offered to somebody who may be standing on a pier trying
 * to use it, and it costs them the one thing they came here short of.
 *
 * ## Unknown means carry on
 *
 * `checked: false` is the backend saying it could not determine availability —
 * no key, no network, a transient upstream. The flags beside it are optimistic
 * defaults, not findings, so nothing is hidden on the strength of them.
 *
 * Hiding a working microphone because one probe failed is a worse mistake than
 * the one this fixes, and a much quieter one: the button simply stops being
 * there and nobody files a bug about a control they never saw.
 *
 * ## And an unresolved health query is also unknown
 *
 * `health` is undefined until the first poll returns. Treating that as
 * unavailable would blink the microphone out of the composer on every cold
 * load, which is a worse experience than the failure it prevents.
 */
export function canTranscribe(voice: VoiceStatus | undefined): boolean {
  if (!config.features.voice) return false;
  if (!voice?.checked) return true;
  return voice.stt;
}

export function canSpeak(voice: VoiceStatus | undefined): boolean {
  if (!config.features.voice) return false;
  if (!voice?.checked) return true;
  return voice.tts;
}

/*
 * ── A STORE, NOT A QUERY IN EVERY BUTTON ─────────────────────────────────────
 *
 * The first version called `useHealth()` inside `SpeakButton`. That button is a
 * LEAF rendered once per assistant message, so it subscribed every message to
 * the health query and — worse — made a presentational component require a
 * `QueryClientProvider`. Forty-six tests that render `MessageBubble` bare broke
 * at once, and they were right to: the same argument `Sidebar` makes about
 * staying router-free so it can be tested on its own applies here.
 *
 * So availability is published ONCE by whoever already holds health, and the
 * buttons read it with `useSyncExternalStore` — the pattern
 * `features/voice/speech.ts` already establishes in this codebase. The default
 * is the optimistic one, so a component rendered with nothing published behaves
 * exactly as it did before any of this existed.
 */

const UNKNOWN: VoiceStatus = {
  stt: true,
  tts: true,
  checked: false,
  detail: 'not reported yet',
};

let status: VoiceStatus = UNKNOWN;
const listeners = new Set<() => void>();

/** Called by whoever holds the health response. Idempotent and cheap. */
export function publishVoiceStatus(next: VoiceStatus | undefined): void {
  const value = next ?? UNKNOWN;
  if (value.stt === status.stt && value.tts === status.tts && value.checked === status.checked) {
    return;
  }
  status = value;
  for (const listener of listeners) listener();
}

export function subscribeToVoiceStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVoiceStatus(): VoiceStatus {
  return status;
}

/** Server render has no health yet, and unknown means carry on. */
export function getVoiceServerSnapshot(): VoiceStatus {
  return UNKNOWN;
}

/** Resets between tests. Production never needs it. */
export function resetVoiceStatus(): void {
  status = UNKNOWN;
  for (const listener of listeners) listener();
}

/** What a control should ask. Subscribes to the store, needs no provider. */
export function useVoiceAvailability(): { transcribe: boolean; speak: boolean } {
  const current = useSyncExternalStore(
    subscribeToVoiceStatus,
    getVoiceStatus,
    getVoiceServerSnapshot
  );
  return { transcribe: canTranscribe(current), speak: canSpeak(current) };
}
