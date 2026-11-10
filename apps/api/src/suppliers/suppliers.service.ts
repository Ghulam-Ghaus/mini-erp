import {
  type CreateSupplierInput,
  type LedgerEntryDto,
  type ListSuppliersQuery,
  type PaginatedResponse,
  type SupplierDto,
  type SupplierLedgerQuery,
  type SupplierLedgerResponse,
  type UpdateSupplierInput,
} from '@mini-erp/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  async toSupplierDto(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    supplier: {
      id: number;
      code: string | null;
      name: string;
      nameUr: string | null;
      contactPerson: string | null;
      phone: string | null;
      address: string | null;
      taxNo: string | null;
      openingBalance: Prisma.Decimal;
      notes: string | null;
      isActive: boolean;
      createdAt: Date;
    },
  ): Promise<SupplierDto> {
    const [currentBalance, purchasesAgg, paymentsAgg] = await Promise.all([
      this.ledger.getPartyBalance(tx, organizationId, 'SUPPLIER', supplier.id),
      tx.purchaseInvoice.aggregate({
        where: {
          organizationId,
          supplierId: supplier.id,
          status: { not: 'VOIDED' },
        },
        _sum: { total: true, returnedAmount: true },
      }),
      tx.payment.aggregate({
        where: {
          organizationId,
          partyType: 'SUPPLIER',
          partyId: supplier.id,
          direction: 'OUT',
          status: 'POSTED',
        },
        _sum: { amount: true },
      }),
    ]);

    const grossPurchased = purchasesAgg._sum.total
      ? new Decimal(purchasesAgg._sum.total.toString())
      : new Decimal(0);
    const returned = purchasesAgg._sum.returnedAmount
      ? new Decimal(purchasesAgg._sum.returnedAmount.toString())
      : new Decimal(0);
    const totalPurchased = grossPurchased.minus(returned).toFixed(2);
    const totalPaid = paymentsAgg._sum.amount
      ? new Decimal(paymentsAgg._sum.amount.toString()).toFixed(2)
      : '0.00';

    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      nameUr: supplier.nameUr,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      address: supplier.address,
      taxNo: supplier.taxNo,
      openingBalance: new Decimal(supplier.openingBalance.toString()).toFixed(2),
      currentBalance,
      totalPurchased,
      totalPaid,
      notes: supplier.notes,
      isActive: supplier.isActive,
      createdAt: supplier.createdAt.toISOString(),
    };
  }

  async listSuppliers(
    organizationId: number,
    query: ListSuppliersQuery,
  ): Promise<PaginatedResponse<SupplierDto>> {
    const where: Prisma.SupplierWhereInput = { organizationId };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameUr: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { contactPerson: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set(['id', 'name', 'code', 'phone', 'createdAt']);
    const sortField = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'id';
    const orderBy: Prisma.SupplierOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    const data = await Promise.all(
      rows.map((r) => this.toSupplierDto(this.prisma, organizationId, r)),
    );

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getSupplierById(organizationId: number, supplierId: number): Promise<SupplierDto> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return this.toSupplierDto(this.prisma, organizationId, supplier);
  }

  async createSupplier(
    organizationId: number,
    actorUserId: number,
    input: CreateSupplierInput,
  ): Promise<SupplierDto> {
    return inTransaction(this.prisma, async (tx) => {
      const id = await nextId(tx, 'suppliers');
      const openingDec = new Decimal(input.openingBalance).toDecimalPlaces(2);

      const created = await tx.supplier.create({
        data: {
          id,
          organizationId,
          code: input.code || null,
          name: input.name,
          nameUr: input.nameUr || null,
          contactPerson: input.contactPerson || null,
          phone: input.phone || null,
          address: input.address || null,
          taxNo: input.taxNo || null,
          openingBalance: new Prisma.Decimal(openingDec.toFixed(2)),
          notes: input.notes || null,
          isActive: input.isActive,
        },
      });

      if (openingDec.gt(0)) {
        await this.ledger.postEntry(tx, {
          organizationId,
          partyType: 'SUPPLIER',
          partyId: created.id,
          entryDate: new Date(),
          refType: 'OPENING_BALANCE',
          refId: created.id,
          refNo: `OB-SUP-${created.id}`,
          debit: '0.00',
          credit: openingDec.toFixed(2),
          narration: `Opening payable balance for ${created.name}`,
          createdById: actorUserId,
        });
      }

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'supplier',
        entityId: created.id,
        afterJson: {
          id: created.id,
          name: created.name,
          openingBalance: openingDec.toFixed(2),
        },
      });

      return this.toSupplierDto(tx, organizationId, created);
    });
  }

  async updateSupplier(
    organizationId: number,
    actorUserId: number,
    supplierId: number,
    input: UpdateSupplierInput,
  ): Promise<SupplierDto> {
    return inTransaction(this.prisma, async (tx) => {
      const existing = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId },
      });
      if (!existing) {
        throw new NotFoundException('Supplier not found');
      }

      const updated = await tx.supplier.update({
        where: { id: existing.id },
        data: {
          ...(input.code !== undefined ? { code: input.code || null } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameUr !== undefined ? { nameUr: input.nameUr || null } : {}),
          ...(input.contactPerson !== undefined
            ? { contactPerson: input.contactPerson || null }
            : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.address !== undefined ? { address: input.address || null } : {}),
          ...(input.taxNo !== undefined ? { taxNo: input.taxNo || null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'UPDATE',
        entity: 'supplier',
        entityId: updated.id,
        beforeJson: { name: existing.name, phone: existing.phone, isActive: existing.isActive },
        afterJson: { name: updated.name, phone: updated.phone, isActive: updated.isActive },
      });

      return this.toSupplierDto(tx, organizationId, updated);
    });
  }

  async getSupplierLedger(
    organizationId: number,
    supplierId: number,
    query: SupplierLedgerQuery,
  ): Promise<SupplierLedgerResponse> {
    const supplier = await this.getSupplierById(organizationId, supplierId);

    const where: Prisma.LedgerEntryWhereInput = {
      organizationId,
      partyType: 'SUPPLIER',
      partyId: supplierId,
    };

    if (query.refType) {
      where.refType = query.refType;
    }

    const dateFilter: Prisma.DateTimeFilter = {};
    let fromDate: Date | undefined;
    if (query.dateFrom) {
      fromDate = new Date(query.dateFrom);
      dateFilter.gte = fromDate;
    }
    if (query.dateTo) {
      const toDate = new Date(query.dateTo);
      toDate.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }
    if (query.dateFrom || query.dateTo) {
      where.entryDate = dateFilter;
    }
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { narration: { contains: q, mode: 'insensitive' } },
        { refNo: { contains: q, mode: 'insensitive' } },
      ];
    }

    let openingBalanceBeforeRange = '0.00';
    if (fromDate) {
      const lastBefore = await this.prisma.ledgerEntry.findFirst({
        where: {
          organizationId,
          partyType: 'SUPPLIER',
          partyId: supplierId,
          entryDate: { lt: fromDate },
        },
        orderBy: { id: 'desc' },
      });
      if (lastBefore) {
        openingBalanceBeforeRange = new Decimal(lastBefore.balance.toString()).toFixed(2);
      }
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows, rangeAgg] = await Promise.all([
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { id: query.sortOrder },
        skip,
        take: query.pageSize,
      }),
      this.prisma.ledgerEntry.aggregate({
        where,
        _sum: { debit: true, credit: true },
      }),
    ]);

    const paymentRefIds = rows.filter((r) => r.refType === 'PAYMENT_OUT').map((r) => r.refId);
    const payments =
      paymentRefIds.length > 0
        ? await this.prisma.payment.findMany({
            where: { id: { in: paymentRefIds }, organizationId },
            select: { id: true, method: true },
          })
        : [];
    const paymentMethodMap = new Map<number, string>();
    for (const p of payments) {
      paymentMethodMap.set(p.id, p.method);
    }

    const totalDebitInRange = rangeAgg._sum.debit
      ? new Decimal(rangeAgg._sum.debit.toString()).toFixed(2)
      : '0.00';
    const totalCreditInRange = rangeAgg._sum.credit
      ? new Decimal(rangeAgg._sum.credit.toString()).toFixed(2)
      : '0.00';

    const data: LedgerEntryDto[] = rows.map((e) => ({
      id: e.id,
      partyType: 'SUPPLIER',
      partyId: e.partyId,
      entryDate: e.entryDate.toISOString(),
      refType: e.refType,
      paymentMethod: e.refType === 'PAYMENT_OUT' ? (paymentMethodMap.get(e.refId) ?? null) : null,
      refId: e.refId,
      refNo: e.refNo,
      debit: new Decimal(e.debit.toString()).toFixed(2),
      credit: new Decimal(e.credit.toString()).toFixed(2),
      balance: new Decimal(e.balance.toString()).toFixed(2),
      narration: e.narration,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      supplier,
      openingBalanceBeforeRange,
      totalDebitInRange,
      totalCreditInRange,
      closingBalance: supplier.currentBalance,
      entries: {
        data,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }
}
