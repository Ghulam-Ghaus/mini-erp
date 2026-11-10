import { z } from 'zod';
import { nonNegativeDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';

export const createSupplierSchema = z.object({
  code: z.string().trim().max(30).optional(),
  name: z.string().trim().min(1, 'Supplier name is required').max(120),
  nameUr: z.string().trim().max(120).optional(),
  contactPerson: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(250).optional(),
  taxNo: z.string().trim().max(60).optional(),
  openingBalance: nonNegativeDecimalStringSchema.default('0.00'),
  notes: z.string().trim().max(400).optional(),
  isActive: z.boolean().default(true),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.omit({ openingBalance: true }).partial();

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

export const supplierLedgerQuerySchema = paginationQuerySchema.extend({
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  refType: z.string().trim().optional(),
});

export type SupplierLedgerQuery = z.infer<typeof supplierLedgerQuerySchema>;

export interface SupplierDto {
  readonly id: number;
  readonly code: string | null;
  readonly name: string;
  readonly nameUr: string | null;
  readonly contactPerson: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly taxNo: string | null;
  readonly openingBalance: string;
  readonly currentBalance: string;
  readonly totalPurchased: string;
  readonly totalPaid: string;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface LedgerEntryDto {
  readonly id: number;
  readonly partyType: 'SUPPLIER' | 'CLIENT';
  readonly partyId: number;
  readonly entryDate: string;
  readonly refType: string;
  readonly paymentMethod?: string | null;
  readonly refId: number;
  readonly refNo: string | null;
  readonly debit: string;
  readonly credit: string;
  readonly balance: string;
  readonly narration: string;
  readonly createdById: number;
  readonly createdAt: string;
}

export interface SupplierLedgerResponse {
  readonly supplier: SupplierDto;
  readonly openingBalanceBeforeRange: string;
  readonly totalDebitInRange: string;
  readonly totalCreditInRange: string;
  readonly closingBalance: string;
  readonly entries: {
    readonly data: readonly LedgerEntryDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  };
}
