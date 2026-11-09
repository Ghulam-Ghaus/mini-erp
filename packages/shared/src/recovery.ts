import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';
import { PAYMENT_METHODS, paymentAllocationInputSchema, type PaymentMethod } from './payments.js';

export const RECOVERY_OUTCOMES = [
  'COLLECTED',
  'PARTIAL',
  'PROMISED',
  'NOT_AVAILABLE',
  'REFUSED',
] as const;

export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number];

export const createRecoveryEntrySchema = z
  .object({
    clientId: z.coerce.number().int().positive('Client is required'),
    visitDate: z.string().trim().min(1, 'Visit date is required'),
    outcome: z.enum(RECOVERY_OUTCOMES),
    amount: nonNegativeDecimalStringSchema.default('0.00'),
    method: z.enum(PAYMENT_METHODS).optional(),
    referenceNo: z.string().trim().max(80).optional(),
    bankName: z.string().trim().max(100).optional(),
    chequeDate: z.string().trim().optional(),
    proofDataUrl: z.string().max(5_000_000).optional(),
    proofFileName: z.string().trim().max(160).optional(),
    nextPromisedDate: z.string().trim().optional(),
    promisedAmount: positiveDecimalStringSchema.optional(),
    remarks: z.string().trim().max(400).optional(),
    allocations: z.array(paymentAllocationInputSchema).default([]),
  })
  .superRefine((val, ctx) => {
    const isMoneyCollected = val.outcome === 'COLLECTED' || val.outcome === 'PARTIAL';
    const amt = new Decimal(val.amount || '0');

    if (isMoneyCollected) {
      if (amt.lte(0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'Amount must be greater than zero when outcome is COLLECTED or PARTIAL',
        });
      }
      if (!val.method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['method'],
          message: 'Payment method is required when collecting payment',
        });
      } else {
        if (val.method === 'CHEQUE') {
          if (!val.referenceNo?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['referenceNo'],
              message: 'Cheque number is required for cheque payments',
            });
          }
          if (!val.bankName?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['bankName'],
              message: 'Bank name is required for cheque payments',
            });
          }
          if (!val.chequeDate?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['chequeDate'],
              message: 'Cheque date is required for cheque payments',
            });
          }
        }
        if (val.method !== 'CASH' && (!val.proofDataUrl || val.proofDataUrl.trim().length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['proofDataUrl'],
            message: 'Proof upload is required for non-cash collections',
          });
        }
      }
    }

    if (
      val.outcome === 'PROMISED' &&
      (!val.nextPromisedDate || val.nextPromisedDate.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextPromisedDate'],
        message: 'Next promised date is required when outcome is PROMISED',
      });
    }
  });

export type CreateRecoveryEntryInput = z.infer<typeof createRecoveryEntrySchema>;

export const todaysRecoveryQuerySchema = z.object({
  targetDate: z.string().trim().optional(),
  routeId: z.coerce.number().int().positive().optional(),
  officerId: z.coerce.number().int().positive().optional(),
  recoveryDay: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export type TodaysRecoveryQuery = z.infer<typeof todaysRecoveryQuerySchema>;

export const listRecoveryEntriesQuerySchema = paginationQuerySchema.extend({
  clientId: z.coerce.number().int().positive().optional(),
  routeId: z.coerce.number().int().positive().optional(),
  officerId: z.coerce.number().int().positive().optional(),
  outcome: z.enum(RECOVERY_OUTCOMES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListRecoveryEntriesQuery = z.infer<typeof listRecoveryEntriesQuerySchema>;

export const recoveryAgingQuerySchema = z.object({
  asOfDate: z.string().trim().optional(),
  routeId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
});

export type RecoveryAgingQuery = z.infer<typeof recoveryAgingQuerySchema>;

export interface RecoveryDueClientDto {
  readonly clientId: number;
  readonly clientCode: string | null;
  readonly clientName: string;
  readonly clientNameUr: string | null;
  readonly phone: string | null;
  readonly routeId: number | null;
  readonly routeName: string | null;
  readonly assignedOfficerId: number | null;
  readonly assignedOfficerName: string | null;
  readonly recoveryDay: string | null;
  readonly currentBalance: string;
  readonly creditLimit: string;
  readonly isOverCreditLimit: boolean;
  readonly dueReason: 'SCHEDULED_DAY' | 'PROMISED_DUE' | 'OVERDUE_PROMISE';
  readonly promisedDate: string | null;
  readonly promisedAmount: string | null;
  readonly oldestInvoiceDays: number;
  readonly lastPaymentDate: string | null;
  readonly lastPaymentAmount: string | null;
  readonly lastVisitDate: string | null;
  readonly lastVisitOutcome: RecoveryOutcome | null;
  readonly lastVisitRemarks: string | null;
}

export interface TodaysRecoveryResponse {
  readonly targetDate: string;
  readonly weekday: string;
  readonly totalReceivableDue: string;
  readonly clientsDueCount: number;
  readonly collectedTodayTotal: string;
  readonly promisedTodayCount: number;
  readonly items: readonly RecoveryDueClientDto[];
}

export interface RecoveryEntryDto {
  readonly id: number;
  readonly clientId: number;
  readonly clientName: string;
  readonly clientNameUr: string | null;
  readonly routeId: number | null;
  readonly routeName: string | null;
  readonly officerId: number;
  readonly officerName: string;
  readonly visitDate: string;
  readonly outcome: RecoveryOutcome;
  readonly amount: string;
  readonly method: PaymentMethod | null;
  readonly paymentId: number | null;
  readonly paymentNo: string | null;
  readonly nextPromisedDate: string | null;
  readonly promisedAmount: string | null;
  readonly remarks: string | null;
  readonly createdAt: string;
}

export interface ClientAgingRowDto {
  readonly clientId: number;
  readonly clientCode: string | null;
  readonly clientName: string;
  readonly clientNameUr: string | null;
  readonly routeId: number | null;
  readonly routeName: string | null;
  readonly recoveryDay: string | null;
  readonly promisedDate: string | null;
  readonly promisedAmount: string | null;
  readonly bucket0to7: string;
  readonly bucket8to15: string;
  readonly bucket16to30: string;
  readonly bucket31to60: string;
  readonly bucket60Plus: string;
  readonly totalReceivable: string;
}

export interface RecoveryAgingSummaryDto {
  readonly asOfDate: string;
  readonly totalBucket0to7: string;
  readonly totalBucket8to15: string;
  readonly totalBucket16to30: string;
  readonly totalBucket31to60: string;
  readonly totalBucket60Plus: string;
  readonly grandTotalReceivable: string;
  readonly rows: readonly ClientAgingRowDto[];
}
