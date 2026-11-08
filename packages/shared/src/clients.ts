import { z } from 'zod';
import { nonNegativeDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';
import type { LedgerEntryDto } from './suppliers.js';

export const RECOVERY_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type RecoveryDay = (typeof RECOVERY_DAYS)[number];

export const createClientSchema = z.object({
  routeId: z.number().int().positive().optional().nullable(),
  code: z.string().trim().max(30).optional(),
  name: z.string().trim().min(1, 'Client name is required').max(120),
  nameUr: z.string().trim().max(120).optional(),
  contactPerson: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(250).optional(),
  taxNo: z.string().trim().max(60).optional(),
  creditLimit: nonNegativeDecimalStringSchema.default('0.00'),
  openingBalance: nonNegativeDecimalStringSchema.default('0.00'),
  recoveryDay: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(400).optional(),
  isActive: z.boolean().default(true),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.omit({ openingBalance: true }).partial();

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const listClientsQuerySchema = paginationQuerySchema.extend({
  routeId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export const clientLedgerQuerySchema = paginationQuerySchema.extend({
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  refType: z.string().trim().optional(),
});

export type ClientLedgerQuery = z.infer<typeof clientLedgerQuerySchema>;

export interface ClientDto {
  readonly id: number;
  readonly routeId: number | null;
  readonly routeName?: string | null;
  readonly code: string | null;
  readonly name: string;
  readonly nameUr: string | null;
  readonly contactPerson: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly taxNo: string | null;
  readonly creditLimit: string;
  readonly openingBalance: string;
  readonly currentBalance: string;
  readonly totalSold: string;
  readonly totalPaid: string;
  readonly totalReturned: string;
  readonly recoveryDay: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface ClientLedgerResponse {
  readonly client: ClientDto;
  readonly openingBalanceBeforeRange: string;
  readonly totalDebitInRange: string;
  readonly totalCreditInRange: string;
  readonly closingBalance: string;
  readonly entries: readonly LedgerEntryDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
