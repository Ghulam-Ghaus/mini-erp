import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { BackupService } from '../src/backup/backup.service.js';
import { extractZipBuffer } from '../src/backup/zip-util.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ItemsService } from '../src/items/items.service.js';
import { OrgService } from '../src/org/org.service.js';
import { StockService } from '../src/stock/stock.module.js';
import { SuppliersService } from '../src/suppliers/suppliers.service.js';
import { LedgerService } from '../src/ledger/ledger.module.js';
import { requireTestDatabaseUrl } from './test-db.js';

let prisma: PrismaClient;
let orgService: OrgService;
let auditService: AuditService;
let backupService: BackupService;
let itemsService: ItemsService;
let suppliersService: SuppliersService;

beforeAll(() => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });

  const prismaAsService = prisma as unknown as PrismaService;
  auditService = new AuditService(prismaAsService);
  const stock = new StockService();
  const ledger = new LedgerService();

  orgService = new OrgService(prismaAsService, auditService);
  backupService = new BackupService(prismaAsService, auditService);
  itemsService = new ItemsService(prismaAsService, auditService, stock);
  suppliersService = new SuppliersService(prismaAsService, auditService, ledger);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "backup_logs", "notifications", "salary_records", "salary_advances", "employees", "expenses", "expense_categories", "challans", "recovery_entries", "sale_return_items", "sale_returns", "sale_items", "sales_invoices", "clients", "routes", "batch_costs", "batch_sources", "batches", "attachments", "cheques", "payment_allocations", "payments", "ledger_entries", "stock_movements", "purchase_return_items", "purchase_returns", "purchase_items", "purchase_invoices", "item_units", "items", "suppliers", "number_sequences", "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Phase 12: Backup, Restore & Audit Log System', () => {
  it('1. queries and filters immutable audit logs with before/after state diffs', async () => {
    // 1. Initialize organization (generates SETUP audit log)
    const org = await orgService.initializeFirstRun({
      organization: {
        name: 'Audit Test Trading Co',
        currency: 'PKR',
        dateFormat: 'DD/MM/YYYY',
        taxEnabled: false,
        taxName: 'GST',
        defaultTaxRate: '0.00',
        inactivityLockMinutes: 15,
      },
      admin: {
        firstName: 'Audit',
        lastName: 'Admin',
        username: 'auditadmin',
        pin: '1234',
      },
    });

    const orgId = org.id;
    const adminUser = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId } });

    // 2. Create supplier & item (generates CREATE audit logs)
    const supplier = await suppliersService.createSupplier(orgId, adminUser.id, {
      name: 'Audit Test Supplier',
      contactPerson: 'Tariq',
      phone: '03001234567',
      address: 'Industrial Area',
      openingBalance: '0.00',
      isActive: true,
    });

    const item = await itemsService.createItem(orgId, adminUser.id, {
      name: 'Audit Test Feed',
      category: 'RAW_MATERIAL',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });

    expect(supplier.id).toBeDefined();
    expect(item.id).toBeDefined();

    // 3. Query all audit logs
    const allLogs = await auditService.findAll(orgId, {
      page: 1,
      pageSize: 25,
    });

    expect(allLogs.total).toBeGreaterThanOrEqual(3);
    const actions = allLogs.data.map((l) => l.action);
    expect(actions).toContain('SETUP');
    expect(actions).toContain('CREATE');

    // 4. Test action filter
    const setupLogs = await auditService.findAll(orgId, {
      page: 1,
      pageSize: 25,
      action: 'SETUP',
    });
    expect(setupLogs.data.every((l) => l.action === 'SETUP')).toBe(true);

    // 5. Test search filter
    const searchLogs = await auditService.findAll(orgId, {
      page: 1,
      pageSize: 25,
      search: 'Supplier',
    });
    expect(searchLogs.data.some((l) => l.entity.toLowerCase() === 'supplier')).toBe(true);
  });

  it('2. creates compressed zip backup, enforces retention, and performs safe restore with pre-restore safeguard', async () => {
    // 1. Setup organization
    const org = await orgService.initializeFirstRun({
      organization: {
        name: 'Backup Test Trading Co',
        currency: 'PKR',
        dateFormat: 'DD/MM/YYYY',
        taxEnabled: false,
        taxName: 'GST',
        defaultTaxRate: '0.00',
        inactivityLockMinutes: 15,
      },
      admin: {
        firstName: 'Backup',
        lastName: 'Manager',
        username: 'backupmgr',
        pin: '1234',
      },
    });

    const orgId = org.id;
    const adminUser = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId } });
    const adminId = adminUser.id;

    // Create some sample data
    await itemsService.createItem(orgId, adminId, {
      name: 'Backup Test Item A',
      category: 'FINISHED_GOOD',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });

    // 2. Create manual backup
    const backup1 = await backupService.createBackup(orgId, 'MANUAL', adminId);
    expect(backup1.status).toBe('SUCCESS');
    expect(backup1.type).toBe('MANUAL');
    expect(backup1.path).toBeTruthy();
    expect(fs.existsSync(backup1.path!)).toBe(true);

    // Verify zip archive contents
    const zipData = fs.readFileSync(backup1.path!);
    const entries = extractZipBuffer(zipData);
    const entryNames = entries.map((e) => e.name);
    expect(entryNames).toContain('manifest.json');
    expect(entryNames).toContain('db_dump.sql');

    const sqlDumpEntry = entries.find((e) => e.name === 'db_dump.sql');
    expect(sqlDumpEntry?.data.toString('utf8')).toContain('INSERT INTO "id_counters"');

    // 3. Check summary
    const summary = await backupService.getSummary(orgId);
    expect(summary.totalBackups).toBeGreaterThanOrEqual(1);
    expect(summary.lastBackupAt).toBeTruthy();

    // 4. Create another item
    await itemsService.createItem(orgId, adminId, {
      name: 'Item Created After Backup 1',
      category: 'RAW_MATERIAL',
      baseUnit: 'BAG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });

    const itemsBeforeRestore = await itemsService.listItems(orgId, {
      page: 1,
      pageSize: 25,
      sortOrder: 'desc',
    });
    expect(itemsBeforeRestore.total).toBe(2);

    // 5. Attempt restore with wrong code -> should reject
    await expect(
      backupService.restoreBackup(orgId, backup1.id, 'WRONG_CODE', adminId),
    ).rejects.toThrow();

    // 6. Perform valid restore from Backup 1
    const restoreResult = await backupService.restoreBackup(orgId, backup1.id, 'RESTORE', adminId);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restoredBackupId).toBe(backup1.id);
    expect(restoreResult.preRestoreBackupId).toBeDefined();

    // Verify pre-restore safety backup exists
    const preRestoreBackup = await prisma.backupLog.findUnique({
      where: { id: restoreResult.preRestoreBackupId },
    });
    expect(preRestoreBackup?.type).toBe('PRE_RESTORE');
    expect(preRestoreBackup?.status).toBe('SUCCESS');

    // Verify state was restored: only Item A exists now!
    const itemsAfterRestore = await itemsService.listItems(orgId, {
      page: 1,
      pageSize: 25,
      sortOrder: 'desc',
    });
    expect(itemsAfterRestore.total).toBe(1);
    expect(itemsAfterRestore.data[0]?.name).toBe('Backup Test Item A');

    // 7. Verify retention pruning
    // Create 3 additional backups
    await backupService.createBackup(orgId, 'AUTO', adminId);
    await backupService.createBackup(orgId, 'MANUAL', adminId);

    // Prune keeping only last 2
    const prunedCount = await backupService.pruneOldBackups(orgId, 2);
    expect(prunedCount).toBeGreaterThanOrEqual(1);

    const remainingBackups = await backupService.listBackups(orgId, { page: 1, pageSize: 25 });
    expect(remainingBackups.total).toBe(2);

    // 8. Verify external .zip upload restore restores records + id_counters safely
    await itemsService.createItem(orgId, adminId, {
      name: 'Temporary Item Before External Restore',
      category: 'RAW_MATERIAL',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });

    const uploadRestoreRes = await backupService.restoreBackupFromUpload(
      orgId,
      zipData,
      'RESTORE',
      adminId,
    );
    expect(uploadRestoreRes.success).toBe(true);
    expect(uploadRestoreRes.preRestoreBackupId).toBeGreaterThan(0);

    const itemsAfterUploadRestore = await itemsService.listItems(orgId, {
      page: 1,
      pageSize: 25,
      sortOrder: 'desc',
    });
    expect(itemsAfterUploadRestore.total).toBe(1);
    expect(itemsAfterUploadRestore.data[0]?.name).toBe('Backup Test Item A');

    // Ensure creating a new item after restore succeeds without id_counters collision
    const postRestoreItem = await itemsService.createItem(orgId, adminId, {
      name: 'Post Restore New Item',
      category: 'RAW_MATERIAL',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      isActive: true,
      alternateUnits: [],
    });
    expect(postRestoreItem.id).toBeGreaterThan(itemsAfterUploadRestore.data[0]!.id);
  });
});
