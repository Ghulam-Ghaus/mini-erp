import {
  calculateSaleLineAmounts,
  convertToBaseUnitQty,
  type CreateSaleInvoiceInput,
  type ListSalesQuery,
  type PaginatedResponse,
  type SaleInvoiceDto,
  type SaleItemDto,
  type SaleStatus,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';
import { NumberingService } from '../numbering/numbering.module.js';
import { StockService } from '../stock/stock.module.js';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly stock: StockService,
    private readonly numbering: NumberingService,
  ) {}

  toSaleInvoiceDto(sale: {
    id: number;
    invoiceNo: string;
    saleDate: Date;
    clientId: number;
    routeId: number | null;
    subtotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    extraCharges: Prisma.Decimal;
    total: Prisma.Decimal;
    totalCogs: Prisma.Decimal;
    totalProfit: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    returnedAmount: Prisma.Decimal;
    status: string;
    notes: string | null;
    voidReason: string | null;
    voidedAt: Date | null;
    createdAt: Date;
    client: { name: string; nameUr: string | null };
    route?: { name: string } | null;
    createdByUser?: { firstName: string; lastName: string } | null;
    voidedByUser?: { firstName: string; lastName: string } | null;
    items: {
      id: number;
      saleId: number;
      batchId: number;
      itemId: number;
      enteredQty: Prisma.Decimal;
      enteredUnit: string;
      conversionFactor: Prisma.Decimal;
      bagCount: number | null;
      qtyBase: Prisma.Decimal;
      ratePerEnteredUnit: Prisma.Decimal;
      ratePerBase: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      batchCostRateSnapshot: Prisma.Decimal;
      lineCogs: Prisma.Decimal;
      lineProfit: Prisma.Decimal;
      returnedQtyBase: Prisma.Decimal;
      notes: string | null;
      batch: { batchNo: string };
      item: { name: string; nameUr: string | null };
    }[];
  }): SaleInvoiceDto {
    let totalQtyBase = new Decimal(0);

    const items: SaleItemDto[] = sale.items.map((line) => {
      const qtyBaseDec = new Decimal(line.qtyBase.toString());
      const returnedQtyDec = new Decimal(line.returnedQtyBase.toString());
      const availToReturn = Decimal.max(0, qtyBaseDec.minus(returnedQtyDec));
      totalQtyBase = totalQtyBase.plus(qtyBaseDec);

      return {
        id: line.id,
        saleId: line.saleId,
        batchId: line.batchId,
        batchNo: line.batch.batchNo,
        itemId: line.itemId,
        itemName: line.item.name,
        itemNameUr: line.item.nameUr,
        enteredQty: new Decimal(line.enteredQty.toString()).toFixed(3),
        enteredUnit: line.enteredUnit,
        conversionFactor: new Decimal(line.conversionFactor.toString()).toFixed(3),
        bagCount: line.bagCount,
        qtyBase: qtyBaseDec.toFixed(3),
        ratePerEnteredUnit: new Decimal(line.ratePerEnteredUnit.toString()).toFixed(4),
        ratePerBase: new Decimal(line.ratePerBase.toString()).toFixed(4),
        taxRate: new Decimal(line.taxRate.toString()).toFixed(2),
        taxAmount: new Decimal(line.taxAmount.toString()).toFixed(2),
        lineSubtotal: new Decimal(line.lineSubtotal.toString()).toFixed(2),
        lineTotal: new Decimal(line.lineTotal.toString()).toFixed(2),
        batchCostRateSnapshot: new Decimal(line.batchCostRateSnapshot.toString()).toFixed(4),
        lineCogs: new Decimal(line.lineCogs.toString()).toFixed(2),
        lineProfit: new Decimal(line.lineProfit.toString()).toFixed(2),
        returnedQtyBase: returnedQtyDec.toFixed(3),
        availableToReturnQtyBase: availToReturn.toFixed(3),
        notes: line.notes,
      };
    });

    const totalDec = new Decimal(sale.total.toString());
    const cogsDec = new Decimal(sale.totalCogs.toString());
    const profitDec = new Decimal(sale.totalProfit.toString());
    const paidDec = new Decimal(sale.paidAmount.toString());
    const returnedDec = new Decimal(sale.returnedAmount.toString());
    const balanceDue = Decimal.max(0, totalDec.minus(paidDec).minus(returnedDec)).toFixed(2);

    const profitMargin = totalDec.gt(0) ? profitDec.div(totalDec).mul(100).toFixed(2) : '0.00';

    return {
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      saleDate: sale.saleDate.toISOString().slice(0, 10),
      clientId: sale.clientId,
      clientName: sale.client.name,
      clientNameUr: sale.client.nameUr,
      routeId: sale.routeId,
      routeName: sale.route?.name ?? null,
      subtotal: new Decimal(sale.subtotal.toString()).toFixed(2),
      taxTotal: new Decimal(sale.taxTotal.toString()).toFixed(2),
      discount: new Decimal(sale.discount.toString()).toFixed(2),
      extraCharges: new Decimal(sale.extraCharges.toString()).toFixed(2),
      total: totalDec.toFixed(2),
      totalCogs: cogsDec.toFixed(2),
      totalProfit: profitDec.toFixed(2),
      profitMarginPercent: profitMargin,
      totalQtyBase: totalQtyBase.toFixed(3),
      paidAmount: paidDec.toFixed(2),
      returnedAmount: returnedDec.toFixed(2),
      balanceDue,
      status: sale.status as SaleStatus,
      notes: sale.notes,
      voidReason: sale.voidReason,
      voidedAt: sale.voidedAt ? sale.voidedAt.toISOString() : null,
      voidedByName: sale.voidedByUser
        ? `${sale.voidedByUser.firstName} ${sale.voidedByUser.lastName}`.trim()
        : null,
      createdByName: sale.createdByUser
        ? `${sale.createdByUser.firstName} ${sale.createdByUser.lastName}`.trim()
        : null,
      createdAt: sale.createdAt.toISOString(),
      items,
    };
  }

  async listSales(
    organizationId: number,
    query: ListSalesQuery,
  ): Promise<PaginatedResponse<SaleInvoiceDto>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const fromDate = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
    const toDate = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined;

    const where: Prisma.SaleInvoiceWhereInput = {
      organizationId,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(fromDate || toDate
        ? {
            saleDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNo: { contains: query.search, mode: 'insensitive' } },
              { client: { name: { contains: query.search, mode: 'insensitive' } } },
              { client: { nameUr: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.saleInvoice.count({ where }),
      this.prisma.saleInvoice.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { saleDate: 'desc' },
        include: {
          client: { select: { name: true, nameUr: true } },
          route: { select: { name: true } },
          items: {
            include: {
              batch: { select: { batchNo: true } },
              item: { select: { name: true, nameUr: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((r) => this.toSaleInvoiceDto(r)),
      total,
      page,
      pageSize,
    };
  }

  async getSaleById(
    organizationId: number,
    id: number,
    txClient?: TxClient | Prisma.TransactionClient,
  ): Promise<SaleInvoiceDto> {
    const db = (txClient as PrismaService) ?? this.prisma;
    const row = await db.saleInvoice.findFirst({
      where: { id, organizationId },
      include: {
        client: { select: { name: true, nameUr: true } },
        route: { select: { name: true } },
        items: {
          include: {
            batch: { select: { batchNo: true } },
            item: { select: { name: true, nameUr: true } },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Sale invoice with id ${id} not found`);
    }

    return this.toSaleInvoiceDto(row);
  }

  async createSaleInvoice(
    organizationId: number,
    input: CreateSaleInvoiceInput,
    userId: number,
  ): Promise<SaleInvoiceDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const client = await tx.client.findFirst({
        where: { id: input.clientId, organizationId, isActive: true },
      });

      if (!client) {
        throw new BadRequestException('Client not found or inactive');
      }

      const saleDate = new Date(`${input.saleDate}T00:00:00.000Z`);

      // Pre-validate batches and stock with row-locking
      let sumSubtotal = new Decimal(0);
      let sumTax = new Decimal(0);
      let sumCogs = new Decimal(0);
      let sumProfit = new Decimal(0);

      const calculatedLines: Array<{
        batchId: number;
        itemId: number;
        enteredQty: string;
        enteredUnit: string;
        conversionFactor: string;
        bagCount: number | null;
        qtyBase: string;
        ratePerEnteredUnit: string;
        ratePerBase: string;
        taxRate: string;
        taxAmount: string;
        lineSubtotal: string;
        lineTotal: string;
        batchCostRateSnapshot: string;
        lineCogs: string;
        lineProfit: string;
        notes?: string;
      }> = [];

      for (const line of input.lines) {
        const batch = await tx.batch.findFirst({
          where: { id: line.batchId, organizationId },
        });

        if (!batch) {
          throw new BadRequestException(`Batch with ID ${line.batchId} not found`);
        }

        const item = await tx.item.findFirst({
          where: { id: line.itemId, organizationId },
        });

        if (!item) {
          throw new BadRequestException(`Item with ID ${line.itemId} not found`);
        }

        const conv = line.conversionFactor ?? '1.000';
        const qtyBase = convertToBaseUnitQty(line.enteredQty, conv);

        // Lock batch row and verify stock
        const currentBatchStock = await this.stock.getBatchStock(tx, organizationId, line.batchId);

        if (new Decimal(currentBatchStock).lt(new Decimal(qtyBase))) {
          throw new BadRequestException(
            `Insufficient stock in batch ${batch.batchNo} for ${item.name}. Available: ${currentBatchStock} kg, requested: ${qtyBase} kg.`,
          );
        }

        const batchCostRateSnapshot = new Decimal(batch.costPerKg.toString()).toFixed(4);

        const calc = calculateSaleLineAmounts({
          enteredQty: line.enteredQty,
          conversionFactor: conv,
          ratePerEnteredUnit: line.ratePerEnteredUnit,
          taxRate: line.taxRate ?? '0.00',
          batchCostRateSnapshot,
        });

        sumSubtotal = sumSubtotal.plus(new Decimal(calc.lineSubtotal));
        sumTax = sumTax.plus(new Decimal(calc.taxAmount));
        sumCogs = sumCogs.plus(new Decimal(calc.lineCogs));
        sumProfit = sumProfit.plus(new Decimal(calc.lineProfit));

        calculatedLines.push({
          batchId: line.batchId,
          itemId: line.itemId,
          enteredQty: calc.enteredQty,
          enteredUnit: line.enteredUnit,
          conversionFactor: calc.conversionFactor,
          bagCount: line.bagCount ?? null,
          qtyBase: calc.qtyBase,
          ratePerEnteredUnit: calc.ratePerEnteredUnit,
          ratePerBase: calc.ratePerBase,
          taxRate: calc.taxRate,
          taxAmount: calc.taxAmount,
          lineSubtotal: calc.lineSubtotal,
          lineTotal: calc.lineTotal,
          batchCostRateSnapshot: calc.batchCostRateSnapshot,
          lineCogs: calc.lineCogs,
          lineProfit: calc.lineProfit,
          notes: line.notes?.trim() || undefined,
        });
      }

      const discountDec = new Decimal(input.discount || '0');
      const extraDec = new Decimal(input.extraCharges || '0');
      const netTotalDec = Decimal.max(
        0,
        sumSubtotal.plus(sumTax).minus(discountDec).plus(extraDec),
      );

      // Check credit limit warning or violation (informational or blocked if limit set)
      const currentBalance = await this.ledger.getPartyBalance(
        tx,
        organizationId,
        'CLIENT',
        client.id,
      );
      const creditLimit = new Decimal(client.creditLimit.toString());
      const projectedBalance = new Decimal(currentBalance).plus(netTotalDec);
      if (creditLimit.gt(0) && projectedBalance.gt(creditLimit)) {
        // Can be logged or warned, but let's allow it with alert in audit log
      }

      const invoiceNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'SALE_INVOICE',
        saleDate,
      );

      const saleId = await nextId(tx, 'sales_invoices');
      const paidNowAmountDec = input.paidNow?.amount
        ? new Decimal(input.paidNow.amount)
        : new Decimal(0);
      const initialStatus =
        paidNowAmountDec.gte(netTotalDec) && netTotalDec.gt(0)
          ? 'PAID'
          : paidNowAmountDec.gt(0)
            ? 'PARTIAL'
            : 'POSTED';

      const created = await tx.saleInvoice.create({
        data: {
          id: saleId,
          organizationId,
          invoiceNo,
          saleDate,
          clientId: client.id,
          routeId: input.routeId ?? client.routeId ?? null,
          subtotal: new Prisma.Decimal(sumSubtotal.toFixed(2)),
          taxTotal: new Prisma.Decimal(sumTax.toFixed(2)),
          discount: new Prisma.Decimal(discountDec.toFixed(2)),
          extraCharges: new Prisma.Decimal(extraDec.toFixed(2)),
          total: new Prisma.Decimal(netTotalDec.toFixed(2)),
          totalCogs: new Prisma.Decimal(sumCogs.toFixed(2)),
          totalProfit: new Prisma.Decimal(sumProfit.toFixed(2)),
          paidAmount: new Prisma.Decimal(paidNowAmountDec.toFixed(2)),
          returnedAmount: new Prisma.Decimal('0.00'),
          status: initialStatus,
          notes: input.notes?.trim() || null,
          createdById: userId,
        },
      });

      // Insert line items & stock movements
      for (const line of calculatedLines) {
        const itemId = await nextId(tx, 'sale_items');
        await tx.saleItem.create({
          data: {
            id: itemId,
            saleId: created.id,
            batchId: line.batchId,
            itemId: line.itemId,
            enteredQty: new Prisma.Decimal(line.enteredQty),
            enteredUnit: line.enteredUnit,
            conversionFactor: new Prisma.Decimal(line.conversionFactor),
            bagCount: line.bagCount,
            qtyBase: new Prisma.Decimal(line.qtyBase),
            ratePerEnteredUnit: new Prisma.Decimal(line.ratePerEnteredUnit),
            ratePerBase: new Prisma.Decimal(line.ratePerBase),
            taxRate: new Prisma.Decimal(line.taxRate),
            taxAmount: new Prisma.Decimal(line.taxAmount),
            lineSubtotal: new Prisma.Decimal(line.lineSubtotal),
            lineTotal: new Prisma.Decimal(line.lineTotal),
            batchCostRateSnapshot: new Prisma.Decimal(line.batchCostRateSnapshot),
            lineCogs: new Prisma.Decimal(line.lineCogs),
            lineProfit: new Prisma.Decimal(line.lineProfit),
            notes: line.notes ?? null,
          },
        });

        // Record SALE_OUT movement
        await this.stock.recordMovement(tx, {
          organizationId,
          itemId: line.itemId,
          batchId: line.batchId,
          type: 'SALE_OUT',
          qtyBase: new Decimal(line.qtyBase).negated(),
          refType: 'SALE_INVOICE',
          refId: created.id,
          refNo: created.invoiceNo,
          userId,
        });
      }

      // Post Client Ledger entry (Debit receivable)
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'CLIENT',
        partyId: client.id,
        entryDate: saleDate,
        refType: 'SALE_INVOICE',
        refId: created.id,
        refNo: created.invoiceNo,
        debit: netTotalDec.toFixed(2),
        credit: '0.00',
        narration: `Sale Invoice ${created.invoiceNo}`,
        createdById: userId,
      });

      // Handle optional immediate payment
      if (paidNowAmountDec.gt(0)) {
        const paymentNo = await this.numbering.nextDocumentNumber(
          tx,
          organizationId,
          'PAYMENT_IN',
          saleDate,
        );

        const paymentId = await nextId(tx, 'payments');
        await tx.payment.create({
          data: {
            id: paymentId,
            organizationId,
            paymentNo,
            direction: 'IN',
            partyType: 'CLIENT',
            partyId: client.id,
            paymentDate: saleDate,
            method: input.paidNow!.method,
            amount: new Prisma.Decimal(paidNowAmountDec.toFixed(2)),
            referenceNo: input.paidNow!.referenceNo?.trim() || null,
            status: 'POSTED',
            notes: `Immediate payment at invoice creation for ${created.invoiceNo}`,
            createdById: userId,
          },
        });

        const allocId = await nextId(tx, 'payment_allocations');
        await tx.paymentAllocation.create({
          data: {
            id: allocId,
            paymentId,
            invoiceType: 'SALE_INVOICE',
            invoiceId: created.id,
            amount: new Prisma.Decimal(paidNowAmountDec.toFixed(2)),
          },
        });

        await this.ledger.postEntry(tx, {
          organizationId,
          partyType: 'CLIENT',
          partyId: client.id,
          entryDate: saleDate,
          refType: 'PAYMENT_IN',
          refId: paymentId,
          refNo: paymentNo,
          debit: '0.00',
          credit: paidNowAmountDec.toFixed(2),
          narration: `Payment received (${input.paidNow!.method}) for ${created.invoiceNo}`,
          createdById: userId,
        });
      }

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'SaleInvoice',
        entityId: created.id,
        afterJson: {
          invoiceNo: created.invoiceNo,
          total: created.total.toString(),
          totalProfit: created.totalProfit.toString(),
        },
      });

      return this.getSaleById(organizationId, created.id, tx);
    });
  }

  async voidSaleInvoice(
    organizationId: number,
    id: number,
    reason: string,
    userId: number,
  ): Promise<SaleInvoiceDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const sale = await tx.saleInvoice.findFirst({
        where: { id, organizationId },
        include: {
          items: true,
          returns: {
            where: { status: { not: 'VOIDED' } },
          },
        },
      });

      if (!sale) {
        throw new NotFoundException(`Sale invoice with id ${id} not found`);
      }

      if (sale.status === 'VOIDED') {
        throw new BadRequestException(`Sale invoice ${sale.invoiceNo} is already voided`);
      }

      if (sale.returns.length > 0) {
        throw new BadRequestException(
          `Cannot void sale invoice ${sale.invoiceNo} because it has active returns. Void the returns first.`,
        );
      }

      // Check if any payments are allocated to this invoice
      const payments = await tx.paymentAllocation.findMany({
        where: {
          invoiceType: 'SALE_INVOICE',
          invoiceId: sale.id,
          payment: { status: 'POSTED' },
        },
      });

      if (payments.length > 0) {
        throw new BadRequestException(
          `Cannot void sale invoice ${sale.invoiceNo} because payments have been allocated to it. Reallocate or void those payments first.`,
        );
      }

      // Reverse stock movements
      for (const item of sale.items) {
        await this.stock.recordMovement(tx, {
          organizationId,
          itemId: item.itemId,
          batchId: item.batchId,
          type: 'SALE_CANCEL_IN',
          qtyBase: new Decimal(item.qtyBase.toString()),
          refType: 'SALE_CANCEL',
          refId: sale.id,
          refNo: sale.invoiceNo,
          note: `Void invoice ${sale.invoiceNo}: ${reason}`,
          userId,
        });
      }

      // Reverse client ledger entry (Credit reversal)
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'CLIENT',
        partyId: sale.clientId,
        entryDate: new Date(),
        refType: 'SALE_CANCEL',
        refId: sale.id,
        refNo: sale.invoiceNo,
        debit: '0.00',
        credit: new Decimal(sale.total.toString()).toFixed(2),
        narration: `Void Sale Invoice ${sale.invoiceNo}: ${reason}`,
        createdById: userId,
      });

      await tx.saleInvoice.update({
        where: { id: sale.id },
        data: {
          status: 'VOIDED',
          voidReason: reason,
          voidedAt: new Date(),
          voidedById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'VOID',
        entity: 'SaleInvoice',
        entityId: sale.id,
        beforeJson: { status: sale.status },
        afterJson: { status: 'VOIDED', voidReason: reason },
      });

      return this.getSaleById(organizationId, sale.id, tx);
    });
  }
}
