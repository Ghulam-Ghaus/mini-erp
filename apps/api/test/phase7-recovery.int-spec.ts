import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { BatchesService } from '../src/batches/batches.service.js';
import { ClientsService } from '../src/clients/clients.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ItemsService } from '../src/items/items.service.js';
import { LedgerService } from '../src/ledger/ledger.module.js';
import { NumberingService } from '../src/numbering/numbering.module.js';
import { OrgService } from '../src/org/org.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { RecoveryService } from '../src/recovery/recovery.service.js';
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
let recoveryService: RecoveryService;

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
  recoveryService = new RecoveryService(prismaAsService, audit, ledger, paymentsService);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "recovery_entries", "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedRecoveryScenario() {
  const org = await orgService.initializeFirstRun({
    organization: {
      name: 'RZ Trading',
      currency: 'PKR',
      dateFormat: 'DD/MM/YYYY',
      taxEnabled: false,
      taxName: 'GST',
      defaultTaxRate: '0.00',
      inactivityLockMinutes: 15,
    },
    admin: {
      firstName: 'Admin',
      lastName: 'Officer',
      username: 'admin',
      pin: '1234',
    },
  });

  const route = await routesService.createRoute(
    org.id,
    { code: 'R-01', name: 'Saddar Route', assignedOfficerId: 1, isActive: true },
    1,
  );

  // Client A: MONDAY recovery day
  const clientMonday = await clientsService.createClient(
    org.id,
    {
      name: 'Al-Noor Traders',
      routeId: route.id,
      recoveryDay: 'MONDAY',
      creditLimit: '100000.00',
      openingBalance: '0.00',
      isActive: true,
    },
    1,
  );

  // Client B: THURSDAY recovery day
  const clientThursday = await clientsService.createClient(
    org.id,
    {
      name: 'Bismillah Store',
      routeId: route.id,
      recoveryDay: 'THURSDAY',
      creditLimit: '100000.00',
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
    name: 'name',
    baseUnit: 'KG',
    defaultTaxRate: '0.00',
    isActive: true,
    alternateUnits: [],
  });

  const purchase = await purchasesService.createPurchaseInvoice(org.id, 1, {
    supplierId: supplier.id,
    invoiceDate: '2026-10-01',
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

  const batch = await batchesService.createBatch(org.id, 1, {
    name: 'Batch 01',
    batchDate: '2026-10-01',
    itemId: item.id,
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

  // Sale 1 for Client Monday on 2026-10-20 (20 days old on 2026-11-09): 100 kg @ 300 = 30,000.00
  const saleMonday = await salesService.createSaleInvoice(
    org.id,
    {
      clientId: clientMonday.id,
      saleDate: '2026-10-20',
      discount: '0.00',
      extraCharges: '0.00',
      lines: [
        {
          batchId: batch.id,
          itemId: item.id,
          enteredQty: '100.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          ratePerEnteredUnit: '300.0000',
          taxRate: '0.00',
        },
      ],
    },
    1,
  );

  // Sale 2 for Client Thursday on 2026-11-05 (4 days old on 2026-11-09): 50 kg @ 300 = 15,000.00
  const saleThursday = await salesService.createSaleInvoice(
    org.id,
    {
      clientId: clientThursday.id,
      saleDate: '2026-11-05',
      discount: '0.00',
      extraCharges: '0.00',
      lines: [
        {
          batchId: batch.id,
          itemId: item.id,
          enteredQty: '50.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          ratePerEnteredUnit: '300.0000',
          taxRate: '0.00',
        },
      ],
    },
    1,
  );

  return { org, route, clientMonday, clientThursday, saleMonday, saleThursday };
}

describe('Phase 7 — Recovery Schedule, Officer Daily Screen, Recovery Entries & Aging', () => {
  it('filters Today Recovery by weekday and surfaces promised clients on their promised date', async () => {
    const { org, clientMonday, clientThursday } = await seedRecoveryScenario();

    // 2026-11-09 is a MONDAY -> only clientMonday should appear
    const mondayQueue = await recoveryService.getTodaysRecovery(org.id, {
      targetDate: '2026-11-09',
    });

    expect(mondayQueue.weekday).toBe('MONDAY');
    expect(mondayQueue.clientsDueCount).toBe(1);
    expect(mondayQueue.items[0]!.clientId).toBe(clientMonday.id);
    expect(mondayQueue.items[0]!.currentBalance).toBe('30000.00');
    expect(mondayQueue.items[0]!.oldestInvoiceDays).toBe(20);

    // Log a PROMISED visit on clientThursday promising to pay on 2026-11-09
    const promiseEntry = await recoveryService.createRecoveryEntry(org.id, 1, {
      clientId: clientThursday.id,
      visitDate: '2026-11-06',
      outcome: 'PROMISED',
      amount: '0.00',
      nextPromisedDate: '2026-11-09',
      promisedAmount: '15000.00',
      remarks: 'Will pay Monday afternoon',
      allocations: [],
    });

    expect(promiseEntry.outcome).toBe('PROMISED');
    expect(promiseEntry.nextPromisedDate).toBe('2026-11-09');

    // Now on 2026-11-09, both clientMonday (SCHEDULED_DAY) and clientThursday (PROMISED_DUE) appear
    const updatedMondayQueue = await recoveryService.getTodaysRecovery(org.id, {
      targetDate: '2026-11-09',
    });

    expect(updatedMondayQueue.clientsDueCount).toBe(2);
    expect(updatedMondayQueue.totalReceivableDue).toBe('45000.00');
  });

  it('auto-creates a Payment In receipt, allocates open invoices FIFO, and updates client ledger on PARTIAL and COLLECTED outcomes', async () => {
    const { org, clientMonday, saleMonday } = await seedRecoveryScenario();

    // 1. Log PARTIAL collection of 12,000.00 with nextPromisedDate
    const partialEntry = await recoveryService.createRecoveryEntry(org.id, 1, {
      clientId: clientMonday.id,
      visitDate: '2026-11-09',
      outcome: 'PARTIAL',
      amount: '12000.00',
      method: 'CASH',
      nextPromisedDate: '2026-11-12',
      remarks: 'Collected 12k cash, rest on Thursday',
      allocations: [],
    });

    expect(partialEntry.paymentNo).toBe('RCP-2026-0001');
    expect(partialEntry.amount).toBe('12000.00');

    const saleAfterPartial = await salesService.getSaleById(org.id, saleMonday.id);
    expect(saleAfterPartial.paidAmount).toBe('12000.00');
    expect(saleAfterPartial.balanceDue).toBe('18000.00');
    expect(saleAfterPartial.status).toBe('PARTIAL');

    // 2. Log COLLECTED for remaining 18,000.00
    const collectedEntry = await recoveryService.createRecoveryEntry(org.id, 1, {
      clientId: clientMonday.id,
      visitDate: '2026-11-12',
      outcome: 'COLLECTED',
      amount: '18000.00',
      method: 'CASH',
      remarks: 'Full balance cleared',
      allocations: [],
    });

    expect(collectedEntry.paymentNo).toBe('RCP-2026-0002');

    const saleAfterFull = await salesService.getSaleById(org.id, saleMonday.id);
    expect(saleAfterFull.paidAmount).toBe('30000.00');
    expect(saleAfterFull.balanceDue).toBe('0.00');
    expect(saleAfterFull.status).toBe('PAID');

    const clientAfterFull = await clientsService.getClientById(org.id, clientMonday.id);
    expect(clientAfterFull.currentBalance).toBe('0.00');
  });

  it('computes exact Decimal receivable aging buckets (0-7, 8-15, 16-30, 31-60, 60+ days)', async () => {
    const { org } = await seedRecoveryScenario();

    // As of 2026-11-09:
    // - saleThursday (2026-11-05) is 4 days old -> 15,000.00 in bucket0to7
    // - saleMonday (2026-10-20) is 20 days old -> 30,000.00 in bucket16to30
    const aging = await recoveryService.getReceivableAging(org.id, {
      asOfDate: '2026-11-09',
    });

    expect(aging.totalBucket0to7).toBe('15000.00');
    expect(aging.totalBucket8to15).toBe('0.00');
    expect(aging.totalBucket16to30).toBe('30000.00');
    expect(aging.totalBucket31to60).toBe('0.00');
    expect(aging.totalBucket60Plus).toBe('0.00');
    expect(aging.grandTotalReceivable).toBe('45000.00');
    expect(aging.rows).toHaveLength(2);
  });
});
