import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * Gapless integer ids.
 *
 * Postgres sequences (SERIAL / IDENTITY) skip numbers when a transaction fails.
 * Instead, every table keeps a counter row in `id_counters`. The counter is
 * incremented inside the same transaction as the insert, which locks the row
 * until commit. If anything fails, the increment is rolled back together with
 * the insert, so the next save reuses the number: 1, 2, 3 … never a gap.
 *
 * Usage:
 *   await inTransaction(prisma, async (tx) => {
 *     const id = await nextId(tx, 'organizations');
 *     return tx.organization.create({ data: { id, name } });
 *   });
 *
 * When a new table is added, add its table name to GAPLESS_TABLES.
 */
export const GAPLESS_TABLES = [
  'organizations',
  'roles',
  'permissions',
  'users',
  'audit_logs',
  'number_sequences',
  'suppliers',
  'items',
  'item_units',
  'purchase_invoices',
  'purchase_items',
  'purchase_returns',
  'purchase_return_items',
  'stock_movements',
  'ledger_entries',
  'payments',
  'payment_allocations',
  'attachments',
  'batches',
  'batch_sources',
  'batch_costs',
  'routes',
  'clients',
  'sales_invoices',
  'sale_items',
  'sale_returns',
  'sale_return_items',
] as const;

export type GaplessTable = (typeof GAPLESS_TABLES)[number];

declare const inTransactionBrand: unique symbol;

/** A Prisma client that is guaranteed (at compile time) to run inside a transaction. */
export type TxClient = Prisma.TransactionClient & { readonly [inTransactionBrand]: true };

export interface TxOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/** Runs `fn` inside an interactive transaction and hands it a branded `TxClient`. */
export function inTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: TxClient) => Promise<T>,
  options?: TxOptions,
): Promise<T> {
  // The cast only adds the compile-time brand; the object is Prisma's transaction client.
  return prisma.$transaction((tx) => fn(tx as TxClient), options);
}

/** Returns the next gapless id for `table`. Must be called inside `inTransaction`. */
export async function nextId(tx: TxClient, table: GaplessTable): Promise<number> {
  if (!(GAPLESS_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown gapless table: ${table}`);
  }
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO "id_counters" ("table_name", "last_value")
    VALUES (${table}, 1)
    ON CONFLICT ("table_name")
    DO UPDATE SET "last_value" = "id_counters"."last_value" + 1
    RETURNING "last_value"`;
  const row = rows[0];
  if (!row) throw new Error(`Could not allocate an id for table ${table}`);
  return row.last_value;
}
