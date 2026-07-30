/// <reference types="vite/client" />

/**
 * Typed environment. Adding a variable here makes it a type error to read one
 * that does not exist, which is the failure `import.meta.env` otherwise gives
 * you silently as `undefined`.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_VOICE?: string;
  readonly VITE_ENABLE_CHARTS?: string;
  readonly VITE_STREAM_TIMEOUT_MS?: string;
  readonly VITE_EMBED_ALLOWED_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
