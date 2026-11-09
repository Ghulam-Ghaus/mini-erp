import {
  type AttachmentDto,
  type ChequeDto,
  type ChequeStatus,
  type CreateClientPaymentInput,
  type CreateSupplierPaymentInput,
  type ListChequesQuery,
  type ListPaymentsQuery,
  type PaginatedResponse,
  type PaymentAllocationDto,
  type PaymentDto,
  type PaymentMethod,
  type PaymentStatus,
  type UpdateChequeStatusInput,
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

  private async resolvePartyNames(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    partyType: string,
    partyId: number,
  ): Promise<{ partyName: string; partyNameUr: string | null }> {
    if (partyType === 'SUPPLIER') {
      const sup = await tx.supplier.findFirst({
        where: { id: partyId, organizationId },
        select: { name: true, nameUr: true },
      });
      if (sup) {
        return { partyName: sup.name, partyNameUr: sup.nameUr };
      }
    } else if (partyType === 'CLIENT') {
      const client = await tx.client.findFirst({
        where: { id: partyId, organizationId },
        select: { name: true, nameUr: true },
      });
      if (client) {
        return { partyName: client.name, partyNameUr: client.nameUr };
      }
    }
    return { partyName: `Party #${partyId}`, partyNameUr: null };
  }

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
      cheque?: { status: string } | null;
      allocations: {
        id: number;
        invoiceType: string;
        invoiceId: number;
        amount: Prisma.Decimal;
      }[];
    },
  ): Promise<PaymentDto> {
    const { partyName, partyNameUr } = await this.resolvePartyNames(
      tx,
      organizationId,
      payment.partyType,
      payment.partyId,
    );

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

    let allocatedSum = new Decimal(0);
    const allocations: PaymentAllocationDto[] = await Promise.all(
      payment.allocations.map(async (al) => {
        let invoiceNo: string | undefined;
        if (al.invoiceType === 'PURCHASE_INVOICE') {
          const inv = await tx.purchaseInvoice.findFirst({
            where: { id: al.invoiceId, organizationId },
            select: { invoiceNo: true },
          });
          invoiceNo = inv?.invoiceNo;
        } else if (al.invoiceType === 'SALE_INVOICE') {
          const inv = await tx.saleInvoice.findFirst({
            where: { id: al.invoiceId, organizationId },
            select: { invoiceNo: true },
          });
          invoiceNo = inv?.invoiceNo;
        }
        const alDec = new Decimal(al.amount.toString());
        allocatedSum = allocatedSum.plus(alDec);
        return {
          id: al.id,
          invoiceType: al.invoiceType,
          invoiceId: al.invoiceId,
          ...(invoiceNo ? { invoiceNo } : {}),
          amount: alDec.toFixed(2),
        };
      }),
    );

    const amountDec = new Decimal(payment.amount.toString());
    const unallocatedDec = Decimal.max(0, amountDec.minus(allocatedSum));

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
      amount: amountDec.toFixed(2),
      allocatedAmount: allocatedSum.toFixed(2),
      unallocatedAmount: unallocatedDec.toFixed(2),
      referenceNo: payment.referenceNo,
      bankName: payment.bankName,
      chequeDate: payment.chequeDate ? payment.chequeDate.toISOString() : null,
      status: payment.status as PaymentStatus,
      chequeStatus: (payment.cheque?.status as ChequeStatus | undefined) ?? null,
      notes: payment.notes,
      voidReason: payment.voidReason,
      voidedAt: payment.voidedAt ? payment.voidedAt.toISOString() : null,
      allocations,
      attachments,
      createdAt: payment.createdAt.toISOString(),
    };
  }

  async toChequeDto(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    cheque: {
      id: number;
      paymentId: number;
      direction: string;
      partyType: string;
      partyId: number;
      chequeNo: string;
      bankName: string;
      chequeDate: Date;
      amount: Prisma.Decimal;
      status: string;
      depositDate: Date | null;
      depositBank: string | null;
      clearedDate: Date | null;
      bouncedDate: Date | null;
      bounceReason: string | null;
      bounceFee: Prisma.Decimal;
      notes: string | null;
      createdAt: Date;
      payment: { paymentNo: string };
    },
  ): Promise<ChequeDto> {
    const { partyName, partyNameUr } = await this.resolvePartyNames(
      tx,
      organizationId,
      cheque.partyType,
      cheque.partyId,
    );

    const attachmentRows = await tx.attachment.findMany({
      where: {
        organizationId,
        ownerType: 'PAYMENT',
        ownerId: cheque.paymentId,
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

    return {
      id: cheque.id,
      paymentId: cheque.paymentId,
      paymentNo: cheque.payment.paymentNo,
      direction: cheque.direction as 'IN' | 'OUT',
      partyType: cheque.partyType as 'SUPPLIER' | 'CLIENT',
      partyId: cheque.partyId,
      partyName,
      partyNameUr,
      chequeNo: cheque.chequeNo,
      bankName: cheque.bankName,
      chequeDate: cheque.chequeDate.toISOString().slice(0, 10),
      amount: new Decimal(cheque.amount.toString()).toFixed(2),
      status: cheque.status as ChequeStatus,
      depositDate: cheque.depositDate ? cheque.depositDate.toISOString().slice(0, 10) : null,
      depositBank: cheque.depositBank,
      clearedDate: cheque.clearedDate ? cheque.clearedDate.toISOString().slice(0, 10) : null,
      bouncedDate: cheque.bouncedDate ? cheque.bouncedDate.toISOString().slice(0, 10) : null,
      bounceReason: cheque.bounceReason,
      bounceFee: new Decimal(cheque.bounceFee.toString()).toFixed(2),
      notes: cheque.notes,
      attachments,
      createdAt: cheque.createdAt.toISOString(),
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

    if (input.method === 'CHEQUE') {
      const chequeId = await nextId(tx, 'cheques');
      await tx.cheque.create({
        data: {
          id: chequeId,
          organizationId,
          paymentId,
          direction: 'OUT',
          partyType: 'SUPPLIER',
          partyId: supplier.id,
          chequeNo: input.referenceNo?.trim() || paymentNo,
          bankName: input.bankName?.trim() || 'Bank',
          chequeDate: input.chequeDate ? new Date(input.chequeDate) : paymentDate,
          amount: new Prisma.Decimal(amountDec.toFixed(2)),
          status: 'RECEIVED',
          notes: input.notes || null,
        },
      });
    }

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
      include: { allocations: true, cheque: true },
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

  /**
   * Internal transactional method for recording a Client Payment In (Receipt).
   * Enforces proof upload for non-cash methods, validates allocations against SaleInvoice,
   * creates a Cheque row when method === 'CHEQUE', and posts a CLIENT ledger credit.
   */
  async createClientPaymentInTx(
    tx: TxClient,
    organizationId: number,
    actorUserId: number,
    input: CreateClientPaymentInput,
  ): Promise<PaymentDto> {
    const client = await tx.client.findFirst({
      where: { id: input.clientId, organizationId },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const amountDec = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amountDec.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (
      input.method !== 'CASH' &&
      (!input.proofDataUrl || input.proofDataUrl.trim().length === 0)
    ) {
      throw new BadRequestException(
        'Proof upload (image or PDF) is mandatory for non-cash payments',
      );
    }

    if (input.method === 'CHEQUE') {
      if (!input.referenceNo?.trim() || !input.bankName?.trim() || !input.chequeDate?.trim()) {
        throw new BadRequestException(
          'Cheque number, bank name, and cheque date are required for cheque payments',
        );
      }
    }

    // Validate allocations against open SaleInvoices
    let allocatedSum = new Decimal(0);
    for (const al of input.allocations) {
      const alAmount = new Decimal(al.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      allocatedSum = allocatedSum.plus(alAmount);

      if (al.invoiceType !== 'SALE_INVOICE') {
        throw new BadRequestException('Client payment can only be allocated to SALE_INVOICE');
      }

      const sale = await tx.saleInvoice.findFirst({
        where: { id: al.invoiceId, organizationId, clientId: client.id },
      });
      if (!sale) {
        throw new BadRequestException(`Sale invoice #${al.invoiceId} not found for client`);
      }
      if (sale.status === 'VOIDED') {
        throw new BadRequestException(
          `Cannot allocate payment to voided invoice ${sale.invoiceNo}`,
        );
      }
      const netTotal = new Decimal(sale.total.toString()).minus(
        new Decimal(sale.returnedAmount.toString()),
      );
      const currentPaid = new Decimal(sale.paidAmount.toString());
      const remaining = Decimal.max(0, netTotal.minus(currentPaid));
      if (alAmount.gt(remaining)) {
        throw new BadRequestException(
          `Allocation ${alAmount.toFixed(2)} exceeds remaining balance ${remaining.toFixed(2)} on invoice ${sale.invoiceNo}`,
        );
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
      'PAYMENT_IN',
      paymentDate,
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
        paymentDate,
        method: input.method,
        amount: new Prisma.Decimal(amountDec.toFixed(2)),
        referenceNo: input.referenceNo?.trim() || null,
        bankName: input.bankName?.trim() || null,
        chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
        status: 'POSTED',
        notes: input.notes?.trim() || null,
        createdById: actorUserId,
      },
    });

    if (input.method === 'CHEQUE') {
      const chequeId = await nextId(tx, 'cheques');
      await tx.cheque.create({
        data: {
          id: chequeId,
          organizationId,
          paymentId,
          direction: 'IN',
          partyType: 'CLIENT',
          partyId: client.id,
          chequeNo: input.referenceNo!.trim(),
          bankName: input.bankName!.trim(),
          chequeDate: new Date(input.chequeDate!),
          amount: new Prisma.Decimal(amountDec.toFixed(2)),
          status: 'RECEIVED',
          notes: input.notes?.trim() || null,
        },
      });
    }

    // Save allocations and update SaleInvoice paidAmount + status
    for (const al of input.allocations) {
      const alAmount = new Decimal(al.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const allocationId = await nextId(tx, 'payment_allocations');
      await tx.paymentAllocation.create({
        data: {
          id: allocationId,
          paymentId,
          invoiceType: 'SALE_INVOICE',
          invoiceId: al.invoiceId,
          amount: new Prisma.Decimal(alAmount.toFixed(2)),
        },
      });

      const sale = await tx.saleInvoice.findUniqueOrThrow({ where: { id: al.invoiceId } });
      const nextPaid = new Decimal(sale.paidAmount.toString()).plus(alAmount);
      const netTotal = new Decimal(sale.total.toString()).minus(
        new Decimal(sale.returnedAmount.toString()),
      );
      const nextStatus =
        nextPaid.gte(netTotal) && netTotal.gt(0) ? 'PAID' : nextPaid.gt(0) ? 'PARTIAL' : 'POSTED';
      await tx.saleInvoice.update({
        where: { id: sale.id },
        data: {
          paidAmount: new Prisma.Decimal(nextPaid.toFixed(2)),
          status: nextStatus,
        },
      });
    }

    // Proof attachment
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

    // Post Client Ledger Credit (reduces receivable owed by client)
    await this.ledger.postEntry(tx, {
      organizationId,
      partyType: 'CLIENT',
      partyId: client.id,
      entryDate: paymentDate,
      refType: 'PAYMENT_IN',
      refId: paymentId,
      refNo: paymentNo,
      debit: '0.00',
      credit: amountDec.toFixed(2),
      narration: `Receipt ${paymentNo} (${input.method})${input.referenceNo ? ` Ref: ${input.referenceNo}` : ''}`,
      createdById: actorUserId,
    });

    await this.audit.log(tx, {
      organizationId,
      userId: actorUserId,
      action: 'CREATE',
      entity: 'payment_in',
      entityId: paymentId,
      afterJson: {
        paymentNo,
        clientId: client.id,
        method: input.method,
        amount: amountDec.toFixed(2),
        allocatedAmount: allocatedSum.toFixed(2),
      },
    });

    const created = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { allocations: true, cheque: true },
    });

    return this.toPaymentDto(tx, organizationId, created);
  }

  async createClientPayment(
    organizationId: number,
    actorUserId: number,
    input: CreateClientPaymentInput,
  ): Promise<PaymentDto> {
    return inTransaction(this.prisma, (tx) =>
      this.createClientPaymentInTx(tx, organizationId, actorUserId, input),
    );
  }

  private async reverseAllocationsInTx(
    tx: TxClient,
    allocations: { invoiceType: string; invoiceId: number; amount: Prisma.Decimal }[],
  ): Promise<void> {
    for (const al of allocations) {
      const alDec = new Decimal(al.amount.toString());
      if (al.invoiceType === 'PURCHASE_INVOICE') {
        const inv = await tx.purchaseInvoice.findUnique({ where: { id: al.invoiceId } });
        if (inv && inv.status !== 'VOIDED') {
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
      } else if (al.invoiceType === 'SALE_INVOICE') {
        const sale = await tx.saleInvoice.findUnique({ where: { id: al.invoiceId } });
        if (sale && sale.status !== 'VOIDED') {
          const nextPaid = Decimal.max(0, new Decimal(sale.paidAmount.toString()).minus(alDec));
          const netTotal = new Decimal(sale.total.toString()).minus(
            new Decimal(sale.returnedAmount.toString()),
          );
          const nextStatus =
            nextPaid.gte(netTotal) && netTotal.gt(0)
              ? 'PAID'
              : nextPaid.gt(0)
                ? 'PARTIAL'
                : 'POSTED';
          await tx.saleInvoice.update({
            where: { id: sale.id },
            data: {
              paidAmount: new Prisma.Decimal(nextPaid.toFixed(2)),
              status: nextStatus,
            },
          });
        }
      }
    }
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
        include: { allocations: true, cheque: true },
      });
      if (!existing) {
        throw new NotFoundException('Payment not found');
      }
      if (existing.status === 'VOIDED') {
        throw new BadRequestException('Payment is already voided');
      }
      if (existing.status === 'BOUNCED') {
        throw new BadRequestException('Cannot void a payment whose cheque has already bounced');
      }

      // Reverse allocations on purchase or sale invoices
      await this.reverseAllocationsInTx(tx, existing.allocations);

      if (existing.cheque) {
        await tx.cheque.update({
          where: { id: existing.cheque.id },
          data: {
            status: 'VOIDED',
            notes: `Parent payment voided: ${input.reason}`,
          },
        });
      }

      const updated = await tx.payment.update({
        where: { id: existing.id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: actorUserId,
        },
        include: { allocations: true, cheque: true },
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
      } else if (existing.partyType === 'CLIENT' && existing.direction === 'IN') {
        // Reversal of a client Payment In credit is a debit
        await this.ledger.postEntry(tx, {
          organizationId,
          partyType: 'CLIENT',
          partyId: existing.partyId,
          entryDate: new Date(),
          refType: 'PAYMENT_VOID',
          refId: existing.id,
          refNo: existing.paymentNo,
          debit: amountDec,
          credit: '0.00',
          narration: `Voided Receipt ${existing.paymentNo}: ${input.reason}`,
          createdById: actorUserId,
        });
      }

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CANCEL',
        entity: existing.direction === 'IN' ? 'payment_in' : 'payment_out',
        entityId: existing.id,
        beforeJson: { status: existing.status, amount: amountDec },
        afterJson: { status: 'VOIDED', voidReason: input.reason },
      });

      return this.toPaymentDto(tx, organizationId, updated);
    });
  }

  /**
   * Transitions a cheque through its lifecycle:
   * RECEIVED -> DEPOSITED -> CLEARED | BOUNCED.
   * When marked BOUNCED:
   * - Reverses any invoice allocations on the parent payment
   * - Marks the parent payment status as BOUNCED
   * - Posts a CHEQUE_BOUNCE reversal entry in the party's ledger (+ optional bounceFee debit for clients)
   */
  async updateChequeStatus(
    organizationId: number,
    actorUserId: number,
    chequeId: number,
    input: UpdateChequeStatusInput,
  ): Promise<ChequeDto> {
    return inTransaction(this.prisma, async (tx) => {
      const cheque = await tx.cheque.findFirst({
        where: { id: chequeId, organizationId },
        include: {
          payment: {
            include: { allocations: true },
          },
        },
      });

      if (!cheque) {
        throw new NotFoundException('Cheque not found');
      }

      if (cheque.status === 'VOIDED') {
        throw new BadRequestException('Cannot update status of a voided cheque');
      }
      if (cheque.status === 'BOUNCED') {
        throw new BadRequestException('Cheque is already marked as bounced');
      }
      if (cheque.status === 'CLEARED') {
        throw new BadRequestException('Cheque is already cleared and cannot be changed');
      }

      if (input.status === 'DEPOSITED' && cheque.status !== 'RECEIVED') {
        throw new BadRequestException(
          `Only RECEIVED cheques can be marked DEPOSITED (current: ${cheque.status})`,
        );
      }

      const previousStatus = cheque.status;
      const bounceFeeDec = new Decimal(input.bounceFee || '0').toDecimalPlaces(
        2,
        Decimal.ROUND_HALF_UP,
      );

      if (input.status === 'DEPOSITED') {
        await tx.cheque.update({
          where: { id: cheque.id },
          data: {
            status: 'DEPOSITED',
            depositDate: new Date(input.depositDate!),
            depositBank: input.depositBank?.trim() || null,
            notes: input.notes?.trim() || cheque.notes,
          },
        });
      } else if (input.status === 'CLEARED') {
        const clearedDate = new Date(input.clearedDate!);
        await tx.cheque.update({
          where: { id: cheque.id },
          data: {
            status: 'CLEARED',
            depositDate: cheque.depositDate ?? clearedDate,
            clearedDate,
            notes: input.notes?.trim() || cheque.notes,
          },
        });
      } else if (input.status === 'BOUNCED') {
        const bouncedDate = new Date(input.bouncedDate!);
        const bounceReason = input.bounceReason!.trim();

        // 1. Reverse invoice allocations so open balance returns on invoices
        await this.reverseAllocationsInTx(tx, cheque.payment.allocations);

        // 2. Mark parent payment as BOUNCED
        await tx.payment.update({
          where: { id: cheque.paymentId },
          data: {
            status: 'BOUNCED',
            voidReason: `Cheque #${cheque.chequeNo} bounced: ${bounceReason}`,
          },
        });

        // 3. Update cheque record
        await tx.cheque.update({
          where: { id: cheque.id },
          data: {
            status: 'BOUNCED',
            bouncedDate,
            bounceReason,
            bounceFee: new Prisma.Decimal(bounceFeeDec.toFixed(2)),
            notes: input.notes?.trim() || cheque.notes,
          },
        });

        const amountDec = new Decimal(cheque.amount.toString());

        // 4. Post append-only ledger reversal entry
        if (cheque.partyType === 'CLIENT' && cheque.direction === 'IN') {
          await this.ledger.postEntry(tx, {
            organizationId,
            partyType: 'CLIENT',
            partyId: cheque.partyId,
            entryDate: bouncedDate,
            refType: 'CHEQUE_BOUNCE',
            refId: cheque.id,
            refNo: cheque.chequeNo,
            debit: amountDec.toFixed(2),
            credit: '0.00',
            narration: `Bounced Cheque #${cheque.chequeNo} (${cheque.bankName}) on Receipt ${cheque.payment.paymentNo}: ${bounceReason}`,
            createdById: actorUserId,
          });

          if (bounceFeeDec.gt(0)) {
            await this.ledger.postEntry(tx, {
              organizationId,
              partyType: 'CLIENT',
              partyId: cheque.partyId,
              entryDate: bouncedDate,
              refType: 'CHEQUE_BOUNCE_FEE',
              refId: cheque.id,
              refNo: cheque.chequeNo,
              debit: bounceFeeDec.toFixed(2),
              credit: '0.00',
              narration: `Cheque bounce penalty fee for Cheque #${cheque.chequeNo}`,
              createdById: actorUserId,
            });
          }
        } else if (cheque.partyType === 'SUPPLIER' && cheque.direction === 'OUT') {
          await this.ledger.postEntry(tx, {
            organizationId,
            partyType: 'SUPPLIER',
            partyId: cheque.partyId,
            entryDate: bouncedDate,
            refType: 'CHEQUE_BOUNCE',
            refId: cheque.id,
            refNo: cheque.chequeNo,
            debit: '0.00',
            credit: amountDec.toFixed(2),
            narration: `Bounced Cheque #${cheque.chequeNo} (${cheque.bankName}) on Payment ${cheque.payment.paymentNo}: ${bounceReason}`,
            createdById: actorUserId,
          });
        }
      }

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'UPDATE',
        entity: 'cheque',
        entityId: cheque.id,
        beforeJson: { status: previousStatus },
        afterJson: {
          status: input.status,
          bounceReason: input.bounceReason ?? null,
          bounceFee: bounceFeeDec.toFixed(2),
        },
      });

      const updated = await tx.cheque.findUniqueOrThrow({
        where: { id: cheque.id },
        include: { payment: { select: { paymentNo: true } } },
      });

      return this.toChequeDto(tx, organizationId, updated);
    });
  }

  async listCheques(
    organizationId: number,
    query: ListChequesQuery,
  ): Promise<PaginatedResponse<ChequeDto>> {
    const where: Prisma.ChequeWhereInput = { organizationId };

    if (query.direction) where.direction = query.direction;
    if (query.partyType) where.partyType = query.partyType;
    if (query.partyId) where.partyId = query.partyId;
    if (query.status) where.status = query.status;

    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
      where.chequeDate = dateFilter;
    }

    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { chequeNo: { contains: q, mode: 'insensitive' } },
        { bankName: { contains: q, mode: 'insensitive' } },
        { payment: { paymentNo: { contains: q, mode: 'insensitive' } } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set(['id', 'chequeNo', 'chequeDate', 'amount', 'createdAt']);
    const sortField =
      query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'chequeDate';
    const orderBy: Prisma.ChequeOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.cheque.count({ where }),
      this.prisma.cheque.findMany({
        where,
        include: { payment: { select: { paymentNo: true } } },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    const data = await Promise.all(
      rows.map((r) => this.toChequeDto(this.prisma, organizationId, r)),
    );

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
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
        include: { allocations: true, cheque: true },
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
      include: { allocations: true, cheque: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toPaymentDto(this.prisma, organizationId, payment);
  }
}
