import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { BatchesService } from '../src/batches/batches.service.js';
import { ChallansService } from '../src/challans/challans.service.js';
import { ClientsService } from '../src/clients/clients.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ExpensesService } from '../src/expenses/expenses.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ItemsService } from '../src/items/items.service.js';
import { LedgerService } from '../src/ledger/ledger.module.js';
import { NumberingService } from '../src/numbering/numbering.module.js';
import { OrgService } from '../src/org/org.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PayrollService } from '../src/payroll/payroll.service.js';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { ReportsService } from '../src/reports/reports.service.js';
import { RoutesService } from '../src/routes/routes.service.js';
import { SaleReturnsService } from '../src/sale-returns/sale-returns.service.js';
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.module.js';
import { SuppliersService } from '../src/suppliers/suppliers.service.js';
import { requireTestDatabaseUrl } from './test-db.js';

let prisma: PrismaClient;
let orgService: OrgService;
let itemsService: ItemsService;
let suppliersService: SuppliersService;
let purchasesService: PurchasesService;
let batchesService: BatchesService;
let routesService: RoutesService;
let clientsService: ClientsService;
let salesService: SalesService;
let saleReturnsService: SaleReturnsService;
let challansService: ChallansService;
let paymentsService: PaymentsService;
let expensesService: ExpensesService;
let payrollService: PayrollService;
let reportsService: ReportsService;

beforeAll(() => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });

  const prismaAsService = prisma as unknown as PrismaService;
  const audit = new AuditService();
  const numbering = new NumberingService();
  const ledger = new LedgerService();
  const stock = new StockService();
  paymentsService = new PaymentsService(prismaAsService, audit, ledger, numbering);

  orgService = new OrgService(prismaAsService, audit);
  itemsService = new ItemsService(prismaAsService, audit, stock);
  suppliersService = new SuppliersService(prismaAsService, audit, ledger);
  purchasesService = new PurchasesService(
    prismaAsService,
    audit,
    ledger,
    stock,
    numbering,
    paymentsService,
  );
  batchesService = new BatchesService(prismaAsService, numbering, stock, audit);
  routesService = new RoutesService(prismaAsService, audit);
  clientsService = new ClientsService(prismaAsService, audit, ledger);
  salesService = new SalesService(prismaAsService, audit, ledger, stock, numbering);
  saleReturnsService = new SaleReturnsService(prismaAsService, audit, ledger, stock, numbering);
  challansService = new ChallansService(prismaAsService, numbering, ledger, audit);
  expensesService = new ExpensesService(prismaAsService, numbering, audit);
  payrollService = new PayrollService(prismaAsService, numbering, audit);
  reportsService = new ReportsService(prismaAsService);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "salary_records", "salary_advances", "employees", "expenses", "expense_categories", "challans", "recovery_entries", "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Phase 10: Dashboard, Detailed Sales Report & Other Reports', () => {
  it('1. computes Dashboard KPIs, Batch Performance, Detailed Sales Report (Notebook Page 2), Cash Book, and Receivable Aging accurately', async () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    const org = await orgService.initializeFirstRun({
      organization: {
        name: 'Al-Karam Pulse Trading',
        currency: 'PKR',
        dateFormat: 'DD/MM/YYYY',
        taxEnabled: false,
        taxName: 'GST',
        defaultTaxRate: '0.00',
        inactivityLockMinutes: 15,
      },
      admin: {
        firstName: 'Admin',
        lastName: 'User',
        username: 'admin',
        pin: '1234',
      },
    });
    const orgId = org.id;
    const adminUser = await prisma.user.findFirstOrThrow({ where: { username: 'admin' } });
    const userId = adminUser.id;

    const item = await itemsService.createItem(orgId, userId, {
      name: 'Daal Masoor',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });

    const supplier = await suppliersService.createSupplier(orgId, userId, {
      name: 'Multan Grain Supplier',
      openingBalance: '0.00',
      isActive: true,
    });

    // Purchase 1,000 kg @ 200.00/kg = 200,000.00
    const purchase = await purchasesService.createPurchaseInvoice(orgId, userId, {
      supplierId: supplier.id,
      invoiceDate: todayStr,
      extraCharges: '0.00',
      discount: '0.00',
      lines: [
        {
          itemId: item.id,
          enteredQty: '1000.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          qtyBase: '1000.000',
          ratePerEnteredUnit: '200.0000',
          taxRate: '0.00',
        },
      ],
    });

    // Batch: 1,000 kg raw, 0% wastage -> costPerKg = 200.00
    const batch = await batchesService.createBatch(orgId, userId, {
      name: 'Masoor Batch #1',
      itemId: item.id,
      batchDate: todayStr,
      status: 'OPEN',
      wastageMode: 'KG',
      wastagePercent: '0.000',
      wastageKg: '0.000',
      allocations: [{ purchaseItemId: purchase.items[0]!.id, kgUsed: '1000.000' }],
      costs: [],
    });

    const route = await routesService.createRoute(
      orgId,
      {
        code: 'R-01',
        name: 'Jodia Bazaar Route',
        assignedOfficerId: userId,
        isActive: true,
      },
      userId,
    );

    const client = await clientsService.createClient(
      orgId,
      {
        name: 'Madina General Store',
        routeId: route.id,
        creditLimit: '500000.00',
        openingBalance: '0.00',
        isActive: true,
      },
      userId,
    );
    await prisma.client.update({
      where: { id: client.id },
      data: {
        promisedDate: new Date(`${todayStr}T00:00:00.000Z`),
        promisedAmount: '50000.00',
      },
    });

    // Sale Invoice: 200 kg @ 260.00/kg = 52,000.00
    // Snapshot COGS: 200 * 200.00 = 40,000.00 -> Profit = 12,000.00
    const sale = await salesService.createSaleInvoice(
      orgId,
      {
        clientId: client.id,
        routeId: route.id,
        saleDate: todayStr,
        discount: '0.00',
        extraCharges: '0.00',
        lines: [
          {
            batchId: batch.id,
            itemId: item.id,
            enteredQty: '200.000',
            enteredUnit: 'KG',
            conversionFactor: '1.000',
            ratePerEnteredUnit: '260.0000',
            taxRate: '0.00',
          },
        ],
      },
      userId,
    );

    // Create Challan for Sale
    const challan = await challansService.createChallan(orgId, userId, {
      saleId: sale.id,
      challanDate: todayStr,
      riderName: 'Rashid Rider',
      vehicleNo: 'KHI-9901',
    });

    // Sale Return (RESALEABLE): 20 kg @ 260/kg = 5,200.00
    // COGS Reversed: 20 * 200.00 = 4,000.00 -> Profit reduced by 1,200.00
    // Net Sold = 180 kg, Net Sale = 46,800.00, Net COGS = 36,000.00, Net Gross Profit = 10,800.00
    await saleReturnsService.createSaleReturn(
      orgId,
      {
        saleId: sale.id,
        returnDate: todayStr,
        reasonCode: 'OTHER',
        deduction: '0.00',
        settlementType: 'ADJUST_BALANCE',
        lines: [
          {
            saleItemId: sale.items[0]!.id,
            enteredQty: '20.000',
            condition: 'RESALEABLE',
          },
        ],
      },
      userId,
    );

    // Client Cash Receipt: 16,800.00 (allocated to sale) + Pending Cheque: 10,000.00 due in 2 days
    await paymentsService.createClientPayment(orgId, userId, {
      clientId: client.id,
      paymentDate: todayStr,
      method: 'CASH',
      amount: '16800.00',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '16800.00' }],
    });

    const twoDaysLater = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await paymentsService.createClientPayment(orgId, userId, {
      clientId: client.id,
      paymentDate: todayStr,
      method: 'CHEQUE',
      amount: '10000.00',
      bankName: 'Meezan Bank',
      referenceNo: 'CHQ-7788',
      chequeDate: twoDaysLater,
      proofFileName: 'cheque.png',
      proofDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '10000.00' }],
    });

    // Operating Expense: 1,800.00
    const categories = await expensesService.listCategories(orgId);
    await expensesService.createExpense(orgId, userId, {
      expenseDate: todayStr,
      categoryId: categories[0]!.id,
      amount: '1800.00',
      method: 'CASH',
      description: 'Office Electricity Bill',
    });

    // Operating Salary: 3,000.00
    const emp = await payrollService.createEmployee(orgId, userId, {
      name: 'Tariq Clerk',
      payType: 'FIXED_MONTHLY',
      baseRate: '3000.00',
      isActive: true,
    });
    await payrollService.createSalaryRecord(orgId, userId, {
      employeeId: emp.id,
      periodMonth: todayStr.slice(0, 7),
      paymentDate: todayStr,
      payType: 'FIXED_MONTHLY',
      unitsWorked: '1.000',
      rateApplied: '3000.00',
      overtimeAmount: '0.00',
      bonusAmount: '0.00',
      deductionsAmount: '0.00',
      advanceDeducted: '0.00',
      method: 'CASH',
    });

    // 1. Verify Dashboard Report
    const dashboard = await reportsService.getDashboard(orgId, {
      preset: 'CUSTOM',
      dateFrom: todayStr,
      dateTo: todayStr,
    });

    expect(dashboard.kpis.grossSales).toBe('52000.00');
    expect(dashboard.kpis.saleReturnsTotal).toBe('5200.00');
    expect(dashboard.kpis.totalSales).toBe('46800.00');
    expect(dashboard.kpis.totalReceived).toBe('26800.00');
    expect(dashboard.kpis.totalReceivable).toBe('20000.00');
    expect(dashboard.kpis.pendingChequesCount).toBe(1);
    expect(dashboard.kpis.pendingChequesAmount).toBe('10000.00');
    expect(dashboard.kpis.grossProfit).toBe('10800.00');
    expect(dashboard.kpis.operatingExpenses).toBe('4800.00'); // 1800 + 3000
    expect(dashboard.kpis.netProfit).toBe('6000.00'); // 10800 - 4800

    expect(dashboard.batchPerformance.length).toBe(1);
    const bp = dashboard.batchPerformance[0]!;
    expect(bp.soldKg).toBe('180.000');
    expect(bp.remainingKg).toBe('820.000');
    expect(bp.costPerKg).toBe('200.00');
    expect(bp.avgSaleRatePerKg).toBe('260.00');
    expect(bp.profitPerKg).toBe('60.00');
    expect(bp.totalProfit).toBe('10800.00');

    expect(dashboard.chequesDueSoon.length).toBe(1);
    expect(dashboard.chequesDueSoon[0]!.chequeNo).toBe('CHQ-7788');
    expect(dashboard.todaysRecoveryDue.length).toBe(1);
    expect(dashboard.overdueClients.length).toBe(1);

    // 2. Verify Detailed Sales Report (Notebook Page 2)
    const detailedSales = await reportsService.getDetailedSalesReport(orgId, {
      dateFrom: todayStr,
      dateTo: todayStr,
    });

    expect(detailedSales.rows.length).toBe(1);
    const row = detailedSales.rows[0]!;
    expect(row.invoiceNo).toBe(sale.invoiceNo);
    expect(row.challanNo).toBe(challan.challanNo);
    expect(row.batchNo).toBe(batch.batchNo);
    expect(row.batchCostPerKg).toBe('200.00');
    expect(row.saleRatePerKg).toBe('260.00');
    expect(row.grossQtyKg).toBe('200.000');
    expect(row.returnedQtyKg).toBe('20.000');
    expect(row.netQtyKg).toBe('180.000');
    expect(row.amount).toBe('46800.00');
    expect(row.cogs).toBe('36000.00');
    expect(row.profit).toBe('10800.00');
    expect(row.profitPerKg).toBe('60.00');
    expect(row.paymentStatus).toBe('PARTIAL');

    expect(detailedSales.totals.totalNetQtyKg).toBe('180.000');
    expect(detailedSales.totals.totalAmount).toBe('46800.00');
    expect(detailedSales.totals.totalCogs).toBe('36000.00');
    expect(detailedSales.totals.totalProfit).toBe('10800.00');
    expect(detailedSales.totals.avgProfitPerKg).toBe('60.00');

    // 3. Verify Other Reports (Cash Book & Receivable Aging)
    const otherReports = await reportsService.getOtherReports(orgId, {
      dateFrom: todayStr,
      dateTo: todayStr,
    });

    expect(otherReports.cashBook.totalIn).toBe('26800.00'); // 16800 cash + 10000 cheque
    expect(otherReports.cashBook.totalOut).toBe('4800.00'); // 1800 expense + 3000 salary
    expect(otherReports.cashBook.netCashFlow).toBe('22000.00');

    expect(otherReports.receivableAging.totalReceivable).toBe('20000.00');
    expect(otherReports.receivableAging.total0To30).toBe('20000.00');
    expect(otherReports.receivableAging.rows.length).toBe(1);
  });
});
