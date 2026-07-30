/**
 * What this browser can actually do, decided before anything is rendered.
 *
 * Every check here has a failure mode that is **silent** — the button appears,
 * the user taps it, and nothing happens with no error anywhere. Each one is
 * therefore resolved up front and the control is hidden rather than shipped
 * broken.
 */

/**
 * The MIME types the backend accepts, in the order this client prefers them.
 *
 * The whitelist is webm, mp4, m4a, mpeg, wav and ogg. **The order matters**:
 * Chrome and Firefox produce `audio/webm`, Safari produces `audio/mp4`, and iOS
 * Safari is the case that matters most because these users are on iPhones.
 * Sending something off the list gets a clean 422 that is easy to misdiagnose as
 * a broken recorder.
 *
 * Opus is listed before bare webm because it is smaller for the same quality, and
 * the cap is 20MB.
 */
export const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mpeg',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/wav',
] as const;

/** The base types the backend whitelists, for validating whatever we end up with. */
const ACCEPTED_BASE_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

/**
 * Ask the browser which of the candidates it can actually produce.
 *
 * Feature-detected, never assumed. `MediaRecorder.isTypeSupported` is the only
 * honest answer — a user-agent sniff gets iPadOS wrong, and iPadOS reports itself
 * as a Mac.
 *
 * Returns null when none is supported, which is a real state on older Safari and
 * means the control must not be shown.
 */
export function pickMimeType(
  isSupported: (type: string) => boolean = defaultIsTypeSupported
): string | null {
  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (isSupported(candidate)) return candidate;
  }
  return null;
}

function defaultIsTypeSupported(type: string): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  // Safari has shipped MediaRecorder without isTypeSupported in the past.
  if (typeof MediaRecorder.isTypeSupported !== 'function') return false;
  return MediaRecorder.isTypeSupported(type);
}

/** Whether a negotiated type is one the backend will accept. */
export function isAcceptedByBackend(mimeType: string): boolean {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ACCEPTED_BASE_TYPES.includes(base);
}

export type VoiceUnavailableReason =
  'disabled' | 'insecure-context' | 'no-media-devices' | 'no-recorder' | 'no-supported-format';

export interface VoiceCapability {
  available: boolean;
  reason: VoiceUnavailableReason | null;
  /** The negotiated type, when available. */
  mimeType: string | null;
}

/**
 * Can this browser record at all?
 *
 * **`isSecureContext` is the one that catches people out.** `getUserMedia` is
 * only exposed on HTTPS or `localhost`. Testing on a phone against a laptop's LAN
 * address — `http://192.168.1.20:5173`, the usual way — leaves `mediaDevices`
 * undefined and the microphone fails with no prompt, no dialog and nothing in the
 * console. It looks exactly like a bug in this code, and it is not.
 *
 * So the button is **hidden entirely** rather than shipped in a state where it
 * cannot work. A control that does nothing when tapped is worse than an absent
 * one: the user tries three times and concludes the product is broken.
 */
export function detectVoiceCapability(enabled: boolean): VoiceCapability {
  if (!enabled) return { available: false, reason: 'disabled', mimeType: null };

  if (typeof window === 'undefined') {
    return { available: false, reason: 'no-media-devices', mimeType: null };
  }

  if (!window.isSecureContext) {
    warnOnce(
      '[voice] Microphone disabled: this page is not a secure context.\n' +
        '  getUserMedia requires HTTPS or localhost. On a plain-HTTP LAN address ' +
        '(http://192.168.x.x:5173) the microphone fails SILENTLY — no prompt, no error.\n' +
        '  Use http://localhost:5173, or serve over HTTPS to test on a phone.\n' +
        '  The voice control is hidden rather than shown in a state where it cannot work.'
    );
    return { available: false, reason: 'insecure-context', mimeType: null };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    warnOnce('[voice] Microphone disabled: navigator.mediaDevices.getUserMedia is unavailable.');
    return { available: false, reason: 'no-media-devices', mimeType: null };
  }

  if (typeof MediaRecorder === 'undefined') {
    warnOnce('[voice] Microphone disabled: this browser has no MediaRecorder.');
    return { available: false, reason: 'no-recorder', mimeType: null };
  }

  const mimeType = pickMimeType();
  if (!mimeType) {
    warnOnce(
      '[voice] Microphone disabled: none of the formats the backend accepts is ' +
        `supported here. Tried: ${CANDIDATE_MIME_TYPES.join(', ')}`
    );
    return { available: false, reason: 'no-supported-format', mimeType: null };
  }

  return { available: true, reason: null, mimeType };
}

const warned = new Set<string>();

/** One line per distinct problem. Repeating it every render is how a warning gets ignored. */
function warnOnce(message: string): void {
  if (!import.meta.env.DEV || warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** Test seam. */
export function resetVoiceWarnings(): void {
  warned.clear();
}

// ── Recording limits ─────────────────────────────────────────────────────────

/**
 * The backend caps audio at 20MB and roughly 60 seconds.
 *
 * Stopping at 55 leaves headroom for the final chunk and the upload, so a
 * recording is never rejected for being a second over — a rejection at that point
 * costs the user the whole question.
 */
export const MAX_RECORDING_MS = 55_000;
/** From here the user is told, so the stop is expected rather than abrupt. */
export const WARN_FROM_MS = 45_000;
/** Belt and braces: the backend limit, checked before upload. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
