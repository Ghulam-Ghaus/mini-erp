// ESLint config for React packages (web, ui).
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import base from './base.js';

export default defineConfig(base, {
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    globals: { ...globals.browser },
  },
  plugins: {
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'react-refresh/only-export-components': 'off',
  },
});
