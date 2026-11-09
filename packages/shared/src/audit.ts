import { z } from 'zod';
import { pageSizeSchema } from './pagination.js';

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'CANCEL',
  'VOID',
  'LOGIN',
  'PIN_CHANGE',
  'SETUP',
  'ALLOCATE_PURCHASE',
  'ADD_COST',
  'VOID_COST',
  'UPDATE_WASTAGE',
  'CLOSE',
  'ADJUST_STOCK',
  'RESTORE_DATABASE',
  'CREATE_BACKUP',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditUserSummarySchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string(),
  username: z.string(),
});
export type AuditUserSummaryDto = z.infer<typeof auditUserSummarySchema>;

export const auditLogSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  userId: z.number().int().nullable(),
  user: auditUserSummarySchema.nullable().optional(),
  action: z.string(),
  entity: z.string(),
  entityId: z.number().int().nullable(),
  beforeJson: z.unknown().optional(),
  afterJson: z.unknown().optional(),
  createdAt: z.string(),
});
export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: pageSizeSchema.default(25),
  search: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type AuditLogQueryDto = z.infer<typeof auditLogQuerySchema>;
