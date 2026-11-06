import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  CORS_ORIGINS: z
    .string()
    .default('http://127.0.0.1:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  APP_VERSION: z.string().default('0.0.0'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('mini-erp-dev-jwt-secret-change-in-prod'),
});

export type AppEnv = z.infer<typeof envSchema>;

/** Validates the environment. Throws a readable error listing every invalid variable. */
export function parseAppEnv(source: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Finds the nearest `.env` file, starting at `startDir` and walking up. */
export function findEnvFile(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads a `.env` file for development. Variables that already exist in the
 * environment (for example PORT set by Electron) are never overridden.
 * Skipped in production, where the desktop app passes the configuration.
 */
export function loadDotEnv(
  file: string | undefined = process.env['MINI_ERP_ENV_FILE'] ?? findEnvFile(process.cwd()),
): void {
  if (process.env['NODE_ENV'] === 'production' || !file || !existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}
