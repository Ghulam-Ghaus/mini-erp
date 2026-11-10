import {
  type ClientDto,
  type ClientLedgerQuery,
  type ClientLedgerResponse,
  type CreateClientInput,
  type LedgerEntryDto,
  type ListClientsQuery,
  type PaginatedResponse,
  type UpdateClientInput,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.module.js';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  async toClientDto(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    client: {
      id: number;
      routeId: number | null;
      code: string | null;
      name: string;
      nameUr: string | null;
      contactPerson: string | null;
      phone: string | null;
      address: string | null;
      taxNo: string | null;
      creditLimit: Prisma.Decimal;
      openingBalance: Prisma.Decimal;
      recoveryDay: string | null;
      notes: string | null;
      isActive: boolean;
      createdAt: Date;
      route?: { name: string } | null;
    },
  ): Promise<ClientDto> {
    const [currentBalance, salesAgg, paymentsAgg, returnsAgg] = await Promise.all([
      this.ledger.getPartyBalance(tx, organizationId, 'CLIENT', client.id),
      tx.saleInvoice.aggregate({
        where: {
          organizationId,
          clientId: client.id,
          status: { not: 'VOIDED' },
        },
        _sum: { total: true },
      }),
      tx.payment.aggregate({
        where: {
          organizationId,
          partyType: 'CLIENT',
          partyId: client.id,
          direction: 'IN',
          status: 'POSTED',
        },
        _sum: { amount: true },
      }),
      tx.saleReturn.aggregate({
        where: {
          organizationId,
          clientId: client.id,
          status: { not: 'VOIDED' },
        },
        _sum: { total: true },
      }),
    ]);

    const grossSold = salesAgg._sum.total
      ? new Decimal(salesAgg._sum.total.toString())
      : new Decimal(0);
    const returned = returnsAgg._sum.total
      ? new Decimal(returnsAgg._sum.total.toString())
      : new Decimal(0);
    const totalSold = grossSold.toFixed(2);
    const totalReturned = returned.toFixed(2);
    const totalPaid = paymentsAgg._sum.amount
      ? new Decimal(paymentsAgg._sum.amount.toString()).toFixed(2)
      : '0.00';

    return {
      id: client.id,
      routeId: client.routeId,
      routeName: client.route?.name ?? null,
      code: client.code,
      name: client.name,
      nameUr: client.nameUr,
      contactPerson: client.contactPerson,
      phone: client.phone,
      address: client.address,
      taxNo: client.taxNo,
      creditLimit: new Decimal(client.creditLimit.toString()).toFixed(2),
      openingBalance: new Decimal(client.openingBalance.toString()).toFixed(2),
      currentBalance,
      totalSold,
      totalPaid,
      totalReturned,
      recoveryDay: client.recoveryDay,
      notes: client.notes,
      isActive: client.isActive,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async listClients(
    organizationId: number,
    query: ListClientsQuery,
  ): Promise<PaginatedResponse<ClientDto>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ClientWhereInput = {
      organizationId,
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { nameUr: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { contactPerson: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: {
          route: {
            select: { name: true },
          },
        },
      }),
    ]);

    const data = await Promise.all(
      rows.map((client) => this.toClientDto(this.prisma, organizationId, client)),
    );

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  async getClientById(organizationId: number, id: number): Promise<ClientDto> {
    const row = await this.prisma.client.findFirst({
      where: { id, organizationId },
      include: {
        route: {
          select: { name: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }

    return this.toClientDto(this.prisma, organizationId, row);
  }

  async createClient(
    organizationId: number,
    input: CreateClientInput,
    userId: number,
  ): Promise<ClientDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const existing = await tx.client.findFirst({
        where: {
          organizationId,
          name: { equals: input.name.trim(), mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new BadRequestException(`Client named "${input.name}" already exists`);
      }

      if (input.routeId) {
        const route = await tx.route.findFirst({
          where: { id: input.routeId, organizationId, isActive: true },
        });
        if (!route) {
          throw new BadRequestException(`Route not found or inactive`);
        }
      }

      const id = await nextId(tx, 'clients');
      const openingBalanceDec = new Decimal(input.openingBalance || '0');
      const creditLimitDec = new Decimal(input.creditLimit || '0');

      const created = await tx.client.create({
        data: {
          id,
          organizationId,
          routeId: input.routeId ?? null,
          code: input.code?.trim() || null,
          name: input.name.trim(),
          nameUr: input.nameUr?.trim() || null,
          contactPerson: input.contactPerson?.trim() || null,
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          taxNo: input.taxNo?.trim() || null,
          creditLimit: new Prisma.Decimal(creditLimitDec.toFixed(2)),
          openingBalance: new Prisma.Decimal(openingBalanceDec.toFixed(2)),
          recoveryDay: input.recoveryDay ?? null,
          notes: input.notes?.trim() || null,
          isActive: input.isActive,
        },
        include: {
          route: {
            select: { name: true },
          },
        },
      });

      if (openingBalanceDec.gt(0)) {
        await this.ledger.postEntry(tx, {
          organizationId,
          partyType: 'CLIENT',
          partyId: created.id,
          entryDate: new Date(),
          refType: 'OPENING_BALANCE',
          refId: created.id,
          refNo: null,
          debit: openingBalanceDec.toFixed(2),
          credit: '0.00',
          narration: 'Opening balance',
          createdById: userId,
        });
      }

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'Client',
        entityId: created.id,
        afterJson: {
          id: created.id,
          name: created.name,
          openingBalance: created.openingBalance.toString(),
          creditLimit: created.creditLimit.toString(),
        },
      });

      return this.toClientDto(tx, organizationId, created);
    });
  }

  async updateClient(
    organizationId: number,
    id: number,
    input: UpdateClientInput,
    userId: number,
  ): Promise<ClientDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const existing = await tx.client.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        throw new NotFoundException(`Client with id ${id} not found`);
      }

      if (input.name && input.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        const dup = await tx.client.findFirst({
          where: {
            organizationId,
            name: { equals: input.name.trim(), mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (dup) {
          throw new BadRequestException(`Client named "${input.name}" already exists`);
        }
      }

      if (input.routeId) {
        const route = await tx.route.findFirst({
          where: { id: input.routeId, organizationId, isActive: true },
        });
        if (!route) {
          throw new BadRequestException(`Route not found or inactive`);
        }
      }

      const updated = await tx.client.update({
        where: { id },
        data: {
          routeId: input.routeId !== undefined ? input.routeId : undefined,
          code: input.code !== undefined ? input.code?.trim() || null : undefined,
          name: input.name ? input.name.trim() : undefined,
          nameUr: input.nameUr !== undefined ? input.nameUr?.trim() || null : undefined,
          contactPerson:
            input.contactPerson !== undefined ? input.contactPerson?.trim() || null : undefined,
          phone: input.phone !== undefined ? input.phone?.trim() || null : undefined,
          address: input.address !== undefined ? input.address?.trim() || null : undefined,
          taxNo: input.taxNo !== undefined ? input.taxNo?.trim() || null : undefined,
          creditLimit:
            input.creditLimit !== undefined
              ? new Prisma.Decimal(new Decimal(input.creditLimit).toFixed(2))
              : undefined,
          recoveryDay: input.recoveryDay !== undefined ? input.recoveryDay : undefined,
          notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
          isActive: input.isActive !== undefined ? input.isActive : undefined,
        },
        include: {
          route: {
            select: { name: true },
          },
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'UPDATE',
        entity: 'Client',
        entityId: updated.id,
        beforeJson: {
          name: existing.name,
          phone: existing.phone,
          creditLimit: existing.creditLimit.toString(),
        },
        afterJson: {
          name: updated.name,
          phone: updated.phone,
          creditLimit: updated.creditLimit.toString(),
        },
      });

      return this.toClientDto(tx, organizationId, updated);
    });
  }

  async getClientLedger(
    organizationId: number,
    clientId: number,
    query: ClientLedgerQuery,
  ): Promise<ClientLedgerResponse> {
    const client = await this.getClientById(organizationId, clientId);

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, query.pageSize ?? 50));
    const skip = (page - 1) * pageSize;

    const fromDate = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
    const toDate = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined;

    let openingBefore = new Decimal(0);
    if (fromDate) {
      const priorLast = await this.prisma.ledgerEntry.findFirst({
        where: {
          organizationId,
          partyType: 'CLIENT',
          partyId: clientId,
          entryDate: { lt: fromDate },
        },
        orderBy: { id: 'desc' },
      });
      if (priorLast) {
        openingBefore = new Decimal(priorLast.balance.toString());
      }
    }

    const where: Prisma.LedgerEntryWhereInput = {
      organizationId,
      partyType: 'CLIENT',
      partyId: clientId,
      ...(fromDate || toDate
        ? {
            entryDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(query.refType ? { refType: query.refType } : {}),
    };

    const [total, rows, rangeAgg] = await Promise.all([
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { id: 'asc' },
      }),
      this.prisma.ledgerEntry.aggregate({
        where,
        _sum: { debit: true, credit: true },
      }),
    ]);

    const paymentRefIds = rows.filter((r) => r.refType === 'PAYMENT_IN').map((r) => r.refId);
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

    const entries: LedgerEntryDto[] = rows.map((r) => ({
      id: r.id,
      partyType: 'CLIENT',
      partyId: r.partyId,
      entryDate: r.entryDate.toISOString(),
      refType: r.refType,
      paymentMethod: r.refType === 'PAYMENT_IN' ? (paymentMethodMap.get(r.refId) ?? null) : null,
      refId: r.refId,
      refNo: r.refNo,
      debit: new Decimal(r.debit.toString()).toFixed(2),
      credit: new Decimal(r.credit.toString()).toFixed(2),
      balance: new Decimal(r.balance.toString()).toFixed(2),
      narration: r.narration,
      createdById: r.createdById,
      createdAt: r.createdAt.toISOString(),
    }));

    const totalDebitInRange = rangeAgg._sum.debit
      ? new Decimal(rangeAgg._sum.debit.toString()).toFixed(2)
      : '0.00';
    const totalCreditInRange = rangeAgg._sum.credit
      ? new Decimal(rangeAgg._sum.credit.toString()).toFixed(2)
      : '0.00';

    return {
      client,
      openingBalanceBeforeRange: openingBefore.toFixed(2),
      totalDebitInRange,
      totalCreditInRange,
      closingBalance: client.currentBalance,
      entries,
      total,
      page,
      pageSize,
    };
  }
}
