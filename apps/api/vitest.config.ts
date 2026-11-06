import { defineConfig } from 'vitest/config';

// Unit tests only. They never touch a database.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
