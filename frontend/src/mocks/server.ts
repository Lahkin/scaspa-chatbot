import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Node-side MSW server, used by Vitest. Never bundled into the app. */
export const server = setupServer(...handlers);
