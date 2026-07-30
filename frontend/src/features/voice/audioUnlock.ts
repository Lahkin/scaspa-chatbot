/**
 * Unlocking audio on iOS.
 *
 * iOS Safari refuses programmatic audio playback that is not tied to a user
 * gesture. The failure is the worst kind: TTS works on every desktop browser
 * through every round of testing, and then silently does nothing on the
 * presenter's iPhone in front of the room. `play()` returns a promise that
 * rejects with `NotAllowedError`, which nobody is watching for.
 *
 * The fix is to create and resume an `AudioContext` — and prime an `<audio>`
 * element — inside the **first user gesture anywhere in the app**, then reuse
 * them. By the time someone taps a speaker button, the gesture that unlocked
 * audio was their tap on a suggested question thirty seconds earlier.
 *
 * Listeners are attached once, capture-phase, and remove themselves after the
 * first gesture.
 */

let context: AudioContext | null = null;
let unlocked = false;
let listening = false;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  // `webkitAudioContext` is still what older iOS exposes.
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return candidate ?? null;
}

/**
 * The shared context, created lazily.
 *
 * One per app: iOS limits how many can exist, and creating one per recording
 * eventually fails outright.
 */
export function getAudioContext(): AudioContext | null {
  if (context) return context;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

/**
 * Run inside a real user gesture.
 *
 * Resuming a suspended context is the part that matters; the silent buffer is
 * what convinces older iOS that playback has genuinely begun.
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const audio = getAudioContext();
  if (!audio) return;

  void audio.resume().catch(() => {});

  try {
    const source = audio.createBufferSource();
    source.buffer = audio.createBuffer(1, 1, 22050);
    source.connect(audio.destination);
    source.start(0);
  } catch {
    // Older engines throw on a zero-length buffer. The resume above is the part
    // that matters; this is belt and braces.
  }

  unlocked = true;
}

/**
 * Listen for the first gesture anywhere and unlock.
 *
 * Called once from the app root. `pointerdown` and `keydown` rather than `click`,
 * because they fire earlier in the same gesture — and `touchend`, which is the
 * one older iOS actually honours.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === 'undefined' || listening || unlocked) return () => {};
  listening = true;

  const events = ['pointerdown', 'touchend', 'keydown'] as const;

  const handler = () => {
    unlockAudio();
    for (const event of events) {
      window.removeEventListener(event, handler, true);
    }
    listening = false;
  };

  for (const event of events) {
    // Capture, so a component calling stopPropagation cannot swallow the gesture
    // that unlocks audio for the whole session.
    window.addEventListener(event, handler, true);
  }

  return handler;
}

/** Test seam. */
export function resetAudioUnlock(): void {
  context = null;
  unlocked = false;
  listening = false;
}
