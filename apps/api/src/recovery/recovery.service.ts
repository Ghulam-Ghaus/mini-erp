import {
  type ClientAgingRowDto,
  type CreateRecoveryEntryInput,
  type ListRecoveryEntriesQuery,
  type PaginatedResponse,
  type PaymentMethod,
  type RecoveryAgingQuery,
  type RecoveryAgingSummaryDto,
  type RecoveryDueClientDto,
  type RecoveryEntryDto,
  type RecoveryOutcome,
  type TodaysRecoveryQuery,
  type TodaysRecoveryResponse,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';
import { PaymentsService } from '../payments/payments.service.js';

const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
  ) {}

  private getWeekdayName(dateStr: string): string {
    const dt = new Date(`${dateStr}T00:00:00.000Z`);
    return WEEKDAY_NAMES[dt.getUTCDay()] ?? 'MONDAY';
  }

  private toRecoveryEntryDto(row: {
    id: number;
    clientId: number;
    routeId: number | null;
    officerId: number;
    visitDate: Date;
    outcome: string;
    amount: Prisma.Decimal;
    method: string | null;
    paymentId: number | null;
    nextPromisedDate: Date | null;
    promisedAmount: Prisma.Decimal | null;
    remarks: string | null;
    createdAt: Date;
    client: { name: string; nameUr: string | null };
    route: { name: string } | null;
    officer: { firstName: string; lastName: string };
    payment: { paymentNo: string } | null;
  }): RecoveryEntryDto {
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.name,
      clientNameUr: row.client.nameUr,
      routeId: row.routeId,
      routeName: row.route?.name ?? null,
      officerId: row.officerId,
      officerName: `${row.officer.firstName} ${row.officer.lastName}`.trim(),
      visitDate: row.visitDate.toISOString().slice(0, 10),
      outcome: row.outcome as RecoveryOutcome,
      amount: new Decimal(row.amount.toString()).toFixed(2),
      method: (row.method as PaymentMethod | null) ?? null,
      paymentId: row.paymentId,
      paymentNo: row.payment?.paymentNo ?? null,
      nextPromisedDate: row.nextPromisedDate
        ? row.nextPromisedDate.toISOString().slice(0, 10)
        : null,
      promisedAmount: row.promisedAmount
        ? new Decimal(row.promisedAmount.toString()).toFixed(2)
        : null,
      remarks: row.remarks,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Returns Today's Recovery Queue (Officer Daily Screen):
   * Active clients with positive receivable balance who are either:
   * - Scheduled for the target recoveryDay (or DAILY), OR
   * - Have a promisedDate <= targetDate.
   */
  async getTodaysRecovery(
    organizationId: number,
    query: TodaysRecoveryQuery,
  ): Promise<TodaysRecoveryResponse> {
    const targetDateStr = query.targetDate || new Date().toISOString().slice(0, 10);
    const targetDate = new Date(`${targetDateStr}T23:59:59.999Z`);
    const weekday = query.recoveryDay || this.getWeekdayName(targetDateStr);

    const clientWhere: Prisma.ClientWhereInput = {
      organizationId,
      isActive: true,
    };
    if (query.routeId) {
      clientWhere.routeId = query.routeId;
    }
    if (query.officerId) {
      clientWhere.route = { assignedOfficerId: query.officerId };
    }
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      clientWhere.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameUr: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const clients = await this.prisma.client.findMany({
      where: clientWhere,
      include: {
        route: {
          include: {
            assignedOfficer: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const dueItems: RecoveryDueClientDto[] = [];
    let totalReceivableDue = new Decimal(0);

    for (const client of clients) {
      const balanceStr = await this.ledger.getPartyBalance(
        this.prisma as unknown as TxClient,
        organizationId,
        'CLIENT',
        client.id,
      );
      const balanceDec = new Decimal(balanceStr);

      if (balanceDec.lte(0)) {
        continue;
      }

      const promisedDateStr = client.promisedDate
        ? client.promisedDate.toISOString().slice(0, 10)
        : null;
      const isPromisedDue = Boolean(promisedDateStr && promisedDateStr <= targetDateStr);
      const isOverduePromise = Boolean(promisedDateStr && promisedDateStr < targetDateStr);
      const isScheduledDay =
        client.recoveryDay === weekday ||
        client.recoveryDay === 'DAILY' ||
        Boolean(query.recoveryDay && client.recoveryDay === query.recoveryDay);

      if (!isScheduledDay && !isPromisedDue) {
        continue;
      }

      const dueReason: 'SCHEDULED_DAY' | 'PROMISED_DUE' | 'OVERDUE_PROMISE' = isOverduePromise
        ? 'OVERDUE_PROMISE'
        : isPromisedDue
          ? 'PROMISED_DUE'
          : 'SCHEDULED_DAY';

      // Oldest unpaid invoice age
      const oldestOpenInvoice = await this.prisma.saleInvoice.findFirst({
        where: {
          organizationId,
          clientId: client.id,
          status: { in: ['POSTED', 'PARTIAL'] },
        },
        orderBy: { saleDate: 'asc' },
        select: { saleDate: true },
      });

      const oldestInvoiceDays = oldestOpenInvoice
        ? Math.max(
            0,
            Math.floor(
              (targetDate.getTime() - oldestOpenInvoice.saleDate.getTime()) / (1000 * 60 * 60 * 24),
            ),
          )
        : 0;

      // Last payment received
      const lastPayment = await this.prisma.payment.findFirst({
        where: {
          organizationId,
          partyType: 'CLIENT',
          partyId: client.id,
          direction: 'IN',
          status: 'POSTED',
        },
        orderBy: { paymentDate: 'desc' },
        select: { paymentDate: true, amount: true },
      });

      // Last recovery visit
      const lastVisit = await this.prisma.recoveryEntry.findFirst({
        where: {
          organizationId,
          clientId: client.id,
        },
        orderBy: { id: 'desc' },
        select: { visitDate: true, outcome: true, remarks: true },
      });

      const creditLimitDec = new Decimal(client.creditLimit.toString());
      totalReceivableDue = totalReceivableDue.plus(balanceDec);

      dueItems.push({
        clientId: client.id,
        clientCode: client.code,
        clientName: client.name,
        clientNameUr: client.nameUr,
        phone: client.phone,
        routeId: client.routeId,
        routeName: client.route?.name ?? null,
        assignedOfficerId: client.route?.assignedOfficer?.id ?? null,
        assignedOfficerName: client.route?.assignedOfficer
          ? `${client.route.assignedOfficer.firstName} ${client.route.assignedOfficer.lastName}`.trim()
          : null,
        recoveryDay: client.recoveryDay,
        currentBalance: balanceDec.toFixed(2),
        creditLimit: creditLimitDec.toFixed(2),
        isOverCreditLimit: creditLimitDec.gt(0) && balanceDec.gt(creditLimitDec),
        dueReason,
        promisedDate: promisedDateStr,
        promisedAmount: client.promisedAmount
          ? new Decimal(client.promisedAmount.toString()).toFixed(2)
          : null,
        oldestInvoiceDays,
        lastPaymentDate: lastPayment ? lastPayment.paymentDate.toISOString().slice(0, 10) : null,
        lastPaymentAmount: lastPayment
          ? new Decimal(lastPayment.amount.toString()).toFixed(2)
          : null,
        lastVisitDate: lastVisit ? lastVisit.visitDate.toISOString().slice(0, 10) : null,
        lastVisitOutcome: (lastVisit?.outcome as RecoveryOutcome | undefined) ?? null,
        lastVisitRemarks: lastVisit?.remarks ?? null,
      });
    }

    // Compute today's collection & promise KPIs
    const startOfDay = new Date(`${targetDateStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${targetDateStr}T23:59:59.999Z`);
    const todaysEntries = await this.prisma.recoveryEntry.findMany({
      where: {
        organizationId,
        visitDate: { gte: startOfDay, lte: endOfDay },
      },
      select: { outcome: true, amount: true },
    });

    let collectedTodayTotal = new Decimal(0);
    let promisedTodayCount = 0;
    for (const e of todaysEntries) {
      if (e.outcome === 'COLLECTED' || e.outcome === 'PARTIAL') {
        collectedTodayTotal = collectedTodayTotal.plus(new Decimal(e.amount.toString()));
      }
      if (e.outcome === 'PROMISED') {
        promisedTodayCount += 1;
      }
    }

    return {
      targetDate: targetDateStr,
      weekday,
      totalReceivableDue: totalReceivableDue.toFixed(2),
      clientsDueCount: dueItems.length,
      collectedTodayTotal: collectedTodayTotal.toFixed(2),
      promisedTodayCount,
      items: dueItems,
    };
  }

  /**
   * Records a Recovery Entry (visit / collection).
   * If outcome is COLLECTED or PARTIAL:
   * - Auto-allocates against oldest unpaid SaleInvoices if explicit allocations are not provided
   * - Creates a linked Payment In (`RCP-YYYY-NNNN`) via PaymentsService.createClientPaymentInTx
   * - Updates Client promisedDate / promisedAmount
   */
  async createRecoveryEntry(
    organizationId: number,
    actorUserId: number,
    input: CreateRecoveryEntryInput,
  ): Promise<RecoveryEntryDto> {
    return inTransaction(this.prisma, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: input.clientId, organizationId },
      });
      if (!client) {
        throw new NotFoundException('Client not found');
      }

      const amountDec = new Decimal(input.amount || '0').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const isMoneyCollected = input.outcome === 'COLLECTED' || input.outcome === 'PARTIAL';

      let createdPaymentId: number | null = null;

      if (isMoneyCollected) {
        if (amountDec.lte(0) || !input.method) {
          throw new BadRequestException(
            'Positive amount and payment method are required when outcome is COLLECTED or PARTIAL',
          );
        }

        // Auto-allocate FIFO against oldest open SaleInvoices if caller did not specify allocations
        let allocations = input.allocations;
        if (allocations.length === 0) {
          const openInvoices = await tx.saleInvoice.findMany({
            where: {
              organizationId,
              clientId: client.id,
              status: { in: ['POSTED', 'PARTIAL'] },
            },
            orderBy: [{ saleDate: 'asc' }, { id: 'asc' }],
          });

          let remainingToAllocate = amountDec;
          const autoAllocs: {
            invoiceType: 'SALE_INVOICE';
            invoiceId: number;
            amount: string;
          }[] = [];

          for (const inv of openInvoices) {
            if (remainingToAllocate.lte(0)) break;
            const netTotal = new Decimal(inv.total.toString()).minus(
              new Decimal(inv.returnedAmount.toString()),
            );
            const currentPaid = new Decimal(inv.paidAmount.toString());
            const openDue = Decimal.max(0, netTotal.minus(currentPaid));
            if (openDue.lte(0)) continue;

            const allocAmt = Decimal.min(remainingToAllocate, openDue);
            autoAllocs.push({
              invoiceType: 'SALE_INVOICE',
              invoiceId: inv.id,
              amount: allocAmt.toFixed(2),
            });
            remainingToAllocate = remainingToAllocate.minus(allocAmt);
          }
          allocations = autoAllocs;
        }

        const paymentDto = await this.payments.createClientPaymentInTx(
          tx,
          organizationId,
          actorUserId,
          {
            clientId: client.id,
            paymentDate: input.visitDate,
            method: input.method,
            amount: amountDec.toFixed(2),
            referenceNo: input.referenceNo,
            bankName: input.bankName,
            chequeDate: input.chequeDate,
            proofDataUrl: input.proofDataUrl,
            proofFileName: input.proofFileName,
            notes: input.remarks
              ? `Recovery (${input.outcome}): ${input.remarks}`
              : `Recovery collection (${input.outcome})`,
            allocations,
          },
        );
        createdPaymentId = paymentDto.id;
      }

      // Update client promisedDate & promisedAmount
      const nextPromisedDate = input.nextPromisedDate
        ? new Date(`${input.nextPromisedDate}T00:00:00.000Z`)
        : input.outcome === 'COLLECTED'
          ? null
          : client.promisedDate;

      const nextPromisedAmount = input.promisedAmount
        ? new Prisma.Decimal(new Decimal(input.promisedAmount).toFixed(2))
        : input.outcome === 'COLLECTED'
          ? null
          : client.promisedAmount;

      await tx.client.update({
        where: { id: client.id },
        data: {
          promisedDate: nextPromisedDate,
          promisedAmount: nextPromisedAmount,
        },
      });

      const entryId = await nextId(tx, 'recovery_entries');
      await tx.recoveryEntry.create({
        data: {
          id: entryId,
          organizationId,
          clientId: client.id,
          routeId: client.routeId,
          officerId: actorUserId,
          visitDate: new Date(`${input.visitDate}T00:00:00.000Z`),
          outcome: input.outcome,
          amount: new Prisma.Decimal(isMoneyCollected ? amountDec.toFixed(2) : '0.00'),
          method: isMoneyCollected ? input.method! : null,
          paymentId: createdPaymentId,
          nextPromisedDate: input.nextPromisedDate
            ? new Date(`${input.nextPromisedDate}T00:00:00.000Z`)
            : null,
          promisedAmount: input.promisedAmount
            ? new Prisma.Decimal(new Decimal(input.promisedAmount).toFixed(2))
            : null,
          remarks: input.remarks?.trim() || null,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'recovery_entry',
        entityId: entryId,
        afterJson: {
          clientId: client.id,
          outcome: input.outcome,
          amount: isMoneyCollected ? amountDec.toFixed(2) : '0.00',
          paymentId: createdPaymentId,
          nextPromisedDate: input.nextPromisedDate ?? null,
        },
      });

      const created = await tx.recoveryEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: {
          client: { select: { name: true, nameUr: true } },
          route: { select: { name: true } },
          officer: { select: { firstName: true, lastName: true } },
          payment: { select: { paymentNo: true } },
        },
      });

      return this.toRecoveryEntryDto(created);
    });
  }

  async listRecoveryEntries(
    organizationId: number,
    query: ListRecoveryEntriesQuery,
  ): Promise<PaginatedResponse<RecoveryEntryDto>> {
    const where: Prisma.RecoveryEntryWhereInput = { organizationId };

    if (query.clientId) where.clientId = query.clientId;
    if (query.routeId) where.routeId = query.routeId;
    if (query.officerId) where.officerId = query.officerId;
    if (query.outcome) where.outcome = query.outcome;

    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
      if (query.dateTo) dateFilter.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
      where.visitDate = dateFilter;
    }

    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { client: { name: { contains: q, mode: 'insensitive' } } },
        { payment: { paymentNo: { contains: q, mode: 'insensitive' } } },
        { remarks: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.recoveryEntry.count({ where }),
      this.prisma.recoveryEntry.findMany({
        where,
        include: {
          client: { select: { name: true, nameUr: true } },
          route: { select: { name: true } },
          officer: { select: { firstName: true, lastName: true } },
          payment: { select: { paymentNo: true } },
        },
        orderBy: [{ visitDate: query.sortOrder }, { id: query.sortOrder }],
        skip,
        take: query.pageSize,
      }),
    ]);

    return {
      data: rows.map((r) => this.toRecoveryEntryDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Computes exact Decimal receivable aging buckets (0-7, 8-15, 16-30, 31-60, 60+ days)
   * across active clients with positive receivable balance.
   */
  async getReceivableAging(
    organizationId: number,
    query: RecoveryAgingQuery,
  ): Promise<RecoveryAgingSummaryDto> {
    const asOfDateStr = query.asOfDate || new Date().toISOString().slice(0, 10);
    const asOfDate = new Date(`${asOfDateStr}T23:59:59.999Z`);

    const clientWhere: Prisma.ClientWhereInput = {
      organizationId,
      isActive: true,
    };
    if (query.routeId) clientWhere.routeId = query.routeId;
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      clientWhere.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const clients = await this.prisma.client.findMany({
      where: clientWhere,
      include: {
        route: { select: { name: true } },
        salesInvoices: {
          where: { status: { in: ['POSTED', 'PARTIAL'] } },
          orderBy: { saleDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows: ClientAgingRowDto[] = [];
    let total0to7 = new Decimal(0);
    let total8to15 = new Decimal(0);
    let total16to30 = new Decimal(0);
    let total31to60 = new Decimal(0);
    let total60Plus = new Decimal(0);
    let grandTotal = new Decimal(0);

    for (const client of clients) {
      const balanceStr = await this.ledger.getPartyBalance(
        this.prisma as unknown as TxClient,
        organizationId,
        'CLIENT',
        client.id,
      );
      const ledgerBalance = new Decimal(balanceStr);

      if (ledgerBalance.lte(0)) continue;

      let b0to7 = new Decimal(0);
      let b8to15 = new Decimal(0);
      let b16to30 = new Decimal(0);
      let b31to60 = new Decimal(0);
      let b60Plus = new Decimal(0);
      let sumInvoicesOpen = new Decimal(0);

      for (const inv of client.salesInvoices) {
        const netTotal = new Decimal(inv.total.toString()).minus(
          new Decimal(inv.returnedAmount.toString()),
        );
        const paid = new Decimal(inv.paidAmount.toString());
        const openDue = Decimal.max(0, netTotal.minus(paid));
        if (openDue.lte(0)) continue;

        sumInvoicesOpen = sumInvoicesOpen.plus(openDue);
        const ageDays = Math.max(
          0,
          Math.floor((asOfDate.getTime() - inv.saleDate.getTime()) / (1000 * 60 * 60 * 24)),
        );

        if (ageDays <= 7) {
          b0to7 = b0to7.plus(openDue);
        } else if (ageDays <= 15) {
          b8to15 = b8to15.plus(openDue);
        } else if (ageDays <= 30) {
          b16to30 = b16to30.plus(openDue);
        } else if (ageDays <= 60) {
          b31to60 = b31to60.plus(openDue);
        } else {
          b60Plus = b60Plus.plus(openDue);
        }
      }

      // Any remaining ledger receivable (e.g. from opening balance or bounce fees) goes into 60+ days if older, or 0-7 if recent
      const diff = ledgerBalance.minus(sumInvoicesOpen);
      if (diff.gt(0)) {
        const clientAgeDays = Math.max(
          0,
          Math.floor((asOfDate.getTime() - client.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        );
        if (clientAgeDays <= 7) b0to7 = b0to7.plus(diff);
        else if (clientAgeDays <= 15) b8to15 = b8to15.plus(diff);
        else if (clientAgeDays <= 30) b16to30 = b16to30.plus(diff);
        else if (clientAgeDays <= 60) b31to60 = b31to60.plus(diff);
        else b60Plus = b60Plus.plus(diff);
      }

      total0to7 = total0to7.plus(b0to7);
      total8to15 = total8to15.plus(b8to15);
      total16to30 = total16to30.plus(b16to30);
      total31to60 = total31to60.plus(b31to60);
      total60Plus = total60Plus.plus(b60Plus);
      grandTotal = grandTotal.plus(ledgerBalance);

      rows.push({
        clientId: client.id,
        clientCode: client.code,
        clientName: client.name,
        clientNameUr: client.nameUr,
        routeId: client.routeId,
        routeName: client.route?.name ?? null,
        recoveryDay: client.recoveryDay,
        promisedDate: client.promisedDate ? client.promisedDate.toISOString().slice(0, 10) : null,
        promisedAmount: client.promisedAmount
          ? new Decimal(client.promisedAmount.toString()).toFixed(2)
          : null,
        bucket0to7: b0to7.toFixed(2),
        bucket8to15: b8to15.toFixed(2),
        bucket16to30: b16to30.toFixed(2),
        bucket31to60: b31to60.toFixed(2),
        bucket60Plus: b60Plus.toFixed(2),
        totalReceivable: ledgerBalance.toFixed(2),
      });
    }

    return {
      asOfDate: asOfDateStr,
      totalBucket0to7: total0to7.toFixed(2),
      totalBucket8to15: total8to15.toFixed(2),
      totalBucket16to30: total16to30.toFixed(2),
      totalBucket31to60: total31to60.toFixed(2),
      totalBucket60Plus: total60Plus.toFixed(2),
      grandTotalReceivable: grandTotal.toFixed(2),
      rows,
    };
  }
}
