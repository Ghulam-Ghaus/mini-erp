// Root ESLint config: only for files in the repo root (e.g. prisma.config.ts).
// ESLint looks up the nearest config per file, so each package uses its own config.
import node from '@mini-erp/config/eslint/node';

export default node;
