import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import type {
  CashBookEntryDto,
  CashBookMethodBreakdownDto,
  DashboardBatchPerformanceRowDto,
  DashboardBatchProfitChartPointDto,
  DashboardChequeDueItemDto,
  DashboardDailySalesChartPointDto,
  DashboardLowStockBatchItemDto,
  DashboardOverdueClientItemDto,
  DashboardPreset,
  DashboardQueryInput,
  DashboardRecoveryDueItemDto,
  DashboardResponseDto,
  DetailedSalesReportQueryInput,
  DetailedSalesReportResponseDto,
  DetailedSalesReportRowDto,
  OtherReportsQueryInput,
  OtherReportsResponseDto,
  ReceivableAgingRowDto,
  ReportPaymentStatus,
} from '@mini-erp/shared';
import { PrismaService } from '../database/prisma.service.js';

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
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveDateRange(
    preset: DashboardPreset = 'THIS_MONTH',
    dateFrom?: string,
    dateTo?: string,
  ): { startDate: Date; endDate: Date; dateFromStr: string; dateToStr: string } {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'TODAY') {
      return {
        startDate: new Date(`${todayStr}T00:00:00.000Z`),
        endDate: new Date(`${todayStr}T23:59:59.999Z`),
        dateFromStr: todayStr,
        dateToStr: todayStr,
      };
    }

    if (preset === 'THIS_WEEK') {
      const dayOfWeek = now.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday),
      );
      const fromStr = monday.toISOString().slice(0, 10);
      return {
        startDate: new Date(`${fromStr}T00:00:00.000Z`),
        endDate: new Date(`${todayStr}T23:59:59.999Z`),
        dateFromStr: fromStr,
        dateToStr: todayStr,
      };
    }

    if (preset === 'CUSTOM' && (dateFrom || dateTo)) {
      const fromStr = dateFrom || `${todayStr.slice(0, 8)}01`;
      const toStr = dateTo || todayStr;
      return {
        startDate: new Date(`${fromStr}T00:00:00.000Z`),
        endDate: new Date(`${toStr}T23:59:59.999Z`),
        dateFromStr: fromStr,
        dateToStr: toStr,
      };
    }

    // Default: THIS_MONTH
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const fromStr = dateFrom || firstOfMonth.toISOString().slice(0, 10);
    const toStr = dateTo || lastOfMonth.toISOString().slice(0, 10);
    return {
      startDate: new Date(`${fromStr}T00:00:00.000Z`),
      endDate: new Date(`${toStr}T23:59:59.999Z`),
      dateFromStr: fromStr,
      dateToStr: toStr,
    };
  }

  private computeSalePaymentStatus(sale: {
    total: Decimal | string | number;
    returnedAmount: Decimal | string | number;
    paidAmount: Decimal | string | number;
  }): ReportPaymentStatus {
    const netPayable = Decimal.max(
      0,
      new Decimal(sale.total.toString()).minus(sale.returnedAmount.toString()),
    );
    const paid = new Decimal(sale.paidAmount.toString());
    if (netPayable.lte(0) || paid.gte(netPayable)) {
      return 'PAID';
    }
    if (paid.gt(0)) {
      return 'PARTIAL';
    }
    return 'UNPAID';
  }

  private async getClientCurrentBalances(organizationId: number): Promise<Map<number, Decimal>> {
    const clients = await this.prisma.client.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, openingBalance: true },
    });

    const latestEntries = await this.prisma.ledgerEntry.findMany({
      where: { organizationId, partyType: 'CLIENT' },
      orderBy: [{ partyId: 'asc' }, { id: 'desc' }],
      distinct: ['partyId'],
      select: { partyId: true, balance: true },
    });

    const latestMap = new Map<number, Decimal>();
    for (const entry of latestEntries) {
      latestMap.set(entry.partyId, new Decimal(entry.balance.toString()));
    }

    const balances = new Map<number, Decimal>();
    for (const client of clients) {
      const bal = latestMap.get(client.id) ?? new Decimal(client.openingBalance.toString());
      balances.set(client.id, bal);
    }
    return balances;
  }

  async getDashboard(
    organizationId: number,
    query: DashboardQueryInput,
  ): Promise<DashboardResponseDto> {
    const preset: DashboardPreset = query.preset ?? 'THIS_MONTH';
    const { startDate, endDate, dateFromStr, dateToStr } = this.resolveDateRange(
      preset,
      query.dateFrom,
      query.dateTo,
    );

    const [
      salesInRange,
      returnsInRange,
      paymentsInRange,
      pendingCheques,
      operatingExpensesRows,
      operatingSalariesRows,
      clientBalances,
      allBatches,
      stockAggs,
      allClients,
    ] = await Promise.all([
      this.prisma.saleInvoice.findMany({
        where: {
          organizationId,
          status: { in: ['POSTED', 'PARTIAL', 'PAID'] },
          saleDate: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          returnDate: { gte: startDate, lte: endDate },
        },
        include: { items: true },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId,
          direction: 'IN',
          partyType: 'CLIENT',
          status: 'POSTED',
          paymentDate: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.cheque.findMany({
        where: {
          organizationId,
          direction: 'IN',
          status: { in: ['RECEIVED', 'DEPOSITED'] },
        },
        orderBy: { chequeDate: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          batchId: null,
          expenseDate: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.salaryRecord.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          batchId: null,
          paymentDate: { gte: startDate, lte: endDate },
        },
      }),
      this.getClientCurrentBalances(organizationId),
      this.prisma.batch.findMany({
        where: { organizationId },
        include: {
          item: true,
          saleItems: {
            where: { sale: { status: { in: ['POSTED', 'PARTIAL', 'PAID'] } } },
          },
          saleReturnItems: {
            where: { saleReturn: { status: 'POSTED' } },
          },
        },
        orderBy: { id: 'desc' },
        take: 25,
      }),
      this.prisma.stockMovement.groupBy({
        by: ['batchId'],
        where: { organizationId, batchId: { not: null } },
        _sum: { qtyBase: true },
      }),
      this.prisma.client.findMany({
        where: { organizationId, isActive: true },
        include: {
          route: { include: { assignedOfficer: true } },
          salesInvoices: {
            where: { status: { in: ['POSTED', 'PARTIAL', 'PAID'] } },
            select: { saleDate: true, total: true, returnedAmount: true, paidAmount: true },
          },
        },
      }),
    ]);

    // 1. KPIs
    let grossSales = new Decimal(0);
    let grossSaleProfit = new Decimal(0);
    const dailyMap = new Map<string, { sales: Decimal; received: Decimal }>();

    for (const s of salesInRange) {
      const amt = new Decimal(s.total.toString());
      grossSales = grossSales.plus(amt);
      grossSaleProfit = grossSaleProfit.plus(s.totalProfit.toString());

      const dayKey = s.saleDate.toISOString().slice(0, 10);
      const curr = dailyMap.get(dayKey) ?? { sales: new Decimal(0), received: new Decimal(0) };
      curr.sales = curr.sales.plus(amt);
      dailyMap.set(dayKey, curr);
    }

    let saleReturnsTotal = new Decimal(0);
    let returnProfitReversal = new Decimal(0);
    for (const sr of returnsInRange) {
      const retAmt = new Decimal(sr.total.toString());
      saleReturnsTotal = saleReturnsTotal.plus(retAmt);

      const cogsRev = sr.items.reduce(
        (acc, it) => acc.plus(it.cogsReversed.toString()),
        new Decimal(0),
      );
      const netRevReduced = new Decimal(sr.subtotal.toString()).minus(sr.deduction.toString());
      returnProfitReversal = returnProfitReversal.plus(netRevReduced.minus(cogsRev));

      const dayKey = sr.returnDate.toISOString().slice(0, 10);
      const curr = dailyMap.get(dayKey) ?? { sales: new Decimal(0), received: new Decimal(0) };
      curr.sales = curr.sales.minus(retAmt);
      dailyMap.set(dayKey, curr);
    }

    const totalSales = grossSales.minus(saleReturnsTotal);
    const grossProfit = grossSaleProfit.minus(returnProfitReversal);

    let totalReceived = new Decimal(0);
    for (const p of paymentsInRange) {
      const amt = new Decimal(p.amount.toString());
      totalReceived = totalReceived.plus(amt);

      const dayKey = p.paymentDate.toISOString().slice(0, 10);
      const curr = dailyMap.get(dayKey) ?? { sales: new Decimal(0), received: new Decimal(0) };
      curr.received = curr.received.plus(amt);
      dailyMap.set(dayKey, curr);
    }

    let totalReceivable = new Decimal(0);
    for (const bal of clientBalances.values()) {
      if (bal.gt(0)) {
        totalReceivable = totalReceivable.plus(bal);
      }
    }

    const pendingChequesCount = pendingCheques.length;
    const pendingChequesAmount = pendingCheques.reduce(
      (acc, chq) => acc.plus(chq.amount.toString()),
      new Decimal(0),
    );

    const operatingExpensesOnly = operatingExpensesRows.reduce(
      (acc, e) => acc.plus(e.amount.toString()),
      new Decimal(0),
    );
    const operatingPayrollCost = operatingSalariesRows.reduce(
      (acc, s) =>
        acc.plus(
          new Decimal(s.basicAmount.toString())
            .plus(s.overtimeAmount.toString())
            .plus(s.bonusAmount.toString())
            .minus(s.deductionsAmount.toString()),
        ),
      new Decimal(0),
    );
    const operatingExpenses = operatingExpensesOnly.plus(operatingPayrollCost);
    const netProfit = grossProfit.minus(operatingExpenses);

    // 2. Batch Performance + Low Batch Stock + Profit by Batch chart
    const stockByBatch = new Map<number, Decimal>();
    for (const row of stockAggs) {
      if (row.batchId !== null) {
        stockByBatch.set(row.batchId, new Decimal(row._sum.qtyBase?.toString() ?? '0'));
      }
    }

    const batchPerformance: DashboardBatchPerformanceRowDto[] = [];
    const lowBatchStock: DashboardLowStockBatchItemDto[] = [];
    const profitByBatch: DashboardBatchProfitChartPointDto[] = [];

    for (const b of allBatches) {
      const remainingKg = stockByBatch.get(b.id) ?? new Decimal(0);
      let grossSoldKg = new Decimal(0);
      let grossRevenue = new Decimal(0);
      let grossBatchProfit = new Decimal(0);

      for (const si of b.saleItems) {
        grossSoldKg = grossSoldKg.plus(si.qtyBase.toString());
        grossRevenue = grossRevenue.plus(si.lineSubtotal.toString());
        grossBatchProfit = grossBatchProfit.plus(si.lineProfit.toString());
      }

      let returnedKg = new Decimal(0);
      let returnedRev = new Decimal(0);
      let returnedProfitImpact = new Decimal(0);

      for (const sri of b.saleReturnItems) {
        returnedKg = returnedKg.plus(sri.qtyBase.toString());
        returnedRev = returnedRev.plus(sri.lineSubtotal.toString());
        returnedProfitImpact = returnedProfitImpact.plus(
          new Decimal(sri.lineSubtotal.toString()).minus(sri.cogsReversed.toString()),
        );
      }

      const soldKg = Decimal.max(0, grossSoldKg.minus(returnedKg));
      const netRevenue = grossRevenue.minus(returnedRev);
      const totalBatchProfit = grossBatchProfit.minus(returnedProfitImpact);
      const avgSaleRatePerKg = soldKg.gt(0) ? netRevenue.div(soldKg) : new Decimal(0);
      const profitPerKg = soldKg.gt(0) ? totalBatchProfit.div(soldKg) : new Decimal(0);

      batchPerformance.push({
        batchId: b.id,
        batchNo: b.batchNo,
        batchName: b.name,
        itemName: b.item?.name ?? null,
        status: b.status,
        outputKg: new Decimal(b.outputKg.toString()).toFixed(3),
        soldKg: soldKg.toFixed(3),
        remainingKg: remainingKg.toFixed(3),
        costPerKg: new Decimal(b.costPerKg.toString()).toFixed(2),
        avgSaleRatePerKg: avgSaleRatePerKg.toFixed(2),
        profitPerKg: profitPerKg.toFixed(2),
        totalProfit: totalBatchProfit.toFixed(2),
      });

      const outKg = new Decimal(b.outputKg.toString());
      const lowThreshold = Decimal.max(new Decimal(100), outKg.mul('0.15'));
      if (b.status === 'OPEN' && remainingKg.gt(0) && remainingKg.lte(lowThreshold)) {
        lowBatchStock.push({
          batchId: b.id,
          batchNo: b.batchNo,
          batchName: b.name,
          itemName: b.item?.name ?? null,
          outputKg: outKg.toFixed(3),
          remainingKg: remainingKg.toFixed(3),
        });
      }

      if (soldKg.gt(0) || !totalBatchProfit.isZero()) {
        profitByBatch.push({
          batchId: b.id,
          batchNo: b.batchNo,
          batchName: b.name,
          revenue: netRevenue.toFixed(2),
          grossProfit: totalBatchProfit.toFixed(2),
        });
      }
    }

    // 3. Cheques Due Soon (within 7 days or overdue)
    const clientNameMap = new Map<number, string>();
    for (const c of allClients) {
      clientNameMap.set(c.id, c.name);
    }

    const nowMs = Date.now();
    const sevenDaysFromNow = new Date(nowMs + 7 * 86400000);
    const chequesDueSoon: DashboardChequeDueItemDto[] = pendingCheques
      .filter((chq) => chq.chequeDate <= sevenDaysFromNow)
      .slice(0, 10)
      .map((chq) => {
        const diffDays = Math.ceil((chq.chequeDate.getTime() - nowMs) / 86400000);
        return {
          chequeId: chq.id,
          chequeNo: chq.chequeNo,
          bankName: chq.bankName,
          chequeDate: chq.chequeDate.toISOString().slice(0, 10),
          amount: new Decimal(chq.amount.toString()).toFixed(2),
          status: chq.status,
          partyType: chq.partyType,
          partyId: chq.partyId,
          partyName: clientNameMap.get(chq.partyId) ?? `#${chq.partyId}`,
          daysUntilDue: diffDays,
        };
      });

    // 4. Today's Recovery Due & Overdue Clients (Top 10)
    const todayWeekday = WEEKDAY_NAMES[new Date().getUTCDay()];
    const endOfToday = new Date(`${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`);

    const todaysRecoveryDue: DashboardRecoveryDueItemDto[] = [];
    const overdueClientsAll: DashboardOverdueClientItemDto[] = [];

    for (const c of allClients) {
      const bal = clientBalances.get(c.id) ?? new Decimal(0);
      if (bal.lte(0)) continue;

      const isPromisedDue = c.promisedDate !== null && c.promisedDate <= endOfToday;
      const isWeekdayMatch = c.recoveryDay === todayWeekday;
      if (isPromisedDue || isWeekdayMatch) {
        const officer = c.route?.assignedOfficer;
        todaysRecoveryDue.push({
          clientId: c.id,
          clientName: c.name,
          routeName: c.route?.name ?? null,
          officerName: officer ? `${officer.firstName} ${officer.lastName}`.trim() : null,
          currentBalance: bal.toFixed(2),
          promisedAmount: c.promisedAmount
            ? new Decimal(c.promisedAmount.toString()).toFixed(2)
            : null,
          recoveryDay: c.recoveryDay ?? null,
        });
      }

      let oldestDays = 0;
      for (const inv of c.salesInvoices) {
        const st = this.computeSalePaymentStatus(inv);
        if (st !== 'PAID') {
          const ageDays = Math.max(0, Math.floor((nowMs - inv.saleDate.getTime()) / 86400000));
          if (ageDays > oldestDays) {
            oldestDays = ageDays;
          }
        }
      }

      overdueClientsAll.push({
        clientId: c.id,
        clientName: c.name,
        phone: c.phone ?? null,
        routeName: c.route?.name ?? null,
        creditLimit: new Decimal(c.creditLimit.toString()).toFixed(2),
        currentBalance: bal.toFixed(2),
        oldestUnpaidDays: oldestDays,
      });
    }

    overdueClientsAll.sort((a, b) =>
      new Decimal(b.currentBalance).cmp(new Decimal(a.currentBalance)),
    );

    const dailySalesVsReceived: DashboardDailySalesChartPointDto[] = Array.from(dailyMap.entries())
      .sort(([d1], [d2]) => d1.localeCompare(d2))
      .map(([date, vals]) => ({
        date,
        salesAmount: vals.sales.toFixed(2),
        receivedAmount: vals.received.toFixed(2),
      }));

    return {
      preset,
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      kpis: {
        totalSales: totalSales.toFixed(2),
        grossSales: grossSales.toFixed(2),
        saleReturnsTotal: saleReturnsTotal.toFixed(2),
        totalReceived: totalReceived.toFixed(2),
        totalReceivable: totalReceivable.toFixed(2),
        pendingChequesCount,
        pendingChequesAmount: pendingChequesAmount.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        operatingExpenses: operatingExpenses.toFixed(2),
        netProfit: netProfit.toFixed(2),
      },
      batchPerformance,
      chequesDueSoon,
      todaysRecoveryDue: todaysRecoveryDue.slice(0, 10),
      overdueClients: overdueClientsAll.slice(0, 10),
      lowBatchStock: lowBatchStock.slice(0, 10),
      charts: {
        dailySalesVsReceived,
        profitByBatch: profitByBatch.slice(0, 10),
      },
    };
  }

  /**
   * Section 5.4: Detailed Sales Report (page 2 of notebook)
   * Columns: Date | Invoice ID | Challan ID | Batch | Item | Client | Batch cost/kg |
   * Sale rate/kg | Qty (kg) | Amount | Cost | Profit/Loss | Profit/kg | Payment status | Salesperson
   */
  async getDetailedSalesReport(
    organizationId: number,
    query: DetailedSalesReportQueryInput,
  ): Promise<DetailedSalesReportResponseDto> {
    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.itemId ? { itemId: query.itemId } : {}),
        sale: {
          organizationId,
          status: { in: ['POSTED', 'PARTIAL', 'PAID'] },
          ...(query.clientId ? { clientId: query.clientId } : {}),
          ...(query.routeId ? { routeId: query.routeId } : {}),
          ...(query.salespersonId ? { createdById: query.salespersonId } : {}),
          ...(query.dateFrom || query.dateTo
            ? {
                saleDate: {
                  ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
                  ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        batch: true,
        item: true,
        returnItems: {
          where: { saleReturn: { status: 'POSTED' } },
        },
        sale: {
          include: {
            client: true,
            route: true,
            challans: {
              where: { status: { not: 'CANCELLED' } },
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ sale: { saleDate: 'desc' } }, { id: 'asc' }],
    });

    const userIds = Array.from(new Set(saleItems.map((si) => si.sale.createdById)));
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, username: true },
          })
        : [];
    const userMap = new Map<number, string>();
    for (const u of users) {
      userMap.set(u.id, `${u.firstName} ${u.lastName}`.trim() || u.username);
    }

    const searchLower = query.search?.trim().toLowerCase() ?? '';

    const rows: DetailedSalesReportRowDto[] = [];
    let totalGrossQtyKg = new Decimal(0);
    let totalReturnedQtyKg = new Decimal(0);
    let totalNetQtyKg = new Decimal(0);
    let totalAmount = new Decimal(0);
    let totalCogs = new Decimal(0);
    let totalProfit = new Decimal(0);

    for (const si of saleItems) {
      const paymentStatus = this.computeSalePaymentStatus(si.sale);
      if (query.paymentStatus && paymentStatus !== query.paymentStatus) {
        continue;
      }

      const challanNo = si.sale.challans[0]?.challanNo ?? null;
      const salespersonName = userMap.get(si.sale.createdById) ?? `#${si.sale.createdById}`;

      if (searchLower) {
        const haystack = [
          si.sale.invoiceNo,
          challanNo ?? '',
          si.batch.batchNo,
          si.batch.name,
          si.item.name,
          si.sale.client.name,
          salespersonName,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchLower)) {
          continue;
        }
      }

      const grossQty = new Decimal(si.qtyBase.toString());
      const retQty = si.returnItems.reduce(
        (acc, ri) => acc.plus(ri.qtyBase.toString()),
        new Decimal(0),
      );
      const netQty = Decimal.max(0, grossQty.minus(retQty));

      const retLineTotal = si.returnItems.reduce(
        (acc, ri) => acc.plus(ri.lineTotal.toString()),
        new Decimal(0),
      );
      const retLineSubtotal = si.returnItems.reduce(
        (acc, ri) => acc.plus(ri.lineSubtotal.toString()),
        new Decimal(0),
      );
      const retCogsReversed = si.returnItems.reduce(
        (acc, ri) => acc.plus(ri.cogsReversed.toString()),
        new Decimal(0),
      );

      const lineAmount = new Decimal(si.lineTotal.toString()).minus(retLineTotal);
      const lineCogs = new Decimal(si.lineCogs.toString()).minus(retCogsReversed);
      const lineProfit = new Decimal(si.lineProfit.toString()).minus(
        retLineSubtotal.minus(retCogsReversed),
      );
      const profitPerKg = netQty.gt(0) ? lineProfit.div(netQty) : new Decimal(0);

      totalGrossQtyKg = totalGrossQtyKg.plus(grossQty);
      totalReturnedQtyKg = totalReturnedQtyKg.plus(retQty);
      totalNetQtyKg = totalNetQtyKg.plus(netQty);
      totalAmount = totalAmount.plus(lineAmount);
      totalCogs = totalCogs.plus(lineCogs);
      totalProfit = totalProfit.plus(lineProfit);

      rows.push({
        saleItemId: si.id,
        saleId: si.saleId,
        saleDate: si.sale.saleDate.toISOString().slice(0, 10),
        invoiceNo: si.sale.invoiceNo,
        challanNo,
        batchId: si.batchId,
        batchNo: si.batch.batchNo,
        batchName: si.batch.name,
        itemId: si.itemId,
        itemName: si.item.name,
        clientId: si.sale.clientId,
        clientName: si.sale.client.name,
        routeId: si.sale.routeId ?? null,
        routeName: si.sale.route?.name ?? null,
        batchCostPerKg: new Decimal(si.batchCostRateSnapshot.toString()).toFixed(2),
        saleRatePerKg: new Decimal(si.ratePerBase.toString()).toFixed(2),
        grossQtyKg: grossQty.toFixed(3),
        returnedQtyKg: retQty.toFixed(3),
        netQtyKg: netQty.toFixed(3),
        amount: lineAmount.toFixed(2),
        cogs: lineCogs.toFixed(2),
        profit: lineProfit.toFixed(2),
        profitPerKg: profitPerKg.toFixed(2),
        paymentStatus,
        salespersonId: si.sale.createdById,
        salespersonName,
      });
    }

    const avgProfitPerKg = totalNetQtyKg.gt(0) ? totalProfit.div(totalNetQtyKg) : new Decimal(0);

    return {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      rows,
      totals: {
        rowCount: rows.length,
        totalGrossQtyKg: totalGrossQtyKg.toFixed(3),
        totalReturnedQtyKg: totalReturnedQtyKg.toFixed(3),
        totalNetQtyKg: totalNetQtyKg.toFixed(3),
        totalAmount: totalAmount.toFixed(2),
        totalCogs: totalCogs.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        avgProfitPerKg: avgProfitPerKg.toFixed(2),
      },
    };
  }

  /**
   * Section 5.5: Other Reports — Daily Cash Book / Day-End Closing & Receivable Aging
   */
  async getOtherReports(
    organizationId: number,
    query: OtherReportsQueryInput,
  ): Promise<OtherReportsResponseDto> {
    const { startDate, endDate, dateFromStr, dateToStr } = this.resolveDateRange(
      'CUSTOM',
      query.dateFrom,
      query.dateTo,
    );

    const [payments, expenses, advances, salaries, clients, suppliers, clientBalances] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: {
            organizationId,
            status: 'POSTED',
            paymentDate: { gte: startDate, lte: endDate },
          },
          orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.expense.findMany({
          where: {
            organizationId,
            status: 'POSTED',
            expenseDate: { gte: startDate, lte: endDate },
          },
          include: { category: true, batch: true },
          orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.salaryAdvance.findMany({
          where: {
            organizationId,
            status: 'POSTED',
            advanceDate: { gte: startDate, lte: endDate },
          },
          include: { employee: true },
          orderBy: [{ advanceDate: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.salaryRecord.findMany({
          where: {
            organizationId,
            status: 'POSTED',
            paymentDate: { gte: startDate, lte: endDate },
          },
          include: { employee: true },
          orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.client.findMany({
          where: { organizationId, isActive: true },
          include: {
            route: true,
            salesInvoices: {
              where: { status: { in: ['POSTED', 'PARTIAL', 'PAID'] } },
              orderBy: { saleDate: 'desc' },
            },
          },
        }),
        this.prisma.supplier.findMany({
          where: { organizationId },
          select: { id: true, name: true },
        }),
        this.getClientCurrentBalances(organizationId),
      ]);

    const clientMap = new Map<number, string>();
    for (const c of clients) clientMap.set(c.id, c.name);
    const supplierMap = new Map<number, string>();
    for (const s of suppliers) supplierMap.set(s.id, s.name);

    const entries: CashBookEntryDto[] = [];
    const methodTotals = new Map<string, { inAmt: Decimal; outAmt: Decimal }>();
    const ensureMethod = (m: string) => {
      const curr = methodTotals.get(m);
      if (curr) return curr;
      const fresh = { inAmt: new Decimal(0), outAmt: new Decimal(0) };
      methodTotals.set(m, fresh);
      return fresh;
    };

    let totalIn = new Decimal(0);
    let totalOut = new Decimal(0);

    for (const p of payments) {
      const amt = new Decimal(p.amount.toString());
      const mBucket = ensureMethod(p.method);
      if (p.direction === 'IN') {
        totalIn = totalIn.plus(amt);
        mBucket.inAmt = mBucket.inAmt.plus(amt);
        entries.push({
          id: `PAY-${p.id}`,
          date: p.paymentDate.toISOString().slice(0, 10),
          type: 'CLIENT_RECEIPT',
          refNo: p.paymentNo,
          partyOrPayee: clientMap.get(p.partyId) ?? `Client #${p.partyId}`,
          description: p.notes ?? 'Client payment receipt',
          method: p.method,
          cashIn: amt.toFixed(2),
          cashOut: '0.00',
        });
      } else {
        totalOut = totalOut.plus(amt);
        mBucket.outAmt = mBucket.outAmt.plus(amt);
        entries.push({
          id: `PAY-${p.id}`,
          date: p.paymentDate.toISOString().slice(0, 10),
          type: 'SUPPLIER_PAYMENT',
          refNo: p.paymentNo,
          partyOrPayee: supplierMap.get(p.partyId) ?? `Supplier #${p.partyId}`,
          description: p.notes ?? 'Supplier payment',
          method: p.method,
          cashIn: '0.00',
          cashOut: amt.toFixed(2),
        });
      }
    }

    for (const exp of expenses) {
      const amt = new Decimal(exp.amount.toString());
      totalOut = totalOut.plus(amt);
      const mBucket = ensureMethod(exp.method);
      mBucket.outAmt = mBucket.outAmt.plus(amt);
      entries.push({
        id: `EXP-${exp.id}`,
        date: exp.expenseDate.toISOString().slice(0, 10),
        type: 'EXPENSE',
        refNo: exp.expenseNo,
        partyOrPayee: exp.paidTo ?? exp.category.name,
        description: exp.batch ? `[${exp.batch.batchNo}] ${exp.description}` : exp.description,
        method: exp.method,
        cashIn: '0.00',
        cashOut: amt.toFixed(2),
      });
    }

    for (const adv of advances) {
      const amt = new Decimal(adv.amount.toString());
      totalOut = totalOut.plus(amt);
      const mBucket = ensureMethod(adv.method);
      mBucket.outAmt = mBucket.outAmt.plus(amt);
      entries.push({
        id: `ADV-${adv.id}`,
        date: adv.advanceDate.toISOString().slice(0, 10),
        type: 'SALARY_ADVANCE',
        refNo: adv.advanceNo,
        partyOrPayee: adv.employee.name,
        description: adv.notes ?? 'Salary advance issued',
        method: adv.method,
        cashIn: '0.00',
        cashOut: amt.toFixed(2),
      });
    }

    for (const sal of salaries) {
      const amt = new Decimal(sal.netAmount.toString());
      if (amt.lte(0)) continue;
      totalOut = totalOut.plus(amt);
      const mBucket = ensureMethod(sal.method);
      mBucket.outAmt = mBucket.outAmt.plus(amt);
      entries.push({
        id: `SAL-${sal.id}`,
        date: sal.paymentDate.toISOString().slice(0, 10),
        type: 'SALARY_SLIP',
        refNo: sal.salaryNo,
        partyOrPayee: sal.employee.name,
        description: `Salary slip (${sal.periodMonth})`,
        method: sal.method,
        cashIn: '0.00',
        cashOut: amt.toFixed(2),
      });
    }

    entries.sort((a, b) => b.date.localeCompare(a.date));

    const byMethod: CashBookMethodBreakdownDto[] = Array.from(methodTotals.entries()).map(
      ([method, vals]) => ({
        method,
        totalIn: vals.inAmt.toFixed(2),
        totalOut: vals.outAmt.toFixed(2),
        netFlow: vals.inAmt.minus(vals.outAmt).toFixed(2),
      }),
    );

    // Receivable Aging
    const refMs = endDate.getTime();
    let totalReceivable = new Decimal(0);
    let total0To30 = new Decimal(0);
    let total31To60 = new Decimal(0);
    let total61To90 = new Decimal(0);
    let total90Plus = new Decimal(0);
    const agingRows: ReceivableAgingRowDto[] = [];

    for (const c of clients) {
      const bal = clientBalances.get(c.id) ?? new Decimal(0);
      if (bal.lte(0)) continue;

      let remainingToAllocate = bal;
      let b0 = new Decimal(0);
      let b31 = new Decimal(0);
      let b61 = new Decimal(0);
      let b90 = new Decimal(0);

      for (const inv of c.salesInvoices) {
        if (remainingToAllocate.lte(0)) break;
        const unpaid = Decimal.max(
          0,
          new Decimal(inv.total.toString())
            .minus(inv.returnedAmount.toString())
            .minus(inv.paidAmount.toString()),
        );
        if (unpaid.lte(0)) continue;

        const alloc = Decimal.min(remainingToAllocate, unpaid);
        remainingToAllocate = remainingToAllocate.minus(alloc);

        const ageDays = Math.max(0, Math.floor((refMs - inv.saleDate.getTime()) / 86400000));
        if (ageDays <= 30) {
          b0 = b0.plus(alloc);
        } else if (ageDays <= 60) {
          b31 = b31.plus(alloc);
        } else if (ageDays <= 90) {
          b61 = b61.plus(alloc);
        } else {
          b90 = b90.plus(alloc);
        }
      }

      if (remainingToAllocate.gt(0)) {
        // Any remaining balance (e.g. opening balance) goes into 0-30 or 90+ based on client creation age
        const clientAgeDays = Math.max(0, Math.floor((refMs - c.createdAt.getTime()) / 86400000));
        if (clientAgeDays <= 30) b0 = b0.plus(remainingToAllocate);
        else if (clientAgeDays <= 60) b31 = b31.plus(remainingToAllocate);
        else if (clientAgeDays <= 90) b61 = b61.plus(remainingToAllocate);
        else b90 = b90.plus(remainingToAllocate);
      }

      totalReceivable = totalReceivable.plus(bal);
      total0To30 = total0To30.plus(b0);
      total31To60 = total31To60.plus(b31);
      total61To90 = total61To90.plus(b61);
      total90Plus = total90Plus.plus(b90);

      agingRows.push({
        clientId: c.id,
        clientCode: c.code ?? null,
        clientName: c.name,
        phone: c.phone ?? null,
        routeName: c.route?.name ?? null,
        creditLimit: new Decimal(c.creditLimit.toString()).toFixed(2),
        currentBalance: bal.toFixed(2),
        bucket0To30: b0.toFixed(2),
        bucket31To60: b31.toFixed(2),
        bucket61To90: b61.toFixed(2),
        bucket90Plus: b90.toFixed(2),
      });
    }

    agingRows.sort((a, b) => new Decimal(b.currentBalance).cmp(new Decimal(a.currentBalance)));

    return {
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      cashBook: {
        totalIn: totalIn.toFixed(2),
        totalOut: totalOut.toFixed(2),
        netCashFlow: totalIn.minus(totalOut).toFixed(2),
        byMethod,
        entries,
      },
      receivableAging: {
        totalReceivable: totalReceivable.toFixed(2),
        total0To30: total0To30.toFixed(2),
        total31To60: total31To60.toFixed(2),
        total61To90: total61To90.toFixed(2),
        total90Plus: total90Plus.toFixed(2),
        rows: agingRows,
      },
    };
  }
}
