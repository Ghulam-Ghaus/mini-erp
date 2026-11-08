import { Global, Injectable, Module } from '@nestjs/common';
import type { LedgerEntryDto } from '@mini-erp/shared';
import { Decimal } from 'decimal.js';
import { nextId, type TxClient } from '../database/gapless-id.js';
import { Prisma } from '../generated/prisma/client.js';

export type LedgerPartyType = 'SUPPLIER' | 'CLIENT';

export interface PostLedgerEntryInput {
  readonly organizationId: number;
  readonly partyType: LedgerPartyType;
  readonly partyId: number;
  readonly entryDate: Date;
  readonly refType: string;
  readonly refId: number;
  readonly refNo?: string | null;
  readonly debit: Decimal | string;
  readonly credit: Decimal | string;
  readonly narration: string;
  readonly createdById: number;
}

/**
 * Pure running balance calculation for a ledger entry.
 * - For SUPPLIER (payable account): balance = previousBalance + credit - debit
 *   (positive = payable owed to supplier)
 * - For CLIENT (receivable account): balance = previousBalance + debit - credit
 *   (positive = receivable owed by client)
 */
export function computeNextLedgerBalance(params: {
  partyType: LedgerPartyType;
  previousBalance: Decimal | string;
  debit: Decimal | string;
  credit: Decimal | string;
}): Decimal {
  const prev = new Decimal(params.previousBalance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const debit = new Decimal(params.debit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const credit = new Decimal(params.credit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (params.partyType === 'SUPPLIER') {
    return prev.plus(credit).minus(debit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
  return prev.plus(debit).minus(credit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

@Injectable()
export class LedgerService {
  /**
   * Appends a new immutable row to `ledger_entries` inside the active transaction.
   * Locks the supplier/client row (`SELECT ... FOR UPDATE`) to serialize balance computation.
   */
  async postEntry(tx: TxClient, input: PostLedgerEntryInput): Promise<LedgerEntryDto> {
    if (input.partyType === 'SUPPLIER') {
      await tx.$queryRaw`
        SELECT "id" FROM "suppliers"
        WHERE "id" = ${input.partyId} AND "organization_id" = ${input.organizationId}
        FOR UPDATE
      `;
    } else if (input.partyType === 'CLIENT') {
      await tx.$queryRaw`
        SELECT "id" FROM "clients"
        WHERE "id" = ${input.partyId} AND "organization_id" = ${input.organizationId}
        FOR UPDATE
      `;
    }

    const lastEntry = await tx.ledgerEntry.findFirst({
      where: {
        organizationId: input.organizationId,
        partyType: input.partyType,
        partyId: input.partyId,
      },
      orderBy: { id: 'desc' },
    });

    const previousBalance = lastEntry ? new Decimal(lastEntry.balance.toString()) : new Decimal(0);
    const debit = new Decimal(input.debit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const credit = new Decimal(input.credit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const nextBalance = computeNextLedgerBalance({
      partyType: input.partyType,
      previousBalance,
      debit,
      credit,
    });

    const id = await nextId(tx, 'ledger_entries');
    const created = await tx.ledgerEntry.create({
      data: {
        id,
        organizationId: input.organizationId,
        partyType: input.partyType,
        partyId: input.partyId,
        entryDate: input.entryDate,
        refType: input.refType,
        refId: input.refId,
        refNo: input.refNo ?? null,
        debit: new Prisma.Decimal(debit.toFixed(2)),
        credit: new Prisma.Decimal(credit.toFixed(2)),
        balance: new Prisma.Decimal(nextBalance.toFixed(2)),
        narration: input.narration,
        createdById: input.createdById,
      },
    });

    return {
      id: created.id,
      partyType: created.partyType as LedgerPartyType,
      partyId: created.partyId,
      entryDate: created.entryDate.toISOString(),
      refType: created.refType,
      refId: created.refId,
      refNo: created.refNo,
      debit: new Decimal(created.debit.toString()).toFixed(2),
      credit: new Decimal(created.credit.toString()).toFixed(2),
      balance: new Decimal(created.balance.toString()).toFixed(2),
      narration: created.narration,
      createdById: created.createdById,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Returns the current running balance for a party (0.00 if no entries exist).
   */
  async getPartyBalance(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    partyType: LedgerPartyType,
    partyId: number,
  ): Promise<string> {
    const lastEntry = await tx.ledgerEntry.findFirst({
      where: { organizationId, partyType, partyId },
      orderBy: { id: 'desc' },
    });
    return lastEntry ? new Decimal(lastEntry.balance.toString()).toFixed(2) : '0.00';
  }
}

@Global()
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
