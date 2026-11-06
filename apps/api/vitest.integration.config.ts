import { defineConfig } from 'vitest/config';

// Integration tests. They run against DATABASE_URL_TEST only (see test/test-db.ts).
export default defineConfig({
  test: {
    include: ['test/**/*.int-spec.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
