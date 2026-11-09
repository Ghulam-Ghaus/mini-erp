import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { PAYMENT_METHODS, type PaymentMethod } from './payments.js';

export const EXPENSE_STATUSES = ['POSTED', 'VOIDED'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const createExpenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  nameUr: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const createExpenseSchema = z.object({
  expenseDate: z.string().min(1),
  categoryId: z.number().int().positive(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal with up to 2 decimal places'),
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  referenceNo: z.string().trim().max(80).optional().nullable(),
  paidTo: z.string().trim().max(120).optional().nullable(),
  batchId: z.number().int().positive().optional().nullable(),
  description: z.string().trim().min(1).max(400),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const listExpensesQuerySchema = paginationQuerySchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  batchId: z.coerce.number().int().positive().optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export interface ExpenseCategoryDto {
  id: number;
  name: string;
  nameUr: string | null;
  isActive: boolean;
}

export interface ExpenseDto {
  id: number;
  expenseNo: string;
  expenseDate: string;
  categoryId: number;
  categoryName: string;
  categoryNameUr: string | null;
  amount: string;
  method: PaymentMethod;
  referenceNo: string | null;
  paidTo: string | null;
  batchId: number | null;
  batchNo: string | null;
  batchCostId: number | null;
  description: string;
  status: ExpenseStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface ExpensesSummaryDto {
  operatingTotal: string;
  batchLinkedTotal: string;
  combinedTotal: string;
  count: number;
}
