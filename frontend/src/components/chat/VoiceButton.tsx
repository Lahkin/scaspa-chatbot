import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ApiError, transcribeAudio } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { useRecorder } from '@/features/voice/useRecorder';
import { useVoiceAvailability } from '@/features/voice/availability';
import { MAX_RECORDING_MS } from '@/features/voice/capabilities';
import { TranscriptionResult, type TranscriptionState } from './TranscriptionResult';

/**
 * The record button — §6.15, six states, **44px circle at every breakpoint**.
 *
 * | Idle              | `1px solid --border`, 18px mic `--text-2`                        |
 * | Hover             | `1px solid --brand-500`, `--surface-3`, mic `--brand-100`        |
 * | Recording         | `--brand-500` fill, 18px waveform `#FFFFFF` · `Recording 0:12`   |
 * | Approaching 60s   | `--caution` fill, elapsed in `600 12/16 #22245E` · `7 seconds left` |
 * | Permission denied | `--critical-fill`, `1px solid rgba(217,86,75,0.4)`, mic `--critical-text` |
 * | Voice off         | `1px dashed --border`, mic `--text-3`                            |
 *
 * **Accessibility, not novelty.** A passenger with a phone in one hand and a bag
 * in the other will talk to this long before they type, and so will a driver at
 * the cargo gate with the engine running. 44px at every breakpoint is the same
 * decision §1.3 makes for tap-to-call: the control that matters does not shrink.
 *
 * ## It drew three emoji
 *
 * 🎙, ■ and ✕. No icon rule can govern an emoji — the platform renders it in its
 * own font at its own colour, so "mic in `--text-2`" was not expressible and the
 * hover, denied and voice-off treatments could not exist. Same correction as the
 * speak button's on board 15.
 *
 * ## Voice off is drawn; a browser that cannot record still renders nothing
 *
 * Two different causes, and only one of them is a state:
 *
 * - **`disabled`** — the deployment switched voice off. §6.15 draws it: a dashed
 *   outline, inert. A control that vanishes is one the user has to remember
 *   existed; a dashed edge says "this is switched off".
 * - **anything else** — `getUserMedia` is undefined on plain HTTP, or the
 *   browser has no recorder, or no supported format. Nothing is drawn, because
 *   "a control that does nothing when tapped is worse than an absent one: the
 *   user tries three times and concludes the product is broken."
 *
 * The first is a fact about SCASPA's deployment; the second is a fact about the
 * reader's browser, and only the first is worth a square of screen.
 */
interface VoiceButtonProps {
  /** Receives the transcript. It goes in the composer — never straight to the model. */
  onTranscript: (text: string) => void;
}

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const [result, setResult] = useState<TranscriptionState | null>(null);
  const abort = useRef<AbortController | null>(null);

  const handleComplete = useCallback(
    async (audio: Blob) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setResult({ kind: 'working' });
      try {
        const transcript = await transcribeAudio(audio, { signal: controller.signal });
        const text = transcript.text.trim();
        if (!text) {
          setResult({ kind: 'no-speech' });
          return;
        }
        // Straight into the composer. Never sent — §6.16, and global rule 12.
        onTranscript(text);
        setResult({ kind: 'placed', text });
      } catch (thrown) {
        if (controller.signal.aborted) return;
        // Contained: the text path is completely unaffected.
        setResult(toTranscriptionState(thrown, audio));
      }
    },
    [onTranscript]
  );

  /*
   * `canTranscribe` and not `config.features.voice`, which was the whole of the
   * gate and is only half the question. The flag is "may we"; the backend's
   * health report is "can we" — on a project with no speech models the answer
   * is no, and the microphone used to be rendered anyway and fail on every
   * press after a round trip and a wait.
   *
   * The recorder's own `capability.reason === 'disabled'` branch already draws
   * the off state and labels it, so nothing below this line changes.
   */
  const voice = useVoiceAvailability();

  const recorder = useRecorder({
    enabled: voice.transcribe,
    onComplete: handleComplete,
    onError: () => setResult({ kind: 'unavailable' }),
  });

  useEffect(() => () => abort.current?.abort(), []);

  const { capability, state, permission, level, elapsedMs, nearLimit, remainingS } = recorder;
  const voiceOff = capability.reason === 'disabled';

  // See the note above: a browser that cannot record draws nothing at all.
  if (!capability.available && !voiceOff) return null;

  const listening = state === 'listening';
  const busy = state === 'requesting' || state === 'processing';
  const denied = permission === 'denied';
  const visual: Visual = voiceOff
    ? 'off'
    : denied
      ? 'denied'
      : listening && nearLimit
        ? 'ending'
        : listening
          ? 'recording'
          : 'idle';

  const label = voiceOff
    ? 'Asking by voice is switched off'
    : denied
      ? 'The microphone is blocked for this site'
      : listening
        ? 'Stop recording and transcribe'
        : state === 'requesting'
          ? 'Waiting for microphone permission'
          : state === 'processing'
            ? 'Transcribing'
            : 'Ask by voice';

  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (listening) recorder.stop();
            else void recorder.start();
          }}
          onKeyDown={(event) => {
            // Escape cancels and discards. Space and Enter already activate a
            // button natively, so they are not re-implemented here — doing so
            // double-fires on some browsers.
            if (event.key === 'Escape' && listening) {
              event.preventDefault();
              recorder.cancel();
            }
          }}
          disabled={voiceOff || busy}
          // Whether a recording is in progress, which is what a screen reader
          // needs before deciding whether pressing it starts or stops.
          aria-pressed={listening}
          aria-label={label}
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-full',
            'transition-colors duration-fast ease-out-soft disabled:cursor-not-allowed',
            TREATMENT[visual]
          )}
        >
          {visual === 'ending' ? (
            /*
             * The elapsed time INSIDE the button — §6.15 draws `0:53` on the
             * caution fill, at `600 12/16` tabular. The ink comes from the
             * button's own treatment, where it sits beside the fill it is safe
             * on.
             */
            <span className="text-caption font-semibold tabular">{clock(elapsedMs)}</span>
          ) : (
            <Icon name={visual === 'recording' ? 'waveform' : 'microphone'} size={18} />
          )}
        </button>

        {listening ? (
          <>
            <LevelMeter level={level} />
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Cancel recording and discard it"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              <Icon name="x" size={16} />
            </button>
          </>
        ) : null}

        {/*
         * §6.15's captions. Beside the button rather than beneath it: the
         * composer's control row is horizontal, and the board's vertical
         * stacking is how a swatch grid is laid out, not where this sits.
         */}
        {visual === 'recording' ? (
          <span className="text-caption font-medium text-ink-muted tabular">
            Recording {clock(elapsedMs)}
          </span>
        ) : null}
        {visual === 'ending' ? (
          <span className="text-caption font-medium text-caution tabular">
            {remainingS} seconds left
          </span>
        ) : null}
      </div>

      {/*
        The live region. A voice feature that cannot be followed without sight is
        an ironic failure, and "is it listening yet" is the one question the
        visual states answer and a screen reader otherwise cannot.
      */}
      <span aria-live="polite" className="sr-only">
        {state === 'requesting'
          ? 'Waiting for microphone permission'
          : listening
            ? nearLimit
              ? `Listening. ${remainingS} seconds left.`
              : 'Listening'
            : state === 'processing'
              ? 'Processing'
              : ''}
      </span>

      {/* §6.15's permission-denied message, in its own panel. */}
      {denied ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-input border border-critical-notice-edge bg-critical-tint px-3.5 py-3 text-label leading-5 text-ink-muted"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-critical-text" />
          Your browser is blocking the microphone for this site. Allow it in the address bar, or
          type your question instead.
        </p>
      ) : null}

      {/* §6.16's eight states, in the one component that draws them. */}
      {result ? <TranscriptionResult state={result} /> : null}
    </div>
  );
}

type Visual = 'idle' | 'recording' | 'ending' | 'denied' | 'off';

const TREATMENT: Record<Visual, string> = {
  idle: 'border border-border text-ink-muted hover:border-brand-500 hover:bg-surface-3 hover:text-brand-100',
  recording: 'bg-brand-500 text-ink-inverse',
  /*
   * The last fifteen seconds. A caution fill, and the clock replaces the glyph.
   *
   * The ink is on this line with its fill deliberately: `--brand-700` is the one
   * §1.2 puts on a caution ground (6.20:1, where white is 2.29:1), and
   * `tests/contrast.test.ts` reads a line at a time — a dark brand step as text
   * is legitimate only when the same element supplies the light fill.
   */
  ending: 'bg-caution text-ink-on-bright',
  denied: 'border border-critical-edge bg-critical-tint text-critical-text',
  off: 'border border-dashed border-border disabled:text-ink-disabled',
};

/** `0:12`, and `0:53` — the elapsed clock §6.15 draws in two places. */
function clock(elapsedMs: number): string {
  const seconds = Math.min(Math.floor(elapsedMs / 1000), Math.floor(MAX_RECORDING_MS / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * A failure, in §6.16's terms.
 *
 * Every one names the limit it hit and the value that broke it, so the mapping
 * carries the **measured** figure through rather than a status code alone: the
 * size of the blob is known here, and the duration cap is the recorder's own.
 */
function toTranscriptionState(thrown: unknown, audio: Blob): TranscriptionState {
  if (!(thrown instanceof ApiError)) return { kind: 'unavailable' };

  if (thrown.status === 429) {
    return { kind: 'rate-limited', retryAfterS: thrown.retryAfter ?? 60 };
  }
  if (thrown.status === 413) {
    return { kind: 'too-large', megabytes: audio.size / 1_000_000 };
  }
  if (thrown.status === 422) {
    /*
     * The API answers both "wrong container" and "too long" with a 422, and the
     * two need different sentences. The recorder's own cap is the only duration
     * this client measured, so a recording at the cap is the long one; anything
     * shorter was refused for its format.
     */
    return audio.size > 0 && thrown.message.toLowerCase().includes('second')
      ? { kind: 'too-long', seconds: Math.round(MAX_RECORDING_MS / 1000) }
      : { kind: 'unsupported-format' };
  }
  return { kind: 'unavailable' };
}

/**
 * A live level meter, driven by real audio.
 *
 * The point is what it does when nothing is arriving. A looping animation moves
 * whether or not the microphone is muted, so a user whose mic is off sees a
 * confident animation, talks for thirty seconds and gets nothing — with no way
 * to tell whether the fault was theirs, the browser's or ours. A real meter that
 * stays flat says "we are not hearing you", which is the useful answer.
 *
 * §6.15 does not draw it, and §3.2 does not enumerate the control row **while
 * recording** — only the empty and typing states. So this is kept: it is a real
 * signal, not decoration, and nothing in the handoff refuses it.
 */
function LevelMeter({ level }: { level: number }) {
  const bars = 4;
  return (
    <span aria-hidden="true" className="flex h-5 shrink-0 items-end gap-0.5">
      {Array.from({ length: bars }, (_, index) => {
        // Each bar has a threshold, so quiet speech lights one and a shout
        // lights all four.
        const threshold = (index + 1) / (bars + 1);
        return (
          <span
            key={index}
            className={cn(
              'w-1 rounded-full transition-all duration-fast',
              level >= threshold ? 'bg-brand-400' : 'bg-border'
            )}
            style={{ height: `${6 + index * 4}px` }}
          />
        );
      })}
    </span>
  );
}
