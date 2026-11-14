import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'coverage/', 'logs/', 'public/'] },
  js.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // Legacy CommonJS modules (rewritten in TypeScript during M2).
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  // Only the SmartGlass adapter may use the protocol library (ROADMAP T-103).
  // Legacy files listed here are removed during M2; don't add to this list.
  {
    files: ['**/*.{ts,js}'],
    ignores: [
      'src/console/smartglass/**',
      'types/**',
      'test/**/smartglass/**',
      'src/xbox/connection.js', // legacy, M2
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['xbox-smartglass-core-node', 'xbox-smartglass-core-node/*'], message: 'Only src/console/smartglass/ may use the SmartGlass library. Use a ConsoleAdapter.' }],
      }],
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.name='require'][arguments.0.value=/^xbox-smartglass-core-node/]",
        message: 'Only src/console/smartglass/ may use the SmartGlass library. Use a ConsoleAdapter.',
      }],
    },
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
);
