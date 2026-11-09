import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';

export const NOTIFICATION_TYPES = [
  'CHEQUE_DUE',
  'CHEQUE_BOUNCED',
  'CHEQUE_CLEARED',
  'RECOVERY_DUE',
  'RECOVERY_OVERDUE',
  'LOW_BATCH_STOCK',
  'BATCH_OPEN_LONG',
  'CREDIT_LIMIT_EXCEEDED',
  'BACKUP_WARNING',
  'BACKUP_STATUS',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(NOTIFICATION_TYPES).optional(),
  severity: z.enum(NOTIFICATION_SEVERITIES).optional(),
  unreadOnly: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export interface NotificationDto {
  readonly id: number;
  readonly organizationId: number;
  readonly type: NotificationType;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly body: string;
  readonly dueAt: string | null;
  readonly isRead: boolean;
  readonly readAt: string | null;
  readonly userId: number | null;
  readonly refType: string | null;
  readonly refId: number | null;
  readonly createdAt: string;
}

export interface NotificationsListResponseDto {
  readonly data: readonly NotificationDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly unreadCount: number;
}

export interface RunNotificationScanResultDto {
  readonly createdCount: number;
  readonly unreadCount: number;
  readonly newNotifications: readonly NotificationDto[];
}
