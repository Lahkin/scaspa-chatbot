import { Icon, type IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * What happened to a recording — spec board 21, "8 states, each error naming
 * its real limit".
 *
 * ## Every error names the actual number
 *
 * That phrase in the board's own heading is the design. "That recording is
 * 26.4 MB. The limit is 20 MB." tells someone what to do; "file too large"
 * tells them they failed. The limits are real and published — 20 MB, 60
 * seconds, five recordings a minute — so there is no reason to be vague about
 * them.
 *
 * ## And the transcript is never sent
 *
 * The success state says "Placed in the composer. Correct it before sending."
 * because that is what happens: `useRecorder` puts the text in the draft and
 * focuses it. "Nevis" versus "never" is exactly the mishearing that happens on
 * stage, and a confident answer to a misheard question is both a bad experience
 * and a bad demo moment.
 */
export type TranscriptionState =
  | { kind: 'working' }
  | { kind: 'placed'; text: string }
  | { kind: 'no-speech' }
  /** 422 — an unsupported container or codec. */
  | { kind: 'unsupported-format' }
  /** 413 — over 20 MB. `megabytes` is what the recording actually was. */
  | { kind: 'too-large'; megabytes: number }
  /** 422 — over 60 seconds. `seconds` is what it actually ran to. */
  | { kind: 'too-long'; seconds: number }
  /** 429 — the voice budget is a third of the chat one. */
  | { kind: 'rate-limited'; retryAfterS: number }
  /** 503 — the provider is unreachable, or no key is configured. */
  | { kind: 'unavailable' };

interface Presentation {
  icon: IconName;
  iconClass: string;
  container: string;
  /** The HTTP status, shown where the board shows one. */
  status?: string;
  body: string;
  detail?: string;
}

const NEUTRAL = 'border-border bg-surface-muted';
const CRITICAL = 'border-critical/35 bg-critical-tint';
const CAUTION = 'border-caution/30 bg-caution-tint';

function present(state: TranscriptionState): Presentation {
  switch (state.kind) {
    case 'working':
      return {
        icon: 'clock',
        iconClass: 'text-brand-200',
        container: NEUTRAL,
        body: 'Working out what you said…',
      };
    case 'placed':
      return {
        icon: 'check',
        iconClass: 'text-positive',
        container: 'border-brand-500 bg-surface-muted',
        body: `“${state.text}”`,
        detail: 'Placed in the composer. Correct it before sending.',
      };
    case 'no-speech':
      return {
        icon: 'info',
        iconClass: 'text-caution',
        container: NEUTRAL,
        body: 'We could not make out any words. Record again, closer to the microphone.',
      };
    case 'unsupported-format':
      return {
        icon: 'alert',
        iconClass: 'text-critical-text',
        container: CRITICAL,
        status: '422',
        body: 'That file type is not supported. Send a WAV, MP3, M4A, OGG or WebM recording.',
      };
    case 'too-large':
      return {
        icon: 'alert',
        iconClass: 'text-critical-text',
        container: CRITICAL,
        status: '413',
        // The real size, not "too large".
        body: `That recording is ${state.megabytes.toFixed(1)} MB. The limit is 20 MB. Record a shorter clip.`,
      };
    case 'too-long':
      return {
        icon: 'alert',
        iconClass: 'text-critical-text',
        container: CRITICAL,
        status: '422',
        body: `That recording is ${formatDuration(state.seconds)}. The limit is 60 seconds.`,
      };
    case 'rate-limited':
      return {
        icon: 'clock',
        iconClass: 'text-caution',
        container: CAUTION,
        status: '429',
        body: `Five recordings a minute is the limit. Try again in ${formatClock(state.retryAfterS)}.`,
      };
    case 'unavailable':
      return {
        icon: 'info',
        iconClass: 'text-ink-muted',
        container: NEUTRAL,
        status: '503',
        // Voice is an enhancement and every failure in it is contained.
        body: 'Voice is switched off at the moment. You can still type your question.',
      };
  }
}

export function TranscriptionResult({ state }: { state: TranscriptionState }) {
  const presentation = present(state);
  const failed = presentation.container !== NEUTRAL && state.kind !== 'placed';

  return (
    <div
      // A failure interrupts something the user just did; progress does not.
      role={failed ? 'alert' : 'status'}
      data-transcription={state.kind}
      className={cn('flex items-start gap-3 rounded-input border p-3.5', presentation.container)}
    >
      {presentation.status ? (
        <span className={cn('shrink-0 text-caption font-semibold tabular', presentation.iconClass)}>
          {presentation.status}
        </span>
      ) : (
        <Icon name={presentation.icon} size={16} className={cn('mt-0.5', presentation.iconClass)} />
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-label text-ink-muted">{presentation.body}</span>
        {presentation.detail ? (
          <span className="text-caption font-medium text-brand-200">{presentation.detail}</span>
        ) : null}
      </div>
    </div>
  );
}

/** `1 minute 14 seconds` — spelled out, because "74s" is a figure to decode. */
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes === 0) return `${rest} seconds`;
  return `${minutes} minute${minutes === 1 ? '' : 's'} ${rest} second${rest === 1 ? '' : 's'}`;
}

/** `0:26` for a countdown, where a clock is what the reader is watching. */
function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
