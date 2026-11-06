import { Global, Injectable, Module } from '@nestjs/common';
import { nextId, type TxClient } from '../database/gapless-id.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditLogInput {
  readonly organizationId: number;
  readonly userId?: number | null;
  readonly action: 'CREATE' | 'UPDATE' | 'CANCEL' | 'LOGIN' | 'PIN_CHANGE' | 'SETUP';
  readonly entity: string;
  readonly entityId?: number | null;
  readonly beforeJson?: Prisma.InputJsonValue;
  readonly afterJson?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
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
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
