import { PrismaClient } from '../generated/prisma/client.js';

export interface TableExportConfig {
  readonly modelName: string;
  readonly tableName: string;
}

export const EXPORT_TABLES: readonly TableExportConfig[] = [
  { modelName: 'permission', tableName: 'permissions' },
  { modelName: 'organization', tableName: 'organizations' },
  { modelName: 'role', tableName: 'roles' },
  { modelName: 'rolePermission', tableName: 'role_permissions' },
  { modelName: 'user', tableName: 'users' },
  { modelName: 'numberSequence', tableName: 'number_sequences' },
  { modelName: 'supplier', tableName: 'suppliers' },
  { modelName: 'item', tableName: 'items' },
  { modelName: 'itemUnit', tableName: 'item_units' },
  { modelName: 'purchaseInvoice', tableName: 'purchase_invoices' },
  { modelName: 'purchaseItem', tableName: 'purchase_items' },
  { modelName: 'purchaseReturn', tableName: 'purchase_returns' },
  { modelName: 'purchaseReturnItem', tableName: 'purchase_return_items' },
  { modelName: 'batch', tableName: 'batches' },
  { modelName: 'batchSource', tableName: 'batch_sources' },
  { modelName: 'batchCost', tableName: 'batch_costs' },
  { modelName: 'route', tableName: 'routes' },
  { modelName: 'client', tableName: 'clients' },
  { modelName: 'saleInvoice', tableName: 'sales_invoices' },
  { modelName: 'saleItem', tableName: 'sale_items' },
  { modelName: 'saleReturn', tableName: 'sale_returns' },
  { modelName: 'saleReturnItem', tableName: 'sale_return_items' },
  { modelName: 'challan', tableName: 'challans' },
  { modelName: 'payment', tableName: 'payments' },
  { modelName: 'paymentAllocation', tableName: 'payment_allocations' },
  { modelName: 'cheque', tableName: 'cheques' },
  { modelName: 'recoveryEntry', tableName: 'recovery_entries' },
  { modelName: 'expenseCategory', tableName: 'expense_categories' },
  { modelName: 'expense', tableName: 'expenses' },
  { modelName: 'employee', tableName: 'employees' },
  { modelName: 'salaryAdvance', tableName: 'salary_advances' },
  { modelName: 'salaryRecord', tableName: 'salary_records' },
  { modelName: 'attachment', tableName: 'attachments' },
  { modelName: 'stockMovement', tableName: 'stock_movements' },
  { modelName: 'ledgerEntry', tableName: 'ledger_entries' },
  { modelName: 'notification', tableName: 'notifications' },
];

function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  // Decimal or Decimal-like object
  if (typeof value === 'object' && value !== null && 's' in value && 'e' in value && 'd' in value) {
    return `'${String(value)}'`;
  }
  if (typeof value === 'object') {
    const jsonStr = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  // String escaping
  const s = String(value).replace(/'/g, "''");
  return `'${s}'`;
}

/**
 * Exports all database records into clean, transactional SQL statements.
 */
export async function generateSqlDump(prisma: PrismaClient): Promise<string> {
  const lines: string[] = [];
  lines.push('-- MINI ERP DATABASE DUMP');
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push("SET session_replication_role = 'replica';");
  lines.push('BEGIN;');

  // Clear exported tables in reverse order using DELETE (preserves backup_logs and audit_logs)
  for (const table of [...EXPORT_TABLES].reverse()) {
    lines.push(`DELETE FROM "${table.tableName}";`);
  }

  // Export each table
  for (const table of EXPORT_TABLES) {
    const delegate = (
      prisma as unknown as Record<
        string,
        { findMany: () => Promise<readonly Record<string, unknown>[]> }
      >
    )[table.modelName];
    if (!delegate?.findMany) continue;

    const rows = await delegate.findMany();
    if (rows.length === 0) continue;

    lines.push(`-- Table: ${table.tableName} (${rows.length} rows)`);

    for (const row of rows) {
      const keys = Object.keys(row);
      const cols = keys.map((k) => `"${camelToSnakeCase(k)}"`).join(', ');
      const vals = keys.map((k) => escapeSqlValue(row[k])).join(', ');
      lines.push(`INSERT INTO "${table.tableName}" (${cols}) VALUES (${vals});`);
    }
  }

  lines.push('COMMIT;');
  lines.push("SET session_replication_role = 'origin';");

  return lines.join('\n');
}

/**
 * Executes a raw SQL dump against the database within a safe replication role context.
 */
export async function executeSqlRestore(prisma: PrismaClient, sqlScript: string): Promise<void> {
  // Execute the script
  await prisma.$executeRawUnsafe(sqlScript);
}
