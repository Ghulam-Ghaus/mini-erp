import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { BatchesService } from '../src/batches/batches.service.js';
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
import { RoutesService } from '../src/routes/routes.service.js';
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
let expensesService: ExpensesService;
let payrollService: PayrollService;

beforeAll(() => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });

  const prismaAsService = prisma as unknown as PrismaService;
  const audit = new AuditService();
  const numbering = new NumberingService();
  const ledger = new LedgerService();
  const stock = new StockService();
  const paymentsService = new PaymentsService(prismaAsService, audit, ledger, numbering);

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
  expensesService = new ExpensesService(prismaAsService, numbering, audit);
  payrollService = new PayrollService(prismaAsService, numbering, audit);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "salary_records", "salary_advances", "employees", "expenses", "expense_categories", "challans", "recovery_entries", "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedPhase9Base() {
  const org = await orgService.initializeFirstRun({
    organization: {
      name: 'Noor Pulse Mills',
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

  const route = await routesService.createRoute(
    org.id,
    { code: 'R-01', name: 'Main Market', assignedOfficerId: 1, isActive: true },
    1,
  );

  const client = await clientsService.createClient(
    org.id,
    {
      name: 'Sultan Traders',
      routeId: route.id,
      creditLimit: '500000.00',
      openingBalance: '0.00',
      isActive: true,
    },
    1,
  );

  const supplier = await suppliersService.createSupplier(org.id, 1, {
    name: 'Mandi Supplier',
    openingBalance: '0.00',
    isActive: true,
  });

  const item = await itemsService.createItem(org.id, 1, {
    name: 'Daal Moong',
    baseUnit: 'KG',
    defaultTaxRate: '0.00',
    isActive: true,
    alternateUnits: [],
  });

  // Purchase 1,000 kg @ 200.00/kg = 200,000.00
  const purchase = await purchasesService.createPurchaseInvoice(org.id, 1, {
    supplierId: supplier.id,
    invoiceDate: '2026-06-01',
    discount: '0.00',
    extraCharges: '0.00',
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

  // Batch allocates 1,000 kg @ 200/kg = 200,000.00 raw cost
  const batch = await batchesService.createBatch(org.id, 1, {
    itemId: item.id,
    name: 'June Moong Batch 1',
    batchDate: '2026-06-01',
    status: 'OPEN',
    wastageMode: 'KG',
    wastagePercent: '0.000',
    wastageKg: '0.000',
    allocations: [
      {
        purchaseItemId: purchase.items[0]!.id,
        kgUsed: '1000.000',
      },
    ],
    costs: [],
  });

  return { org, client, batch, item };
}

describe('Phase 9: Expenses, Employees, Salary Advances, Payroll & Net Profit', () => {
  it('1. auto-seeds expense categories, records operating & batch-linked expenses, and recalculates batch cost/kg', async () => {
    const { org, batch } = await seedPhase9Base();

    const categories = await expensesService.listCategories(org.id);
    expect(categories.length).toBeGreaterThanOrEqual(5);
    const rentCat = categories.find((c) => c.name.includes('Rent'))!;

    // 1. Operating expense (not linked to batch): 15,000.00
    const opExpense = await expensesService.createExpense(org.id, 1, {
      expenseDate: '2026-06-02',
      categoryId: rentCat.id,
      amount: '15000.00',
      method: 'CASH',
      paidTo: 'Landlord',
      description: 'Warehouse Rent June',
    });
    expect(opExpense.expenseNo).toBe('EXP-2026-0001');
    expect(opExpense.batchId).toBeNull();

    // 2. Batch-linked expense (e.g. 5,000.00 packing on 1,000 kg batch -> costPerKg becomes 205.0000)
    const batchExpense = await expensesService.createExpense(org.id, 1, {
      expenseDate: '2026-06-02',
      categoryId: rentCat.id,
      amount: '5000.00',
      method: 'CASH',
      batchId: batch.id,
      description: 'Special batch packing bags',
    });
    expect(batchExpense.expenseNo).toBe('EXP-2026-0002');
    expect(batchExpense.batchId).toBe(batch.id);
    expect(batchExpense.batchCostId).toBeTruthy();

    const updatedBatch = await batchesService.getBatchById(org.id, batch.id);
    expect(updatedBatch.extraCost).toBe('5000.00');
    expect(updatedBatch.totalCost).toBe('205000.00');
    expect(updatedBatch.costPerKg).toBe('205.00');
  });

  it('2. manages employees (FIXED_MONTHLY & PIECE_RATE), FIFO salary advances, piece-rate batch labour cost, and Net Profit calculation', async () => {
    const { org, client, batch, item } = await seedPhase9Base();

    const categories = await expensesService.listCategories(org.id);
    // Record 10,000.00 operating expense (electricity bill)
    await expensesService.createExpense(org.id, 1, {
      expenseDate: '2026-06-05',
      categoryId: categories[0]!.id,
      amount: '10000.00',
      method: 'CASH',
      description: 'June Electricity Bill',
    });

    // 1. Create a PIECE_RATE worker and link their work (1,000 kg @ 5.00/kg = 5,000.00) to the OPEN batch
    const pieceWorker = await payrollService.createEmployee(org.id, 1, {
      name: 'Bashir Loader',
      payType: 'PIECE_RATE',
      baseRate: '5.00',
      isActive: true,
    });

    const pieceSalary = await payrollService.createSalaryRecord(org.id, 1, {
      employeeId: pieceWorker.id,
      periodMonth: '2026-06',
      paymentDate: '2026-06-03',
      payType: 'PIECE_RATE',
      unitsWorked: '1000.000',
      rateApplied: '5.00',
      overtimeAmount: '0.00',
      bonusAmount: '0.00',
      deductionsAmount: '0.00',
      advanceDeducted: '0.00',
      batchId: batch.id,
      method: 'CASH',
    });
    expect(pieceSalary.basicAmount).toBe('5000.00');
    expect(pieceSalary.netAmount).toBe('5000.00');
    expect(pieceSalary.batchCostId).toBeTruthy();

    // Batch cost is now 200,000 (raw) + 5,000 (piece-rate labour) = 205,000 => 205.00/kg!
    const updatedBatch = await batchesService.getBatchById(org.id, batch.id);
    expect(updatedBatch.costPerKg).toBe('205.00');

    // 2. Sell 500 kg from this batch @ 265.00/kg => Revenue = 132,500, COGS = 500 * 205 = 102,500, Gross Profit = 30,000.00
    const sale = await salesService.createSaleInvoice(
      org.id,
      {
        clientId: client.id,
        saleDate: '2026-06-10',
        discount: '0.00',
        extraCharges: '0.00',
        lines: [
          {
            batchId: batch.id,
            itemId: item.id,
            enteredQty: '500.000',
            enteredUnit: 'KG',
            conversionFactor: '1.000',
            ratePerEnteredUnit: '265.0000',
            taxRate: '0.00',
          },
        ],
      },
      1,
    );
    expect(sale.totalProfit).toBe('30000.00');

    // 3. Create FIXED_MONTHLY employee (salary 12,000.00), give 3,000.00 advance, then process salary with 1,000.00 bonus & 3,000.00 advance deduction
    const monthlyEmp = await payrollService.createEmployee(org.id, 1, {
      name: 'Tariq Accountant',
      payType: 'FIXED_MONTHLY',
      baseRate: '12000.00',
      isActive: true,
    });

    const adv = await payrollService.createAdvance(org.id, 1, {
      employeeId: monthlyEmp.id,
      advanceDate: '2026-06-12',
      amount: '3000.00',
      method: 'CASH',
    });
    expect(adv.unsettledAmount).toBe('3000.00');

    // Attempt to over-deduct advance (4,000 > 3,000) -> blocked!
    await expect(
      payrollService.createSalaryRecord(org.id, 1, {
        employeeId: monthlyEmp.id,
        periodMonth: '2026-06',
        paymentDate: '2026-06-30',
        payType: 'FIXED_MONTHLY',
        unitsWorked: '1.000',
        rateApplied: '12000.00',
        overtimeAmount: '0.00',
        bonusAmount: '1000.00',
        deductionsAmount: '0.00',
        advanceDeducted: '4000.00',
        method: 'CASH',
      }),
    ).rejects.toThrow(/unsettled advance/);

    // Settle with 3,000.00 advance deduction: Basic 12,000 + Bonus 1,000 = 13,000 payroll expense; Net cash paid = 10,000.00
    const monthlySlip = await payrollService.createSalaryRecord(org.id, 1, {
      employeeId: monthlyEmp.id,
      periodMonth: '2026-06',
      paymentDate: '2026-06-30',
      payType: 'FIXED_MONTHLY',
      unitsWorked: '1.000',
      rateApplied: '12000.00',
      overtimeAmount: '0.00',
      bonusAmount: '1000.00',
      deductionsAmount: '0.00',
      advanceDeducted: '3000.00',
      method: 'CASH',
    });
    expect(monthlySlip.basicAmount).toBe('12000.00');
    expect(monthlySlip.netAmount).toBe('10000.00');

    // Verify Net Profit:
    // Gross Profit = 30,000.00
    // Operating Expenses = 10,000.00
    // Operating Payroll = 13,000.00 (12,000 basic + 1,000 bonus; piece-rate 5,000 is batch-capitalized so not double-counted!)
    // Net Profit = 30,000 - 10,000 - 13,000 = 7,000.00
    const summary = await payrollService.getNetProfitSummary(org.id, {});
    expect(summary.netGrossProfit).toBe('30000.00');
    expect(summary.operatingExpenses).toBe('10000.00');
    expect(summary.operatingPayroll).toBe('13000.00');
    expect(summary.batchCapitalizedPayroll).toBe('5000.00');
    expect(summary.netProfit).toBe('7000.00');
  });
});
