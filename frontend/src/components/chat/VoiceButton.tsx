import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { config } from '@/lib/config';
import { transcribeAudio } from '@/lib/api';
import { useRecorder } from '@/features/voice/useRecorder';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

/**
 * The microphone.
 *
 * **Accessibility, not novelty.** A passenger with a phone in one hand and a bag
 * in the other will talk to this long before they type, and so will a driver at
 * the cargo gate with the engine running.
 *
 * Four visible states — idle, requesting permission, listening, processing —
 * because they mean different things to the user and a single spinner for all of
 * them tells nobody what to do next.
 *
 * ### It renders nothing at all when it cannot work
 *
 * Not a disabled button, not a tooltip. On plain HTTP `getUserMedia` is undefined
 * and the microphone fails with no prompt and no error; a control that does
 * nothing when tapped is worse than an absent one, because the user tries three
 * times and concludes the product is broken. `detectVoiceCapability` resolves
 * that before render and logs a dev warning naming the cause.
 */

interface VoiceButtonProps {
  /** Receives the transcript. It goes in the composer — never straight to the model. */
  onTranscript: (text: string) => void;
}

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const abort = useRef<AbortController | null>(null);

  const handleComplete = useCallback(
    async (audio: Blob) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const result = await transcribeAudio(audio, { signal: controller.signal });
        const text = result.text.trim();
        if (!text) {
          setError('Nothing was heard. Please try again, or type your question.');
          return;
        }
        // Straight into the composer. Never sent.
        onTranscript(text);
        setError(null);
      } catch {
        if (controller.signal.aborted) return;
        // Contained: the text path is completely unaffected.
        setError('That could not be transcribed. Please type your question instead.');
      }
    },
    [onTranscript]
  );

  const recorder = useRecorder({
    enabled: config.features.voice,
    onComplete: handleComplete,
    onError: setError,
  });

  useEffect(() => () => abort.current?.abort(), []);

  // Hidden entirely — see the note above. No layout hole: the composer's flex row
  // simply has one fewer child.
  if (!recorder.capability.available) return null;

  const { state, level, nearLimit, remainingS } = recorder;
  const listening = state === 'listening';
  const busy = state === 'requesting' || state === 'processing';

  const label =
    state === 'listening'
      ? 'Stop recording and transcribe'
      : state === 'requesting'
        ? 'Waiting for microphone permission'
        : state === 'processing'
          ? 'Transcribing'
          : 'Ask by voice';

  const announcement =
    state === 'requesting'
      ? 'Waiting for microphone permission'
      : state === 'listening'
        ? nearLimit
          ? `Listening. ${remainingS} seconds left.`
          : 'Listening'
        : state === 'processing'
          ? 'Processing'
          : '';

  return (
    <div className="flex shrink-0 items-center gap-1">
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
        disabled={busy}
        // Reflects whether a recording is in progress, which is what a screen
        // reader needs to know before deciding whether pressing it starts or stops.
        aria-pressed={listening}
        aria-label={label}
        className={cn(
          'inline-flex size-touch-min shrink-0 items-center justify-center rounded-md',
          'transition-colors duration-fast ease-out-soft disabled:cursor-not-allowed',
          listening
            ? 'bg-danger text-ink-inverse'
            : 'text-ink-muted hover:bg-neutral-100 hover:text-ink disabled:text-ink-subtle'
        )}
      >
        {state === 'processing' || state === 'requesting' ? (
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-4 rounded-full border-2 border-current border-t-transparent',
              !reduced && 'animate-spin'
            )}
          />
        ) : (
          <span aria-hidden="true" className="text-lead">
            {listening ? '■' : '🎙'}
          </span>
        )}
      </button>

      {listening && (
        <>
          <LevelMeter level={level} />
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Cancel recording and discard it"
            className="inline-flex size-touch-min shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-100 hover:text-ink"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </>
      )}

      {/*
        The live region. A voice feature that cannot be followed without sight is
        an ironic failure, and "is it listening yet" is the one question the visual
        states answer and a screen reader otherwise cannot.
      */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      {nearLimit && listening && (
        <span className="text-caption tabular text-danger" aria-hidden="true">
          {remainingS}s
        </span>
      )}

      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
      {error && (
        <span className="max-w-40 text-caption text-danger" aria-hidden="true">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * A live level meter, driven by real audio.
 *
 * The point is what it does when nothing is arriving. A looping animation moves
 * whether or not the microphone is muted, so a user whose mic is off sees a
 * confident animation, talks for thirty seconds and gets nothing — with no way to
 * tell whether the fault was theirs, the browser's or ours. A real meter that
 * stays flat says "we are not hearing you", which is the useful answer.
 */
function LevelMeter({ level }: { level: number }) {
  const bars = 4;
  return (
    <span aria-hidden="true" className="flex h-5 shrink-0 items-end gap-0.5">
      {Array.from({ length: bars }, (_, index) => {
        // Each bar has a threshold, so quiet speech lights one and a shout lights
        // all four.
        const threshold = (index + 1) / (bars + 1);
        const active = level >= threshold;
        return (
          <span
            key={index}
            className={cn(
              'w-1 rounded-full transition-all duration-fast',
              active ? 'bg-danger' : 'bg-neutral-300'
            )}
            style={{ height: `${6 + index * 4}px` }}
          />
        );
      })}
    </span>
  );
}
