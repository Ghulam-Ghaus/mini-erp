import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env automatically. Load it here without overriding
// variables that are already set in the environment.
if (existsSync('.env')) {
  const parsed = parseEnv(readFileSync('.env', 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Empty string lets `prisma generate` run on a fresh clone without a .env.
    // Commands that touch the database fail with a clear error if it is missing.
    url: process.env['DATABASE_URL'] ?? '',
  },
});
