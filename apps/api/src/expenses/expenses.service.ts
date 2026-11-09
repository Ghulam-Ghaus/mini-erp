import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateBatchMetrics,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpensesSummaryDto,
  type ExpenseStatus,
  type ListExpensesQuery,
  type PaginatedResponse,
  type PaymentMethod,
  type VoidDocumentInput,
} from '@mini-erp/shared';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.module.js';

type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: {
    category: true;
    batch: true;
  };
}>;

const DEFAULT_CATEGORIES: { name: string; nameUr: string }[] = [
  { name: 'Shop / Warehouse Rent', nameUr: 'کرایہ دوکان / گودام' },
  { name: 'Electricity & Utility Bills', nameUr: 'بجلی اور بل' },
  { name: 'Fuel & Transport', nameUr: 'پٹرول اور کرایہ باربرداری' },
  { name: 'Loading & Unloading (Mazdoori)', nameUr: 'لوڈنگ ان لوڈنگ / مزدوری' },
  { name: 'Packing & Bags', nameUr: 'پیکنگ اور باردانہ' },
  { name: 'Maintenance & Repair', nameUr: 'مرمت اور دیکھ بھال' },
  { name: 'Tea, Refreshment & Office', nameUr: 'چائے پانی اور دفتری اخراجات' },
];

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  private toDto(row: ExpenseWithRelations): ExpenseDto {
    return {
      id: row.id,
      expenseNo: row.expenseNo,
      expenseDate: row.expenseDate.toISOString().slice(0, 10),
      categoryId: row.categoryId,
      categoryName: row.category.name,
      categoryNameUr: row.category.nameUr,
      amount: new Decimal(row.amount.toString()).toFixed(2),
      method: row.method as PaymentMethod,
      referenceNo: row.referenceNo,
      paidTo: row.paidTo,
      batchId: row.batchId,
      batchNo: row.batch?.batchNo ?? null,
      batchCostId: row.batchCostId,
      description: row.description,
      status: row.status as ExpenseStatus,
      voidReason: row.voidReason,
      voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async ensureDefaultCategories(organizationId: number): Promise<void> {
    const count = await this.prisma.expenseCategory.count({ where: { organizationId } });
    if (count > 0) return;

    await inTransaction(this.prisma, async (tx) => {
      const existing = await tx.expenseCategory.count({ where: { organizationId } });
      if (existing > 0) return;
      for (const cat of DEFAULT_CATEGORIES) {
        const id = await nextId(tx, 'expense_categories');
        await tx.expenseCategory.create({
          data: {
            id,
            organizationId,
            name: cat.name,
            nameUr: cat.nameUr,
            isActive: true,
          },
        });
      }
    });
  }

  async listCategories(organizationId: number): Promise<ExpenseCategoryDto[]> {
    await this.ensureDefaultCategories(organizationId);
    const rows = await this.prisma.expenseCategory.findMany({
      where: { organizationId },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameUr: r.nameUr,
      isActive: r.isActive,
    }));
  }

  async createCategory(
    organizationId: number,
    userId: number,
    input: CreateExpenseCategoryInput,
  ): Promise<ExpenseCategoryDto> {
    return inTransaction(this.prisma, async (tx) => {
      const dup = await tx.expenseCategory.findFirst({
        where: {
          organizationId,
          name: { equals: input.name.trim(), mode: 'insensitive' },
        },
      });
      if (dup) {
        throw new BadRequestException(`Expense category "${input.name}" already exists`);
      }

      const id = await nextId(tx, 'expense_categories');
      const created = await tx.expenseCategory.create({
        data: {
          id,
          organizationId,
          name: input.name.trim(),
          nameUr: input.nameUr?.trim() || null,
          isActive: input.isActive,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'ExpenseCategory',
        entityId: created.id,
        afterJson: { name: created.name, nameUr: created.nameUr },
      });

      return {
        id: created.id,
        name: created.name,
        nameUr: created.nameUr,
        isActive: created.isActive,
      };
    });
  }

  async listExpenses(
    organizationId: number,
    query: ListExpensesQuery,
  ): Promise<PaginatedResponse<ExpenseDto> & { summary: ExpensesSummaryDto }> {
    const where: Prisma.ExpenseWhereInput = { organizationId };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.batchId) where.batchId = query.batchId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.expenseDate = {
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { expenseNo: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { paidTo: { contains: q, mode: 'insensitive' } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total, postedRows] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: true, batch: true },
        orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where: { ...where, status: 'POSTED' },
        select: { amount: true, batchId: true },
      }),
    ]);

    let operatingDec = new Decimal(0);
    let batchLinkedDec = new Decimal(0);
    for (const r of postedRows) {
      const amt = new Decimal(r.amount.toString());
      if (r.batchId !== null) {
        batchLinkedDec = batchLinkedDec.plus(amt);
      } else {
        operatingDec = operatingDec.plus(amt);
      }
    }

    return {
      data: rows.map((r) => this.toDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summary: {
        operatingTotal: operatingDec.toFixed(2),
        batchLinkedTotal: batchLinkedDec.toFixed(2),
        combinedTotal: operatingDec.plus(batchLinkedDec).toFixed(2),
        count: postedRows.length,
      },
    };
  }

  private async syncOpenBatchCostInTx(tx: TxClient, batchId: number): Promise<void> {
    const batch = await tx.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: {
        sources: true,
        costs: { where: { isVoided: false } },
      },
    });

    const metrics = calculateBatchMetrics({
      allocations: batch.sources.map((s) => ({
        kgUsed: s.kgUsed.toString(),
        amount: s.amount.toString(),
      })),
      activeCosts: batch.costs.map((c) => ({
        amount: c.amount.toString(),
      })),
      wastageMode: 'KG',
      wastageKg: batch.wastageKg.toString(),
    });

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        rawCost: new Prisma.Decimal(metrics.rawCost),
        extraCost: new Prisma.Decimal(metrics.extraCost),
        totalCost: new Prisma.Decimal(metrics.totalCost),
        costPerKg: new Prisma.Decimal(metrics.costPerKg),
      },
    });
  }

  async createExpense(
    organizationId: number,
    userId: number,
    input: CreateExpenseInput,
  ): Promise<ExpenseDto> {
    const amountDec = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amountDec.lte(0)) {
      throw new BadRequestException('Expense amount must be greater than zero');
    }

    const expenseId = await inTransaction(this.prisma, async (tx) => {
      const category = await tx.expenseCategory.findFirst({
        where: { id: input.categoryId, organizationId },
      });
      if (!category) {
        throw new NotFoundException(`Expense category #${input.categoryId} not found`);
      }

      const expenseDate = new Date(`${input.expenseDate}T00:00:00.000Z`);
      const expenseNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'EXPENSE',
        expenseDate,
      );

      let batchCostId: number | null = null;
      if (input.batchId) {
        await tx.$queryRaw`
          SELECT "id" FROM "batches"
          WHERE "id" = ${input.batchId} AND "organization_id" = ${organizationId}
          FOR UPDATE
        `;
        const batch = await tx.batch.findFirst({
          where: { id: input.batchId, organizationId },
        });
        if (!batch) {
          throw new NotFoundException(`Batch #${input.batchId} not found`);
        }
        if (batch.status === 'CLOSED') {
          throw new BadRequestException(
            `Batch ${batch.batchNo} is CLOSED and locked. Cannot link new expenses to a closed batch.`,
          );
        }

        batchCostId = await nextId(tx, 'batch_costs');
        await tx.batchCost.create({
          data: {
            id: batchCostId,
            batchId: batch.id,
            costType: 'OTHER',
            costDate: expenseDate,
            description: `${expenseNo} (${category.name}): ${input.description}`,
            amount: new Prisma.Decimal(amountDec.toFixed(2)),
            createdById: userId,
          },
        });

        await this.syncOpenBatchCostInTx(tx, batch.id);
      }

      const id = await nextId(tx, 'expenses');
      const created = await tx.expense.create({
        data: {
          id,
          organizationId,
          expenseNo,
          expenseDate,
          categoryId: category.id,
          amount: new Prisma.Decimal(amountDec.toFixed(2)),
          method: input.method,
          referenceNo: input.referenceNo?.trim() || null,
          paidTo: input.paidTo?.trim() || null,
          batchId: input.batchId ?? null,
          batchCostId,
          description: input.description.trim(),
          status: 'POSTED',
          createdById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'Expense',
        entityId: created.id,
        afterJson: {
          expenseNo,
          categoryId: category.id,
          amount: amountDec.toFixed(2),
          batchId: created.batchId,
          batchCostId,
        },
      });

      return created.id;
    });

    const row = await this.prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: { category: true, batch: true },
    });
    return this.toDto(row);
  }

  async voidExpense(
    organizationId: number,
    userId: number,
    id: number,
    input: VoidDocumentInput,
  ): Promise<ExpenseDto> {
    await inTransaction(this.prisma, async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id, organizationId },
        include: { batch: true },
      });
      if (!existing) {
        throw new NotFoundException(`Expense #${id} not found`);
      }
      if (existing.status === 'VOIDED') {
        throw new BadRequestException('Expense is already voided');
      }

      if (existing.batchId && existing.batchCostId) {
        if (existing.batch?.status === 'CLOSED') {
          throw new BadRequestException(
            `Cannot void expense linked to closed batch ${existing.batch.batchNo}`,
          );
        }
        await tx.batchCost.update({
          where: { id: existing.batchCostId },
          data: {
            isVoided: true,
            voidReason: input.reason,
            voidedAt: new Date(),
            voidedById: userId,
          },
        });
        await this.syncOpenBatchCostInTx(tx, existing.batchId);
      }

      await tx.expense.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'VOID',
        entity: 'Expense',
        entityId: id,
        beforeJson: { status: 'POSTED' },
        afterJson: { status: 'VOIDED', voidReason: input.reason },
      });
    });

    const row = await this.prisma.expense.findUniqueOrThrow({
      where: { id },
      include: { category: true, batch: true },
    });
    return this.toDto(row);
  }
}
