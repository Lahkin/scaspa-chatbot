import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

// Declared once and reused. ESLint flat config REPLACES a rule's options rather
// than merging them, so re-declaring `no-restricted-globals` in a later block
// silently drops everything the earlier one forbade — which is exactly how the
// localStorage restriction went missing until a probe file caught it.
const RESTRICTED_EVENTSOURCE = {
  name: 'EventSource',
  message:
    'Rule 3: EventSource cannot POST. Streaming is SSE over POST via fetch + ReadableStream. Use lib/stream.ts.',
};
const RESTRICTED_LOCALSTORAGE = {
  name: 'localStorage',
  message:
    'Rule 5: message content never goes to storage. Only conversation_id, and only in sessionStorage.',
};
const RESTRICTED_FETCH = {
  name: 'fetch',
  message: 'Rule 7: every fetch lives in lib/api.ts. No component calls fetch directly.',
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/routeTree.gen.ts', 'public/mockServiceWorker.js'] },
  js.configs.recommended,
  // Type-aware rules need a TS program, so they apply to TS files only. Spreading
  // them unscoped made ESLint try to type-check its own config file and crash.
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // CLAUDE.md rule: no `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // A dropped promise in a streaming client is a hang with no error, which is
      // the hardest kind of bug to see. Type-aware rules are why this project uses
      // typescript-eslint rather than a parser-only linter.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // CLAUDE.md absolute rules, enforced by the linter rather than by review.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        RESTRICTED_EVENTSOURCE,
        RESTRICTED_LOCALSTORAGE,
        RESTRICTED_FETCH,
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message: 'Rule 5: only conversation_id may be stored, and only in sessionStorage.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Rule 4: never use dangerouslySetInnerHTML. Markdown renders through react-markdown with raw HTML disabled.',
        },
        {
          selector: "NewExpression[callee.name='EventSource']",
          message: 'Rule 3: EventSource cannot POST. Use fetch + ReadableStream in lib/stream.ts.',
        },
        {
          selector: 'Literal[value=/pay\\.scaspa\\.com/]',
          message:
            'Rule 9: never link to, iframe or reference pay.scaspa.com. It is a live payment portal.',
        },
      ],
    },
  },
  // lib/api.ts and lib/stream.ts are the only places fetch is allowed. The other
  // restrictions still apply here — they must be repeated, because this
  // declaration replaces the one above rather than extending it.
  {
    files: ['src/lib/api.ts', 'src/lib/stream.ts', 'src/mocks/**'],
    rules: {
      'no-restricted-globals': ['error', RESTRICTED_EVENTSOURCE, RESTRICTED_LOCALSTORAGE],
    },
  },
  // TanStack Router file routes. Two generic rules misfire on the framework's
  // own required patterns, so they are relaxed HERE and nowhere else:
  //   - every route file must `export const Route`, which react-refresh reads as
  //     a non-component export;
  //   - `throw redirect()` / `throw notFound()` is how the router does control
  //     flow, and they are not Error subclasses.
  // Node scripts. They run outside the browser bundle, and `page.evaluate`
  // callbacks are serialised and executed *in the browser* — so both global sets
  // are legitimately in scope here and nowhere else.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // A context module exports a Provider component *and* its hook. That is the
  // standard React shape and splitting them across two files to satisfy a
  // hot-reload heuristic makes the code worse, not better. Scoped to files named
  // *Context.tsx so it cannot quietly cover anything else.
  {
    files: ['src/**/*Context.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  {
    files: ['src/routes/**/*.tsx'],
    rules: {
      // Off, not warned. Every file route MUST define a component and export
      // only `Route`, which is exactly the shape this rule objects to —
      // `allowExportNames` does not suppress it because the component itself is
      // not exported. The rule is about hot-reload ergonomics, not correctness,
      // and it cannot be satisfied without abandoning file-based routing.
      // Leaving six permanent warnings would teach everyone to ignore warnings,
      // which is worse than turning off one rule in one directory.
      'react-refresh/only-export-components': 'off',
      // `throw redirect()` / `throw notFound()` is the router's control flow.
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
  // Config and script files are plain JS and outside the TS program.
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/mocks/**', 'vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier
);
