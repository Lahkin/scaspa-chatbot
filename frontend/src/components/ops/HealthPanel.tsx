import { cn } from '@/lib/cn';
import type { HealthResponse } from '@/lib/types';

/**
 * The health panel — §6.11.
 *
 * ```
 * padding: 14px 18px; border-radius: 12px; gap: 12px, 8px dot
 * ```
 *
 * | ok               | `--surface-3`, `1px solid --border` | `--positive` | All parts of the service are responding |
 * | degraded — search | `--caution-fill`, `1px solid rgba(217,162,59,0.3)` | `--caution` | **Search is unavailable** / The assistant cannot answer questions. Vessels, flights and tariffs still work. |
 * | degraded — voice  | same | `--caution` | **Voice is switched off** / Speaking and listening are unavailable. You can still type your question. |
 *
 * ## Two causes, two messages
 *
 * > "'Degraded' alone tells a user nothing about whether the thing they came for
 * > still works."
 *
 * The index being unavailable stops the **assistant** and nothing else: vessels,
 * flights and tariffs are a separate path with no model, no embeddings and no
 * index in it. A banner reading "the service is degraded" would send someone
 * away from three screens that would have answered them.
 *
 * Voice is the other cause, and it is knowable without asking the server:
 * `VITE_ENABLE_VOICE` is the switch, so this is a client-side fact rather than
 * a field `/api/health` would have to grow.
 *
 * ## The ok state renders here and nowhere else
 *
 * This is the console's health panel, where "everything is responding" is the
 * answer to a question the reader came to ask. `shells/HealthBanner` is a
 * different component for a different job — it interrupts the chat only when
 * something is wrong, and stays silent otherwise, because a permanent green bar
 * over a conversation is furniture.
 */
export function HealthPanel({
  health,
  voiceEnabled,
}: {
  health: HealthResponse | null | undefined;
  voiceEnabled: boolean;
}) {
  const states: readonly State[] = [];
  const rows = [...states];

  if (!health) {
    rows.push({
      tone: 'caution',
      title: 'The service has not answered',
      body: 'This panel reports what /api/health says. Nothing has come back from it yet.',
    });
  } else {
    // Search first: it is the one that stops the assistant.
    if (!health.index.ready || health.status !== 'ok') {
      rows.push({
        tone: 'caution',
        title: 'Search is unavailable',
        body: 'The assistant cannot answer questions. Vessels, flights and tariffs still work.',
      });
    }
    /*
     * ── TWO REASONS VOICE IS OFF, AND AN OPERATOR NEEDS TO TELL THEM APART ───
     *
     * Switched off is a decision somebody made and can undo with a build flag.
     * Unavailable is an OpenAI project with no speech-model entitlement, which
     * no amount of redeploying will change — it is an account change.
     *
     * The panel said "switched off" for both, so the one state that needs
     * somebody to go and edit an OpenAI project looked like a setting. The
     * backend now reports which it is, and `detail` says exactly which models
     * are missing.
     */
    if (!voiceEnabled) {
      rows.push({
        tone: 'caution',
        title: 'Voice is switched off',
        body: 'Turned off in this build. Speaking and listening are unavailable; typing works.',
      });
    } else if (health.voice.checked && (!health.voice.stt || !health.voice.tts)) {
      /*
       * The title names the PROVIDER, because with two of them the first
       * question an operator has is which one this deployment is using — and it
       * cannot be inferred from the client, which never sees a key. Sending
       * somebody to the wrong dashboard is the failure this avoids.
       *
       * `detail` carries the rest, including which half works: a reachable
       * ElevenLabs account with no voice chosen transcribes fine and cannot
       * speak, which is a real state and not a total outage.
       */
      rows.push({
        tone: 'caution',
        title: `Voice is limited on ${health.voice.provider}`,
        body: health.voice.detail,
      });
    }
    if (rows.length === 0) {
      rows.push({ tone: 'ok', title: 'All parts of the service are responding' });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.title}
          role="status"
          data-health={row.tone}
          className={cn(
            'flex items-start gap-3 rounded-input px-4.5 py-3.5',
            row.tone === 'ok'
              ? 'border border-border bg-surface-muted'
              : 'border border-caution-notice-edge bg-caution-tint'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'mt-1.5 size-2 shrink-0 rounded-full',
              row.tone === 'ok' ? 'bg-positive' : 'bg-caution'
            )}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className={cn(
                'text-body font-medium',
                row.tone === 'ok' ? 'text-ink' : 'text-caution'
              )}
            >
              {row.title}
            </span>
            {row.body ? (
              <span className="text-label leading-5 text-ink-muted">{row.body}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

interface State {
  tone: 'ok' | 'caution';
  title: string;
  body?: string;
}
