import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { BatchesService } from '../src/batches/batches.service.js';
import { ChallansService } from '../src/challans/challans.service.js';
import { ClientsService } from '../src/clients/clients.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ItemsService } from '../src/items/items.service.js';
import { LedgerService } from '../src/ledger/ledger.module.js';
import { NumberingService } from '../src/numbering/numbering.module.js';
import { OrgService } from '../src/org/org.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
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
let paymentsService: PaymentsService;
let challansService: ChallansService;

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
  challansService = new ChallansService(prismaAsService, numbering, ledger, audit);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "salary_records", "salary_advances", "employees", "expenses", "expense_categories", "challans", "recovery_entries", "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedSaleScenario() {
  const org = await orgService.initializeFirstRun({
    organization: {
      name: 'Madina Daal Mills',
      nameUr: 'مدینہ دال ملز',
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
    { code: 'R-01', name: 'Grain Market Route', assignedOfficerId: 1, isActive: true },
    1,
  );

  const client = await clientsService.createClient(
    org.id,
    {
      name: 'Al-Karam Traders',
      nameUr: 'الکرم ٹریڈرز',
      phone: '0300-1122334',
      address: 'Shop #14, Grain Market',
      routeId: route.id,
      creditLimit: '500000.00',
      openingBalance: '10000.00',
      isActive: true,
    },
    1,
  );

  const supplier = await suppliersService.createSupplier(org.id, 1, {
    name: 'Punjab Growers',
    openingBalance: '0.00',
    isActive: true,
  });

  const item = await itemsService.createItem(org.id, 1, {
    name: 'name Fine',
    nameUr: 'دال چنا فائن',
    baseUnit: 'KG',
    defaultTaxRate: '0.00',
    isActive: true,
    alternateUnits: [],
  });

  const purchase = await purchasesService.createPurchaseInvoice(org.id, 1, {
    supplierId: supplier.id,
    invoiceDate: '2026-05-01',
    discount: '0.00',
    extraCharges: '0.00',
    lines: [
      {
        itemId: item.id,
        enteredQty: '1000.000',
        enteredUnit: 'KG',
        conversionFactor: '1.000',
        qtyBase: '1000.000',
        bagCount: 20,
        ratePerEnteredUnit: '200.0000',
        taxRate: '0.00',
      },
    ],
  });

  const batch = await batchesService.createBatch(org.id, 1, {
    itemId: item.id,
    name: 'May Chana Batch 1',
    batchDate: '2026-05-02',
    status: 'OPEN',
    wastageMode: 'KG',
    wastagePercent: '0.000',
    wastageKg: '0.000',
    allocations: [
      {
        purchaseItemId: purchase.items[0]!.id,
        kgUsed: '500.000',
      },
    ],
    costs: [],
  });

  const sale = await salesService.createSaleInvoice(
    org.id,
    {
      clientId: client.id,
      routeId: route.id,
      saleDate: '2026-05-05',
      discount: '0.00',
      extraCharges: '0.00',
      lines: [
        {
          batchId: batch.id,
          itemId: item.id,
          enteredQty: '200.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          bagCount: 4,
          ratePerEnteredUnit: '250.0000',
          taxRate: '0.00',
        },
      ],
    },
    1,
  );

  return { org, client, sale };
}

describe('Phase 8: Delivery Challans & Print Tracking (Invoice, Challan, Receipt)', () => {
  it('1. creates a gapless CH-YYYY-NNNN delivery challan with quantities only (no prices) and transitions status', async () => {
    const { org, sale } = await seedSaleScenario();

    const challan = await challansService.createChallan(org.id, 1, {
      saleId: sale.id,
      challanDate: '2026-05-05',
      riderName: 'Muhammad Aslam',
      vehicleNo: 'LHR-9988',
      notes: 'Deliver before 5 PM',
    });

    expect(challan.challanNo).toBe('CH-2026-0001');
    expect(challan.invoiceNo).toBe(sale.invoiceNo);
    expect(challan.clientName).toBe('Al-Karam Traders');
    expect(challan.clientNameUr).toBe('الکرم ٹریڈرز');
    expect(challan.riderName).toBe('Muhammad Aslam');
    expect(challan.vehicleNo).toBe('LHR-9988');
    expect(challan.status).toBe('PENDING');
    expect(challan.items).toHaveLength(1);
    expect(challan.items[0]!.qtyBase).toBe('200.000');
    expect(challan.items[0]!.bagCount).toBe(4);
    expect('ratePerBase' in challan.items[0]!).toBe(false);
    expect('lineTotal' in challan.items[0]!).toBe(false);

    const dispatched = await challansService.updateChallanStatus(org.id, 1, challan.id, {
      status: 'DISPATCHED',
    });
    expect(dispatched.status).toBe('DISPATCHED');
    expect(dispatched.dispatchedAt).toBeTruthy();

    const delivered = await challansService.updateChallanStatus(org.id, 1, challan.id, {
      status: 'DELIVERED',
      receivedBy: 'Haji Bilal',
    });
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.deliveredAt).toBeTruthy();
    expect(delivered.receivedBy).toBe('Haji Bilal');
  });

  it('2. tracks prints (ORIGINAL vs DUPLICATE) and calculates previousBalance and currentBalance accurately', async () => {
    const { org, client, sale } = await seedSaleScenario();

    const firstPrint = await challansService.trackPrint(org.id, 1, {
      docType: 'SALE_INVOICE',
      docId: sale.id,
    });
    expect(firstPrint.printCount).toBe(1);
    expect(firstPrint.isDuplicate).toBe(false);
    expect(firstPrint.previousBalance).toBe('10000.00');
    expect(firstPrint.currentBalance).toBe('60000.00');
    expect(firstPrint.organization.nameUr).toBe('مدینہ دال ملز');

    const secondPrint = await challansService.trackPrint(org.id, 1, {
      docType: 'SALE_INVOICE',
      docId: sale.id,
    });
    expect(secondPrint.printCount).toBe(2);
    expect(secondPrint.isDuplicate).toBe(true);

    const payment = await paymentsService.createClientPayment(org.id, 1, {
      clientId: client.id,
      paymentDate: '2026-05-06',
      method: 'CASH',
      amount: '25000.00',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '25000.00' }],
    });

    const receiptPrint1 = await challansService.trackPrint(org.id, 1, {
      docType: 'PAYMENT_IN',
      docId: payment.id,
    });
    expect(receiptPrint1.printCount).toBe(1);
    expect(receiptPrint1.isDuplicate).toBe(false);
    expect(receiptPrint1.currentBalance).toBe('35000.00');
  });
});
