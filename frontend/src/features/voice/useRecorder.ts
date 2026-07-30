import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_RECORDING_MS,
  MAX_UPLOAD_BYTES,
  WARN_FROM_MS,
  detectVoiceCapability,
  isAcceptedByBackend,
} from './capabilities';
import { getAudioContext, unlockAudio } from './audioUnlock';

/**
 * Recording, with the four states the button needs.
 *
 * `idle` → `requesting` → `listening` → `processing` → `idle`.
 *
 * The states are explicit rather than derived from a pair of booleans because
 * they mean different things to the user and each needs its own copy:
 * `requesting` is "your browser is asking you", which is a prompt to go and look
 * at the address bar, and `processing` is "we have your audio and are working" —
 * telling someone to keep talking during that would lose the end of their
 * question.
 */
export type RecorderState = 'idle' | 'requesting' | 'listening' | 'processing';

export type PermissionState = 'unknown' | 'granted' | 'denied';

interface UseRecorderOptions {
  enabled: boolean;
  /** Called with the finished audio. The caller posts it to /api/stt. */
  onComplete: (audio: Blob) => void | Promise<void>;
  onError: (message: string) => void;
}

export function useRecorder({ enabled, onComplete, onError }: UseRecorderOptions) {
  const capability = detectVoiceCapability(enabled);

  const [state, setState] = useState<RecorderState>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const frame = useRef<number | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const startedAt = useRef(0);
  /** Set when the user cancels, so the `stop` handler knows to discard. */
  const cancelled = useRef(false);

  const teardown = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;

    analyser.current?.disconnect();
    analyser.current = null;

    // Releasing every track is what turns off the browser's recording indicator.
    // Leaving it on after a recording is both a privacy problem and the kind of
    // thing that gets noticed on stage.
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    recorder.current = null;
    chunks.current = [];
    setLevel(0);
    setElapsedMs(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  /**
   * The live level meter, from real audio.
   *
   * Driven by an `AnalyserNode` reading the actual microphone, not a looping
   * animation. A fake animation **lies when the mic is muted** — the user sees
   * movement, assumes it is working, talks for thirty seconds and gets nothing
   * back, with no way to tell whether the problem was them, the browser or us.
   * A real meter that stays flat says "we are not hearing you", which is the one
   * useful thing to know.
   */
  const startMetering = useCallback((source: MediaStream) => {
    const audio = getAudioContext();
    if (!audio) return;

    try {
      const node = audio.createAnalyser();
      node.fftSize = 512;
      // Some smoothing, or the bar flickers on every consonant.
      node.smoothingTimeConstant = 0.6;
      audio.createMediaStreamSource(source).connect(node);
      analyser.current = node;

      const buffer = new Uint8Array(node.frequencyBinCount);
      const tick = () => {
        if (!analyser.current) return;
        analyser.current.getByteTimeDomainData(buffer);

        // RMS around the 128 centre line, which is amplitude rather than
        // loudness — good enough to show that sound is arriving.
        let sum = 0;
        for (const sample of buffer) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / buffer.length);
        // Scaled so ordinary speech fills a useful part of the bar.
        setLevel(Math.min(1, rms * 3.2));

        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch {
      // Metering is a nicety; recording still works without it.
    }
  }, []);

  const finish = useCallback(
    (blob: Blob) => {
      if (blob.size === 0) {
        onError('No audio was recorded. Check that your microphone is not muted.');
        setState('idle');
        return;
      }
      if (blob.size > MAX_UPLOAD_BYTES) {
        // The backend would reject it; saying so here costs one round trip less.
        onError('That recording is too long to send. Please try a shorter question.');
        setState('idle');
        return;
      }
      setState('processing');
      void Promise.resolve(onComplete(blob)).finally(() => setState('idle'));
    },
    [onComplete, onError]
  );

  /**
   * Ask for the microphone **at the moment the user taps**, never on page load.
   *
   * A permission prompt on arrival is hostile, arrives before any reason to trust
   * the page, and gets denied — permanently, for the origin. Asking on the tap
   * means the request has an obvious cause.
   */
  const start = useCallback(async () => {
    if (!capability.available || !capability.mimeType) return;
    if (state !== 'idle') return;
    // Denied once is denied for the session. Asking again produces nothing —
    // the browser will not re-prompt — and it wastes a tap.
    if (permission === 'denied') return;

    // The tap that starts a recording is also a gesture, so use it.
    unlockAudio();

    cancelled.current = false;
    setState('requesting');

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (thrown) {
      const name = thrown instanceof Error ? thrown.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied');
        onError(
          'Microphone access was blocked. To turn it back on, tap the padlock or ' +
            'camera icon in your browser address bar and allow the microphone, then reload.'
        );
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        onError('No microphone was found on this device. You can still type your question.');
      } else {
        onError('The microphone could not be started. You can still type your question.');
      }
      setState('idle');
      return;
    }

    setPermission('granted');
    stream.current = media;

    let instance: MediaRecorder;
    try {
      instance = new MediaRecorder(media, { mimeType: capability.mimeType });
    } catch {
      // Negotiation said this type was supported; if construction still fails,
      // let the browser pick rather than losing the recording entirely.
      instance = new MediaRecorder(media);
    }
    recorder.current = instance;
    chunks.current = [];

    instance.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };

    instance.onstop = () => {
      const collected = chunks.current;
      const type = instance.mimeType || capability.mimeType || 'audio/webm';
      teardown();

      if (cancelled.current) {
        // Discarded without sending. Nothing is uploaded and nothing is kept.
        setState('idle');
        return;
      }

      const blob = new Blob(collected, { type });
      if (!isAcceptedByBackend(blob.type)) {
        // Should be unreachable — negotiation only picks from the whitelist — but
        // a clean local message beats a 422 that looks like a broken recorder.
        onError('This browser produced an audio format the assistant cannot read.');
        setState('idle');
        return;
      }
      finish(blob);
    };

    startedAt.current = Date.now();
    // A timeslice, so a long recording is not one enormous buffer and `onstop`
    // has data even if the final `requestData` is missed.
    instance.start(1000);
    setState('listening');
    startMetering(media);
  }, [capability, state, permission, onError, finish, startMetering, teardown]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  /** Discard without sending. */
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else {
      teardown();
      setState('idle');
    }
  }, [teardown]);

  /**
   * The clock, and the auto-stop.
   *
   * The backend caps audio at roughly 60 seconds. Stopping at 55 leaves headroom
   * for the final chunk and the upload, so a recording is never rejected for
   * being a second over — losing a 60-second question to a rounding error is
   * exactly the failure worth engineering out.
   */
  useEffect(() => {
    if (state !== 'listening') return undefined;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) stop();
    }, 250);

    return () => clearInterval(timer);
  }, [state, stop]);

  return {
    capability,
    state,
    permission,
    level,
    elapsedMs,
    /** True from 45 seconds, so the stop is expected rather than abrupt. */
    nearLimit: elapsedMs >= WARN_FROM_MS,
    remainingS: Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsedMs) / 1000)),
    start,
    stop,
    cancel,
  };
}
