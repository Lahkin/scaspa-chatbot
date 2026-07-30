/**
 * Voice.
 *
 * The claims worth testing are all about *not* shipping something broken: a
 * button that cannot work is absent rather than disabled, the format is
 * negotiated rather than assumed, the transcript never reaches the model, and a
 * failure never touches the text path.
 *
 * jsdom has no `MediaRecorder`, no `AudioContext` and no real audio, so the parts
 * that need those are stubbed. What that *can* prove — the decisions — is what is
 * proven here; the rest is stated as unverified rather than quietly ticked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CANDIDATE_MIME_TYPES,
  detectVoiceCapability,
  isAcceptedByBackend,
  pickMimeType,
  resetVoiceWarnings,
  MAX_RECORDING_MS,
  WARN_FROM_MS,
} from '@/features/voice/capabilities';
import {
  installAudioUnlock,
  isAudioUnlocked,
  resetAudioUnlock,
} from '@/features/voice/audioUnlock';
import { VoiceButton } from '@/components/chat/VoiceButton';
import { SpeakButton } from '@/components/chat/SpeakButton';
import { Composer } from '@/components/chat/Composer';
import { getDraft, resetDraft, setDraft } from '@/features/chat/draft';
import { resetSpeech } from '@/features/voice/speech';
import { setScenario } from '@/mocks/scenarios';

afterEach(() => {
  resetVoiceWarnings();
  resetAudioUnlock();
  resetSpeech();
  resetDraft();
  setScenario('happy');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Task 1: the constraints ──────────────────────────────────────────────────

describe('format negotiation', () => {
  it('prefers webm-opus, then webm, then mp4 — the iOS Safari case', () => {
    expect(CANDIDATE_MIME_TYPES[0]).toBe('audio/webm;codecs=opus');
    // Safari produces audio/mp4 and iOS Safari is where these users are.
    expect(CANDIDATE_MIME_TYPES).toContain('audio/mp4');
  });

  it('picks the first type the browser actually supports', () => {
    // Safari: no webm at all.
    const safari = (type: string) => type.startsWith('audio/mp4');
    expect(pickMimeType(safari)).toBe('audio/mp4');

    const chrome = (type: string) => type.startsWith('audio/webm');
    expect(pickMimeType(chrome)).toBe('audio/webm;codecs=opus');
  });

  it('returns null when nothing is supported, rather than guessing', () => {
    // A guess produces a clean 422 from the backend that looks like a broken
    // recorder and costs an hour.
    expect(pickMimeType(() => false)).toBeNull();
  });

  it('every candidate is on the backend whitelist', () => {
    for (const candidate of CANDIDATE_MIME_TYPES) {
      expect(isAcceptedByBackend(candidate), candidate).toBe(true);
    }
  });

  it('rejects a type the backend does not accept', () => {
    expect(isAcceptedByBackend('audio/flac')).toBe(false);
    expect(isAcceptedByBackend('video/mp4')).toBe(false);
  });
});

describe('capability detection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'MediaRecorder',
      Object.assign(function () {}, {
        isTypeSupported: (type: string) => type.startsWith('audio/webm'),
      })
    );
  });

  it('is unavailable when the flag is off', () => {
    expect(detectVoiceCapability(false)).toMatchObject({ available: false, reason: 'disabled' });
  });

  it('is unavailable on an insecure context, and says why in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('isSecureContext', false);

    const result = detectVoiceCapability(true);
    expect(result).toMatchObject({ available: false, reason: 'insecure-context' });
    // On plain HTTP the mic fails with no prompt and no error. The warning names
    // the cause so nobody debugs their own code for an hour.
    expect(warn.mock.calls[0]?.[0]).toContain('secure context');
    expect(warn.mock.calls[0]?.[0]).toContain('localhost');
  });

  it('is unavailable when no candidate format is supported', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal(
      'MediaRecorder',
      Object.assign(function () {}, {
        isTypeSupported: () => false,
      })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });

    expect(detectVoiceCapability(true)).toMatchObject({
      available: false,
      reason: 'no-supported-format',
    });
  });

  it('is available when everything lines up, and names the format', () => {
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });

    expect(detectVoiceCapability(true)).toEqual({
      available: true,
      reason: null,
      mimeType: 'audio/webm;codecs=opus',
    });
  });

  it('warns once, not on every render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('isSecureContext', false);
    detectVoiceCapability(true);
    detectVoiceCapability(true);
    detectVoiceCapability(true);
    // Repeating it every render is how a warning gets ignored.
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('recording limits leave headroom', () => {
  it('stops before the backend cap, and warns before stopping', () => {
    // The backend caps at ~60s. Losing a 60-second question to a rounding error
    // is the failure worth engineering out.
    expect(MAX_RECORDING_MS).toBeLessThan(60_000);
    expect(WARN_FROM_MS).toBeLessThan(MAX_RECORDING_MS);
    expect(MAX_RECORDING_MS - WARN_FROM_MS).toBeGreaterThanOrEqual(10_000);
  });
});

// ── Task 6: iOS unlocking ────────────────────────────────────────────────────

describe('iOS audio unlock', () => {
  function stubAudioContext() {
    const resume = vi.fn().mockResolvedValue(undefined);
    // A class, not an arrow function: `new (() => {})` throws, so an arrow stub
    // made getAudioContext() return null and every unlock test fail for the
    // wrong reason.
    class FakeAudioContext {
      resume = resume;
      destination = {};
      createBufferSource() {
        return { connect: vi.fn(), start: vi.fn(), buffer: null };
      }
      createBuffer() {
        return {};
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    return resume;
  }

  it('unlocks on the first gesture anywhere in the app', () => {
    const resume = stubAudioContext();
    installAudioUnlock();
    expect(isAudioUnlocked()).toBe(false);

    // A tap on a suggested question thirty seconds before anyone touches a
    // speaker button.
    window.dispatchEvent(new Event('pointerdown'));
    expect(isAudioUnlocked()).toBe(true);
    expect(resume).toHaveBeenCalled();
  });

  it('unlocks on a keyboard gesture too', () => {
    stubAudioContext();
    installAudioUnlock();
    window.dispatchEvent(new Event('keydown'));
    expect(isAudioUnlocked()).toBe(true);
  });

  it('stops listening after the first gesture', () => {
    const resume = stubAudioContext();
    installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('does nothing harmful when there is no AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    installAudioUnlock();
    expect(() => window.dispatchEvent(new Event('pointerdown'))).not.toThrow();
  });
});

// ── Task 7 and 1: absent, not broken ─────────────────────────────────────────

describe('the voice button renders nothing when it cannot work', () => {
  it('is absent on an insecure context', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('isSecureContext', false);
    const { container } = render(<VoiceButton onTranscript={vi.fn()} />);
    // Not disabled, not a tooltip. A control that does nothing when tapped is
    // worse than an absent one.
    expect(container).toBeEmptyDOMElement();
  });

  it('is absent when the feature flag is off', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({
      config: { features: { voice: false, charts: true }, isDev: true, isProd: false },
    }));
    const { VoiceButton: Flagged } = await import('@/components/chat/VoiceButton');
    const { container } = render(<Flagged onTranscript={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    vi.doUnmock('@/lib/config');
    vi.resetModules();
  });

  it('leaves no layout hole in the composer', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('isSecureContext', false);
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />);
    // The composer still works completely: box, Send, and the hint.
    expect(screen.getByLabelText('Your question')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /voice/i })).toBeNull();
  });
});

// ── Task 5 and 7: speech is contained ────────────────────────────────────────

describe('SpeakButton', () => {
  it('offers to read an answer aloud', () => {
    render(<SpeakButton messageId="a1" text="The fare is XCD 44.44." />);
    const button = screen.getByRole('button', { name: 'Read this answer aloud' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('is absent when the feature flag is off', async () => {
    vi.resetModules();
    vi.doMock('@/lib/config', () => ({
      config: { features: { voice: false, charts: true }, isDev: true, isProd: false },
    }));
    const { SpeakButton: Flagged } = await import('@/components/chat/SpeakButton');
    const { container } = render(<Flagged messageId="a1" text="x" />);
    expect(container).toBeEmptyDOMElement();
    vi.doUnmock('@/lib/config');
    vi.resetModules();
  });

  it('contains a speech failure to itself', async () => {
    // jsdom cannot actually play audio, so this asserts the containment: the
    // request fails and the message text is untouched.
    setScenario('voice_tts_fails');
    const user = userEvent.setup();
    render(
      <div>
        <p>The fare is XCD 44.44.</p>
        <SpeakButton messageId="a1" text="The fare is XCD 44.44." />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Read this answer aloud' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/answer above is unchanged/);
    // The text path is completely unaffected.
    expect(screen.getByText('The fare is XCD 44.44.')).toBeInTheDocument();
  });
});

// ── Task 4: the transcript never reaches the model ───────────────────────────

describe('the transcript lands in the composer', () => {
  it('sets the draft rather than sending', async () => {
    // Driven directly, because jsdom has no MediaRecorder to drive the real path.
    // What matters is the wiring: the transcript reaches setDraft and nothing else.
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} />);

    // Statically imported, not `await import(...)`: earlier tests in this file
    // call `vi.resetModules()`, so a dynamic import here would get a *fresh*
    // module instance with its own store — a different one from the one the
    // rendered Composer is subscribed to.
    setDraft('What time is the last ferry back from Nevis?');

    await waitFor(() =>
      expect(screen.getByLabelText('Your question')).toHaveValue(
        'What time is the last ferry back from Nevis?'
      )
    );
    // "Nevis" versus "never" is exactly the mishearing that happens on stage, so
    // the user gets to correct it before anything is asked.
    expect(onSend).not.toHaveBeenCalled();
    expect(getDraft()).toContain('Nevis');
  });
});
