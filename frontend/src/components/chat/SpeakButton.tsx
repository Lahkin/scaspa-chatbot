import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { config } from '@/lib/config';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import {
  getSpeechServerSnapshot,
  getSpeechState,
  speak,
  stopSpeech,
  subscribeToSpeech,
} from '@/features/voice/speech';

/**
 * Read this answer aloud.
 *
 * The text is sent **verbatim**: the backend strips markdown, citation markers,
 * URLs and JSON, and expands phone numbers and currency into something a person
 * can write down. Pre-cleaning here would only diverge from that.
 *
 * State comes from a shared store, not from this component, because there is one
 * audio element for the whole app — starting a playback stops the previous one.
 * Two answers talking over each other is a memorable failure and the default
 * outcome of giving every message its own player.
 */
export function SpeakButton({ messageId, text }: { messageId: string; text: string }) {
  const speech = useSyncExternalStore(subscribeToSpeech, getSpeechState, getSpeechServerSnapshot);
  const reduced = useReducedMotion();

  // Voice is optional, always. With the flag off the control is absent rather
  // than disabled, and the row simply has one fewer child.
  if (!config.features.voice) return null;

  const mine = speech.messageId === messageId;
  const status = mine ? speech.status : 'idle';

  const label =
    status === 'playing'
      ? 'Pause reading this answer'
      : status === 'paused'
        ? 'Resume reading this answer'
        : status === 'loading'
          ? 'Preparing the spoken version'
          : 'Read this answer aloud';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void speak(messageId, text)}
        disabled={status === 'loading'}
        aria-label={label}
        // Reflects whether this message is the one being read.
        aria-pressed={mine && status !== 'idle'}
        className={cn(
          'inline-flex min-h-touch min-w-touch items-center justify-center rounded-md px-1',
          'text-ink-muted transition-colors duration-fast hover:bg-neutral-100 hover:text-ink',
          'disabled:cursor-not-allowed',
          mine && status === 'playing' && 'text-blue-700'
        )}
      >
        {status === 'loading' ? (
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-4 rounded-full border-2 border-current border-t-transparent',
              !reduced && 'animate-spin'
            )}
          />
        ) : (
          <span aria-hidden="true" className="text-body">
            {status === 'playing' ? '⏸' : '🔊'}
          </span>
        )}
      </button>

      {mine && status !== 'idle' && (
        <button
          type="button"
          onClick={stopSpeech}
          aria-label="Stop reading"
          className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md text-ink-muted hover:bg-neutral-100 hover:text-ink"
        >
          <span aria-hidden="true">■</span>
        </button>
      )}

      <span aria-live="polite" className="sr-only">
        {mine && status === 'playing'
          ? 'Reading the answer aloud'
          : mine && status === 'paused'
            ? 'Paused'
            : ''}
      </span>

      {/* Contained: a TTS failure says so here and changes nothing else. */}
      {mine && speech.error && (
        <span role="alert" className="text-caption text-ink-muted">
          {speech.error}
        </span>
      )}
    </span>
  );
}
