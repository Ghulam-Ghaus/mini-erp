import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '../..');
const stageRoot = path.join(os.tmpdir(), 'mini-erp-stage');
const stageApiDir = path.join(stageRoot, 'api');
const buildResourcesDir = path.join(desktopDir, 'build-resources');
const buildApiDir = path.join(buildResourcesDir, 'api');

if (existsSync(stageApiDir)) {
  rmSync(stageApiDir, { recursive: true, force: true });
}
if (existsSync(buildResourcesDir)) {
  rmSync(buildResourcesDir, { recursive: true, force: true });
}

mkdirSync(stageRoot, { recursive: true });
mkdirSync(buildApiDir, { recursive: true });

console.warn('[desktop] Staging @mini-erp/api hoisted production bundle in temp dir...');
execSync(
  `pnpm --config.node-linker=hoisted --filter @mini-erp/api --prod --legacy deploy "${stageApiDir}"`,
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  },
);

const stripPaths = [
  'backups',
  'uploads',
  'src',
  'test',
  '.turbo',
  'vitest.config.ts',
  'vitest.integration.config.ts',
  'eslint.config.js',
  'tsconfig.json',
  'tsconfig.build.json',
  'nest-cli.json',
  path.join('node_modules', '.pnpm'),
];

for (const rel of stripPaths) {
  const full = path.join(stageApiDir, rel);
  if (existsSync(full)) {
    rmSync(full, { recursive: true, force: true });
  }
}

cpSync(path.join(stageApiDir, 'dist'), path.join(buildApiDir, 'dist'), { recursive: true });
cpSync(path.join(stageApiDir, 'package.json'), path.join(buildApiDir, 'package.json'));

console.warn('[desktop] API dist staged at:', buildApiDir);
console.warn('[desktop] API node_modules staged at:', path.join(stageApiDir, 'node_modules'));
