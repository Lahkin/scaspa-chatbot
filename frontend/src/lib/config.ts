/**
 * The one place `import.meta.env` is read.
 *
 * Scattering `import.meta.env.VITE_…` through components makes it impossible to
 * answer "what configuration does this app take?" without grepping, and typos
 * fail silently as `undefined`. Everything is read here once, validated, and
 * exported typed.
 *
 * Every value here ships in the browser bundle. There is no secret in the
 * frontend and there never will be — the backend holds the API key.
 */

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const normalised = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalised)) return true;
  if (['false', '0', 'no', 'off'].includes(normalised)) return false;
  return fallback;
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const env = import.meta.env;

export const config = {
  /** Backend base URL, never with a trailing slash. */
  apiBaseUrl: readString(env.VITE_API_BASE_URL, 'http://127.0.0.1:8000').replace(/\/+$/, ''),

  /**
   * Feature flags exist so a capability can be switched off from the deploy
   * dashboard without a code change. If voice starts misbehaving an hour before
   * the demo, that is a redeploy, not a hotfix.
   */
  features: {
    voice: readBoolean(env.VITE_ENABLE_VOICE, true),
    charts: readBoolean(env.VITE_ENABLE_CHARTS, true),
    /*
     * The per-answer diagnostics panel — answer time, records searched.
     *
     * Off unless asked for, and gated the same way the mock controls are: DEV
     * plus an explicit flag, not DEV alone. The reasoning is theirs and applies
     * unchanged — the client demonstration runs on `npm run dev`, so anything
     * gated on DEV alone is on screen throughout it.
     *
     * These figures are about the machine, not about the ferry. The Pilot spec
     * asks for them in an internal mode; `How Pilot verified this` is what a
     * customer gets, and that says which sources were consulted rather than how
     * many milliseconds it took.
     *
     * Set `VITE_SHOW_DIAGNOSTICS=true` when working on latency.
     */
    diagnostics: env.DEV && readBoolean(env.VITE_SHOW_DIAGNOSTICS, false),
  },

  /**
   * Stream the answer, or fetch it whole.
   *
   * Streaming is the default because latency is the thing it exists to disguise.
   * The non-streaming path is not a fallback for a broken stream — the contract
   * offers it deliberately, and its text is *fully verified before it is sent*,
   * with unverifiable citation markers already stripped. A surface where a
   * briefly-visible unverified marker is unacceptable should use it.
   */
  useStreaming: readBoolean(env.VITE_USE_STREAMING, true),

  /** Give up on a stream after this long. An honest error beats a spinner. */
  streamTimeoutMs: readNumber(env.VITE_STREAM_TIMEOUT_MS, 30_000),

  /**
   * Deadline for a non-streaming request.
   *
   * Longer than the stream's inter-chunk timeout because this one covers the
   * *whole* answer — retrieval, generation and verification — with nothing
   * arriving in the meantime to prove the connection is alive.
   */
  requestTimeoutMs: readNumber(env.VITE_REQUEST_TIMEOUT_MS, 45_000),

  /** Health must answer fast or it is not telling us anything useful. */
  healthTimeoutMs: readNumber(env.VITE_HEALTH_TIMEOUT_MS, 5_000),

  /** Audio up and audio back: a 20MB upload on hotel wifi needs room. */
  uploadTimeoutMs: readNumber(env.VITE_UPLOAD_TIMEOUT_MS, 60_000),

  /**
   * How often to re-check `GET /api/health`.
   *
   * Five minutes: index state changes on a deploy, not on a timer, so polling
   * harder spends roaming data to learn nothing. Configurable because a demo may
   * want it tighter.
   */
  healthPollMs: readNumber(env.VITE_HEALTH_POLL_MS, 5 * 60_000),

  /**
   * Past this many days since `kb_updated_at`, the UI notes when the information
   * was last verified. Not an error — a fact the reader can weigh.
   */
  kbStaleAfterDays: readNumber(env.VITE_KB_STALE_AFTER_DAYS, 90),

  /** Exact origin permitted to embed the widget. Not a hostname, not '*'. */
  embedAllowedOrigin: readString(env.VITE_EMBED_ALLOWED_ORIGIN, 'https://www.scaspa.com'),

  /**
   * Serve the API from MSW instead of a real backend. Dev only — the flag is
   * ignored in a production build, where the mock code is not even bundled.
   *
   * **Defaults off.** It defaulted on for most of this project's life, because
   * there was no backend to point at. There is one now, and a default that
   * quietly serves fixtures means `npm run dev` shows a working assistant while
   * the two halves are not connected at all — the failure mode being defaulted
   * into is "everything looks fine", which is the one worth avoiding.
   *
   * Set `VITE_ENABLE_MOCKS=true` to work on the UI with no backend running, or
   * to drive a scenario the real one cannot produce on demand (a 429, a stalled
   * stream, a degraded index). `src/mocks/scenarios.ts` lists them.
   */
  useMocks: env.DEV && readBoolean(env.VITE_ENABLE_MOCKS, false),

  isDev: env.DEV,
  isProd: env.PROD,
} as const;

export type AppConfig = typeof config;
