import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { BatchesService } from '../src/batches/batches.service.js';
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
let purchasesService: PurchasesService;
let batchesService: BatchesService;

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
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedPurchaseSetup() {
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

  const item = await itemsService.createItem(org.id, 1, {
    code: 'DC-01',
    name: 'Daal Chana',
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

  const supplier = await suppliersService.createSupplier(org.id, 1, {
    code: 'SUP-01',
    name: 'Madina Grain Market',
    openingBalance: '0.00',
    isActive: true,
  });

  // Purchase 20 Bags (1000.000 kg) @ Rs. 3,250/Bag = Rs. 65.00/kg = Rs. 65,000.00
  const purchase = await purchasesService.createPurchaseInvoice(org.id, 1, {
    supplierId: supplier.id,
    invoiceDate: '2026-11-06',
    discount: '0.00',
    extraCharges: '0.00',
    lines: [
      {
        itemId: item.id,
        enteredQty: '20.000',
        enteredUnit: 'BAG',
        conversionFactor: '50.000',
        bagCount: 20,
        qtyBase: '1000.000',
        ratePerEnteredUnit: '3250.00',
        taxRate: '0.00',
      },
    ],
  });

  return {
    orgId: org.id,
    itemId: item.id,
    supplierId: supplier.id,
    purchaseId: purchase.id,
    purchaseItemId: purchase.items[0]!.id,
  };
}

describe('Phase 4: Batches, Purchase Allocations, Extra Costs, Wastage %, Stock Movements & Closing Lock', () => {
  it('allocates purchase stock to a batch, computes wastage & cost/kg, logs stock movements, blocks negative stock, and locks on close', async () => {
    const { orgId, itemId, purchaseItemId } = await seedPurchaseSetup();

    // Verify 1000.000 kg is available for allocation
    const availableBefore = await batchesService.listAvailablePurchaseItems(orgId, itemId);
    expect(availableBefore).toHaveLength(1);
    expect(availableBefore[0]?.availableQtyBase).toBe('1000.000');

    // 1. Create Batch 1 with 600.000 kg allocated @ 65.00/kg = 39,000.00
    //    Labour cost = 1,425.00 -> Total cost = 40,425.00
    //    Planned wastage = 2.500% -> 15.000 kg -> Output = 585.000 kg
    //    Cost per kg = 40,425.00 / 585.000 = 69.10
    const batch = await batchesService.createBatch(orgId, 1, {
      name: 'Daal Chana — Lot A',
      nameUr: 'دال چنا — لاٹ اے',
      itemId,
      batchDate: '2026-11-06',
      status: 'OPEN',
      wastageMode: 'PERCENT',
      wastagePercent: '2.500',
      wastageKg: '0.000',
      allocations: [
        {
          purchaseItemId,
          kgUsed: '600.000',
          notes: 'First 12 bags',
        },
      ],
      costs: [
        {
          costType: 'LABOUR',
          costDate: '2026-11-06',
          description: 'Cleaning & grading labour',
          amount: '1425.00',
        },
      ],
    });

    expect(batch.batchNo).toBe('BAT-2026-0001');
    expect(batch.rawKg).toBe('600.000');
    expect(batch.wastagePercent).toBe('2.500');
    expect(batch.wastageKg).toBe('15.000');
    expect(batch.outputKg).toBe('585.000');
    expect(batch.availableKg).toBe('585.000');
    expect(batch.rawCost).toBe('39000.00');
    expect(batch.extraCost).toBe('1425.00');
    expect(batch.totalCost).toBe('40425.00');
    expect(batch.costPerKg).toBe('69.10');

    // Verify unallocated raw stock dropped from 1000.000 kg to 400.000 kg
    const itemAfterAlloc = await itemsService.getItemById(orgId, itemId);
    expect(itemAfterAlloc.rawStockQtyBase).toBe('400.000');

    // 2. Over-allocation beyond remaining 400.000 kg is blocked
    await expect(
      batchesService.addAllocations(orgId, 1, batch.id, {
        allocations: [{ purchaseItemId, kgUsed: '450.000' }],
      }),
    ).rejects.toThrow(/only 400.000 kg unallocated/);

    // 3. Add Packing Cost (Rs. 585.00) -> Total cost = 41,010.00 -> Cost/kg = 41,010 / 585 = 70.10
    const afterPacking = await batchesService.addCost(orgId, 1, batch.id, {
      costType: 'PACKING',
      costDate: '2026-11-06',
      description: 'PP woven bags & stitching',
      amount: '585.00',
    });
    expect(afterPacking.extraCost).toBe('2010.00');
    expect(afterPacking.totalCost).toBe('41010.00');
    expect(afterPacking.costPerKg).toBe('70.10');

    // 4. Stock adjustment (-5.000 kg for SPILLAGE) reduces availableKg to 580.000 kg,
    //    and attempting to deduct 600.000 kg is blocked so stock never goes negative
    const afterAdjustment = await batchesService.adjustBatchStock(orgId, 1, batch.id, {
      deltaQtyBase: '-5.000',
      reasonCode: 'SPILLAGE',
      note: 'Floor spillage during bagging',
    });
    expect(afterAdjustment.availableKg).toBe('580.000');

    await expect(
      batchesService.adjustBatchStock(orgId, 1, batch.id, {
        deltaQtyBase: '-600.000',
        reasonCode: 'COUNT_CORRECTION',
        note: 'Should fail',
      }),
    ).rejects.toThrow(/Insufficient stock/);

    // 5. Close the batch with actual weighed output = 580.000 kg (actual wastage = 20.000 kg = 3.333%)
    //    Planned wastage was 15.000 kg -> wastageDiffKg = +5.000 kg
    //    Locked costPerKg = 41,010.00 / 580.000 = 70.71
    const closedBatch = await batchesService.closeBatch(orgId, 1, batch.id, {
      actualOutputKg: '580.000',
      note: 'Weighed final bags at store closing',
    });

    expect(closedBatch.status).toBe('CLOSED');
    expect(closedBatch.outputKg).toBe('580.000');
    expect(closedBatch.wastageKg).toBe('20.000');
    expect(closedBatch.wastagePercent).toBe('3.333');
    expect(closedBatch.costPerKg).toBe('70.71');
    expect(closedBatch.variance).toEqual({
      plannedWastagePercent: '2.500',
      plannedWastageKg: '15.000',
      actualWastagePercent: '3.333',
      actualWastageKg: '20.000',
      wastageDiffKg: '5.000',
      plannedOutputKg: '585.000',
      actualOutputKg: '580.000',
    });

    // 6. Closed batch is locked against further cost edits
    await expect(
      batchesService.addCost(orgId, 1, batch.id, {
        costType: 'FUEL',
        costDate: '2026-11-06',
        description: 'Generator diesel',
        amount: '500.00',
      }),
    ).rejects.toThrow(/CLOSED and locked/);
  });
});
