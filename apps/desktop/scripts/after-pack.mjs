import { cpSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * electron-builder strips `node_modules` from extraResources by default.
 * Copy the staged standalone `api/node_modules` from temp directly into
 * `resources/api/node_modules` before NSIS packages `win-unpacked`.
 */
export default async function afterPack(context) {
  const srcNodeModules = path.join(os.tmpdir(), 'mini-erp-stage', 'api', 'node_modules');
  const destNodeModules = path.join(context.appOutDir, 'resources', 'api', 'node_modules');

  if (!existsSync(srcNodeModules)) {
    throw new Error(`Missing staged API node_modules at ${srcNodeModules}`);
  }

  if (existsSync(destNodeModules)) {
    rmSync(destNodeModules, { recursive: true, force: true });
  }

  console.warn('[afterPack] Copying staged API node_modules into packaged resources...');
  cpSync(srcNodeModules, destNodeModules, {
    recursive: true,
    dereference: true,
  });
  console.warn('[afterPack] API node_modules copied cleanly.');
}
