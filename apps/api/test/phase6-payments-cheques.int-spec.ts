import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { SalesService } from '../src/sales/sales.service.js';
import { StockService } from '../src/stock/stock.module.js';
import { SuppliersService } from '../src/suppliers/suppliers.service.js';
import { requireTestDatabaseUrl } from './test-db.js';

const DUMMY_PROOF =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });

  // Ensure Phase 6 cheques table exists in test DB
  const migrationSql = readFileSync(
    join(
      process.cwd(),
      '..',
      '..',
      'prisma',
      'migrations',
      '20261106050000_phase6_cheques',
      'migration.sql',
    ),
    'utf8',
  );
  // Idempotent table creation for test DB
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cheques') THEN
        ${migrationSql}
      END IF;
    END
    $$;
  `);

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
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedSaleScenario() {
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
    { code: 'R-01', name: 'Saddar Route', isActive: true },
    1,
  );

  const client = await clientsService.createClient(
    org.id,
    {
      name: 'Al-Madina Store',
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
    name: 'Daal Chana',
    baseUnit: 'KG',
    defaultTaxRate: '0.00',
    isActive: true,
    alternateUnits: [],
  });

  const purchase = await purchasesService.createPurchaseInvoice(org.id, 1, {
    supplierId: supplier.id,
    invoiceDate: '2026-11-01',
    discount: '0.00',
    extraCharges: '0.00',
    lines: [
      {
        itemId: item.id,
        enteredQty: '500.000',
        enteredUnit: 'KG',
        conversionFactor: '1.000',
        qtyBase: '500.000',
        ratePerEnteredUnit: '200.0000',
        taxRate: '0.00',
      },
    ],
  });

  const batch = await batchesService.createBatch(org.id, 1, {
    name: 'Batch 01',
    batchDate: '2026-11-02',
    itemId: item.id,
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

  // Create Sale Invoice for 100 kg @ 250 = 25,000.00
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
          enteredQty: '100.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          ratePerEnteredUnit: '250.0000',
          taxRate: '0.00',
        },
      ],
    },
    1,
  );

  return { org, client, supplier, sale };
}

describe('Phase 6 — Payments In, Cheques Lifecycle, Proof Upload & Ledger Allocation', () => {
  it('records CASH and BANK_TRANSFER client receipts, allocates against sale invoices, and enforces proof upload on non-cash', async () => {
    const { org, client, sale } = await seedSaleScenario();

    // 1. Non-cash payment without proof must be rejected
    await expect(
      paymentsService.createClientPayment(org.id, 1, {
        clientId: client.id,
        paymentDate: '2026-11-04',
        method: 'BANK_TRANSFER',
        amount: '10000.00',
        referenceNo: 'TXN-9988',
        allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '10000.00' }],
      }),
    ).rejects.toThrow(/Proof upload/i);

    // 2. Partial CASH payment (10,000.00) -> no proof required, invoice becomes PARTIAL
    const cashReceipt = await paymentsService.createClientPayment(org.id, 1, {
      clientId: client.id,
      paymentDate: '2026-11-04',
      method: 'CASH',
      amount: '10000.00',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '10000.00' }],
    });

    expect(cashReceipt.paymentNo).toBe('RCP-2026-0001');
    expect(cashReceipt.allocatedAmount).toBe('10000.00');
    expect(cashReceipt.unallocatedAmount).toBe('0.00');

    const saleAfterPartial = await salesService.getSaleById(org.id, sale.id);
    expect(saleAfterPartial.paidAmount).toBe('10000.00');
    expect(saleAfterPartial.balanceDue).toBe('15000.00');
    expect(saleAfterPartial.status).toBe('PARTIAL');

    // 3. BANK_TRANSFER payment with proof (18,000.00: 15,000 allocated to invoice + 3,000 unallocated advance)
    const bankReceipt = await paymentsService.createClientPayment(org.id, 1, {
      clientId: client.id,
      paymentDate: '2026-11-05',
      method: 'BANK_TRANSFER',
      amount: '18000.00',
      referenceNo: 'IBFT-1122',
      bankName: 'Meezan Bank',
      proofDataUrl: DUMMY_PROOF,
      proofFileName: 'ibft-slip.png',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '15000.00' }],
    });

    expect(bankReceipt.paymentNo).toBe('RCP-2026-0002');
    expect(bankReceipt.allocatedAmount).toBe('15000.00');
    expect(bankReceipt.unallocatedAmount).toBe('3000.00');
    expect(bankReceipt.attachments).toHaveLength(1);

    const saleAfterFull = await salesService.getSaleById(org.id, sale.id);
    expect(saleAfterFull.paidAmount).toBe('25000.00');
    expect(saleAfterFull.balanceDue).toBe('0.00');
    expect(saleAfterFull.status).toBe('PAID');

    // Client ledger balance should be 25,000 - 10,000 - 18,000 = -3,000.00 (credit on account)
    const updatedClient = await clientsService.getClientById(org.id, client.id);
    expect(updatedClient.currentBalance).toBe('-3000.00');
  });

  it('manages cheque lifecycle (RECEIVED -> DEPOSITED -> CLEARED)', async () => {
    const { org, client, sale } = await seedSaleScenario();

    const chequeReceipt = await paymentsService.createClientPayment(org.id, 1, {
      clientId: client.id,
      paymentDate: '2026-11-04',
      method: 'CHEQUE',
      amount: '25000.00',
      referenceNo: 'CHQ-5001',
      bankName: 'HBL',
      chequeDate: '2026-11-10',
      proofDataUrl: DUMMY_PROOF,
      proofFileName: 'cheque-photo.png',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '25000.00' }],
    });

    expect(chequeReceipt.chequeStatus).toBe('RECEIVED');

    const chequesList = await paymentsService.listCheques(org.id, {
      page: 1,
      pageSize: 25,
      sortOrder: 'desc',
    });
    expect(chequesList.total).toBe(1);
    const cheque = chequesList.data[0]!;
    expect(cheque.chequeNo).toBe('CHQ-5001');
    expect(cheque.status).toBe('RECEIVED');

    // Transition to DEPOSITED
    const deposited = await paymentsService.updateChequeStatus(org.id, 1, cheque.id, {
      status: 'DEPOSITED',
      depositDate: '2026-11-10',
      depositBank: 'Meezan Corporate Account',
      bounceFee: '0.00',
    });
    expect(deposited.status).toBe('DEPOSITED');
    expect(deposited.depositBank).toBe('Meezan Corporate Account');

    // Transition to CLEARED
    const cleared = await paymentsService.updateChequeStatus(org.id, 1, cheque.id, {
      status: 'CLEARED',
      clearedDate: '2026-11-12',
      bounceFee: '0.00',
    });
    expect(cleared.status).toBe('CLEARED');
    expect(cleared.clearedDate).toBe('2026-11-12');
  });

  it('reverses client ledger credit, charges optional bounce fee, and re-opens sale invoice when cheque BOUNCES', async () => {
    const { org, client, sale } = await seedSaleScenario();

    await paymentsService.createClientPayment(org.id, 1, {
      clientId: client.id,
      paymentDate: '2026-11-04',
      method: 'CHEQUE',
      amount: '25000.00',
      referenceNo: 'CHQ-7788',
      bankName: 'UBL',
      chequeDate: '2026-11-08',
      proofDataUrl: DUMMY_PROOF,
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '25000.00' }],
    });

    // Invoice is PAID and client balance is 0.00 after cheque receipt
    expect((await salesService.getSaleById(org.id, sale.id)).status).toBe('PAID');
    expect((await clientsService.getClientById(org.id, client.id)).currentBalance).toBe('0.00');

    const chequesList = await paymentsService.listCheques(org.id, {
      page: 1,
      pageSize: 25,
      sortOrder: 'desc',
    });
    const cheque = chequesList.data[0]!;

    // Deposit then bounce with a 500.00 bounce penalty fee
    await paymentsService.updateChequeStatus(org.id, 1, cheque.id, {
      status: 'DEPOSITED',
      depositDate: '2026-11-08',
      bounceFee: '0.00',
    });

    const bounced = await paymentsService.updateChequeStatus(org.id, 1, cheque.id, {
      status: 'BOUNCED',
      bouncedDate: '2026-11-09',
      bounceReason: 'Insufficient funds',
      bounceFee: '500.00',
    });

    expect(bounced.status).toBe('BOUNCED');
    expect(bounced.bounceReason).toBe('Insufficient funds');
    expect(bounced.bounceFee).toBe('500.00');

    // Sale invoice must be re-opened (paidAmount = 0.00, status = POSTED, balanceDue = 25000.00)
    const saleAfterBounce = await salesService.getSaleById(org.id, sale.id);
    expect(saleAfterBounce.paidAmount).toBe('0.00');
    expect(saleAfterBounce.balanceDue).toBe('25000.00');
    expect(saleAfterBounce.status).toBe('POSTED');

    // Client ledger balance must be 25,000.00 + 500.00 bounce fee = 25,500.00
    const clientAfterBounce = await clientsService.getClientById(org.id, client.id);
    expect(clientAfterBounce.currentBalance).toBe('25500.00');

    // Parent payment status is BOUNCED
    const parentPayment = await paymentsService.getPaymentById(org.id, cheque.paymentId);
    expect(parentPayment.status).toBe('BOUNCED');
  });

  it('voids a client payment, reverses invoice allocation, and restores client receivable balance', async () => {
    const { org, client, sale } = await seedSaleScenario();

    const receipt = await paymentsService.createClientPayment(org.id, 1, {
      clientId: client.id,
      paymentDate: '2026-11-04',
      method: 'CASH',
      amount: '15000.00',
      allocations: [{ invoiceType: 'SALE_INVOICE', invoiceId: sale.id, amount: '15000.00' }],
    });

    expect((await clientsService.getClientById(org.id, client.id)).currentBalance).toBe('10000.00');

    const voided = await paymentsService.voidPayment(org.id, 1, receipt.id, {
      reason: 'Entered against wrong client',
    });

    expect(voided.status).toBe('VOIDED');
    expect((await clientsService.getClientById(org.id, client.id)).currentBalance).toBe('25000.00');
    expect((await salesService.getSaleById(org.id, sale.id)).paidAmount).toBe('0.00');
    expect((await salesService.getSaleById(org.id, sale.id)).status).toBe('POSTED');
  });
});
