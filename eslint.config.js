import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'packages/shared/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'warn',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'e2e/**/*.{js,mjs}'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.{js,jsx}', 'packages/ui/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // JSX counts as a use of the imported component (core no-unused-vars does not know JSX).
      'react/jsx-uses-vars': 'error',
      // TanStack Table's useReactTable is incompatible with the React Compiler by design.
      'react-hooks/incompatible-library': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{6}\\b/]',
          message: 'Use colour tokens from packages/ui/src/tokens.css, not hex values.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.{js,jsx}', '**/test/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
];
