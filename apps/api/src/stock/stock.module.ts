import { BadRequestException, Global, Injectable, Module } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { nextId, type TxClient } from '../database/gapless-id.js';
import { Prisma } from '../generated/prisma/client.js';

export type StockMovementType =
  | 'PURCHASE_IN'
  | 'PURCHASE_VOID_OUT'
  | 'RETURN_OUT'
  | 'RETURN_VOID_IN'
  | 'BATCH_ALLOCATE_OUT'
  | 'PRODUCTION_IN'
  | 'SALE_OUT'
  | 'SALE_CANCEL_IN'
  | 'RETURN_IN'
  | 'RETURN_VOID_OUT'
  | 'ADJUSTMENT'
  | 'WASTAGE';

export interface RecordStockMovementInput {
  readonly organizationId: number;
  readonly itemId: number;
  readonly batchId?: number | null;
  readonly purchaseItemId?: number | null;
  readonly type: StockMovementType;
  /** Signed quantity in base unit (kg): positive adds stock, negative removes stock. */
  readonly qtyBase: Decimal | string;
  readonly refType: string;
  readonly refId: number;
  readonly refNo?: string | null;
  readonly note?: string | null;
  readonly userId: number;
}

/**
 * Pure helper that sums signed stock movements in base unit (3 decimal places)
 * and throws if a negative movement would cause stock to drop below zero.
 */
export function verifyAndSumStockMovements(
  existingSum: Decimal | string,
  deltaQtyBase: Decimal | string,
): Decimal {
  const current = new Decimal(existingSum).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const delta = new Decimal(deltaQtyBase).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const next = current.plus(delta).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

  if (next.lt(0)) {
    throw new BadRequestException(
      `Insufficient stock: available ${current.toFixed(3)}, attempted change ${delta.toFixed(3)}`,
    );
  }
  return next;
}

@Injectable()
export class StockService {
  /**
   * Appends an immutable `stock_movements` row inside the active transaction.
   * Locks the item or batch row (`SELECT ... FOR UPDATE`) when reducing stock so neither
   * raw stock nor batch stock can ever go negative.
   */
  async recordMovement(tx: TxClient, input: RecordStockMovementInput): Promise<void> {
    const qty = new Decimal(input.qtyBase).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    if (qty.isZero()) {
      throw new BadRequestException('Stock movement quantity cannot be zero');
    }

    if (input.batchId != null) {
      // Lock the batch row before checking/modifying batch stock
      await tx.$queryRaw`
        SELECT "id" FROM "batches"
        WHERE "id" = ${input.batchId} AND "organization_id" = ${input.organizationId}
        FOR UPDATE
      `;

      if (qty.lt(0)) {
        const currentBatchStock = await this.getBatchStock(tx, input.organizationId, input.batchId);
        verifyAndSumStockMovements(currentBatchStock, qty);
      }
    } else {
      // Lock the item row before checking/modifying unallocated raw stock
      await tx.$queryRaw`
        SELECT "id" FROM "items"
        WHERE "id" = ${input.itemId} AND "organization_id" = ${input.organizationId}
        FOR UPDATE
      `;

      if (qty.lt(0)) {
        const currentRawStock = await this.getRawItemStock(tx, input.organizationId, input.itemId);
        verifyAndSumStockMovements(currentRawStock, qty);
      }
    }

    const id = await nextId(tx, 'stock_movements');
    await tx.stockMovement.create({
      data: {
        id,
        organizationId: input.organizationId,
        itemId: input.itemId,
        batchId: input.batchId ?? null,
        purchaseItemId: input.purchaseItemId ?? null,
        type: input.type,
        qtyBase: new Prisma.Decimal(qty.toFixed(3)),
        refType: input.refType,
        refId: input.refId,
        refNo: input.refNo ?? null,
        note: input.note ?? null,
        userId: input.userId,
      },
    });
  }

  /**
   * Sums all unallocated raw stock movements (`batch_id IS NULL`) for an item.
   */
  async getRawItemStock(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    itemId: number,
  ): Promise<string> {
    const agg = await tx.stockMovement.aggregate({
      where: {
        organizationId,
        itemId,
        batchId: null,
      },
      _sum: {
        qtyBase: true,
      },
    });
    const sum = agg._sum.qtyBase ? new Decimal(agg._sum.qtyBase.toString()) : new Decimal(0);
    return sum.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
  }

  /**
   * Sums all stock movements (`PRODUCTION_IN`, `WASTAGE`, `ADJUSTMENT`, `SALE_OUT`, `RETURN_IN`)
   * for a specific batch.
   */
  async getBatchStock(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    batchId: number,
  ): Promise<string> {
    const agg = await tx.stockMovement.aggregate({
      where: {
        organizationId,
        batchId,
      },
      _sum: {
        qtyBase: true,
      },
    });
    const sum = agg._sum.qtyBase ? new Decimal(agg._sum.qtyBase.toString()) : new Decimal(0);
    return sum.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
  }
}

@Global()
@Module({
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
