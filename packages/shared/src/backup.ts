import { z } from 'zod';
import { pageSizeSchema } from './pagination.js';

export const BACKUP_TYPES = ['AUTO', 'MANUAL', 'PRE_RESTORE'] as const;
export type BackupType = (typeof BACKUP_TYPES)[number];

export const BACKUP_STATUSES = ['RUNNING', 'SUCCESS', 'FAILED'] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

export const backupLogSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  type: z.enum(BACKUP_TYPES),
  status: z.enum(BACKUP_STATUSES),
  path: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  sizeFormatted: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type BackupLogDto = z.infer<typeof backupLogSchema>;

export const backupSummarySchema = z.object({
  lastBackupAt: z.string().nullable(),
  totalBackups: z.number().int().nonnegative(),
  totalSizeBytes: z.number().nonnegative(),
  retentionCount: z.number().int().positive(),
  backupDir: z.string().optional(),
});
export type BackupSummaryDto = z.infer<typeof backupSummarySchema>;

export const backupQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema.default(25),
  type: z.enum(BACKUP_TYPES).optional(),
  status: z.enum(BACKUP_STATUSES).optional(),
});
export type BackupQueryDto = z.infer<typeof backupQuerySchema>;

export const createBackupSchema = z.object({
  type: z.enum(BACKUP_TYPES).optional().default('MANUAL'),
});
export type CreateBackupDto = z.infer<typeof createBackupSchema>;

export const restoreBackupSchema = z.object({
  confirmCode: z.literal('RESTORE', {
    message: "Confirmation code must be 'RESTORE'",
  }),
});
export type RestoreBackupDto = z.infer<typeof restoreBackupSchema>;
