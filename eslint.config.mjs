import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    rules: {
      // This rule is too strict for modal/open lifecycle patterns used in this app.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['components/QuickAccessButtons.tsx'],
    rules: {
      // This pre-v2 UI module retains legacy dynamic payload types.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Prettier config should be last to override other configs
  prettier,
]);

export default eslintConfig;
