import {
  type ListNotificationsQuery,
  type NotificationDto,
  type NotificationsListResponseDto,
  type NotificationSeverity,
  type NotificationType,
  type RunNotificationScanResultDto,
} from '@mini-erp/shared';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Hourly scheduler per Section 8
    this.timer = setInterval(
      () => {
        void this.runHourlyScanForAllOrgs();
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async runHourlyScanForAllOrgs(): Promise<void> {
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true } });
      for (const org of orgs) {
        await this.scanAndGenerate(org.id);
      }
    } catch (err) {
      console.error('[NotificationsService] Hourly scheduler scan error:', err);
    }
  }

  toNotificationDto(row: {
    id: number;
    organizationId: number;
    type: string;
    severity: string;
    title: string;
    body: string;
    dueAt: Date | null;
    isRead: boolean;
    readAt: Date | null;
    userId: number | null;
    refType: string | null;
    refId: number | null;
    createdAt: Date;
  }): NotificationDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      type: row.type as NotificationType,
      severity: row.severity as NotificationSeverity,
      title: row.title,
      body: row.body,
      dueAt: row.dueAt ? row.dueAt.toISOString().slice(0, 10) : null,
      isRead: row.isRead,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      userId: row.userId,
      refType: row.refType,
      refId: row.refId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async createNotificationIfAbsent(
    tx: TxClient,
    organizationId: number,
    data: {
      type: NotificationType;
      severity: NotificationSeverity;
      title: string;
      body: string;
      dueAt?: Date | null;
      refType?: string | null;
      refId?: number | null;
      dedupeKey: string;
    },
  ): Promise<boolean> {
    const existing = await tx.notification.findUnique({
      where: {
        organizationId_dedupeKey: {
          organizationId,
          dedupeKey: data.dedupeKey,
        },
      },
    });

    if (existing) {
      return false;
    }

    const id = await nextId(tx, 'notifications');
    await tx.notification.create({
      data: {
        id,
        organizationId,
        type: data.type,
        severity: data.severity,
        title: data.title,
        body: data.body,
        dueAt: data.dueAt ?? null,
        refType: data.refType ?? null,
        refId: data.refId ?? null,
        dedupeKey: data.dedupeKey,
      },
    });

    return true;
  }

  async scanAndGenerate(organizationId: number): Promise<RunNotificationScanResultDto> {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);
    const threeDaysLater = new Date(now.getTime() + 3 * 86400000);
    const todayWeekday = WEEKDAY_NAMES[now.getUTCDay()];

    return inTransaction(this.prisma, async (tx: TxClient) => {
      let createdCount = 0;

      // 1. Cheques Due for deposit (3 days, 1 day, today / overdue) & Bounced cheques
      const cheques = await tx.cheque.findMany({
        where: {
          organizationId,
          direction: 'IN',
        },
        include: { payment: true },
      });

      for (const chq of cheques) {
        if (chq.status === 'BOUNCED') {
          const dedupeKey = `CHEQUE_BOUNCED_${chq.id}_${chq.bouncedDate?.toISOString().slice(0, 10) ?? todayStr}`;
          const created = await this.createNotificationIfAbsent(tx, organizationId, {
            type: 'CHEQUE_BOUNCED',
            severity: 'CRITICAL',
            title: `Cheque #${chq.chequeNo} Bounced`,
            body: `Cheque of PKR ${new Decimal(chq.amount.toString()).toFixed(2)} from ${chq.bankName} bounced. Reason: ${chq.bounceReason || 'Unspecified'}.`,
            refType: 'CHEQUE',
            refId: chq.id,
            dedupeKey,
          });
          if (created) createdCount++;
        } else if (chq.status === 'RECEIVED' || chq.status === 'DEPOSITED') {
          if (chq.chequeDate <= threeDaysLater) {
            const diffDays = Math.ceil((chq.chequeDate.getTime() - now.getTime()) / 86400000);
            const dueLabel =
              diffDays <= 0
                ? 'due for deposit today or overdue'
                : diffDays === 1
                  ? 'due tomorrow'
                  : `due in ${diffDays} days`;
            const dedupeKey = `CHEQUE_DUE_${chq.id}_${todayStr}`;
            const created = await this.createNotificationIfAbsent(tx, organizationId, {
              type: 'CHEQUE_DUE',
              severity: diffDays <= 0 ? 'WARNING' : 'INFO',
              title: `Cheque Deposit Due (${dueLabel})`,
              body: `Cheque #${chq.chequeNo} (${chq.bankName}) for PKR ${new Decimal(chq.amount.toString()).toFixed(2)} is ${dueLabel}.`,
              dueAt: chq.chequeDate,
              refType: 'CHEQUE',
              refId: chq.id,
              dedupeKey,
            });
            if (created) createdCount++;
          }
        }
      }

      // 2. Client recovery due today / overdue & Credit limit exceeded
      const clients = await tx.client.findMany({
        where: { organizationId, isActive: true },
        include: { route: true },
      });

      // Get latest ledger balance for clients
      const latestEntries = await tx.ledgerEntry.findMany({
        where: { organizationId, partyType: 'CLIENT' },
        orderBy: [{ partyId: 'asc' }, { id: 'desc' }],
        distinct: ['partyId'],
        select: { partyId: true, balance: true },
      });
      const balanceMap = new Map<number, Decimal>();
      for (const entry of latestEntries) {
        balanceMap.set(entry.partyId, new Decimal(entry.balance.toString()));
      }

      for (const client of clients) {
        const bal = balanceMap.get(client.id) ?? new Decimal(client.openingBalance.toString());

        // Credit Limit Exceeded
        const limit = new Decimal(client.creditLimit.toString());
        if (limit.gt(0) && bal.gt(limit)) {
          const dedupeKey = `CREDIT_LIMIT_${client.id}_${todayStr}`;
          const created = await this.createNotificationIfAbsent(tx, organizationId, {
            type: 'CREDIT_LIMIT_EXCEEDED',
            severity: 'CRITICAL',
            title: `Credit Limit Exceeded: ${client.name}`,
            body: `Outstanding balance of PKR ${bal.toFixed(2)} exceeds credit limit of PKR ${limit.toFixed(2)}.`,
            refType: 'CLIENT',
            refId: client.id,
            dedupeKey,
          });
          if (created) createdCount++;
        }

        // Recovery Due Today / Overdue
        if (bal.gt(0)) {
          if (client.promisedDate) {
            const isToday = client.promisedDate.toISOString().slice(0, 10) === todayStr;
            const isOverdue = client.promisedDate < now && !isToday;

            if (isToday) {
              const dedupeKey = `RECOVERY_DUE_${client.id}_${todayStr}`;
              const created = await this.createNotificationIfAbsent(tx, organizationId, {
                type: 'RECOVERY_DUE',
                severity: 'WARNING',
                title: `Recovery Due Today: ${client.name}`,
                body: `Promised amount of PKR ${client.promisedAmount ? new Decimal(client.promisedAmount.toString()).toFixed(2) : bal.toFixed(2)} is due today.`,
                dueAt: client.promisedDate,
                refType: 'CLIENT',
                refId: client.id,
                dedupeKey,
              });
              if (created) createdCount++;
            } else if (isOverdue) {
              const dedupeKey = `RECOVERY_OVERDUE_${client.id}_${todayStr}`;
              const created = await this.createNotificationIfAbsent(tx, organizationId, {
                type: 'RECOVERY_OVERDUE',
                severity: 'CRITICAL',
                title: `Recovery Overdue: ${client.name}`,
                body: `Promised recovery of PKR ${client.promisedAmount ? new Decimal(client.promisedAmount.toString()).toFixed(2) : bal.toFixed(2)} was due on ${client.promisedDate.toISOString().slice(0, 10)}.`,
                dueAt: client.promisedDate,
                refType: 'CLIENT',
                refId: client.id,
                dedupeKey,
              });
              if (created) createdCount++;
            }
          } else if (client.recoveryDay === todayWeekday) {
            const dedupeKey = `RECOVERY_DAY_${client.id}_${todayStr}`;
            const created = await this.createNotificationIfAbsent(tx, organizationId, {
              type: 'RECOVERY_DUE',
              severity: 'INFO',
              title: `Weekly Recovery Due Today: ${client.name}`,
              body: `Client is scheduled for recovery on ${todayWeekday}. Current outstanding balance: PKR ${bal.toFixed(2)}.`,
              dueAt: todayEnd,
              refType: 'CLIENT',
              refId: client.id,
              dedupeKey,
            });
            if (created) createdCount++;
          }
        }
      }

      // 3. Low batch stock & Batch open too long (> 30 days)
      const batches = await tx.batch.findMany({
        where: { organizationId, status: 'OPEN' },
        include: { item: true },
      });

      const stockAggs = await tx.stockMovement.groupBy({
        by: ['batchId'],
        where: { organizationId, batchId: { in: batches.map((b) => b.id) } },
        _sum: { qtyBase: true },
      });
      const stockMap = new Map<number, Decimal>();
      for (const row of stockAggs) {
        if (row.batchId !== null) {
          stockMap.set(row.batchId, new Decimal(row._sum.qtyBase?.toString() ?? '0'));
        }
      }

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

      for (const batch of batches) {
        const remainingKg = stockMap.get(batch.id) ?? new Decimal(0);
        const outputKg = new Decimal(batch.outputKg.toString());
        const lowThreshold = Decimal.max(new Decimal(100), outputKg.mul('0.15'));

        if (remainingKg.gt(0) && remainingKg.lte(lowThreshold)) {
          const dedupeKey = `LOW_BATCH_STOCK_${batch.id}_${todayStr}`;
          const created = await this.createNotificationIfAbsent(tx, organizationId, {
            type: 'LOW_BATCH_STOCK',
            severity: 'WARNING',
            title: `Low Stock: Batch ${batch.batchNo}`,
            body: `Batch ${batch.batchNo} (${batch.name}) has only ${remainingKg.toFixed(3)} kg remaining.`,
            refType: 'BATCH',
            refId: batch.id,
            dedupeKey,
          });
          if (created) createdCount++;
        }

        if (batch.batchDate <= thirtyDaysAgo) {
          const dedupeKey = `BATCH_OPEN_LONG_${batch.id}_${todayStr}`;
          const created = await this.createNotificationIfAbsent(tx, organizationId, {
            type: 'BATCH_OPEN_LONG',
            severity: 'INFO',
            title: `Batch Open for 30+ Days: ${batch.batchNo}`,
            body: `Batch ${batch.batchNo} (${batch.name}) was created on ${batch.batchDate.toISOString().slice(0, 10)} and remains unclosed.`,
            refType: 'BATCH',
            refId: batch.id,
            dedupeKey,
          });
          if (created) createdCount++;
        }
      }

      // 4. No backup for 24 hours warning
      const [org, lastBackupLog] = await Promise.all([
        tx.organization.findUnique({
          where: { id: organizationId },
          select: { settingsJson: true },
        }),
        tx.backupLog.findFirst({
          where: { organizationId, status: 'SUCCESS' },
          orderBy: { finishedAt: 'desc' },
        }),
      ]);
      const settings = (org?.settingsJson as Record<string, unknown> | null) ?? {};
      const lastBackupDate =
        lastBackupLog?.finishedAt ??
        (settings['lastBackupAt'] ? new Date(settings['lastBackupAt'] as string) : null);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      if (!lastBackupDate || lastBackupDate < twentyFourHoursAgo) {
        const dedupeKey = `BACKUP_WARNING_${todayStr}`;
        const created = await this.createNotificationIfAbsent(tx, organizationId, {
          type: 'BACKUP_WARNING',
          severity: 'CRITICAL',
          title: 'Database Backup Warning',
          body: lastBackupDate
            ? `No database backup has completed in the last 24 hours. Last backup: ${lastBackupDate.toLocaleString()}.`
            : 'No database backup has been taken yet. Please run or configure a backup in Settings.',
          refType: 'BACKUP',
          dedupeKey,
        });
        if (created) createdCount++;
      }

      // Fetch unread count & recent new notifications
      const unreadCount = await tx.notification.count({
        where: { organizationId, isRead: false },
      });

      const newRows = await tx.notification.findMany({
        where: { organizationId },
        orderBy: { id: 'desc' },
        take: Math.max(1, createdCount),
      });

      return {
        createdCount,
        unreadCount,
        newNotifications: newRows.map((r) => this.toNotificationDto(r)),
      };
    });
  }

  async listNotifications(
    organizationId: number,
    query: Partial<ListNotificationsQuery> = {},
  ): Promise<NotificationsListResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);
    const skip = (page - 1) * pageSize;

    const where: Prisma.NotificationWhereInput = {
      organizationId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.unreadOnly ? { isRead: false } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { body: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ isRead: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { organizationId, isRead: false } }),
    ]);

    return {
      data: rows.map((r) => this.toNotificationDto(r)),
      total,
      page,
      pageSize,
      unreadCount,
    };
  }

  async markAsRead(organizationId: number, id: number): Promise<NotificationDto> {
    const row = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return this.toNotificationDto(row);
  }

  async markAllAsRead(organizationId: number): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: result.count };
  }
}
