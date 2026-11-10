import {
  calculateSaleReturnAmounts,
  convertToBaseUnitQty,
  type CreateSaleReturnInput,
  type ListSaleReturnsQuery,
  type PaginatedResponse,
  type SaleReturnCondition,
  type SaleReturnDto,
  type SaleReturnItemDto,
  type SaleReturnReason,
  type SaleReturnSettlement,
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
export class SaleReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly stock: StockService,
    private readonly numbering: NumberingService,
  ) {}

  toSaleReturnDto(ret: {
    id: number;
    returnNo: string;
    returnDate: Date;
    saleId: number;
    clientId: number;
    reasonCode: string;
    notes: string | null;
    subtotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    deduction: Prisma.Decimal;
    total: Prisma.Decimal;
    settlementType: string;
    status: string;
    voidReason: string | null;
    voidedAt: Date | null;
    createdAt: Date;
    sale: { invoiceNo: string };
    client: { name: string; nameUr: string | null };
    createdByUser?: { firstName: string; lastName: string } | null;
    items: {
      id: number;
      saleReturnId: number;
      saleItemId: number;
      batchId: number | null;
      itemId: number | null;
      enteredQty: Prisma.Decimal;
      enteredUnit: string;
      qtyBase: Prisma.Decimal;
      ratePerBase: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      condition: string;
      batchCostRateSnapshot: Prisma.Decimal;
      cogsReversed: Prisma.Decimal;
      lossAmount: Prisma.Decimal;
      batch?: { batchNo: string } | null;
      item?: { name: string } | null;
    }[];
  }): SaleReturnDto {
    const items: SaleReturnItemDto[] = ret.items.map((line) => ({
      id: line.id,
      saleReturnId: line.saleReturnId,
      saleItemId: line.saleItemId,
      batchId: line.batchId,
      batchNo: line.batch?.batchNo ?? null,
      itemId: line.itemId,
      itemName: line.item?.name ?? (line.batch ? `Batch ${line.batch.batchNo}` : 'Raw Item'),
      enteredQty: new Decimal(line.enteredQty.toString()).toFixed(3),
      enteredUnit: line.enteredUnit,
      qtyBase: new Decimal(line.qtyBase.toString()).toFixed(3),
      ratePerBase: new Decimal(line.ratePerBase.toString()).toFixed(4),
      taxRate: new Decimal(line.taxRate.toString()).toFixed(2),
      taxAmount: new Decimal(line.taxAmount.toString()).toFixed(2),
      lineSubtotal: new Decimal(line.lineSubtotal.toString()).toFixed(2),
      lineTotal: new Decimal(line.lineTotal.toString()).toFixed(2),
      condition: line.condition as SaleReturnCondition,
      batchCostRateSnapshot: new Decimal(line.batchCostRateSnapshot.toString()).toFixed(4),
      cogsReversed: new Decimal(line.cogsReversed.toString()).toFixed(2),
      lossAmount: new Decimal(line.lossAmount.toString()).toFixed(2),
    }));

    return {
      id: ret.id,
      returnNo: ret.returnNo,
      returnDate: ret.returnDate.toISOString().slice(0, 10),
      saleId: ret.saleId,
      invoiceNo: ret.sale.invoiceNo,
      clientId: ret.clientId,
      clientName: ret.client.name,
      clientNameUr: ret.client.nameUr,
      reasonCode: ret.reasonCode as SaleReturnReason,
      notes: ret.notes,
      subtotal: new Decimal(ret.subtotal.toString()).toFixed(2),
      taxTotal: new Decimal(ret.taxTotal.toString()).toFixed(2),
      deduction: new Decimal(ret.deduction.toString()).toFixed(2),
      total: new Decimal(ret.total.toString()).toFixed(2),
      settlementType: ret.settlementType as SaleReturnSettlement,
      status: ret.status as 'POSTED' | 'VOIDED',
      voidReason: ret.voidReason,
      voidedAt: ret.voidedAt ? ret.voidedAt.toISOString() : null,
      createdByName: ret.createdByUser
        ? `${ret.createdByUser.firstName} ${ret.createdByUser.lastName}`.trim()
        : null,
      createdAt: ret.createdAt.toISOString(),
      items,
    };
  }

  async listSaleReturns(
    organizationId: number,
    query: ListSaleReturnsQuery,
  ): Promise<PaginatedResponse<SaleReturnDto>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const fromDate = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
    const toDate = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined;

    const where: Prisma.SaleReturnWhereInput = {
      organizationId,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(fromDate || toDate
        ? {
            returnDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { returnNo: { contains: query.search, mode: 'insensitive' } },
              { sale: { invoiceNo: { contains: query.search, mode: 'insensitive' } } },
              { client: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.saleReturn.count({ where }),
      this.prisma.saleReturn.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { returnDate: 'desc' },
        include: {
          sale: { select: { invoiceNo: true } },
          client: { select: { name: true, nameUr: true } },
          items: {
            include: {
              batch: { select: { batchNo: true } },
              item: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: rows.map((r) => this.toSaleReturnDto(r)),
      total,
      page,
      pageSize,
    };
  }

  async getSaleReturnById(
    organizationId: number,
    id: number,
    txClient?: TxClient | Prisma.TransactionClient,
  ): Promise<SaleReturnDto> {
    const db = (txClient as PrismaService) ?? this.prisma;
    const row = await db.saleReturn.findFirst({
      where: { id, organizationId },
      include: {
        sale: { select: { invoiceNo: true } },
        client: { select: { name: true, nameUr: true } },
        items: {
          include: {
            batch: { select: { batchNo: true } },
            item: { select: { name: true } },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Sale return with id ${id} not found`);
    }

    return this.toSaleReturnDto(row);
  }

  async createSaleReturn(
    organizationId: number,
    input: CreateSaleReturnInput,
    userId: number,
  ): Promise<SaleReturnDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const sale = await tx.saleInvoice.findFirst({
        where: { id: input.saleId, organizationId },
        include: {
          items: true,
          client: true,
        },
      });

      if (!sale) {
        throw new NotFoundException(`Original sale invoice with id ${input.saleId} not found`);
      }

      if (sale.status === 'VOIDED') {
        throw new BadRequestException(`Cannot create return for a voided sale invoice`);
      }

      const returnDate = new Date(`${input.returnDate}T00:00:00.000Z`);

      let sumSubtotal = new Decimal(0);
      let sumTax = new Decimal(0);

      const calculatedItems: Array<{
        saleItemId: number;
        batchId: number | null;
        itemId: number | null;
        enteredQty: string;
        enteredUnit: string;
        qtyBase: string;
        ratePerBase: string;
        taxRate: string;
        taxAmount: string;
        lineSubtotal: string;
        lineTotal: string;
        condition: SaleReturnCondition;
        batchCostRateSnapshot: string;
        cogsReversed: string;
        lossAmount: string;
      }> = [];

      for (const line of input.lines) {
        const saleItem = sale.items.find((si) => si.id === line.saleItemId);
        if (!saleItem) {
          throw new BadRequestException(
            `Sale item ID ${line.saleItemId} does not belong to this invoice`,
          );
        }

        const conv = new Decimal(saleItem.conversionFactor.toString());
        const returnQtyBase = convertToBaseUnitQty(line.enteredQty, conv);

        const currentReturnedDec = new Decimal(saleItem.returnedQtyBase.toString());
        const originalSoldDec = new Decimal(saleItem.qtyBase.toString());
        const availableToReturn = originalSoldDec.minus(currentReturnedDec);

        if (new Decimal(returnQtyBase).gt(availableToReturn)) {
          throw new BadRequestException(
            `Cannot return ${returnQtyBase} kg. Max available to return on this line is ${availableToReturn.toFixed(3)} kg (sold ${originalSoldDec.toFixed(3)} kg, already returned ${currentReturnedDec.toFixed(3)} kg).`,
          );
        }

        const calc = calculateSaleReturnAmounts({
          enteredQty: line.enteredQty,
          conversionFactor: conv,
          ratePerBase: saleItem.ratePerBase.toString(),
          taxRate: saleItem.taxRate.toString(),
          batchCostRateSnapshot: saleItem.batchCostRateSnapshot.toString(),
          condition: line.condition,
        });

        sumSubtotal = sumSubtotal.plus(new Decimal(calc.lineSubtotal));
        sumTax = sumTax.plus(new Decimal(calc.taxAmount));

        calculatedItems.push({
          saleItemId: saleItem.id,
          batchId: saleItem.batchId,
          itemId: saleItem.itemId,
          enteredQty: line.enteredQty,
          enteredUnit: saleItem.enteredUnit,
          qtyBase: calc.qtyBase,
          ratePerBase: saleItem.ratePerBase.toString(),
          taxRate: saleItem.taxRate.toString(),
          taxAmount: calc.taxAmount,
          lineSubtotal: calc.lineSubtotal,
          lineTotal: calc.lineTotal,
          condition: line.condition,
          batchCostRateSnapshot: saleItem.batchCostRateSnapshot.toString(),
          cogsReversed: calc.cogsReversed,
          lossAmount: calc.lossAmount,
        });
      }

      const deductionDec = new Decimal(input.deduction || '0');
      const totalDec = Decimal.max(0, sumSubtotal.plus(sumTax).minus(deductionDec));

      const returnNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'SALE_RETURN',
        returnDate,
      );

      const returnId = await nextId(tx, 'sale_returns');
      const created = await tx.saleReturn.create({
        data: {
          id: returnId,
          organizationId,
          returnNo,
          returnDate,
          saleId: sale.id,
          clientId: sale.clientId,
          reasonCode: input.reasonCode,
          notes: input.notes?.trim() || null,
          subtotal: new Prisma.Decimal(sumSubtotal.toFixed(2)),
          taxTotal: new Prisma.Decimal(sumTax.toFixed(2)),
          deduction: new Prisma.Decimal(deductionDec.toFixed(2)),
          total: new Prisma.Decimal(totalDec.toFixed(2)),
          settlementType: input.settlementType,
          status: 'POSTED',
          createdById: userId,
        },
      });

      // Insert return items & process stock movements
      for (const item of calculatedItems) {
        const returnItemId = await nextId(tx, 'sale_return_items');
        await tx.saleReturnItem.create({
          data: {
            id: returnItemId,
            saleReturnId: created.id,
            saleItemId: item.saleItemId,
            batchId: item.batchId,
            itemId: item.itemId,
            enteredQty: new Prisma.Decimal(item.enteredQty),
            enteredUnit: item.enteredUnit,
            qtyBase: new Prisma.Decimal(item.qtyBase),
            ratePerBase: new Prisma.Decimal(item.ratePerBase),
            taxRate: new Prisma.Decimal(item.taxRate),
            taxAmount: new Prisma.Decimal(item.taxAmount),
            lineSubtotal: new Prisma.Decimal(item.lineSubtotal),
            lineTotal: new Prisma.Decimal(item.lineTotal),
            condition: item.condition,
            batchCostRateSnapshot: new Prisma.Decimal(item.batchCostRateSnapshot),
            cogsReversed: new Prisma.Decimal(item.cogsReversed),
            lossAmount: new Prisma.Decimal(item.lossAmount),
          },
        });

        // Update returned quantity on original sale item
        await tx.saleItem.update({
          where: { id: item.saleItemId },
          data: {
            returnedQtyBase: {
              increment: new Prisma.Decimal(item.qtyBase),
            },
          },
        });

        // If resaleable, returned stock goes back to the SAME batch or raw stock at original snapshot cost
        if (item.condition === 'RESALEABLE' && item.itemId != null) {
          await this.stock.recordMovement(tx, {
            organizationId,
            itemId: item.itemId,
            batchId: item.batchId,
            type: 'RETURN_IN',
            qtyBase: new Decimal(item.qtyBase),
            refType: 'SALE_RETURN',
            refId: created.id,
            refNo: created.returnNo,
            note: `Resaleable return from ${sale.invoiceNo}`,
            userId,
          });
        }
      }

      // Update returned amount on the sale invoice
      await tx.saleInvoice.update({
        where: { id: sale.id },
        data: {
          returnedAmount: {
            increment: new Prisma.Decimal(totalDec.toFixed(2)),
          },
        },
      });

      // Post Client Ledger entry (Credit reducing client receivable)
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'CLIENT',
        partyId: sale.clientId,
        entryDate: returnDate,
        refType: 'SALE_RETURN',
        refId: created.id,
        refNo: created.returnNo,
        debit: '0.00',
        credit: totalDec.toFixed(2),
        narration: `Credit Note ${created.returnNo} for ${sale.invoiceNo} (${input.reasonCode})`,
        createdById: userId,
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'SaleReturn',
        entityId: created.id,
        afterJson: {
          returnNo: created.returnNo,
          saleId: sale.id,
          total: created.total.toString(),
        },
      });

      return this.getSaleReturnById(organizationId, created.id, tx);
    });
  }

  async voidSaleReturn(
    organizationId: number,
    id: number,
    reason: string,
    userId: number,
  ): Promise<SaleReturnDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const ret = await tx.saleReturn.findFirst({
        where: { id, organizationId },
        include: {
          items: true,
          sale: true,
        },
      });

      if (!ret) {
        throw new NotFoundException(`Sale return with id ${id} not found`);
      }

      if (ret.status === 'VOIDED') {
        throw new BadRequestException(`Sale return ${ret.returnNo} is already voided`);
      }

      // Reverse stock movements if items were resaleable
      for (const item of ret.items) {
        if (item.condition === 'RESALEABLE' && item.itemId != null) {
          await this.stock.recordMovement(tx, {
            organizationId,
            itemId: item.itemId,
            batchId: item.batchId,
            type: 'RETURN_VOID_OUT',
            qtyBase: new Decimal(item.qtyBase.toString()).negated(),
            refType: 'SALE_RETURN_VOID',
            refId: ret.id,
            refNo: ret.returnNo,
            note: `Void Credit Note ${ret.returnNo}: ${reason}`,
            userId,
          });
        }

        // Decrement returned quantity on original sale item
        await tx.saleItem.update({
          where: { id: item.saleItemId },
          data: {
            returnedQtyBase: {
              decrement: item.qtyBase,
            },
          },
        });
      }

      // Decrement returned amount on original sale invoice
      await tx.saleInvoice.update({
        where: { id: ret.saleId },
        data: {
          returnedAmount: {
            decrement: ret.total,
          },
        },
      });

      // Post reversal Debit to client ledger
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'CLIENT',
        partyId: ret.clientId,
        entryDate: new Date(),
        refType: 'SALE_RETURN_VOID',
        refId: ret.id,
        refNo: ret.returnNo,
        debit: new Decimal(ret.total.toString()).toFixed(2),
        credit: '0.00',
        narration: `Void Credit Note ${ret.returnNo}: ${reason}`,
        createdById: userId,
      });

      await tx.saleReturn.update({
        where: { id: ret.id },
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
        entity: 'SaleReturn',
        entityId: ret.id,
        beforeJson: { status: ret.status },
        afterJson: { status: 'VOIDED', voidReason: reason },
      });

      return this.getSaleReturnById(organizationId, ret.id, tx);
    });
  }
}
