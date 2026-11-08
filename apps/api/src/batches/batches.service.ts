import {
  type AddBatchAllocationInput,
  type AddBatchCostInput,
  type AdjustBatchStockInput,
  type AvailablePurchaseItemDto,
  type BatchCostDto,
  type BatchCostType,
  type BatchDetailDto,
  type BatchSourceDto,
  type BatchStatus,
  type BatchSummaryDto,
  calculateAllocationAmount,
  calculateBatchMetrics,
  calculateBatchVariance,
  type CloseBatchInput,
  type CreateBatchInput,
  type ListBatchesQuery,
  type ListStockMovementsQuery,
  type PaginatedResponse,
  type StockMovementDto,
  type StockMovementTypeDto,
  type UpdateBatchWastageInput,
  type VoidBatchCostInput,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.module.js';
import { StockService } from '../stock/stock.module.js';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberingService: NumberingService,
    private readonly stockService: StockService,
    private readonly auditService: AuditService,
  ) {}

  async listAvailablePurchaseItems(
    organizationId: number,
    itemId?: number,
  ): Promise<AvailablePurchaseItemDto[]> {
    const rows = await this.prisma.purchaseItem.findMany({
      where: {
        ...(itemId ? { itemId } : {}),
        purchase: {
          organizationId,
          status: { not: 'VOIDED' },
        },
      },
      include: {
        purchase: {
          include: {
            supplier: true,
          },
        },
        item: true,
      },
      orderBy: [{ purchase: { invoiceDate: 'asc' } }, { id: 'asc' }],
    });

    const result: AvailablePurchaseItemDto[] = [];
    for (const row of rows) {
      const qtyBase = new Decimal(row.qtyBase.toString());
      const returned = new Decimal(row.returnedQtyBase.toString());
      const allocated = new Decimal(row.allocatedQtyBase.toString());
      const available = qtyBase
        .minus(returned)
        .minus(allocated)
        .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

      if (available.gt(0)) {
        result.push({
          purchaseItemId: row.id,
          purchaseId: row.purchaseId,
          invoiceNo: row.purchase.invoiceNo,
          invoiceDate: row.purchase.invoiceDate.toISOString().slice(0, 10),
          supplierId: row.purchase.supplierId,
          supplierName: row.purchase.supplier.name,
          itemId: row.itemId,
          itemName: row.item.name,
          itemNameUr: row.item.nameUr,
          baseUnit: row.item.baseUnit,
          enteredQty: new Decimal(row.enteredQty.toString()).toFixed(3),
          enteredUnit: row.enteredUnit,
          qtyBase: qtyBase.toFixed(3),
          returnedQtyBase: returned.toFixed(3),
          allocatedQtyBase: allocated.toFixed(3),
          availableQtyBase: available.toFixed(3),
          ratePerBase: new Decimal(row.ratePerBase.toString()).toFixed(4),
        });
      }
    }

    return result;
  }

  async listBatches(
    organizationId: number,
    query: ListBatchesQuery,
  ): Promise<PaginatedResponse<BatchSummaryDto>> {
    const where: Prisma.BatchWhereInput = {
      organizationId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.itemId) {
      where.itemId = query.itemId;
    }
    if (query.dateFrom || query.dateTo) {
      where.batchDate = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { batchNo: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { nameUr: { contains: s, mode: 'insensitive' } },
        { item: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const orderByField =
      query.sortBy === 'batchNo'
        ? 'batchNo'
        : query.sortBy === 'name'
          ? 'name'
          : query.sortBy === 'costPerKg'
            ? 'costPerKg'
            : query.sortBy === 'outputKg'
              ? 'outputKg'
              : 'batchDate';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, rows] = await Promise.all([
      this.prisma.batch.count({ where }),
      this.prisma.batch.findMany({
        where,
        include: {
          item: true,
        },
        orderBy: [{ [orderByField]: sortOrder }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const batchIds = rows.map((r) => r.id);
    const movementSums =
      batchIds.length > 0
        ? await this.prisma.stockMovement.groupBy({
            by: ['batchId', 'type'],
            where: {
              organizationId,
              batchId: { in: batchIds },
            },
            _sum: {
              qtyBase: true,
            },
          })
        : [];

    const availableMap = new Map<number, Decimal>();
    const soldMap = new Map<number, Decimal>();

    for (const m of movementSums) {
      if (m.batchId == null) continue;
      const qty = m._sum.qtyBase ? new Decimal(m._sum.qtyBase.toString()) : new Decimal(0);
      availableMap.set(m.batchId, (availableMap.get(m.batchId) ?? new Decimal(0)).plus(qty));

      if (m.type === 'SALE_OUT') {
        soldMap.set(m.batchId, (soldMap.get(m.batchId) ?? new Decimal(0)).plus(qty.abs()));
      } else if (m.type === 'RETURN_IN') {
        soldMap.set(m.batchId, (soldMap.get(m.batchId) ?? new Decimal(0)).minus(qty.abs()));
      }
    }

    const data: BatchSummaryDto[] = rows.map((row) =>
      this.mapBatchSummary(
        row,
        (availableMap.get(row.id) ?? new Decimal(0)).toFixed(3),
        Decimal.max(0, soldMap.get(row.id) ?? new Decimal(0)).toFixed(3),
      ),
    );

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getBatchById(organizationId: number, batchId: number): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) =>
      this.getBatchDetailInTx(tx, organizationId, batchId),
    );
  }

  async createBatch(
    organizationId: number,
    userId: number,
    input: CreateBatchInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batchDate = new Date(input.batchDate);
      const batchNo = await this.numberingService.nextDocumentNumber(
        tx,
        organizationId,
        'BATCH',
        batchDate,
      );

      const batchId = await nextId(tx, 'batches');
      await tx.batch.create({
        data: {
          id: batchId,
          organizationId,
          batchNo,
          name: input.name,
          nameUr: input.nameUr ?? null,
          itemId: input.itemId ?? null,
          batchDate,
          status: input.status,
          notes: input.notes ?? null,
          createdById: userId,
        },
      });

      const createdAllocations: Array<{ kgUsed: string; amount: string; itemId: number }> = [];

      for (const line of input.allocations) {
        const allocated = await this.allocatePurchaseLineInTx(tx, {
          organizationId,
          userId,
          batchId,
          batchNo,
          purchaseItemId: line.purchaseItemId,
          kgUsed: line.kgUsed,
          notes: line.notes ?? null,
        });
        createdAllocations.push(allocated);
      }

      const activeCosts: Array<{ amount: string }> = [];
      for (const cost of input.costs) {
        const costId = await nextId(tx, 'batch_costs');
        const amountStr = new Decimal(cost.amount)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toFixed(2);
        await tx.batchCost.create({
          data: {
            id: costId,
            batchId,
            costType: cost.costType,
            costDate: new Date(cost.costDate),
            description: cost.description,
            amount: new Prisma.Decimal(amountStr),
            createdById: userId,
          },
        });
        activeCosts.push({ amount: amountStr });
      }

      let metrics;
      try {
        metrics = calculateBatchMetrics({
          allocations: createdAllocations,
          activeCosts,
          wastageMode: input.wastageMode,
          wastagePercent: input.wastagePercent,
          wastageKg: input.wastageKg,
        });
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'Invalid batch metrics');
      }

      const primaryItemId = input.itemId ?? createdAllocations[0]?.itemId ?? null;
      const wastageKgDec = new Decimal(metrics.wastageKg);

      if (wastageKgDec.gt(0) && primaryItemId != null) {
        await this.stockService.recordMovement(tx, {
          organizationId,
          itemId: primaryItemId,
          batchId,
          type: 'WASTAGE',
          qtyBase: wastageKgDec.negated().toFixed(3),
          refType: 'BATCH',
          refId: batchId,
          refNo: batchNo,
          note: `Initial batch wastage (${metrics.wastagePercent}%)`,
          userId,
        });
      }

      await tx.batch.update({
        where: { id: batchId },
        data: {
          itemId: primaryItemId,
          rawKg: new Prisma.Decimal(metrics.rawKg),
          plannedWastagePercent: new Prisma.Decimal(metrics.wastagePercent),
          plannedWastageKg: new Prisma.Decimal(metrics.wastageKg),
          wastagePercent: new Prisma.Decimal(metrics.wastagePercent),
          wastageKg: new Prisma.Decimal(metrics.wastageKg),
          outputKg: new Prisma.Decimal(metrics.outputKg),
          rawCost: new Prisma.Decimal(metrics.rawCost),
          extraCost: new Prisma.Decimal(metrics.extraCost),
          totalCost: new Prisma.Decimal(metrics.totalCost),
          costPerKg: new Prisma.Decimal(metrics.costPerKg),
        },
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'Batch',
        entityId: batchId,
        afterJson: {
          batchNo,
          name: input.name,
          ...metrics,
        },
      });

      return this.getBatchDetailInTx(tx, organizationId, batchId);
    });
  }

  async addAllocations(
    organizationId: number,
    userId: number,
    batchId: number,
    input: AddBatchAllocationInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batch = await this.lockAndGetOpenBatchInTx(tx, organizationId, batchId);

      for (const line of input.allocations) {
        await this.allocatePurchaseLineInTx(tx, {
          organizationId,
          userId,
          batchId: batch.id,
          batchNo: batch.batchNo,
          purchaseItemId: line.purchaseItemId,
          kgUsed: line.kgUsed,
          notes: line.notes ?? null,
        });
      }

      await this.recalculateOpenBatchInTx(tx, {
        organizationId,
        userId,
        batchId: batch.id,
        wastageMode: 'PERCENT',
        wastagePercent: batch.wastagePercent.toString(),
        note: 'Recalculated after additional purchase allocation',
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'ALLOCATE_PURCHASE',
        entity: 'Batch',
        entityId: batch.id,
        afterJson: { allocations: input.allocations },
      });

      return this.getBatchDetailInTx(tx, organizationId, batch.id);
    });
  }

  async addCost(
    organizationId: number,
    userId: number,
    batchId: number,
    input: AddBatchCostInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batch = await this.lockAndGetOpenBatchInTx(tx, organizationId, batchId);

      const costId = await nextId(tx, 'batch_costs');
      const amountStr = new Decimal(input.amount)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .toFixed(2);

      await tx.batchCost.create({
        data: {
          id: costId,
          batchId: batch.id,
          costType: input.costType,
          costDate: new Date(input.costDate),
          description: input.description,
          amount: new Prisma.Decimal(amountStr),
          createdById: userId,
        },
      });

      await this.recalculateOpenBatchInTx(tx, {
        organizationId,
        userId,
        batchId: batch.id,
        wastageMode: 'KG',
        wastageKg: batch.wastageKg.toString(),
        note: `Added batch cost (${input.costType})`,
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'ADD_COST',
        entity: 'Batch',
        entityId: batch.id,
        afterJson: { costId, ...input },
      });

      return this.getBatchDetailInTx(tx, organizationId, batch.id);
    });
  }

  async voidCost(
    organizationId: number,
    userId: number,
    batchId: number,
    costId: number,
    input: VoidBatchCostInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batch = await this.lockAndGetOpenBatchInTx(tx, organizationId, batchId);

      const cost = await tx.batchCost.findFirst({
        where: { id: costId, batchId: batch.id },
      });
      if (!cost) {
        throw new NotFoundException('Batch cost entry not found');
      }
      if (cost.isVoided) {
        throw new BadRequestException('Batch cost entry is already voided');
      }

      await tx.batchCost.update({
        where: { id: costId },
        data: {
          isVoided: true,
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: userId,
        },
      });

      await this.recalculateOpenBatchInTx(tx, {
        organizationId,
        userId,
        batchId: batch.id,
        wastageMode: 'KG',
        wastageKg: batch.wastageKg.toString(),
        note: `Voided batch cost #${costId}`,
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'VOID_COST',
        entity: 'Batch',
        entityId: batch.id,
        afterJson: { costId, reason: input.reason },
      });

      return this.getBatchDetailInTx(tx, organizationId, batch.id);
    });
  }

  async updateWastage(
    organizationId: number,
    userId: number,
    batchId: number,
    input: UpdateBatchWastageInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batch = await this.lockAndGetOpenBatchInTx(tx, organizationId, batchId);

      await this.recalculateOpenBatchInTx(tx, {
        organizationId,
        userId,
        batchId: batch.id,
        wastageMode: input.wastageMode,
        wastagePercent: input.wastagePercent,
        wastageKg: input.wastageKg,
        note: input.note ?? 'Updated batch wastage',
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'UPDATE_WASTAGE',
        entity: 'Batch',
        entityId: batch.id,
        afterJson: input,
      });

      return this.getBatchDetailInTx(tx, organizationId, batch.id);
    });
  }

  async closeBatch(
    organizationId: number,
    userId: number,
    batchId: number,
    input: CloseBatchInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batch = await this.lockAndGetOpenBatchInTx(tx, organizationId, batchId);

      const rawKgDec = new Decimal(batch.rawKg.toString());
      if (rawKgDec.lte(0)) {
        throw new BadRequestException('Cannot close a batch with zero allocated raw stock');
      }

      if (input.actualOutputKg) {
        const actualOutputDec = new Decimal(input.actualOutputKg).toDecimalPlaces(
          3,
          Decimal.ROUND_HALF_UP,
        );
        if (actualOutputDec.lte(0) || actualOutputDec.gt(rawKgDec)) {
          throw new BadRequestException(
            `Actual output (${actualOutputDec.toFixed(3)} kg) must be greater than 0 and at most raw allocated weight (${rawKgDec.toFixed(3)} kg)`,
          );
        }
        const actualWastageKg = rawKgDec
          .minus(actualOutputDec)
          .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

        await this.recalculateOpenBatchInTx(tx, {
          organizationId,
          userId,
          batchId: batch.id,
          wastageMode: 'KG',
          wastageKg: actualWastageKg.toFixed(3),
          note: input.note ?? 'Final weighed output adjustment on batch close',
        });
      }

      const closed = await tx.batch.update({
        where: { id: batch.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: userId,
        },
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'CLOSE',
        entity: 'Batch',
        entityId: batch.id,
        afterJson: {
          status: 'CLOSED',
          outputKg: closed.outputKg.toString(),
          wastageKg: closed.wastageKg.toString(),
          wastagePercent: closed.wastagePercent.toString(),
          costPerKg: closed.costPerKg.toString(),
          note: input.note ?? null,
        },
      });

      return this.getBatchDetailInTx(tx, organizationId, batch.id);
    });
  }

  async adjustBatchStock(
    organizationId: number,
    userId: number,
    batchId: number,
    input: AdjustBatchStockInput,
  ): Promise<BatchDetailDto> {
    return inTransaction(this.prisma, async (tx) => {
      const batch = await tx.batch.findFirst({
        where: { id: batchId, organizationId },
        include: { sources: true },
      });
      if (!batch) {
        throw new NotFoundException('Batch not found');
      }

      const itemId = batch.itemId ?? batch.sources[0]?.itemId;
      if (!itemId) {
        throw new BadRequestException('Batch has no associated item for stock movement');
      }

      await this.stockService.recordMovement(tx, {
        organizationId,
        itemId,
        batchId: batch.id,
        type: 'ADJUSTMENT',
        qtyBase: input.deltaQtyBase,
        refType: 'BATCH_ADJUSTMENT',
        refId: batch.id,
        refNo: batch.batchNo,
        note: `${input.reasonCode}: ${input.note}`,
        userId,
      });

      await this.auditService.log(tx, {
        organizationId,
        userId,
        action: 'ADJUST_STOCK',
        entity: 'Batch',
        entityId: batch.id,
        afterJson: input,
      });

      return this.getBatchDetailInTx(tx, organizationId, batch.id);
    });
  }

  async listStockMovements(
    organizationId: number,
    query: ListStockMovementsQuery,
  ): Promise<PaginatedResponse<StockMovementDto>> {
    const where: Prisma.StockMovementWhereInput = {
      organizationId,
    };

    if (query.itemId) {
      where.itemId = query.itemId;
    }
    if (query.batchId) {
      where.batchId = query.batchId;
    } else if (query.scope === 'RAW') {
      where.batchId = null;
    } else if (query.scope === 'BATCH') {
      where.batchId = { not: null };
    }

    if (query.type) {
      where.type = query.type;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { refNo: { contains: s, mode: 'insensitive' } },
        { note: { contains: s, mode: 'insensitive' } },
        { item: { name: { contains: s, mode: 'insensitive' } } },
        { batch: { batchNo: { contains: s, mode: 'insensitive' } } },
        { batch: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        include: {
          item: true,
          batch: true,
        },
        orderBy: [{ id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const data: StockMovementDto[] = rows.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      itemName: m.item.name,
      itemNameUr: m.item.nameUr,
      batchId: m.batchId,
      batchNo: m.batch?.batchNo ?? null,
      batchName: m.batch?.name ?? null,
      purchaseItemId: m.purchaseItemId,
      type: m.type as StockMovementTypeDto,
      qtyBase: new Decimal(m.qtyBase.toString()).toFixed(3),
      refType: m.refType,
      refId: m.refId,
      refNo: m.refNo,
      note: m.note,
      userId: m.userId,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async lockAndGetOpenBatchInTx(tx: TxClient, organizationId: number, batchId: number) {
    await tx.$queryRaw`
      SELECT "id" FROM "batches"
      WHERE "id" = ${batchId} AND "organization_id" = ${organizationId}
      FOR UPDATE
    `;

    const batch = await tx.batch.findFirst({
      where: { id: batchId, organizationId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }
    if (batch.status === 'CLOSED') {
      throw new BadRequestException(
        `Batch ${batch.batchNo} is CLOSED and locked. Costs and allocations cannot be modified.`,
      );
    }
    return batch;
  }

  private async allocatePurchaseLineInTx(
    tx: TxClient,
    params: {
      readonly organizationId: number;
      readonly userId: number;
      readonly batchId: number;
      readonly batchNo: string;
      readonly purchaseItemId: number;
      readonly kgUsed: string;
      readonly notes: string | null;
    },
  ): Promise<{ kgUsed: string; amount: string; itemId: number }> {
    await tx.$queryRaw`
      SELECT "id" FROM "purchase_items"
      WHERE "id" = ${params.purchaseItemId}
      FOR UPDATE
    `;

    const purchaseItem = await tx.purchaseItem.findUnique({
      where: { id: params.purchaseItemId },
      include: {
        purchase: true,
        item: true,
      },
    });

    if (!purchaseItem || purchaseItem.purchase.organizationId !== params.organizationId) {
      throw new NotFoundException(`Purchase line #${params.purchaseItemId} not found`);
    }
    if (purchaseItem.purchase.status === 'VOIDED') {
      throw new BadRequestException(
        `Cannot allocate from voided purchase invoice ${purchaseItem.purchase.invoiceNo}`,
      );
    }

    const qtyBase = new Decimal(purchaseItem.qtyBase.toString());
    const returned = new Decimal(purchaseItem.returnedQtyBase.toString());
    const allocated = new Decimal(purchaseItem.allocatedQtyBase.toString());
    const available = qtyBase
      .minus(returned)
      .minus(allocated)
      .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

    const kgUsedDec = new Decimal(params.kgUsed).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    if (kgUsedDec.gt(available)) {
      throw new BadRequestException(
        `Cannot allocate ${kgUsedDec.toFixed(3)} kg from ${purchaseItem.purchase.invoiceNo} (${purchaseItem.item.name}): only ${available.toFixed(3)} kg unallocated`,
      );
    }

    const ratePerBaseStr = new Decimal(purchaseItem.ratePerBase.toString()).toFixed(4);
    const amountStr = calculateAllocationAmount(kgUsedDec.toFixed(3), ratePerBaseStr);

    const newAllocated = allocated.plus(kgUsedDec).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    await tx.purchaseItem.update({
      where: { id: purchaseItem.id },
      data: {
        allocatedQtyBase: new Prisma.Decimal(newAllocated.toFixed(3)),
      },
    });

    const sourceId = await nextId(tx, 'batch_sources');
    await tx.batchSource.create({
      data: {
        id: sourceId,
        batchId: params.batchId,
        purchaseItemId: purchaseItem.id,
        itemId: purchaseItem.itemId,
        kgUsed: new Prisma.Decimal(kgUsedDec.toFixed(3)),
        ratePerBase: new Prisma.Decimal(ratePerBaseStr),
        amount: new Prisma.Decimal(amountStr),
        notes: params.notes,
        createdById: params.userId,
      },
    });

    // 1. Deduct from unallocated raw inventory (`batchId: null`)
    await this.stockService.recordMovement(tx, {
      organizationId: params.organizationId,
      itemId: purchaseItem.itemId,
      batchId: null,
      purchaseItemId: purchaseItem.id,
      type: 'BATCH_ALLOCATE_OUT',
      qtyBase: kgUsedDec.negated().toFixed(3),
      refType: 'BATCH',
      refId: params.batchId,
      refNo: params.batchNo,
      note: `Allocated from ${purchaseItem.purchase.invoiceNo} to ${params.batchNo}`,
      userId: params.userId,
    });

    // 2. Add raw quantity into the batch (`batchId: params.batchId`)
    await this.stockService.recordMovement(tx, {
      organizationId: params.organizationId,
      itemId: purchaseItem.itemId,
      batchId: params.batchId,
      purchaseItemId: purchaseItem.id,
      type: 'PRODUCTION_IN',
      qtyBase: kgUsedDec.toFixed(3),
      refType: 'BATCH',
      refId: params.batchId,
      refNo: params.batchNo,
      note: `Allocated from ${purchaseItem.purchase.invoiceNo}`,
      userId: params.userId,
    });

    return {
      kgUsed: kgUsedDec.toFixed(3),
      amount: amountStr,
      itemId: purchaseItem.itemId,
    };
  }

  private async recalculateOpenBatchInTx(
    tx: TxClient,
    params: {
      readonly organizationId: number;
      readonly userId: number;
      readonly batchId: number;
      readonly wastageMode: 'PERCENT' | 'KG';
      readonly wastagePercent?: string;
      readonly wastageKg?: string;
      readonly note: string;
    },
  ): Promise<void> {
    const batch = await tx.batch.findUniqueOrThrow({
      where: { id: params.batchId },
      include: {
        sources: true,
        costs: {
          where: { isVoided: false },
        },
      },
    });

    const allocations = batch.sources.map((s) => ({
      kgUsed: s.kgUsed.toString(),
      amount: s.amount.toString(),
    }));
    const activeCosts = batch.costs.map((c) => ({
      amount: c.amount.toString(),
    }));

    let metrics;
    try {
      metrics = calculateBatchMetrics({
        allocations,
        activeCosts,
        wastageMode: params.wastageMode,
        wastagePercent: params.wastagePercent,
        wastageKg: params.wastageKg,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid batch metrics');
    }

    const oldWastageKg = new Decimal(batch.wastageKg.toString()).toDecimalPlaces(
      3,
      Decimal.ROUND_HALF_UP,
    );
    const newWastageKg = new Decimal(metrics.wastageKg).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    const deltaWastageKg = newWastageKg
      .minus(oldWastageKg)
      .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

    const primaryItemId = batch.itemId ?? batch.sources[0]?.itemId ?? null;
    if (!deltaWastageKg.isZero() && primaryItemId != null) {
      await this.stockService.recordMovement(tx, {
        organizationId: params.organizationId,
        itemId: primaryItemId,
        batchId: batch.id,
        type: 'WASTAGE',
        qtyBase: deltaWastageKg.negated().toFixed(3),
        refType: 'BATCH',
        refId: batch.id,
        refNo: batch.batchNo,
        note: `${params.note} (${metrics.wastagePercent}%)`,
        userId: params.userId,
      });
    }

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        itemId: primaryItemId,
        rawKg: new Prisma.Decimal(metrics.rawKg),
        wastagePercent: new Prisma.Decimal(metrics.wastagePercent),
        wastageKg: new Prisma.Decimal(metrics.wastageKg),
        outputKg: new Prisma.Decimal(metrics.outputKg),
        rawCost: new Prisma.Decimal(metrics.rawCost),
        extraCost: new Prisma.Decimal(metrics.extraCost),
        totalCost: new Prisma.Decimal(metrics.totalCost),
        costPerKg: new Prisma.Decimal(metrics.costPerKg),
      },
    });
  }

  private async getBatchDetailInTx(
    tx: TxClient,
    organizationId: number,
    batchId: number,
  ): Promise<BatchDetailDto> {
    const batch = await tx.batch.findFirst({
      where: { id: batchId, organizationId },
      include: {
        item: true,
        sources: {
          include: {
            purchaseItem: {
              include: {
                purchase: {
                  include: { supplier: true },
                },
              },
            },
            item: true,
          },
          orderBy: { id: 'asc' },
        },
        costs: {
          orderBy: { id: 'asc' },
        },
        movements: {
          include: {
            item: true,
          },
          orderBy: { id: 'desc' },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    let availableDec = new Decimal(0);
    let soldDec = new Decimal(0);
    for (const m of batch.movements) {
      const qty = new Decimal(m.qtyBase.toString());
      availableDec = availableDec.plus(qty);
      if (m.type === 'SALE_OUT') {
        soldDec = soldDec.plus(qty.abs());
      } else if (m.type === 'RETURN_IN') {
        soldDec = soldDec.minus(qty.abs());
      }
    }

    const summary = this.mapBatchSummary(
      batch,
      availableDec.toFixed(3),
      Decimal.max(0, soldDec).toFixed(3),
    );

    const sources: BatchSourceDto[] = batch.sources.map((s) => ({
      id: s.id,
      batchId: s.batchId,
      purchaseItemId: s.purchaseItemId,
      purchaseId: s.purchaseItem.purchaseId,
      invoiceNo: s.purchaseItem.purchase.invoiceNo,
      supplierId: s.purchaseItem.purchase.supplierId,
      supplierName: s.purchaseItem.purchase.supplier.name,
      itemId: s.itemId,
      itemName: s.item.name,
      itemNameUr: s.item.nameUr,
      kgUsed: new Decimal(s.kgUsed.toString()).toFixed(3),
      ratePerBase: new Decimal(s.ratePerBase.toString()).toFixed(4),
      amount: new Decimal(s.amount.toString()).toFixed(2),
      notes: s.notes,
      createdAt: s.createdAt.toISOString(),
    }));

    const costs: BatchCostDto[] = batch.costs.map((c) => ({
      id: c.id,
      batchId: c.batchId,
      costType: c.costType as BatchCostType,
      costDate: c.costDate.toISOString().slice(0, 10),
      description: c.description,
      amount: new Decimal(c.amount.toString()).toFixed(2),
      isVoided: c.isVoided,
      voidReason: c.voidReason,
      createdAt: c.createdAt.toISOString(),
    }));

    const movements: StockMovementDto[] = batch.movements.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      itemName: m.item.name,
      itemNameUr: m.item.nameUr,
      batchId: m.batchId,
      batchNo: batch.batchNo,
      batchName: batch.name,
      purchaseItemId: m.purchaseItemId,
      type: m.type as StockMovementTypeDto,
      qtyBase: new Decimal(m.qtyBase.toString()).toFixed(3),
      refType: m.refType,
      refId: m.refId,
      refNo: m.refNo,
      note: m.note,
      userId: m.userId,
      createdAt: m.createdAt.toISOString(),
    }));

    const variance = calculateBatchVariance({
      rawKg: summary.rawKg,
      plannedWastagePercent: summary.plannedWastagePercent,
      plannedWastageKg: summary.plannedWastageKg,
      actualWastagePercent: summary.wastagePercent,
      actualWastageKg: summary.wastageKg,
      actualOutputKg: summary.outputKg,
    });

    return {
      ...summary,
      sources,
      costs,
      movements,
      variance,
    };
  }

  private mapBatchSummary(
    row: {
      id: number;
      batchNo: string;
      name: string;
      nameUr: string | null;
      itemId: number | null;
      item?: { name: string; nameUr: string | null } | null;
      batchDate: Date;
      status: string;
      rawKg: Prisma.Decimal;
      plannedWastagePercent: Prisma.Decimal;
      plannedWastageKg: Prisma.Decimal;
      wastagePercent: Prisma.Decimal;
      wastageKg: Prisma.Decimal;
      outputKg: Prisma.Decimal;
      rawCost: Prisma.Decimal;
      extraCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
      costPerKg: Prisma.Decimal;
      notes: string | null;
      closedAt: Date | null;
      createdAt: Date;
    },
    availableKg: string,
    soldKg: string,
  ): BatchSummaryDto {
    return {
      id: row.id,
      batchNo: row.batchNo,
      name: row.name,
      nameUr: row.nameUr,
      itemId: row.itemId,
      itemName: row.item?.name ?? null,
      itemNameUr: row.item?.nameUr ?? null,
      batchDate: row.batchDate.toISOString().slice(0, 10),
      status: row.status as BatchStatus,
      rawKg: new Decimal(row.rawKg.toString()).toFixed(3),
      plannedWastagePercent: new Decimal(row.plannedWastagePercent.toString()).toFixed(3),
      plannedWastageKg: new Decimal(row.plannedWastageKg.toString()).toFixed(3),
      wastagePercent: new Decimal(row.wastagePercent.toString()).toFixed(3),
      wastageKg: new Decimal(row.wastageKg.toString()).toFixed(3),
      outputKg: new Decimal(row.outputKg.toString()).toFixed(3),
      availableKg,
      soldKg,
      rawCost: new Decimal(row.rawCost.toString()).toFixed(2),
      extraCost: new Decimal(row.extraCost.toString()).toFixed(2),
      totalCost: new Decimal(row.totalCost.toString()).toFixed(2),
      costPerKg: new Decimal(row.costPerKg.toString()).toFixed(2),
      notes: row.notes,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
