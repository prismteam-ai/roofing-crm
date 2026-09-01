import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '.venv/**',
      'test-fixtures/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // tsc already catches undefined identifiers, and does so more accurately -- it knows
      // every lib/global actually in scope, where no-undef only knows a static list and
      // false-positives on ambient globals it's unaware of. Standard typescript-eslint
      // guidance for typed files: disable this base rule, rely on tsc instead.
      'no-undef': 'off',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off', // this app has no HMR-sensitive constraint to enforce
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['workers/agent-proxy/src/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
);
