import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChallanDto,
  ChallanStatus,
  CreateChallanInput,
  ListChallansQuery,
  PaginatedResponse,
  PrintTrackResultDto,
  TrackPrintInput,
  UpdateChallanStatusInput,
} from '@mini-erp/shared';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';
import { NumberingService } from '../numbering/numbering.module.js';

type ChallanWithRelations = Prisma.ChallanGetPayload<{
  include: {
    sale: {
      include: {
        client: true;
        route: true;
        items: {
          include: {
            item: true;
            batch: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class ChallansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  private toDto(row: ChallanWithRelations): ChallanDto {
    return {
      id: row.id,
      challanNo: row.challanNo,
      saleId: row.saleId,
      invoiceNo: row.sale.invoiceNo,
      challanDate: row.challanDate.toISOString().slice(0, 10),
      clientId: row.sale.clientId,
      clientName: row.sale.client.name,
      clientNameUr: row.sale.client.nameUr,
      clientPhone: row.sale.client.phone,
      clientAddress: row.sale.client.address,
      routeName: row.sale.route?.name ?? null,
      riderName: row.riderName,
      vehicleNo: row.vehicleNo,
      status: row.status as ChallanStatus,
      dispatchedAt: row.dispatchedAt ? row.dispatchedAt.toISOString() : null,
      deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      receivedBy: row.receivedBy,
      notes: row.notes,
      printCount: row.printCount,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt.toISOString(),
      items: row.sale.items.map((item) => ({
        id: item.id,
        itemId: item.itemId,
        itemName:
          item.batch?.name ||
          (item.batch ? `Batch ${item.batch.batchNo}` : (item.item?.name ?? 'Raw Item')),
        itemNameUr: item.item?.nameUr ?? null,
        batchId: item.batchId,
        batchNo: item.batch?.batchNo ?? null,
        batchName: item.batch?.name ?? null,
        enteredQty: new Decimal(item.enteredQty.toString()).toFixed(3),
        enteredUnit: item.enteredUnit,
        bagCount: item.bagCount,
        qtyBase: new Decimal(item.qtyBase.toString()).toFixed(3),
        notes: item.notes,
      })),
    };
  }

  async listChallans(
    organizationId: number,
    query: ListChallansQuery,
  ): Promise<PaginatedResponse<ChallanDto>> {
    const where: Prisma.ChallanWhereInput = { organizationId };

    if (query.status) {
      where.status = query.status;
    }
    if (query.saleId) {
      where.saleId = query.saleId;
    }
    if (query.dateFrom || query.dateTo) {
      where.challanDate = {
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { challanNo: { contains: q, mode: 'insensitive' } },
        { riderName: { contains: q, mode: 'insensitive' } },
        { vehicleNo: { contains: q, mode: 'insensitive' } },
        { sale: { invoiceNo: { contains: q, mode: 'insensitive' } } },
        { sale: { client: { name: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.challan.findMany({
        where,
        include: {
          sale: {
            include: {
              client: true,
              route: true,
              items: {
                include: { item: true, batch: true },
                orderBy: { id: 'asc' },
              },
            },
          },
        },
        orderBy: [{ challanDate: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.challan.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getChallan(organizationId: number, id: number): Promise<ChallanDto> {
    const row = await this.prisma.challan.findFirst({
      where: { id, organizationId },
      include: {
        sale: {
          include: {
            client: true,
            route: true,
            items: {
              include: { item: true, batch: true },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(`Challan #${id} not found`);
    }
    return this.toDto(row);
  }

  async createChallan(
    organizationId: number,
    userId: number,
    input: CreateChallanInput,
  ): Promise<ChallanDto> {
    const challanId = await inTransaction(this.prisma, async (tx) => {
      const sale = await tx.saleInvoice.findFirst({
        where: { id: input.saleId, organizationId },
      });
      if (!sale) {
        throw new NotFoundException(`Sale Invoice #${input.saleId} not found`);
      }
      if (sale.status === 'VOIDED') {
        throw new BadRequestException('Cannot create a delivery challan for a voided invoice');
      }

      // If an active (non-cancelled) challan already exists for this invoice, return it idempotently
      const existingChallan = await tx.challan.findFirst({
        where: {
          organizationId,
          saleId: sale.id,
          status: { not: 'CANCELLED' },
        },
      });
      if (existingChallan) {
        return existingChallan.id;
      }

      const challanDate = new Date(`${input.challanDate}T00:00:00.000Z`);
      const challanNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'CHALLAN',
        challanDate,
      );
      const id = await nextId(tx, 'challans');

      const created = await tx.challan.create({
        data: {
          id,
          organizationId,
          challanNo,
          saleId: sale.id,
          challanDate,
          riderName: input.riderName ?? null,
          vehicleNo: input.vehicleNo ?? null,
          status: 'PENDING',
          notes: input.notes ?? null,
          createdById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'Challan',
        entityId: created.id,
        afterJson: {
          challanNo,
          saleId: sale.id,
          riderName: created.riderName,
          vehicleNo: created.vehicleNo,
          status: created.status,
        },
      });

      return created.id;
    });

    return this.getChallan(organizationId, challanId);
  }

  async updateChallanStatus(
    organizationId: number,
    userId: number,
    id: number,
    input: UpdateChallanStatusInput,
  ): Promise<ChallanDto> {
    await inTransaction(this.prisma, async (tx) => {
      const existing = await tx.challan.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        throw new NotFoundException(`Challan #${id} not found`);
      }
      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('Cannot update a cancelled challan');
      }
      if (input.status === 'CANCELLED' && !input.cancelReason?.trim()) {
        throw new BadRequestException('Cancel reason is required when cancelling a challan');
      }

      const now = new Date();
      const updated = await tx.challan.update({
        where: { id },
        data: {
          status: input.status,
          dispatchedAt:
            input.status === 'DISPATCHED' && !existing.dispatchedAt ? now : existing.dispatchedAt,
          deliveredAt: input.status === 'DELIVERED' ? now : existing.deliveredAt,
          receivedBy: input.receivedBy !== undefined ? input.receivedBy : existing.receivedBy,
          cancelReason: input.status === 'CANCELLED' ? (input.cancelReason ?? null) : null,
          notes: input.notes !== undefined ? input.notes : existing.notes,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: input.status === 'CANCELLED' ? 'CANCEL' : 'UPDATE',
        entity: 'Challan',
        entityId: id,
        beforeJson: { status: existing.status },
        afterJson: {
          status: updated.status,
          receivedBy: updated.receivedBy,
          cancelReason: updated.cancelReason,
        },
      });
    });

    return this.getChallan(organizationId, id);
  }

  async trackPrint(
    organizationId: number,
    userId: number,
    input: TrackPrintInput,
  ): Promise<PrintTrackResultDto> {
    return inTransaction(this.prisma, async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId } });
      if (!org) {
        throw new NotFoundException('Organization not found');
      }

      let printCount = 1;
      let clientId: number | null = null;
      let invoiceTotal = new Decimal(0);
      let invoicePaid = new Decimal(0);

      if (input.docType === 'SALE_INVOICE') {
        const inv = await tx.saleInvoice.findFirst({
          where: { id: input.docId, organizationId },
        });
        if (!inv) throw new NotFoundException(`Sale Invoice #${input.docId} not found`);
        const updated = await tx.saleInvoice.update({
          where: { id: inv.id },
          data: { printCount: inv.printCount + 1 },
        });
        printCount = updated.printCount;
        clientId = inv.clientId;
        invoiceTotal = new Decimal(inv.total.toString());
        invoicePaid = new Decimal(inv.paidAmount.toString());
      } else if (input.docType === 'CHALLAN') {
        const ch = await tx.challan.findFirst({
          where: { id: input.docId, organizationId },
          include: { sale: true },
        });
        if (!ch) throw new NotFoundException(`Challan #${input.docId} not found`);
        const updated = await tx.challan.update({
          where: { id: ch.id },
          data: { printCount: ch.printCount + 1 },
        });
        printCount = updated.printCount;
        clientId = ch.sale.clientId;
      } else if (input.docType === 'PAYMENT_IN') {
        const pay = await tx.payment.findFirst({
          where: { id: input.docId, organizationId },
        });
        if (!pay) throw new NotFoundException(`Payment #${input.docId} not found`);
        const updated = await tx.payment.update({
          where: { id: pay.id },
          data: { printCount: pay.printCount + 1 },
        });
        printCount = updated.printCount;
        if (pay.partyType === 'CLIENT') {
          clientId = pay.partyId;
        }
      } else if (input.docType === 'SALE_RETURN') {
        const ret = await tx.saleReturn.findFirst({
          where: { id: input.docId, organizationId },
        });
        if (!ret) throw new NotFoundException(`Sale Return #${input.docId} not found`);
        const updated = await tx.saleReturn.update({
          where: { id: ret.id },
          data: { printCount: ret.printCount + 1 },
        });
        printCount = updated.printCount;
        clientId = ret.clientId;
      }

      let currentBalanceDec = new Decimal(0);
      let previousBalanceDec = new Decimal(0);

      if (clientId !== null) {
        const balStr = await this.ledger.getPartyBalance(tx, organizationId, 'CLIENT', clientId);
        currentBalanceDec = new Decimal(balStr);
        if (input.docType === 'SALE_INVOICE') {
          const netEffectOfInvoice = invoiceTotal.minus(invoicePaid);
          previousBalanceDec = currentBalanceDec.minus(netEffectOfInvoice);
        } else {
          previousBalanceDec = currentBalanceDec;
        }
      }

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'UPDATE',
        entity: input.docType,
        entityId: input.docId,
        afterJson: { printCount, isDuplicate: printCount > 1 },
      });

      return {
        docType: input.docType,
        docId: input.docId,
        printCount,
        isDuplicate: printCount > 1,
        previousBalance: previousBalanceDec.toFixed(2),
        currentBalance: currentBalanceDec.toFixed(2),
        organization: {
          name: org.name,
          nameUr: org.nameUr,
          address: org.address,
          phone: org.phone,
          taxNo: org.taxNo,
          currency: org.currency,
        },
      };
    });
  }
}
