import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { BatchesService } from '../src/batches/batches.service.js';
import { ClientsService } from '../src/clients/clients.service.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ItemsService } from '../src/items/items.service.js';
import { LedgerService } from '../src/ledger/ledger.module.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
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
let notificationsService: NotificationsService;

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
  notificationsService = new NotificationsService(prismaAsService);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "notifications", "salary_records", "salary_advances", "employees", "expenses", "expense_categories", "challans", "recovery_entries", "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Phase 11: Notifications & Automated Hourly Alert Scanner', () => {
  it('1. detects cheques due, bounced cheques, recovery due, credit limit exceeded, low batch stock, open batch aging, and backup warning with strict idempotency', async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

    const org = await orgService.initializeFirstRun({
      organization: {
        name: 'Alerts Test Org',
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

    // 1. Setup client with small credit limit: 10,000.00 & promised recovery today
    const route = await routesService.createRoute(
      orgId,
      { code: 'R-1', name: 'Alert Route', assignedOfficerId: userId, isActive: true },
      userId,
    );
    const client = await clientsService.createClient(
      orgId,
      {
        name: 'Overlimit Client',
        routeId: route.id,
        creditLimit: '10000.00',
        openingBalance: '15000.00', // exceeds 10,000 credit limit!
        isActive: true,
      },
      userId,
    );
    await prisma.client.update({
      where: { id: client.id },
      data: {
        promisedDate: new Date(`${todayStr}T00:00:00.000Z`),
        promisedAmount: '5000.00',
      },
    });

    // 2. Setup incoming cheque due tomorrow
    const chequePayment = await paymentsService.createClientPayment(orgId, userId, {
      clientId: client.id,
      paymentDate: todayStr,
      method: 'CHEQUE',
      amount: '8000.00',
      bankName: 'HBL',
      referenceNo: 'CHQ-1122',
      chequeDate: tomorrowStr,
      proofFileName: 'chq.png',
      proofDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      allocations: [],
    });
    expect(chequePayment.id).toBeGreaterThan(0);

    // 3. Setup a bounced cheque
    const bouncedPayment = await paymentsService.createClientPayment(orgId, userId, {
      clientId: client.id,
      paymentDate: todayStr,
      method: 'CHEQUE',
      amount: '5000.00',
      bankName: 'UBL',
      referenceNo: 'CHQ-9988',
      chequeDate: todayStr,
      proofFileName: 'chq2.png',
      proofDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      allocations: [],
    });
    const bouncedCheque = await prisma.cheque.findFirstOrThrow({
      where: { paymentId: bouncedPayment.id },
    });
    await paymentsService.updateChequeStatus(orgId, userId, bouncedCheque.id, {
      status: 'BOUNCED',
      bouncedDate: todayStr,
      bounceReason: 'Insufficient funds',
      bounceFee: '0.00',
    });

    // 4. Setup batch with low remaining stock & open for > 30 days
    const item = await itemsService.createItem(orgId, userId, {
      name: 'Daal Alert',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });
    const supplier = await suppliersService.createSupplier(orgId, userId, {
      name: 'Alert Supplier',
      openingBalance: '0.00',
      isActive: true,
    });
    const purchase = await purchasesService.createPurchaseInvoice(orgId, userId, {
      supplierId: supplier.id,
      invoiceDate: '2026-01-01',
      discount: '0.00',
      extraCharges: '0.00',
      lines: [
        {
          itemId: item.id,
          enteredQty: '100.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          qtyBase: '100.000',
          ratePerEnteredUnit: '100.0000',
          taxRate: '0.00',
        },
      ],
    });
    const batch = await batchesService.createBatch(orgId, userId, {
      name: 'Old Low Stock Batch',
      itemId: item.id,
      batchDate: '2026-01-02', // > 30 days ago!
      status: 'OPEN',
      wastageMode: 'KG',
      wastagePercent: '0.000',
      wastageKg: '0.000',
      allocations: [{ purchaseItemId: purchase.items[0]!.id, kgUsed: '100.000' }],
      costs: [],
    });
    // Sell 60 kg so 40 kg remains (<= 100 kg threshold)
    await salesService.createSaleInvoice(
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
            enteredQty: '60.000',
            enteredUnit: 'KG',
            conversionFactor: '1.000',
            ratePerEnteredUnit: '150.0000',
            taxRate: '0.00',
          },
        ],
      },
      userId,
    );

    // 5. Run Alert Scanner
    const firstScan = await notificationsService.scanAndGenerate(orgId);
    expect(firstScan.createdCount).toBeGreaterThanOrEqual(6);
    expect(firstScan.unreadCount).toBe(firstScan.createdCount);

    const list = await notificationsService.listNotifications(orgId, {});
    const types = list.data.map((n) => n.type);
    expect(types).toContain('CREDIT_LIMIT_EXCEEDED');
    expect(types).toContain('RECOVERY_DUE');
    expect(types).toContain('CHEQUE_DUE');
    expect(types).toContain('CHEQUE_BOUNCED');
    expect(types).toContain('LOW_BATCH_STOCK');
    expect(types).toContain('BATCH_OPEN_LONG');
    expect(types).toContain('BACKUP_WARNING');

    // 6. Test Idempotency: Running scan again should NOT produce duplicate alerts today!
    const secondScan = await notificationsService.scanAndGenerate(orgId);
    expect(secondScan.createdCount).toBe(0);
    expect(secondScan.unreadCount).toBe(firstScan.unreadCount);

    // 7. Test Mark as Read & Mark All as Read
    const firstNotification = list.data[0]!;
    const readOne = await notificationsService.markAsRead(orgId, firstNotification.id);
    expect(readOne.isRead).toBe(true);

    const unreadAfterOne = await notificationsService.listNotifications(orgId, {
      unreadOnly: true,
    });
    expect(unreadAfterOne.total).toBe(firstScan.unreadCount - 1);

    const markAll = await notificationsService.markAllAsRead(orgId);
    expect(markAll.count).toBe(firstScan.unreadCount - 1);

    const unreadFinal = await notificationsService.listNotifications(orgId, { unreadOnly: true });
    expect(unreadFinal.total).toBe(0);
  });
});
