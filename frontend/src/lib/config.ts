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
  },

  /** Give up on a stream after this long. An honest error beats a spinner. */
  streamTimeoutMs: readNumber(env.VITE_STREAM_TIMEOUT_MS, 30_000),

  /** Exact origin permitted to embed the widget. Not a hostname, not '*'. */
  embedAllowedOrigin: readString(env.VITE_EMBED_ALLOWED_ORIGIN, 'https://www.scaspa.com'),

  isDev: env.DEV,
  isProd: env.PROD,
} as const;

export type AppConfig = typeof config;
