import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/** Forbids one API layer from importing the given layers and packages. */
function apiLayer(layer, forbiddenLayers, forbiddenPackages) {
  return {
    files: [`apps/api/src/${layer}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: forbiddenPackages.map((name) => ({
            name,
            message: `The ${layer} layer must not depend on ${name}.`,
          })),
          patterns: [
            {
              group: forbiddenLayers.map((forbidden) => `**/${forbidden}/**`),
              message: `The ${layer} layer must not import from: ${forbiddenLayers.join(', ')}.`,
            },
          ],
        },
      ],
    },
  };
}

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'samples/**', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
      eqeqeq: 'error',
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  // API layering (dependency inversion), enforced with ESLint's built-in rule:
  //   domain <- errors <- services <- http
  //   domain <- errors <- infrastructure
  // Only the composition root (container.ts, app.ts, server.ts) may see everything.
  apiLayer('domain', ['errors', 'services', 'infrastructure', 'http'], ['express', 'pg']),
  apiLayer('errors', ['services', 'infrastructure', 'http'], ['express', 'pg']),
  apiLayer('services', ['infrastructure', 'http'], ['express', 'pg']),
  apiLayer('infrastructure', ['services', 'http'], ['express']),
  apiLayer('http', ['infrastructure'], ['pg']),
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: '18.3' } },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.strict,
  },
  {
    // describe() blocks group many small cases; the length cap targets production code.
    files: ['**/tests/**/*.ts', '**/e2e/**/*.ts', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  prettier,
);
