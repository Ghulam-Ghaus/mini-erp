import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ItemsService } from '../src/items/items.service.js';
import { LedgerService } from '../src/ledger/ledger.module.js';
import { NumberingService } from '../src/numbering/numbering.module.js';
import { OrgService } from '../src/org/org.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { StockService } from '../src/stock/stock.module.js';
import { SuppliersService } from '../src/suppliers/suppliers.service.js';
import { requireTestDatabaseUrl } from './test-db.js';

let prisma: PrismaClient;
let orgService: OrgService;
let itemsService: ItemsService;
let suppliersService: SuppliersService;
let paymentsService: PaymentsService;
let purchasesService: PurchasesService;

beforeAll(() => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });
  const prismaAsService = prisma as unknown as PrismaService;
  const audit = new AuditService();
  const numbering = new NumberingService();
  const ledger = new LedgerService();
  const stock = new StockService();

  orgService = new OrgService(prismaAsService, audit);
  itemsService = new ItemsService(prismaAsService, audit, stock);
  suppliersService = new SuppliersService(prismaAsService, audit, ledger);
  paymentsService = new PaymentsService(prismaAsService, audit, ledger, numbering);
  purchasesService = new PurchasesService(
    prismaAsService,
    audit,
    ledger,
    stock,
    numbering,
    paymentsService,
  );
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "recovery_entries", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedOrganization(): Promise<number> {
  const org = await orgService.initializeFirstRun({
    organization: {
      name: 'RZ Enterprises',
      currency: 'PKR',
      dateFormat: 'DD/MM/YYYY',
      taxEnabled: false,
      taxName: 'GST',
      defaultTaxRate: '0.00',
      inactivityLockMinutes: 15,
    },
    admin: {
      firstName: 'Rana',
      lastName: 'Qaiser',
      username: 'admin',
      pin: '1234',
    },
  });
  return org.id;
}

describe('Phase 3: Suppliers, Items, Purchase Invoices, Supplier Ledger, Returns & Payments Out', () => {
  it('posts supplier opening balance, multi-unit purchase invoice, stock movements, payment out, and purchase return (debit note)', async () => {
    const orgId = await seedOrganization();

    // 1. Create Item with Base Unit KG and Alternate Unit BAG = 50.000 KG
    const daalChana = await itemsService.createItem(orgId, 1, {
      code: 'DC-01',
      name: 'name',
      nameUr: 'دال چنا',
      category: 'Pulses',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [
        {
          unitName: 'BAG',
          unitNameUr: 'بوری',
          conversionFactor: '50.000',
          isDefaultForPurchase: true,
          isDefaultForSale: false,
        },
      ],
    });
    expect(daalChana.id).toBe(1);
    expect(daalChana.rawStockQtyBase).toBe('0.000');

    // 2. Create Supplier with Opening Payable Balance of 25,000.00
    const supplier = await suppliersService.createSupplier(orgId, 1, {
      code: 'SUP-01',
      name: 'Faisalabad Grain Mills',
      nameUr: 'فیصل آباد گرین ملز',
      phone: '0300-1112233',
      openingBalance: '25000.00',
      isActive: true,
    });
    expect(supplier.id).toBe(1);
    expect(supplier.currentBalance).toBe('25000.00');

    // 3. Create Purchase Invoice: 10 Bags @ 11,000/Bag (actual weighed = 500.000 KG) + 1,500 freight
    const purchase = await purchasesService.createPurchaseInvoice(orgId, 1, {
      supplierId: supplier.id,
      invoiceDate: '2026-11-06',
      supplierRefNo: 'BILL-771',
      discount: '500.00',
      extraCharges: '1500.00',
      lines: [
        {
          itemId: daalChana.id,
          enteredQty: '10.000',
          enteredUnit: 'BAG',
          conversionFactor: '50.000',
          bagCount: 10,
          qtyBase: '500.000',
          ratePerEnteredUnit: '11000.00',
          taxRate: '0.00',
        },
      ],
    });

    expect(purchase.id).toBe(1);
    expect(purchase.invoiceNo).toBe('PUR-2026-0001');
    expect(purchase.subtotal).toBe('110000.00');
    expect(purchase.total).toBe('111000.00'); // 110,000 - 500 + 1,500
    expect(purchase.balanceDue).toBe('111000.00');
    expect(purchase.totalQtyBase).toBe('500.000');

    // Verify raw stock increased to 500.000 KG via stock_movements
    const itemAfterPurchase = await itemsService.getItemById(orgId, daalChana.id);
    expect(itemAfterPurchase.rawStockQtyBase).toBe('500.000');
    expect(itemAfterPurchase.lastPurchaseRatePerBase).toBe('220.0000'); // 110,000 / 500 kg

    // Verify supplier payable balance = 25,000 + 111,000 = 136,000.00
    const supAfterPurchase = await suppliersService.getSupplierById(orgId, supplier.id);
    expect(supAfterPurchase.currentBalance).toBe('136000.00');

    // 4. Record Payment Out of 61,000.00 allocated to PUR-2026-0001
    const payment = await paymentsService.createSupplierPayment(orgId, 1, {
      supplierId: supplier.id,
      paymentDate: '2026-11-06',
      method: 'BANK_TRANSFER',
      amount: '61000.00',
      referenceNo: 'TXN-9901',
      bankName: 'Meezan Bank',
      allocations: [
        {
          invoiceType: 'PURCHASE_INVOICE',
          invoiceId: purchase.id,
          amount: '61000.00',
        },
      ],
    });

    expect(payment.id).toBe(1);
    expect(payment.paymentNo).toBe('PAY-OUT-2026-0001');

    // Purchase invoice should now be PARTIAL with 50,000.00 remaining
    const purchaseAfterPay = await purchasesService.getPurchaseInvoiceById(orgId, purchase.id);
    expect(purchaseAfterPay.paidAmount).toBe('61000.00');
    expect(purchaseAfterPay.balanceDue).toBe('50000.00');
    expect(purchaseAfterPay.status).toBe('PARTIAL');

    // Supplier balance = 136,000 - 61,000 = 75,000.00
    expect((await suppliersService.getSupplierById(orgId, supplier.id)).currentBalance).toBe(
      '75000.00',
    );

    // 5. Purchase Return (Debit Note): return 50.000 KG (1 Bag) due to QUALITY
    const firstPurchaseLine = purchase.items[0]!;

    // Over-return (> 500.000 KG) must be blocked!
    await expect(
      purchasesService.createPurchaseReturn(orgId, 1, {
        purchaseId: purchase.id,
        returnDate: '2026-11-06',
        reasonCode: 'QUALITY',
        settlementType: 'ADJUST_PAYABLE',
        lines: [
          {
            purchaseItemId: firstPurchaseLine.id,
            returnQtyBase: '500.001',
          },
        ],
      }),
    ).rejects.toThrow(/Cannot return/);

    // Valid partial return of 50.000 KG @ 220.00/KG = 11,000.00
    const purchaseReturn = await purchasesService.createPurchaseReturn(orgId, 1, {
      purchaseId: purchase.id,
      returnDate: '2026-11-06',
      reasonCode: 'QUALITY',
      settlementType: 'ADJUST_PAYABLE',
      lines: [
        {
          purchaseItemId: firstPurchaseLine.id,
          returnQtyBase: '50.000',
        },
      ],
    });

    expect(purchaseReturn.id).toBe(1);
    expect(purchaseReturn.returnNo).toBe('PRN-2026-0001');
    expect(purchaseReturn.total).toBe('11000.00');
    expect(purchaseReturn.totalQtyBase).toBe('50.000');

    // Raw stock should now be 500 - 50 = 450.000 KG
    expect((await itemsService.getItemById(orgId, daalChana.id)).rawStockQtyBase).toBe('450.000');

    // Supplier ledger should have 4 entries in chronological order and closing balance = 75,000 - 11,000 = 64,000.00
    const ledgerView = await suppliersService.getSupplierLedger(orgId, supplier.id, {
      page: 1,
      pageSize: 25,
      sortOrder: 'asc',
    });

    expect(ledgerView.closingBalance).toBe('64000.00');
    expect(ledgerView.entries.total).toBe(4);
    expect(ledgerView.entries.data.map((e) => e.balance)).toEqual([
      '25000.00', // Opening
      '136000.00', // + Purchase 111,000
      '75000.00', // - Payment Out 61,000
      '64000.00', // - Purchase Return 11,000
    ]);
  });

  it('reverses stock and supplier ledger when a purchase invoice or payment is voided', async () => {
    const orgId = await seedOrganization();

    const item = await itemsService.createItem(orgId, 1, {
      name: 'Daal Moong',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });

    const supplier = await suppliersService.createSupplier(orgId, 1, {
      name: 'Multan Traders',
      openingBalance: '0.00',
      isActive: true,
    });

    const purchase = await purchasesService.createPurchaseInvoice(orgId, 1, {
      supplierId: supplier.id,
      invoiceDate: '2026-11-06',
      discount: '0.00',
      extraCharges: '0.00',
      lines: [
        {
          itemId: item.id,
          enteredQty: '200.000',
          enteredUnit: 'KG',
          conversionFactor: '1.000',
          qtyBase: '200.000',
          ratePerEnteredUnit: '150.00',
          taxRate: '0.00',
        },
      ],
    });

    expect(purchase.total).toBe('30000.00');
    expect((await itemsService.getItemById(orgId, item.id)).rawStockQtyBase).toBe('200.000');
    expect((await suppliersService.getSupplierById(orgId, supplier.id)).currentBalance).toBe(
      '30000.00',
    );

    // Void the purchase invoice
    const voided = await purchasesService.voidPurchaseInvoice(orgId, 1, purchase.id, {
      reason: 'Duplicate entry',
    });
    expect(voided.status).toBe('VOIDED');
    expect(voided.balanceDue).toBe('0.00');

    // Stock and supplier ledger must both return to 0
    expect((await itemsService.getItemById(orgId, item.id)).rawStockQtyBase).toBe('0.000');
    expect((await suppliersService.getSupplierById(orgId, supplier.id)).currentBalance).toBe(
      '0.00',
    );
  });
});
