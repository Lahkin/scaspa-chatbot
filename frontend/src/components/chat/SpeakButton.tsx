import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { config } from '@/lib/config';
import { Icon, type IconName } from '@/components/ui/Icon';
import {
  getSpeechServerSnapshot,
  getSpeechState,
  speak,
  stopSpeech,
  subscribeToSpeech,
} from '@/features/voice/speech';

/**
 * Read this answer aloud — the speak button of §3.13, all seven states.
 *
 * The text is sent **verbatim**: the backend strips markdown, citation markers,
 * URLs and JSON, and expands phone numbers and currency into something a person
 * can write down. Pre-cleaning here would only diverge from that.
 *
 * State comes from a shared store, not from this component, because there is one
 * audio element for the whole app — starting a playback stops the previous one.
 * Two answers talking over each other is a memorable failure and the default
 * outcome of giving every message its own player.
 *
 * ## The seven states
 *
 * | State         | Background            | Glyph                      |
 * | ------------- | --------------------- | -------------------------- |
 * | Idle          | transparent           | waveform `--text-3`        |
 * | Hover         | `--surface-3`         | waveform `--text-1`        |
 * | Focus-visible | transparent + ring    | waveform `--text-1`        |
 * | Preparing     | `rgba(56,58,151,.35)` | clock `--brand-200`        |
 * | Speaking      | `--brand-500`         | pause `#FFFFFF`            |
 * | Failed        | `--critical-fill`     | alert `--critical-text`    |
 * | Voice off     | transparent, dashed   | waveform `--text-3`        |
 *
 * Hover and focus are CSS states of the idle button rather than separate
 * renderings; the other five are real modes and each carries a **distinct
 * glyph**, so the control never tells its story in colour alone.
 *
 * ## And a sixth mode, from §6.17
 *
 * §3.13 lists seven states and **paused is not among them**; §6.17's playback
 * control draws it — `1px solid --brand-500`, play `--brand-200`. The store has
 * had a `paused` status all along and this component mapped it to `idle`, so a
 * paused answer looked exactly like one that had never started while its label
 * read "Resume reading this answer". A control that says one thing and draws
 * another is the failure both sections are arranged against, so §6.17's
 * treatment is used for the state §6.17 names.
 *
 * The two sections disagree about this control's **size and rest glyph** —
 * §3.13's 28–32px ghost with a waveform against §6.17's 36px circle with a play
 * glyph. §3.13 governs here: it is the chat chapter, describing the control in
 * the message action row, and §1.3's "ghost icon button (message actions)" is
 * 28px with the same row order. See the progress doc's §4.12.
 *
 * It used to draw three emoji — 🔊, ⏸, ■ — which no icon rule can govern: an
 * emoji is rendered by the platform's own font at the platform's own colour, so
 * "waveform in `--text-3`" was not expressible.
 *
 * ## Voice off is drawn, not omitted
 *
 * This used to return `null` when the feature flag was off — "the control is
 * absent rather than disabled, and the row simply has one fewer child". §3.13
 * draws the state instead, as a dashed outline. That is the better answer for
 * the same reason the handoff gives everywhere else: a control that vanishes is
 * one the user has to remember existed, and a dashed edge says "this is a thing
 * that is switched off" where an empty space says nothing at all.
 */

type VisualState = 'idle' | 'preparing' | 'speaking' | 'paused' | 'failed' | 'off';

const GLYPH: Record<VisualState, IconName> = {
  idle: 'waveform',
  preparing: 'clock',
  speaking: 'pause',
  // §6.17: paused is a play glyph on a brand-500 outline. It was rendering as
  // idle — a paused answer looked exactly like one that had never started, and
  // pressing it announced "Resume" while showing the waveform of "Read aloud".
  paused: 'play',
  failed: 'alert',
  off: 'waveform',
};

const TREATMENT: Record<VisualState, string> = {
  /*
   * `--text-3` at rest, lifting to `--text-1` on hover, focus and press — the
   * ghost icon button of §1.3. The glyph is the only content, so the 3:1
   * non-text bar applies and 3.74:1 clears it; the press fill and the lifted
   * ink land together, so the pressed pairing is text-1 on `--border`.
   */
  idle: 'bg-transparent text-ink-disabled hover:bg-surface-3 hover:text-ink active:bg-border active:text-ink',
  preparing: 'bg-brand-tint text-brand-200',
  speaking: 'bg-brand-500 text-ink-inverse',
  /* §6.17: `1px solid --brand-500`, play `--brand-200`. */
  paused: 'border border-brand-500 bg-transparent text-brand-200',
  failed: 'bg-critical-tint text-critical-text',
  off: 'border border-dashed border-border bg-transparent text-ink-disabled',
};

export function SpeakButton({ messageId, text }: { messageId: string; text: string }) {
  const speech = useSyncExternalStore(subscribeToSpeech, getSpeechState, getSpeechServerSnapshot);

  const voiceOff = !config.features.voice;
  const mine = speech.messageId === messageId;
  const status = mine ? speech.status : 'idle';
  const failed = mine && speech.error !== null;

  const visual: VisualState = voiceOff
    ? 'off'
    : failed
      ? 'failed'
      : status === 'loading'
        ? 'preparing'
        : status === 'playing'
          ? 'speaking'
          : status === 'paused'
            ? 'paused'
            : 'idle';

  const label = voiceOff
    ? 'Reading aloud is switched off'
    : visual === 'speaking'
      ? 'Pause reading this answer'
      : status === 'paused'
        ? 'Resume reading this answer'
        : visual === 'preparing'
          ? 'Preparing the spoken version'
          : visual === 'failed'
            ? 'Reading this answer aloud failed — try again'
            : 'Read this answer aloud';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void speak(messageId, text)}
        // Preparing is a wait and voice-off is a standing condition. Both are
        // inert; neither is hidden.
        disabled={voiceOff || visual === 'preparing'}
        aria-label={label}
        // Whether THIS message is the one being read. Not a decoration: with
        // several answers on screen the fills alone do not say which.
        aria-pressed={mine && status !== 'idle'}
        className={cn(
          // The ghost icon button's box — 28px on an 8px radius, growing to the
          // 44px touch minimum below the 640px threshold.
          'inline-flex size-11 shrink-0 items-center justify-center rounded-ghost sm:size-7',
          'transition-colors duration-fast ease-out-soft disabled:cursor-not-allowed',
          TREATMENT[visual]
        )}
      >
        {/* 18px on touch, 16px above it — §1.3. A 16px glyph centred in a 44px
            target floats in a box that reads as empty. */}
        <Icon name={GLYPH[visual]} size={16} className="max-sm:hidden" />
        <Icon name={GLYPH[visual]} size={18} className="sm:hidden" />
      </button>

      {/* Stop, once something is actually playing. Absent otherwise: a stop
          control beside a silent answer is a control that does nothing. */}
      {mine && status !== 'idle' && !voiceOff && (
        <button
          type="button"
          onClick={stopSpeech}
          aria-label="Stop reading"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-ghost text-ink-muted hover:bg-surface-3 hover:text-ink sm:size-7"
        >
          <span aria-hidden="true" className="size-2 bg-current" />
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
      {failed && (
        <span role="alert" className="text-caption text-ink-muted">
          {speech.error}
        </span>
      )}
    </span>
  );
}
