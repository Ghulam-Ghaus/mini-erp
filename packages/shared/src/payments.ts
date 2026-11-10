import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE_WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['POSTED', 'BOUNCED', 'VOIDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CHEQUE_STATUSES = ['RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'VOIDED'] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

export const paymentAllocationInputSchema = z.object({
  invoiceType: z.enum(['PURCHASE_INVOICE', 'SALE_INVOICE']),
  invoiceId: z.coerce.number().int().positive(),
  amount: positiveDecimalStringSchema,
});

export type PaymentAllocationInput = z.infer<typeof paymentAllocationInputSchema>;

export const createSupplierPaymentSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  paymentDate: z.string().trim().min(1, 'Payment date is required'),
  method: z.enum(PAYMENT_METHODS),
  amount: positiveDecimalStringSchema,
  referenceNo: z.string().trim().max(80).optional(),
  bankName: z.string().trim().max(100).optional(),
  chequeDate: z.string().trim().optional(),
  notes: z.string().trim().max(400).optional(),
  proofDataUrl: z.string().max(5_000_000).optional(),
  proofFileName: z.string().trim().max(160).optional(),
  allocations: z.array(paymentAllocationInputSchema).default([]),
});

export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;

export const createClientPaymentSchema = z
  .object({
    clientId: z.coerce.number().int().positive('Client is required'),
    paymentDate: z.string().trim().min(1, 'Payment date is required'),
    method: z.enum(PAYMENT_METHODS),
    amount: positiveDecimalStringSchema,
    referenceNo: z.string().trim().max(80).optional(),
    bankName: z.string().trim().max(100).optional(),
    chequeDate: z.string().trim().optional(),
    notes: z.string().trim().max(400).optional(),
    proofDataUrl: z.string().max(5_000_000).optional(),
    proofFileName: z.string().trim().max(160).optional(),
    allocations: z.array(paymentAllocationInputSchema).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.method === 'CHEQUE') {
      if (!val.referenceNo || val.referenceNo.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['referenceNo'],
          message: 'Cheque number is required for cheque payments',
        });
      }
      if (!val.bankName || val.bankName.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankName'],
          message: 'Bank name is required for cheque payments',
        });
      }
      if (!val.chequeDate || val.chequeDate.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chequeDate'],
          message: 'Cheque date is required for cheque payments',
        });
      }
    }

    if (val.method !== 'CASH') {
      if (!val.proofDataUrl || val.proofDataUrl.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['proofDataUrl'],
          message: 'Proof upload (image or PDF) is required for non-cash payments',
        });
      }
    }
  });

export type CreateClientPaymentInput = z.infer<typeof createClientPaymentSchema>;

export const updateChequeStatusSchema = z
  .object({
    status: z.enum(['DEPOSITED', 'CLEARED', 'BOUNCED']),
    depositDate: z.string().trim().optional(),
    depositBank: z.string().trim().max(100).optional(),
    clearedDate: z.string().trim().optional(),
    bouncedDate: z.string().trim().optional(),
    bounceReason: z.string().trim().max(250).optional(),
    bounceFee: nonNegativeDecimalStringSchema.default('0.00'),
    notes: z.string().trim().max(400).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'DEPOSITED' && (!val.depositDate || val.depositDate.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositDate'],
        message: 'Deposit date is required when marking cheque as deposited',
      });
    }
    if (val.status === 'CLEARED' && (!val.clearedDate || val.clearedDate.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearedDate'],
        message: 'Cleared date is required when marking cheque as cleared',
      });
    }
    if (val.status === 'BOUNCED') {
      if (!val.bouncedDate || val.bouncedDate.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bouncedDate'],
          message: 'Bounced date is required when marking cheque as bounced',
        });
      }
      if (!val.bounceReason || val.bounceReason.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bounceReason'],
          message: 'Bounce reason (at least 3 characters) is required',
        });
      }
    }
  });

export type UpdateChequeStatusInput = z.infer<typeof updateChequeStatusSchema>;

export const voidDocumentSchema = z.object({
  reason: z.string().trim().min(3, 'Void reason must be at least 3 characters').max(250),
});

export type VoidDocumentInput = z.infer<typeof voidDocumentSchema>;

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  direction: z.enum(['IN', 'OUT']).optional(),
  partyType: z.enum(['SUPPLIER', 'CLIENT']).optional(),
  partyId: z.coerce.number().int().positive().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const listChequesQuerySchema = paginationQuerySchema.extend({
  direction: z.enum(['IN', 'OUT']).optional(),
  partyType: z.enum(['SUPPLIER', 'CLIENT']).optional(),
  partyId: z.coerce.number().int().positive().optional(),
  status: z.enum(CHEQUE_STATUSES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListChequesQuery = z.infer<typeof listChequesQuerySchema>;

export interface PaymentAllocationDto {
  readonly id: number;
  readonly invoiceType: string;
  readonly invoiceId: number;
  readonly invoiceNo?: string;
  readonly amount: string;
}

export interface AttachmentDto {
  readonly id: number;
  readonly fileName: string;
  readonly filePath: string;
  readonly mimeType: string;
  readonly createdAt: string;
}

export interface ChequeDto {
  readonly id: number;
  readonly paymentId: number;
  readonly paymentNo: string;
  readonly direction: 'IN' | 'OUT';
  readonly partyType: 'SUPPLIER' | 'CLIENT';
  readonly partyId: number;
  readonly partyName: string;
  readonly partyNameUr: string | null;
  readonly chequeNo: string;
  readonly bankName: string;
  readonly chequeDate: string;
  readonly amount: string;
  readonly status: ChequeStatus;
  readonly depositDate: string | null;
  readonly depositBank: string | null;
  readonly clearedDate: string | null;
  readonly bouncedDate: string | null;
  readonly bounceReason: string | null;
  readonly bounceFee: string;
  readonly notes: string | null;
  readonly allocations?: readonly PaymentAllocationDto[];
  readonly attachments: readonly AttachmentDto[];
  readonly createdAt: string;
}

export interface PaymentDto {
  readonly id: number;
  readonly paymentNo: string;
  readonly direction: 'IN' | 'OUT';
  readonly partyType: 'SUPPLIER' | 'CLIENT';
  readonly partyId: number;
  readonly partyName: string;
  readonly partyNameUr: string | null;
  readonly paymentDate: string;
  readonly method: PaymentMethod;
  readonly amount: string;
  readonly allocatedAmount: string;
  readonly unallocatedAmount: string;
  readonly referenceNo: string | null;
  readonly bankName: string | null;
  readonly chequeDate: string | null;
  readonly status: PaymentStatus;
  readonly chequeStatus: ChequeStatus | null;
  readonly notes: string | null;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly allocations: readonly PaymentAllocationDto[];
  readonly attachments: readonly AttachmentDto[];
  readonly createdAt: string;
}
