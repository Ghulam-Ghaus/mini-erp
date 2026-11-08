// Root ESLint config: covers root files and composes configs so lint-staged works across the monorepo.
import node from '@mini-erp/config/eslint/node';
import react from '@mini-erp/config/eslint/react';

export default [
  ...node,
  ...react.map((c) => ({
    ...c,
    files: ['apps/web/**/*.{ts,tsx,js,jsx}', 'packages/ui/**/*.{ts,tsx,js,jsx}'],
  })),
];
