import {
  calculatePurchaseLineAmounts,
  type CreatePurchaseInvoiceInput,
  type CreatePurchaseReturnInput,
  type ListPurchaseReturnsQuery,
  type ListPurchasesQuery,
  type PaginatedResponse,
  type PurchaseInvoiceDto,
  type PurchaseItemDto,
  type PurchaseReturnDto,
  type PurchaseReturnItemDto,
  type PurchaseReturnSettlementType,
  type PurchaseStatus,
  type ReturnReasonCode,
  type VoidDocumentInput,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';
import { NumberingService } from '../numbering/numbering.module.js';
import { PaymentsService } from '../payments/payments.service.js';
import { StockService } from '../stock/stock.module.js';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly stock: StockService,
    private readonly numbering: NumberingService,
    private readonly payments: PaymentsService,
  ) {}

  private toPurchaseInvoiceDto(inv: {
    id: number;
    invoiceNo: string;
    supplierRefNo: string | null;
    invoiceDate: Date;
    supplierId: number;
    subtotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    extraCharges: Prisma.Decimal;
    total: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    returnedAmount: Prisma.Decimal;
    status: string;
    notes: string | null;
    voidReason: string | null;
    voidedAt: Date | null;
    createdAt: Date;
    supplier: {
      id: number;
      name: string;
      nameUr: string | null;
    };
    items: {
      id: number;
      purchaseId: number;
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
      allocatedQtyBase: Prisma.Decimal;
      returnedQtyBase: Prisma.Decimal;
      notes: string | null;
      item: {
        id: number;
        name: string;
        nameUr: string | null;
        baseUnit: string;
      };
    }[];
  }): PurchaseInvoiceDto {
    const totalDec = new Decimal(inv.total.toString());
    const paidDec = new Decimal(inv.paidAmount.toString());
    const returnedDec = new Decimal(inv.returnedAmount.toString());
    const balanceDue =
      inv.status === 'VOIDED'
        ? new Decimal(0)
        : Decimal.max(0, totalDec.minus(returnedDec).minus(paidDec));

    let totalQtyBase = new Decimal(0);
    const items: PurchaseItemDto[] = inv.items.map((line) => {
      const qtyBase = new Decimal(line.qtyBase.toString());
      const allocated = new Decimal(line.allocatedQtyBase.toString());
      const returned = new Decimal(line.returnedQtyBase.toString());
      const unconsumed = Decimal.max(0, qtyBase.minus(allocated).minus(returned));
      totalQtyBase = totalQtyBase.plus(qtyBase);

      return {
        id: line.id,
        purchaseId: line.purchaseId,
        itemId: line.itemId,
        itemName: line.item.name,
        itemNameUr: line.item.nameUr,
        baseUnit: line.item.baseUnit,
        enteredQty: new Decimal(line.enteredQty.toString()).toFixed(3),
        enteredUnit: line.enteredUnit,
        conversionFactor: new Decimal(line.conversionFactor.toString()).toFixed(3),
        bagCount: line.bagCount,
        qtyBase: qtyBase.toFixed(3),
        ratePerEnteredUnit: new Decimal(line.ratePerEnteredUnit.toString()).toFixed(4),
        ratePerBase: new Decimal(line.ratePerBase.toString()).toFixed(4),
        taxRate: new Decimal(line.taxRate.toString()).toFixed(2),
        taxAmount: new Decimal(line.taxAmount.toString()).toFixed(2),
        lineSubtotal: new Decimal(line.lineSubtotal.toString()).toFixed(2),
        lineTotal: new Decimal(line.lineTotal.toString()).toFixed(2),
        allocatedQtyBase: allocated.toFixed(3),
        returnedQtyBase: returned.toFixed(3),
        availableToReturnQtyBase: unconsumed.toFixed(3),
        availableToAllocateQtyBase: unconsumed.toFixed(3),
        notes: line.notes,
      };
    });

    return {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      supplierRefNo: inv.supplierRefNo,
      invoiceDate: inv.invoiceDate.toISOString(),
      supplierId: inv.supplierId,
      supplierName: inv.supplier.name,
      supplierNameUr: inv.supplier.nameUr,
      subtotal: new Decimal(inv.subtotal.toString()).toFixed(2),
      taxTotal: new Decimal(inv.taxTotal.toString()).toFixed(2),
      discount: new Decimal(inv.discount.toString()).toFixed(2),
      extraCharges: new Decimal(inv.extraCharges.toString()).toFixed(2),
      total: totalDec.toFixed(2),
      paidAmount: paidDec.toFixed(2),
      returnedAmount: returnedDec.toFixed(2),
      balanceDue: balanceDue.toFixed(2),
      totalQtyBase: totalQtyBase.toFixed(3),
      status: inv.status as PurchaseStatus,
      notes: inv.notes,
      voidReason: inv.voidReason,
      voidedAt: inv.voidedAt ? inv.voidedAt.toISOString() : null,
      items,
      createdAt: inv.createdAt.toISOString(),
    };
  }

  private toPurchaseReturnDto(ret: {
    id: number;
    returnNo: string;
    returnDate: Date;
    purchaseId: number;
    supplierId: number;
    reasonCode: string;
    settlementType: string;
    subtotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    total: Prisma.Decimal;
    status: string;
    notes: string | null;
    voidReason: string | null;
    voidedAt: Date | null;
    createdAt: Date;
    purchase: {
      invoiceNo: string;
    };
    supplier: {
      name: string;
      nameUr: string | null;
    };
    items: {
      id: number;
      purchaseItemId: number;
      itemId: number;
      enteredQty: Prisma.Decimal;
      enteredUnit: string;
      qtyBase: Prisma.Decimal;
      ratePerBase: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      purchaseItem: {
        item: {
          name: string;
          nameUr: string | null;
          baseUnit: string;
        };
      };
    }[];
  }): PurchaseReturnDto {
    let totalQtyBase = new Decimal(0);
    const items: PurchaseReturnItemDto[] = ret.items.map((line) => {
      const qtyBase = new Decimal(line.qtyBase.toString());
      totalQtyBase = totalQtyBase.plus(qtyBase);
      return {
        id: line.id,
        purchaseItemId: line.purchaseItemId,
        itemId: line.itemId,
        itemName: line.purchaseItem.item.name,
        itemNameUr: line.purchaseItem.item.nameUr,
        baseUnit: line.purchaseItem.item.baseUnit,
        enteredQty: new Decimal(line.enteredQty.toString()).toFixed(3),
        enteredUnit: line.enteredUnit,
        qtyBase: qtyBase.toFixed(3),
        ratePerBase: new Decimal(line.ratePerBase.toString()).toFixed(4),
        taxRate: new Decimal(line.taxRate.toString()).toFixed(2),
        taxAmount: new Decimal(line.taxAmount.toString()).toFixed(2),
        lineSubtotal: new Decimal(line.lineSubtotal.toString()).toFixed(2),
        lineTotal: new Decimal(line.lineTotal.toString()).toFixed(2),
      };
    });

    return {
      id: ret.id,
      returnNo: ret.returnNo,
      returnDate: ret.returnDate.toISOString(),
      purchaseId: ret.purchaseId,
      purchaseInvoiceNo: ret.purchase.invoiceNo,
      supplierId: ret.supplierId,
      supplierName: ret.supplier.name,
      supplierNameUr: ret.supplier.nameUr,
      reasonCode: ret.reasonCode as ReturnReasonCode,
      settlementType: ret.settlementType as PurchaseReturnSettlementType,
      subtotal: new Decimal(ret.subtotal.toString()).toFixed(2),
      taxTotal: new Decimal(ret.taxTotal.toString()).toFixed(2),
      total: new Decimal(ret.total.toString()).toFixed(2),
      totalQtyBase: totalQtyBase.toFixed(3),
      status: ret.status as 'POSTED' | 'VOIDED',
      notes: ret.notes,
      voidReason: ret.voidReason,
      voidedAt: ret.voidedAt ? ret.voidedAt.toISOString() : null,
      items,
      createdAt: ret.createdAt.toISOString(),
    };
  }

  async createPurchaseInvoice(
    organizationId: number,
    actorUserId: number,
    input: CreatePurchaseInvoiceInput,
  ): Promise<PurchaseInvoiceDto> {
    return inTransaction(this.prisma, async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, organizationId },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }

      const invoiceDate = new Date(input.invoiceDate);
      const invoiceNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'PURCHASE_INVOICE',
        invoiceDate,
      );

      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);

      const preparedLines: {
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
        notes: string | null;
      }[] = [];

      for (const lineInput of input.lines) {
        const item = await tx.item.findFirst({
          where: { id: lineInput.itemId, organizationId },
        });
        if (!item) {
          throw new BadRequestException(`Item #${lineInput.itemId} does not exist`);
        }

        const calc = calculatePurchaseLineAmounts({
          enteredQty: lineInput.enteredQty,
          qtyBase: lineInput.qtyBase,
          ratePerEnteredUnit: lineInput.ratePerEnteredUnit,
          taxRate: lineInput.taxRate,
        });

        subtotal = subtotal.plus(new Decimal(calc.lineSubtotal));
        taxTotal = taxTotal.plus(new Decimal(calc.taxAmount));

        preparedLines.push({
          itemId: item.id,
          enteredQty: calc.enteredQty,
          enteredUnit: lineInput.enteredUnit.toUpperCase(),
          conversionFactor: new Decimal(lineInput.conversionFactor)
            .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
            .toFixed(3),
          bagCount: lineInput.bagCount ?? null,
          qtyBase: calc.qtyBase,
          ratePerEnteredUnit: calc.ratePerEnteredUnit,
          ratePerBase: calc.ratePerBase,
          taxRate: calc.taxRate,
          taxAmount: calc.taxAmount,
          lineSubtotal: calc.lineSubtotal,
          lineTotal: calc.lineTotal,
          notes: lineInput.notes || null,
        });
      }

      const discount = new Decimal(input.discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const extraCharges = new Decimal(input.extraCharges).toDecimalPlaces(
        2,
        Decimal.ROUND_HALF_UP,
      );
      const total = subtotal
        .plus(taxTotal)
        .minus(discount)
        .plus(extraCharges)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      if (total.lt(0)) {
        throw new BadRequestException('Purchase invoice total cannot be negative');
      }

      const purchaseId = await nextId(tx, 'purchase_invoices');
      await tx.purchaseInvoice.create({
        data: {
          id: purchaseId,
          organizationId,
          invoiceNo,
          supplierRefNo: input.supplierRefNo || null,
          invoiceDate,
          supplierId: supplier.id,
          subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
          taxTotal: new Prisma.Decimal(taxTotal.toFixed(2)),
          discount: new Prisma.Decimal(discount.toFixed(2)),
          extraCharges: new Prisma.Decimal(extraCharges.toFixed(2)),
          total: new Prisma.Decimal(total.toFixed(2)),
          paidAmount: new Prisma.Decimal('0.00'),
          returnedAmount: new Prisma.Decimal('0.00'),
          status: 'POSTED',
          notes: input.notes || null,
          createdById: actorUserId,
        },
      });

      // Insert lines and append PURCHASE_IN stock movements
      for (const pl of preparedLines) {
        const purchaseItemId = await nextId(tx, 'purchase_items');
        await tx.purchaseItem.create({
          data: {
            id: purchaseItemId,
            purchaseId,
            itemId: pl.itemId,
            enteredQty: new Prisma.Decimal(pl.enteredQty),
            enteredUnit: pl.enteredUnit,
            conversionFactor: new Prisma.Decimal(pl.conversionFactor),
            bagCount: pl.bagCount,
            qtyBase: new Prisma.Decimal(pl.qtyBase),
            ratePerEnteredUnit: new Prisma.Decimal(pl.ratePerEnteredUnit),
            ratePerBase: new Prisma.Decimal(pl.ratePerBase),
            taxRate: new Prisma.Decimal(pl.taxRate),
            taxAmount: new Prisma.Decimal(pl.taxAmount),
            lineSubtotal: new Prisma.Decimal(pl.lineSubtotal),
            lineTotal: new Prisma.Decimal(pl.lineTotal),
            allocatedQtyBase: new Prisma.Decimal('0.000'),
            returnedQtyBase: new Prisma.Decimal('0.000'),
            notes: pl.notes,
          },
        });

        await this.stock.recordMovement(tx, {
          organizationId,
          itemId: pl.itemId,
          batchId: null,
          purchaseItemId,
          type: 'PURCHASE_IN',
          qtyBase: pl.qtyBase,
          refType: 'PURCHASE_INVOICE',
          refId: purchaseId,
          refNo: invoiceNo,
          note: `Purchase ${invoiceNo} (${pl.enteredQty} ${pl.enteredUnit})`,
          userId: actorUserId,
        });
      }

      // Post supplier ledger credit (increases payable owed to supplier)
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'SUPPLIER',
        partyId: supplier.id,
        entryDate: invoiceDate,
        refType: 'PURCHASE_INVOICE',
        refId: purchaseId,
        refNo: invoiceNo,
        debit: '0.00',
        credit: total.toFixed(2),
        narration: `Purchase Invoice ${invoiceNo}${input.supplierRefNo ? ` (Supplier Bill: ${input.supplierRefNo})` : ''}`,
        createdById: actorUserId,
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'purchase_invoice',
        entityId: purchaseId,
        afterJson: {
          invoiceNo,
          supplierId: supplier.id,
          total: total.toFixed(2),
          linesCount: preparedLines.length,
        },
      });

      // Optional immediate payment allocated to this invoice
      if (input.immediatePayment) {
        const payAmt = new Decimal(input.immediatePayment.amount).toDecimalPlaces(2);
        if (payAmt.gt(0)) {
          await this.payments.createSupplierPaymentInTx(tx, organizationId, actorUserId, {
            supplierId: supplier.id,
            paymentDate: input.invoiceDate,
            method: input.immediatePayment.method,
            amount: payAmt.toFixed(2),
            referenceNo: input.immediatePayment.referenceNo,
            bankName: input.immediatePayment.bankName,
            chequeDate: input.immediatePayment.chequeDate,
            proofDataUrl: input.immediatePayment.proofDataUrl,
            proofFileName: input.immediatePayment.proofFileName,
            notes: `Immediate payment on Purchase Invoice ${invoiceNo}`,
            allocations: [
              {
                invoiceType: 'PURCHASE_INVOICE',
                invoiceId: purchaseId,
                amount: Decimal.min(payAmt, total).toFixed(2),
              },
            ],
          });
        }
      }

      const created = await tx.purchaseInvoice.findUniqueOrThrow({
        where: { id: purchaseId },
        include: {
          supplier: true,
          items: {
            include: { item: true },
            orderBy: { id: 'asc' },
          },
        },
      });

      return this.toPurchaseInvoiceDto(created);
    });
  }

  async voidPurchaseInvoice(
    organizationId: number,
    actorUserId: number,
    purchaseId: number,
    input: VoidDocumentInput,
  ): Promise<PurchaseInvoiceDto> {
    return inTransaction(this.prisma, async (tx) => {
      const existing = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseId, organizationId },
        include: {
          supplier: true,
          items: { include: { item: true } },
        },
      });
      if (!existing) {
        throw new NotFoundException('Purchase invoice not found');
      }
      if (existing.status === 'VOIDED') {
        throw new BadRequestException('Purchase invoice is already voided');
      }

      const paidDec = new Decimal(existing.paidAmount.toString());
      if (paidDec.gt(0)) {
        throw new BadRequestException(
          `Cannot void purchase invoice ${existing.invoiceNo} while it has active payment allocations (${paidDec.toFixed(2)}). Void the payment first.`,
        );
      }

      for (const line of existing.items) {
        const allocated = new Decimal(line.allocatedQtyBase.toString());
        const returned = new Decimal(line.returnedQtyBase.toString());
        if (allocated.gt(0)) {
          throw new BadRequestException(
            `Cannot void purchase invoice ${existing.invoiceNo}: ${allocated.toFixed(3)} ${line.item.baseUnit} of ${line.item.name} is already allocated to a batch.`,
          );
        }
        if (returned.gt(0)) {
          throw new BadRequestException(
            `Cannot void purchase invoice ${existing.invoiceNo}: ${returned.toFixed(3)} ${line.item.baseUnit} of ${line.item.name} has already been returned via a debit note.`,
          );
        }
      }

      // Reverse raw stock movements
      for (const line of existing.items) {
        const qtyBase = new Decimal(line.qtyBase.toString());
        await this.stock.recordMovement(tx, {
          organizationId,
          itemId: line.itemId,
          batchId: null,
          purchaseItemId: line.id,
          type: 'PURCHASE_VOID_OUT',
          qtyBase: qtyBase.negated().toFixed(3),
          refType: 'PURCHASE_VOID',
          refId: existing.id,
          refNo: existing.invoiceNo,
          note: `Voided Purchase ${existing.invoiceNo}: ${input.reason}`,
          userId: actorUserId,
        });
      }

      const updated = await tx.purchaseInvoice.update({
        where: { id: existing.id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: actorUserId,
        },
        include: {
          supplier: true,
          items: {
            include: { item: true },
            orderBy: { id: 'asc' },
          },
        },
      });

      // Reverse supplier ledger credit with a debit
      const totalStr = new Decimal(existing.total.toString()).toFixed(2);
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'SUPPLIER',
        partyId: existing.supplierId,
        entryDate: new Date(),
        refType: 'PURCHASE_VOID',
        refId: existing.id,
        refNo: existing.invoiceNo,
        debit: totalStr,
        credit: '0.00',
        narration: `Voided Purchase Invoice ${existing.invoiceNo}: ${input.reason}`,
        createdById: actorUserId,
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CANCEL',
        entity: 'purchase_invoice',
        entityId: existing.id,
        beforeJson: { status: existing.status, total: totalStr },
        afterJson: { status: 'VOIDED', voidReason: input.reason },
      });

      return this.toPurchaseInvoiceDto(updated);
    });
  }

  async listPurchaseInvoices(
    organizationId: number,
    query: ListPurchasesQuery,
  ): Promise<PaginatedResponse<PurchaseInvoiceDto>> {
    const where: Prisma.PurchaseInvoiceWhereInput = { organizationId };

    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.status) where.status = query.status;
    if (query.itemId) {
      where.items = { some: { itemId: query.itemId } };
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
      where.invoiceDate = dateFilter;
    }
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { invoiceNo: { contains: q, mode: 'insensitive' } },
        { supplierRefNo: { contains: q, mode: 'insensitive' } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set([
      'id',
      'invoiceNo',
      'invoiceDate',
      'total',
      'status',
      'createdAt',
    ]);
    const sortField = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'id';
    const orderBy: Prisma.PurchaseInvoiceOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.purchaseInvoice.count({ where }),
      this.prisma.purchaseInvoice.findMany({
        where,
        include: {
          supplier: true,
          items: {
            include: { item: true },
            orderBy: { id: 'asc' },
          },
        },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    return {
      data: rows.map((r) => this.toPurchaseInvoiceDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getPurchaseInvoiceById(
    organizationId: number,
    purchaseId: number,
  ): Promise<PurchaseInvoiceDto> {
    const inv = await this.prisma.purchaseInvoice.findFirst({
      where: { id: purchaseId, organizationId },
      include: {
        supplier: true,
        items: {
          include: { item: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!inv) {
      throw new NotFoundException('Purchase invoice not found');
    }
    return this.toPurchaseInvoiceDto(inv);
  }

  async createPurchaseReturn(
    organizationId: number,
    actorUserId: number,
    input: CreatePurchaseReturnInput,
  ): Promise<PurchaseReturnDto> {
    return inTransaction(this.prisma, async (tx) => {
      // Lock the purchase invoice row to prevent concurrent over-returns
      await tx.$queryRaw`
        SELECT "id" FROM "purchase_invoices"
        WHERE "id" = ${input.purchaseId} AND "organization_id" = ${organizationId}
        FOR UPDATE
      `;

      const purchase = await tx.purchaseInvoice.findFirst({
        where: { id: input.purchaseId, organizationId },
        include: {
          supplier: true,
          items: { include: { item: true } },
        },
      });
      if (!purchase) {
        throw new NotFoundException('Original purchase invoice not found');
      }
      if (purchase.status === 'VOIDED') {
        throw new BadRequestException('Cannot create a return against a voided purchase invoice');
      }

      const returnDate = new Date(input.returnDate);
      const returnNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'PURCHASE_RETURN',
        returnDate,
      );

      let subtotal = new Decimal(0);
      let taxTotal = new Decimal(0);

      const preparedReturnLines: {
        purchaseItemId: number;
        itemId: number;
        enteredQty: string;
        enteredUnit: string;
        qtyBase: string;
        ratePerBase: string;
        taxRate: string;
        taxAmount: string;
        lineSubtotal: string;
        lineTotal: string;
        nextReturnedQtyBase: string;
      }[] = [];

      for (const reqLine of input.lines) {
        const origLine = purchase.items.find((i) => i.id === reqLine.purchaseItemId);
        if (!origLine) {
          throw new BadRequestException(
            `Purchase line #${reqLine.purchaseItemId} does not belong to invoice ${purchase.invoiceNo}`,
          );
        }

        const returnQtyBase = new Decimal(reqLine.returnQtyBase).toDecimalPlaces(
          3,
          Decimal.ROUND_HALF_UP,
        );
        const purchasedQtyBase = new Decimal(origLine.qtyBase.toString());
        const allocatedQtyBase = new Decimal(origLine.allocatedQtyBase.toString());
        const alreadyReturnedQtyBase = new Decimal(origLine.returnedQtyBase.toString());
        const availableToReturn = purchasedQtyBase
          .minus(allocatedQtyBase)
          .minus(alreadyReturnedQtyBase)
          .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

        if (returnQtyBase.gt(availableToReturn)) {
          throw new BadRequestException(
            `Cannot return ${returnQtyBase.toFixed(3)} ${origLine.item.baseUnit} of ${origLine.item.name}: only ${availableToReturn.toFixed(3)} ${origLine.item.baseUnit} is unallocated and unreturned`,
          );
        }

        const ratePerBase = new Decimal(origLine.ratePerBase.toString());
        const taxRate = new Decimal(origLine.taxRate.toString());
        const lineSubtotal = returnQtyBase
          .mul(ratePerBase)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const taxAmount = lineSubtotal
          .mul(taxRate)
          .div(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const lineTotal = lineSubtotal.plus(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        const convFactor = new Decimal(origLine.conversionFactor.toString());
        const enteredQty = convFactor.gt(0)
          ? returnQtyBase.div(convFactor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
          : returnQtyBase;

        subtotal = subtotal.plus(lineSubtotal);
        taxTotal = taxTotal.plus(taxAmount);

        preparedReturnLines.push({
          purchaseItemId: origLine.id,
          itemId: origLine.itemId,
          enteredQty: enteredQty.toFixed(3),
          enteredUnit: origLine.enteredUnit,
          qtyBase: returnQtyBase.toFixed(3),
          ratePerBase: ratePerBase.toFixed(4),
          taxRate: taxRate.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          lineSubtotal: lineSubtotal.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
          nextReturnedQtyBase: alreadyReturnedQtyBase.plus(returnQtyBase).toFixed(3),
        });
      }

      const total = subtotal.plus(taxTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const returnId = await nextId(tx, 'purchase_returns');

      await tx.purchaseReturn.create({
        data: {
          id: returnId,
          organizationId,
          returnNo,
          returnDate,
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          reasonCode: input.reasonCode,
          settlementType: input.settlementType,
          subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
          taxTotal: new Prisma.Decimal(taxTotal.toFixed(2)),
          total: new Prisma.Decimal(total.toFixed(2)),
          status: 'POSTED',
          notes: input.notes || null,
          createdById: actorUserId,
        },
      });

      for (const rl of preparedReturnLines) {
        const returnItemId = await nextId(tx, 'purchase_return_items');
        await tx.purchaseReturnItem.create({
          data: {
            id: returnItemId,
            purchaseReturnId: returnId,
            purchaseItemId: rl.purchaseItemId,
            itemId: rl.itemId,
            enteredQty: new Prisma.Decimal(rl.enteredQty),
            enteredUnit: rl.enteredUnit,
            qtyBase: new Prisma.Decimal(rl.qtyBase),
            ratePerBase: new Prisma.Decimal(rl.ratePerBase),
            taxRate: new Prisma.Decimal(rl.taxRate),
            taxAmount: new Prisma.Decimal(rl.taxAmount),
            lineSubtotal: new Prisma.Decimal(rl.lineSubtotal),
            lineTotal: new Prisma.Decimal(rl.lineTotal),
          },
        });

        await tx.purchaseItem.update({
          where: { id: rl.purchaseItemId },
          data: {
            returnedQtyBase: new Prisma.Decimal(rl.nextReturnedQtyBase),
          },
        });

        await this.stock.recordMovement(tx, {
          organizationId,
          itemId: rl.itemId,
          batchId: null,
          purchaseItemId: rl.purchaseItemId,
          type: 'RETURN_OUT',
          qtyBase: new Decimal(rl.qtyBase).negated().toFixed(3),
          refType: 'PURCHASE_RETURN',
          refId: returnId,
          refNo: returnNo,
          note: `Purchase Return ${returnNo} against ${purchase.invoiceNo}`,
          userId: actorUserId,
        });
      }

      // Update purchase invoice returnedAmount and status
      const nextPurchaseReturnedAmt = new Decimal(purchase.returnedAmount.toString()).plus(total);
      const netPurchaseTotal = Decimal.max(
        0,
        new Decimal(purchase.total.toString()).minus(nextPurchaseReturnedAmt),
      );
      const currentPaid = new Decimal(purchase.paidAmount.toString());
      const nextStatus =
        currentPaid.gte(netPurchaseTotal) && currentPaid.gt(0)
          ? 'PAID'
          : currentPaid.gt(0)
            ? 'PARTIAL'
            : 'POSTED';

      await tx.purchaseInvoice.update({
        where: { id: purchase.id },
        data: {
          returnedAmount: new Prisma.Decimal(nextPurchaseReturnedAmt.toFixed(2)),
          status: nextStatus,
        },
      });

      // Post supplier ledger debit (reduces payable owed to supplier)
      await this.ledger.postEntry(tx, {
        organizationId,
        partyType: 'SUPPLIER',
        partyId: purchase.supplierId,
        entryDate: returnDate,
        refType: 'PURCHASE_RETURN',
        refId: returnId,
        refNo: returnNo,
        debit: total.toFixed(2),
        credit: '0.00',
        narration: `Purchase Return (Debit Note) ${returnNo} against ${purchase.invoiceNo} (${input.reasonCode})`,
        createdById: actorUserId,
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'purchase_return',
        entityId: returnId,
        afterJson: {
          returnNo,
          purchaseNo: purchase.invoiceNo,
          reasonCode: input.reasonCode,
          total: total.toFixed(2),
        },
      });

      const created = await tx.purchaseReturn.findUniqueOrThrow({
        where: { id: returnId },
        include: {
          purchase: true,
          supplier: true,
          items: {
            include: {
              purchaseItem: { include: { item: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
      });

      return this.toPurchaseReturnDto(created);
    });
  }

  async listPurchaseReturns(
    organizationId: number,
    query: ListPurchaseReturnsQuery,
  ): Promise<PaginatedResponse<PurchaseReturnDto>> {
    const where: Prisma.PurchaseReturnWhereInput = { organizationId };

    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.purchaseId) where.purchaseId = query.purchaseId;
    if (query.reasonCode) where.reasonCode = query.reasonCode;
    if (query.status) where.status = query.status;

    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
      where.returnDate = dateFilter;
    }

    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { returnNo: { contains: q, mode: 'insensitive' } },
        { purchase: { invoiceNo: { contains: q, mode: 'insensitive' } } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set(['id', 'returnNo', 'returnDate', 'total', 'createdAt']);
    const sortField = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'id';
    const orderBy: Prisma.PurchaseReturnOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.purchaseReturn.count({ where }),
      this.prisma.purchaseReturn.findMany({
        where,
        include: {
          purchase: true,
          supplier: true,
          items: {
            include: {
              purchaseItem: { include: { item: true } },
            },
            orderBy: { id: 'asc' },
          },
        },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    return {
      data: rows.map((r) => this.toPurchaseReturnDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getPurchaseReturnById(
    organizationId: number,
    returnId: number,
  ): Promise<PurchaseReturnDto> {
    const ret = await this.prisma.purchaseReturn.findFirst({
      where: { id: returnId, organizationId },
      include: {
        purchase: true,
        supplier: true,
        items: {
          include: {
            purchaseItem: { include: { item: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!ret) {
      throw new NotFoundException('Purchase return not found');
    }
    return this.toPurchaseReturnDto(ret);
  }
}
