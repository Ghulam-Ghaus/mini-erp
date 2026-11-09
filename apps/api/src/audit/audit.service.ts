import { type AuditLogDto, type AuditLogQueryDto, type PaginatedResponse } from '@mini-erp/shared';
import { Injectable } from '@nestjs/common';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditLogInput {
  readonly organizationId: number;
  readonly userId?: number | null;
  readonly action:
    | 'CREATE'
    | 'UPDATE'
    | 'CANCEL'
    | 'VOID'
    | 'LOGIN'
    | 'PIN_CHANGE'
    | 'SETUP'
    | 'ALLOCATE_PURCHASE'
    | 'ADD_COST'
    | 'VOID_COST'
    | 'UPDATE_WASTAGE'
    | 'CLOSE'
    | 'ADJUST_STOCK'
    | 'RESTORE_DATABASE'
    | 'CREATE_BACKUP';
  readonly entity: string;
  readonly entityId?: number | null;
  readonly beforeJson?: Prisma.InputJsonValue;
  readonly afterJson?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma?: PrismaService) {}

  /**
   * Appends an immutable AuditLog entry inside the active transaction using a gapless ID.
   */
  async log(tx: TxClient, input: AuditLogInput): Promise<void> {
    const id = await nextId(tx, 'audit_logs');
    await tx.auditLog.create({
      data: {
        id,
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        ...(input.beforeJson !== undefined ? { beforeJson: input.beforeJson } : {}),
        ...(input.afterJson !== undefined ? { afterJson: input.afterJson } : {}),
      },
    });
  }

  /**
   * Appends an audit log entry in a self-managed transaction.
   */
  async logStandalone(input: AuditLogInput): Promise<void> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for AuditService.logStandalone');
    }
    await inTransaction(this.prisma, async (tx) => {
      await this.log(tx, input);
    });
  }

  async findAll(orgId: number, query: AuditLogQueryDto): Promise<PaginatedResponse<AuditLogDto>> {
    if (!this.prisma) {
      throw new Error('PrismaService is required for AuditService.findAll');
    }
    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
    };
    if (query.action) {
      where.action = query.action;
    }
    if (query.entity) {
      where.entity = query.entity;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
      }
    }
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { entity: { contains: s, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: s, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: s, mode: 'insensitive' } } } },
        { user: { is: { username: { contains: s, mode: 'insensitive' } } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      data: items.map((item) => ({
        id: item.id,
        organizationId: item.organizationId,
        userId: item.userId,
        user: item.user
          ? {
              id: item.user.id,
              fullName: `${item.user.firstName} ${item.user.lastName}`.trim(),
              username: item.user.username,
            }
          : null,
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        beforeJson: item.beforeJson ?? undefined,
        afterJson: item.afterJson ?? undefined,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
