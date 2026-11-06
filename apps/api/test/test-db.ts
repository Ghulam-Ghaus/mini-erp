import { loadDotEnv } from '../src/config/env.js';

/**
 * Returns DATABASE_URL_TEST and refuses to run if it could point at real data:
 * the database name must end with "_test" and must differ from DATABASE_URL.
 */
export function requireTestDatabaseUrl(): string {
  loadDotEnv();
  const url = process.env['DATABASE_URL_TEST'];
  if (!url) throw new Error('DATABASE_URL_TEST is not set. See .env.example.');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests: database "${dbName}" does not end with "_test".`);
  }
  if (url === process.env['DATABASE_URL']) {
    throw new Error('Refusing to run tests: DATABASE_URL_TEST equals DATABASE_URL.');
  }
  return url;
}
