import { http, HttpResponse } from 'msw';
import { config } from '@/lib/config';

/**
 * MSW request handlers. **Dev and test only** — never imported by production code.
 *
 * CI has no backend, so every test runs against these. They must therefore match
 * `docs/api-contract.md` exactly: a mock that is kinder than the real server
 * produces tests that pass against a product that does not work.
 *
 * Handlers are deliberately thin for now. Realistic chat fixtures arrive with the
 * chat UI in a later prompt.
 */
export const handlers = [
  http.get(`${config.apiBaseUrl}/api/health`, () =>
    HttpResponse.json({
      status: 'ok',
      env: 'test',
      version: '0.1.0',
      uptime_s: 1,
      request_id: 'test-request-id',
      models: {
        chat: 'test-chat-model',
        embedding: 'test-embedding-model',
        transcribe: 'test-transcribe-model',
        tts: 'test-tts-model',
      },
      index: {
        ready: true,
        kb_version: '2026-06-01',
        kb_rows: 10,
        kb_rows_rejected: 0,
        kb_csv_filename: 'test.csv',
        kb_updated_at: '2026-06-01',
        index_built_at: '2026-06-01T00:00:00Z',
        embedding_model: 'test-embedding-model',
        web_docs: 0,
        message: null,
      },
    })
  ),
];
