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
  saleReturnsService = new SaleReturnsService(prismaAsService, audit, ledger, stock, numbering);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTestEnvironment() {
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
      lastName: 'User',
      username: 'admin',
      pin: '1234',
    },
  });

  const route = await routesService.createRoute(
    org.id,
    {
      code: 'R-01',
      name: 'Saddar Market Route',
      nameUr: 'صدر روٹ',
      isActive: true,
    },
    1,
  );

  const client = await clientsService.createClient(
    org.id,
    {
      routeId: route.id,
      code: 'CLI-01',
      name: 'Bismillah Kiryana',
      nameUr: 'بسم اللہ کریانہ',
      creditLimit: '100000.00',
      openingBalance: '0.00',
      phone: '03001234567',
      isActive: true,
    },
    1,
  );

  const supplier = await suppliersService.createSupplier(org.id, 1, {
    name: 'Grain Master Traders',
    openingBalance: '0.00',
    isActive: true,
  });

  const item = await itemsService.createItem(org.id, 1, {
    name: 'Daal Chana Premium',
    baseUnit: 'KG',
    defaultTaxRate: '0.00',
    isActive: true,
    alternateUnits: [
      {
        unitName: 'BAG',
        conversionFactor: '50.000',
        isDefaultForPurchase: true,
        isDefaultForSale: true,
      },
    ],
  });

  // Purchase 100 kg at 100/kg
  const purchase = await purchasesService.createPurchaseInvoice(org.id, 1, {
    supplierId: supplier.id,
    invoiceDate: '2026-11-01',
    discount: '0.00',
    extraCharges: '0.00',
    lines: [
      {
        itemId: item.id,
        enteredQty: '100.000',
        enteredUnit: 'KG',
        conversionFactor: '1.000',
        qtyBase: '100.000',
        ratePerEnteredUnit: '100.00',
        taxRate: '0.00',
      },
    ],
  });

  // Create Batch and allocate 100 kg at 100/kg (0% wastage -> output 100 kg, cost 100/kg)
  const purchaseItemId = purchase.items[0]!.id;
  const batch = await batchesService.createBatch(org.id, 1, {
    name: 'Batch Daal Chana #1',
    batchDate: '2026-11-02',
    status: 'OPEN',
    wastageMode: 'PERCENT',
    wastagePercent: '0.000',
    wastageKg: '0.000',
    allocations: [
      {
        purchaseItemId,
        kgUsed: '100.000',
      },
    ],
    costs: [],
  });

  return { org, route, client, supplier, item, purchase, batch };
}

describe('Phase 5 Sales & Returns Integration Tests', () => {
  it('creates a sale invoice from batch, deducts batch stock, captures profit snapshot, and debits client ledger', async () => {
    const { org, client, item, batch } = await seedTestEnvironment();

    // Sell 40 kg from the batch at 150/kg (Total 6,000, COGS = 40 * 100 = 4,000, Profit = 2,000)
    const sale = await salesService.createSaleInvoice(
      org.id,
      {
        clientId: client.id,
        saleDate: '2026-11-03',
        discount: '0.00',
        extraCharges: '0.00',
        lines: [
          {
            batchId: batch.id,
            itemId: item.id,
            enteredQty: '40.000',
            enteredUnit: 'KG',
            conversionFactor: '1.000',
            ratePerEnteredUnit: '150.00',
            taxRate: '0.00',
          },
        ],
      },
      1,
    );

    expect(sale.invoiceNo).toMatch(/^INV-2026-\d{4}$/);
    expect(sale.total).toBe('6000.00');
    expect(sale.totalCogs).toBe('4000.00');
    expect(sale.totalProfit).toBe('2000.00');
    expect(sale.items[0]?.batchCostRateSnapshot).toBe('100.0000');
    expect(sale.items[0]?.lineProfit).toBe('2000.00');

    // Verify batch stock reduced from 100 kg to 60 kg
    const batchDetail = await batchesService.getBatchById(org.id, batch.id);
    expect(batchDetail.availableKg).toBe('60.000');

    // Verify client ledger debited by 6,000
    const clientDetail = await clientsService.getClientById(org.id, client.id);
    expect(clientDetail.currentBalance).toBe('6000.00');
    expect(clientDetail.totalSold).toBe('6000.00');
  });

  it('prevents overselling batch stock with row-locking', async () => {
    const { org, client, item, batch } = await seedTestEnvironment();

    // Attempting to sell 120 kg when batch has only 100 kg must throw
    await expect(
      salesService.createSaleInvoice(
        org.id,
        {
          clientId: client.id,
          saleDate: '2026-11-03',
          discount: '0.00',
          extraCharges: '0.00',
          lines: [
            {
              batchId: batch.id,
              itemId: item.id,
              enteredQty: '120.000',
              enteredUnit: 'KG',
              conversionFactor: '1.000',
              ratePerEnteredUnit: '150.00',
              taxRate: '0.00',
            },
          ],
        },
        1,
      ),
    ).rejects.toThrow(/Insufficient stock in batch/);
  });

  it('processes sale returns (credit note), verifies over-return blocked, returns resaleable stock to same batch, and credits client ledger', async () => {
    const { org, client, item, batch } = await seedTestEnvironment();

    // 1. Sell 50 kg at 150/kg
    const sale = await salesService.createSaleInvoice(
      org.id,
      {
        clientId: client.id,
        saleDate: '2026-11-03',
        discount: '0.00',
        extraCharges: '0.00',
        lines: [
          {
            batchId: batch.id,
            itemId: item.id,
            enteredQty: '50.000',
            enteredUnit: 'KG',
            conversionFactor: '1.000',
            ratePerEnteredUnit: '150.00',
            taxRate: '0.00',
          },
        ],
      },
      1,
    );

    const saleItemId = sale.items[0]!.id;

    // 2. Attempt over-return: return 60 kg when only 50 kg was sold -> should fail
    await expect(
      saleReturnsService.createSaleReturn(
        org.id,
        {
          saleId: sale.id,
          returnDate: '2026-11-04',
          reasonCode: 'QUALITY',
          deduction: '0.00',
          settlementType: 'ADJUST_BALANCE',
          lines: [
            {
              saleItemId,
              enteredQty: '60.000',
              condition: 'RESALEABLE',
            },
          ],
        },
        1,
      ),
    ).rejects.toThrow(/Max available to return on this line is 50.000 kg/);

    // 3. Return 10 kg as RESALEABLE (10 * 150 = 1,500 credit)
    const ret1 = await saleReturnsService.createSaleReturn(
      org.id,
      {
        saleId: sale.id,
        returnDate: '2026-11-04',
        reasonCode: 'QUALITY',
        deduction: '0.00',
        settlementType: 'ADJUST_BALANCE',
        lines: [
          {
            saleItemId,
            enteredQty: '10.000',
            condition: 'RESALEABLE',
          },
        ],
      },
      1,
    );

    expect(ret1.returnNo).toMatch(/^CRN-2026-\d{4}$/);
    expect(ret1.total).toBe('1500.00');

    // Stock should be 100 - 50 + 10 = 60 kg
    let batchDetail = await batchesService.getBatchById(org.id, batch.id);
    expect(batchDetail.availableKg).toBe('60.000');

    // Client balance should be 7,500 - 1,500 = 6,000
    let clientDetail = await clientsService.getClientById(org.id, client.id);
    expect(clientDetail.currentBalance).toBe('6000.00');

    // 4. Return 5 kg as DAMAGED (5 * 150 = 750 credit, but NO stock added to batch)
    const ret2 = await saleReturnsService.createSaleReturn(
      org.id,
      {
        saleId: sale.id,
        returnDate: '2026-11-05',
        reasonCode: 'DAMAGED_TRANSIT',
        deduction: '0.00',
        settlementType: 'ADJUST_BALANCE',
        lines: [
          {
            saleItemId,
            enteredQty: '5.000',
            condition: 'DAMAGED',
          },
        ],
      },
      1,
    );

    expect(ret2.items[0]?.lossAmount).toBe('500.00'); // 5 kg * 100 batch snapshot cost
    expect(ret2.items[0]?.cogsReversed).toBe('0.00');

    // Batch stock stays 60 kg
    batchDetail = await batchesService.getBatchById(org.id, batch.id);
    expect(batchDetail.availableKg).toBe('60.000');

    // Client balance drops by another 750 -> 5,250
    clientDetail = await clientsService.getClientById(org.id, client.id);
    expect(clientDetail.currentBalance).toBe('5250.00');
  });

  it('prevents voiding a sale invoice with active returns, and reverses stock and ledger when voiding cleanly', async () => {
    const { org, client, item, batch } = await seedTestEnvironment();

    const sale = await salesService.createSaleInvoice(
      org.id,
      {
        clientId: client.id,
        saleDate: '2026-11-03',
        discount: '0.00',
        extraCharges: '0.00',
        lines: [
          {
            batchId: batch.id,
            itemId: item.id,
            enteredQty: '30.000',
            enteredUnit: 'KG',
            conversionFactor: '1.000',
            ratePerEnteredUnit: '150.00',
            taxRate: '0.00',
          },
        ],
      },
      1,
    );

    const saleRet = await saleReturnsService.createSaleReturn(
      org.id,
      {
        saleId: sale.id,
        returnDate: '2026-11-04',
        reasonCode: 'CUSTOMER_CANCELLED',
        deduction: '0.00',
        settlementType: 'ADJUST_BALANCE',
        lines: [
          {
            saleItemId: sale.items[0]!.id,
            enteredQty: '5.000',
            condition: 'RESALEABLE',
          },
        ],
      },
      1,
    );

    // Attempting to void sale invoice while return is active should fail
    await expect(salesService.voidSaleInvoice(org.id, sale.id, 'Test void', 1)).rejects.toThrow(
      /has active returns/,
    );

    // Void the return first
    await saleReturnsService.voidSaleReturn(org.id, saleRet.id, 'Return was a mistake', 1);

    // Now void the sale invoice
    const voidedSale = await salesService.voidSaleInvoice(
      org.id,
      sale.id,
      'Customer cancelled order',
      1,
    );
    expect(voidedSale.status).toBe('VOIDED');

    // Batch stock restored to original 100 kg
    const batchDetail = await batchesService.getBatchById(org.id, batch.id);
    expect(batchDetail.availableKg).toBe('100.000');

    // Client ledger balance back to 0.00
    const clientDetail = await clientsService.getClientById(org.id, client.id);
    expect(clientDetail.currentBalance).toBe('0.00');
  });
});
