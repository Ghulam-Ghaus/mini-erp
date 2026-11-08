import { z } from 'zod';
import { positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE_WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['POSTED', 'VOIDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

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
  readonly referenceNo: string | null;
  readonly bankName: string | null;
  readonly chequeDate: string | null;
  readonly status: PaymentStatus;
  readonly notes: string | null;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly allocations: readonly PaymentAllocationDto[];
  readonly attachments: readonly AttachmentDto[];
  readonly createdAt: string;
}
