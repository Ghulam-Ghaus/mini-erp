import { execSync } from 'node:child_process';
import path from 'node:path';
import { requireTestDatabaseUrl } from './test-db.js';

/** Applies all migrations to the test database before the integration tests run. */
export default function setup(): void {
  const url = requireTestDatabaseUrl();
  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
