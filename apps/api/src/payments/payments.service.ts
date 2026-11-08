import {
  type AttachmentDto,
  type CreateSupplierPaymentInput,
  type ListPaymentsQuery,
  type PaginatedResponse,
  type PaymentAllocationDto,
  type PaymentDto,
  type PaymentMethod,
  type PaymentStatus,
  type VoidDocumentInput,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';
import { NumberingService } from '../numbering/numbering.module.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly numbering: NumberingService,
  ) {}

  async toPaymentDto(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    payment: {
      id: number;
      paymentNo: string;
      direction: string;
      partyType: string;
      partyId: number;
      paymentDate: Date;
      method: string;
      amount: Prisma.Decimal;
      referenceNo: string | null;
      bankName: string | null;
      chequeDate: Date | null;
      status: string;
      notes: string | null;
      voidReason: string | null;
      voidedAt: Date | null;
      createdAt: Date;
      allocations: {
        id: number;
        invoiceType: string;
        invoiceId: number;
        amount: Prisma.Decimal;
      }[];
    },
  ): Promise<PaymentDto> {
    let partyName = `Party #${payment.partyId}`;
    let partyNameUr: string | null = null;
    if (payment.partyType === 'SUPPLIER') {
      const sup = await tx.supplier.findFirst({
        where: { id: payment.partyId, organizationId },
      });
      if (sup) {
        partyName = sup.name;
        partyNameUr = sup.nameUr;
      }
    }

    const attachmentRows = await tx.attachment.findMany({
      where: {
        organizationId,
        ownerType: 'PAYMENT',
        ownerId: payment.id,
      },
      orderBy: { id: 'asc' },
    });

    const attachments: AttachmentDto[] = attachmentRows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      filePath: a.filePath,
      mimeType: a.mimeType,
      createdAt: a.createdAt.toISOString(),
    }));

    const allocations: PaymentAllocationDto[] = await Promise.all(
      payment.allocations.map(async (al) => {
        let invoiceNo: string | undefined;
        if (al.invoiceType === 'PURCHASE_INVOICE') {
          const inv = await tx.purchaseInvoice.findFirst({
            where: { id: al.invoiceId, organizationId },
            select: { invoiceNo: true },
          });
          invoiceNo = inv?.invoiceNo;
        }
        return {
          id: al.id,
          invoiceType: al.invoiceType,
          invoiceId: al.invoiceId,
          ...(invoiceNo ? { invoiceNo } : {}),
          amount: new Decimal(al.amount.toString()).toFixed(2),
        };
      }),
    );

    return {
      id: payment.id,
      paymentNo: payment.paymentNo,
      direction: payment.direction as 'IN' | 'OUT',
      partyType: payment.partyType as 'SUPPLIER' | 'CLIENT',
      partyId: payment.partyId,
      partyName,
      partyNameUr,
      paymentDate: payment.paymentDate.toISOString(),
      method: payment.method as PaymentMethod,
      amount: new Decimal(payment.amount.toString()).toFixed(2),
      referenceNo: payment.referenceNo,
      bankName: payment.bankName,
      chequeDate: payment.chequeDate ? payment.chequeDate.toISOString() : null,
      status: payment.status as PaymentStatus,
      notes: payment.notes,
      voidReason: payment.voidReason,
      voidedAt: payment.voidedAt ? payment.voidedAt.toISOString() : null,
      allocations,
      attachments,
      createdAt: payment.createdAt.toISOString(),
    };
  }

  /**
   * Internal transactional method used both by standalone supplier payment endpoint
   * and by PurchaseInvoice creation when an immediate payment is recorded.
   */
  async createSupplierPaymentInTx(
    tx: TxClient,
    organizationId: number,
    actorUserId: number,
    input: CreateSupplierPaymentInput,
  ): Promise<PaymentDto> {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, organizationId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const amountDec = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amountDec.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    // Validate allocations
    let allocatedSum = new Decimal(0);
    for (const al of input.allocations) {
      const alAmount = new Decimal(al.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      allocatedSum = allocatedSum.plus(alAmount);

      if (al.invoiceType === 'PURCHASE_INVOICE') {
        const inv = await tx.purchaseInvoice.findFirst({
          where: { id: al.invoiceId, organizationId, supplierId: supplier.id },
        });
        if (!inv) {
          throw new BadRequestException(`Purchase invoice #${al.invoiceId} not found for supplier`);
        }
        if (inv.status === 'VOIDED') {
          throw new BadRequestException(
            `Cannot allocate payment to voided invoice ${inv.invoiceNo}`,
          );
        }
        const netTotal = new Decimal(inv.total.toString()).minus(
          new Decimal(inv.returnedAmount.toString()),
        );
        const currentPaid = new Decimal(inv.paidAmount.toString());
        const remaining = netTotal.minus(currentPaid);
        if (alAmount.gt(remaining)) {
          throw new BadRequestException(
            `Allocation ${alAmount.toFixed(2)} exceeds remaining balance ${remaining.toFixed(2)} on invoice ${inv.invoiceNo}`,
          );
        }
      }
    }

    if (allocatedSum.gt(amountDec)) {
      throw new BadRequestException(
        `Total allocated amount (${allocatedSum.toFixed(2)}) cannot exceed payment amount (${amountDec.toFixed(2)})`,
      );
    }

    const paymentDate = new Date(input.paymentDate);
    const paymentNo = await this.numbering.nextDocumentNumber(
      tx,
      organizationId,
      'PAYMENT_OUT',
      paymentDate,
    );
    const paymentId = await nextId(tx, 'payments');

    await tx.payment.create({
      data: {
        id: paymentId,
        organizationId,
        paymentNo,
        direction: 'OUT',
        partyType: 'SUPPLIER',
        partyId: supplier.id,
        paymentDate,
        method: input.method,
        amount: new Prisma.Decimal(amountDec.toFixed(2)),
        referenceNo: input.referenceNo || null,
        bankName: input.bankName || null,
        chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
        status: 'POSTED',
        notes: input.notes || null,
        createdById: actorUserId,
      },
    });

    // Save allocations and update invoice paidAmount + status
    for (const al of input.allocations) {
      const alAmount = new Decimal(al.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const allocationId = await nextId(tx, 'payment_allocations');
      await tx.paymentAllocation.create({
        data: {
          id: allocationId,
          paymentId,
          invoiceType: al.invoiceType,
          invoiceId: al.invoiceId,
          amount: new Prisma.Decimal(alAmount.toFixed(2)),
        },
      });

      if (al.invoiceType === 'PURCHASE_INVOICE') {
        const inv = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: al.invoiceId } });
        const nextPaid = new Decimal(inv.paidAmount.toString()).plus(alAmount);
        const netTotal = new Decimal(inv.total.toString()).minus(
          new Decimal(inv.returnedAmount.toString()),
        );
        const nextStatus = nextPaid.gte(netTotal) ? 'PAID' : nextPaid.gt(0) ? 'PARTIAL' : 'POSTED';
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            paidAmount: new Prisma.Decimal(nextPaid.toFixed(2)),
            status: nextStatus,
          },
        });
      }
    }

    // Optional proof attachment
    if (input.proofDataUrl) {
      const attachmentId = await nextId(tx, 'attachments');
      const mimeMatch = /^data:([^;]+);base64,/i.exec(input.proofDataUrl);
      const mimeType = mimeMatch?.[1] ?? 'image/png';
      await tx.attachment.create({
        data: {
          id: attachmentId,
          organizationId,
          ownerType: 'PAYMENT',
          ownerId: paymentId,
          fileName: input.proofFileName || `${paymentNo}-proof.png`,
          filePath: input.proofDataUrl,
          mimeType,
          uploadedById: actorUserId,
        },
      });
    }

    // Post supplier ledger debit (reduces payable owed to supplier)
    await this.ledger.postEntry(tx, {
      organizationId,
      partyType: 'SUPPLIER',
      partyId: supplier.id,
      entryDate: paymentDate,
      refType: 'PAYMENT_OUT',
      refId: paymentId,
      refNo: paymentNo,
      debit: amountDec.toFixed(2),
      credit: '0.00',
      narration: `Payment Out (${input.method})${input.referenceNo ? ` Ref: ${input.referenceNo}` : ''}`,
      createdById: actorUserId,
    });

    await this.audit.log(tx, {
      organizationId,
      userId: actorUserId,
      action: 'CREATE',
      entity: 'payment_out',
      entityId: paymentId,
      afterJson: {
        paymentNo,
        supplierId: supplier.id,
        method: input.method,
        amount: amountDec.toFixed(2),
      },
    });

    const created = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { allocations: true },
    });

    return this.toPaymentDto(tx, organizationId, created);
  }

  async createSupplierPayment(
    organizationId: number,
    actorUserId: number,
    input: CreateSupplierPaymentInput,
  ): Promise<PaymentDto> {
    return inTransaction(this.prisma, (tx) =>
      this.createSupplierPaymentInTx(tx, organizationId, actorUserId, input),
    );
  }

  async voidPayment(
    organizationId: number,
    actorUserId: number,
    paymentId: number,
    input: VoidDocumentInput,
  ): Promise<PaymentDto> {
    return inTransaction(this.prisma, async (tx) => {
      const existing = await tx.payment.findFirst({
        where: { id: paymentId, organizationId },
        include: { allocations: true },
      });
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      if (existing.status === 'VOIDED') {
        throw new BadRequestException('Payment is already voided');
      }

      // Reverse allocations on purchase invoices
      for (const al of existing.allocations) {
        if (al.invoiceType === 'PURCHASE_INVOICE') {
          const inv = await tx.purchaseInvoice.findUnique({ where: { id: al.invoiceId } });
          if (inv && inv.status !== 'VOIDED') {
            const alDec = new Decimal(al.amount.toString());
            const nextPaid = Decimal.max(0, new Decimal(inv.paidAmount.toString()).minus(alDec));
            const netTotal = new Decimal(inv.total.toString()).minus(
              new Decimal(inv.returnedAmount.toString()),
            );
            const nextStatus =
              nextPaid.gte(netTotal) && netTotal.gt(0)
                ? 'PAID'
                : nextPaid.gt(0)
                  ? 'PARTIAL'
                  : 'POSTED';
            await tx.purchaseInvoice.update({
              where: { id: inv.id },
              data: {
                paidAmount: new Prisma.Decimal(nextPaid.toFixed(2)),
                status: nextStatus,
              },
            });
          }
        }
      }

      const updated = await tx.payment.update({
        where: { id: existing.id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: actorUserId,
        },
        include: { allocations: true },
      });

      const amountDec = new Decimal(existing.amount.toString()).toFixed(2);
      if (existing.partyType === 'SUPPLIER' && existing.direction === 'OUT') {
        // Reversal of a supplier Payment Out debit is a credit
        await this.ledger.postEntry(tx, {
          organizationId,
          partyType: 'SUPPLIER',
          partyId: existing.partyId,
          entryDate: new Date(),
          refType: 'PAYMENT_VOID',
          refId: existing.id,
          refNo: existing.paymentNo,
          debit: '0.00',
          credit: amountDec,
          narration: `Voided Payment ${existing.paymentNo}: ${input.reason}`,
          createdById: actorUserId,
        });
      }

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CANCEL',
        entity: 'payment_out',
        entityId: existing.id,
        beforeJson: { status: existing.status, amount: amountDec },
        afterJson: { status: 'VOIDED', voidReason: input.reason },
      });

      return this.toPaymentDto(tx, organizationId, updated);
    });
  }

  async listPayments(
    organizationId: number,
    query: ListPaymentsQuery,
  ): Promise<PaginatedResponse<PaymentDto>> {
    const where: Prisma.PaymentWhereInput = { organizationId };

    if (query.direction) where.direction = query.direction;
    if (query.partyType) where.partyType = query.partyType;
    if (query.partyId) where.partyId = query.partyId;
    if (query.method) where.method = query.method;
    if (query.status) where.status = query.status;

    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
      where.paymentDate = dateFilter;
    }

    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { paymentNo: { contains: q, mode: 'insensitive' } },
        { referenceNo: { contains: q, mode: 'insensitive' } },
        { bankName: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set(['id', 'paymentNo', 'paymentDate', 'amount', 'createdAt']);
    const sortField = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'id';
    const orderBy: Prisma.PaymentOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: { allocations: true },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    const data = await Promise.all(
      rows.map((r) => this.toPaymentDto(this.prisma, organizationId, r)),
    );

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getPaymentById(organizationId: number, paymentId: number): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: { allocations: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toPaymentDto(this.prisma, organizationId, payment);
  }
}
