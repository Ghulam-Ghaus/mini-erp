import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';
import { PAYMENT_METHODS, type PaymentMethod } from './payments.js';

export const PURCHASE_STATUSES = ['POSTED', 'PARTIAL', 'PAID', 'VOIDED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const RETURN_REASON_CODES = [
  'QUALITY',
  'WRONG_ITEM',
  'SHORT_WEIGHT',
  'DAMAGED_IN_TRANSIT',
  'OTHER',
] as const;

export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];

export const PURCHASE_RETURN_SETTLEMENT_TYPES = [
  'ADJUST_PAYABLE',
  'SUPPLIER_CREDIT',
  'CASH_REFUND',
] as const;

export type PurchaseReturnSettlementType = (typeof PURCHASE_RETURN_SETTLEMENT_TYPES)[number];

export const purchaseLineInputSchema = z.object({
  itemId: z.coerce.number().int().positive('Item is required'),
  enteredQty: positiveDecimalStringSchema,
  enteredUnit: z.string().trim().min(1).max(30),
  conversionFactor: positiveDecimalStringSchema.default('1.000'),
  bagCount: z.coerce.number().int().nonnegative().optional(),
  qtyBase: positiveDecimalStringSchema,
  ratePerEnteredUnit: nonNegativeDecimalStringSchema,
  taxRate: nonNegativeDecimalStringSchema.default('0.00'),
  notes: z.string().trim().max(250).optional(),
});

export type PurchaseLineInput = z.infer<typeof purchaseLineInputSchema>;

export const immediateSupplierPaymentSchema = z.object({
  amount: positiveDecimalStringSchema,
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  referenceNo: z.string().trim().max(80).optional(),
  bankName: z.string().trim().max(100).optional(),
  chequeDate: z.string().trim().optional(),
  proofDataUrl: z.string().max(5_000_000).optional(),
  proofFileName: z.string().trim().max(160).optional(),
});

export type ImmediateSupplierPaymentInput = z.infer<typeof immediateSupplierPaymentSchema>;

export const createPurchaseInvoiceSchema = z.object({
  supplierId: z.coerce.number().int().positive('Supplier is required'),
  invoiceDate: z.string().trim().min(1, 'Invoice date is required'),
  supplierRefNo: z.string().trim().max(60).optional(),
  discount: nonNegativeDecimalStringSchema.default('0.00'),
  extraCharges: nonNegativeDecimalStringSchema.default('0.00'),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(purchaseLineInputSchema).min(1, 'At least one purchase item is required'),
  immediatePayment: immediateSupplierPaymentSchema.optional(),
});

export type CreatePurchaseInvoiceInput = z.infer<typeof createPurchaseInvoiceSchema>;

export const listPurchasesQuerySchema = paginationQuerySchema.extend({
  supplierId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
  status: z.enum(PURCHASE_STATUSES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;

export const purchaseReturnLineInputSchema = z.object({
  purchaseItemId: z.coerce.number().int().positive(),
  returnQtyBase: positiveDecimalStringSchema,
});

export type PurchaseReturnLineInput = z.infer<typeof purchaseReturnLineInputSchema>;

export const createPurchaseReturnSchema = z.object({
  purchaseId: z.coerce.number().int().positive(),
  returnDate: z.string().trim().min(1, 'Return date is required'),
  reasonCode: z.enum(RETURN_REASON_CODES),
  settlementType: z.enum(PURCHASE_RETURN_SETTLEMENT_TYPES).default('ADJUST_PAYABLE'),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(purchaseReturnLineInputSchema).min(1, 'Select at least one line to return'),
});

export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;

export const listPurchaseReturnsQuerySchema = paginationQuerySchema.extend({
  supplierId: z.coerce.number().int().positive().optional(),
  purchaseId: z.coerce.number().int().positive().optional(),
  reasonCode: z.enum(RETURN_REASON_CODES).optional(),
  status: z.enum(['POSTED', 'VOIDED']).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListPurchaseReturnsQuery = z.infer<typeof listPurchaseReturnsQuerySchema>;

export interface PurchaseItemDto {
  readonly id: number;
  readonly purchaseId: number;
  readonly itemId: number;
  readonly itemName: string;
  readonly itemNameUr: string | null;
  readonly baseUnit: string;
  readonly enteredQty: string;
  readonly enteredUnit: string;
  readonly conversionFactor: string;
  readonly bagCount: number | null;
  readonly qtyBase: string;
  readonly ratePerEnteredUnit: string;
  readonly ratePerBase: string;
  readonly taxRate: string;
  readonly taxAmount: string;
  readonly lineSubtotal: string;
  readonly lineTotal: string;
  readonly allocatedQtyBase: string;
  readonly returnedQtyBase: string;
  readonly availableToReturnQtyBase: string;
  readonly availableToAllocateQtyBase: string;
  readonly notes: string | null;
}

export interface PurchaseInvoiceDto {
  readonly id: number;
  readonly invoiceNo: string;
  readonly supplierRefNo: string | null;
  readonly invoiceDate: string;
  readonly supplierId: number;
  readonly supplierName: string;
  readonly supplierNameUr: string | null;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly discount: string;
  readonly extraCharges: string;
  readonly total: string;
  readonly paidAmount: string;
  readonly returnedAmount: string;
  readonly balanceDue: string;
  readonly totalQtyBase: string;
  readonly status: PurchaseStatus;
  readonly notes: string | null;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly items: readonly PurchaseItemDto[];
  readonly createdAt: string;
}

export interface PurchaseReturnItemDto {
  readonly id: number;
  readonly purchaseItemId: number;
  readonly itemId: number;
  readonly itemName: string;
  readonly itemNameUr: string | null;
  readonly baseUnit: string;
  readonly enteredQty: string;
  readonly enteredUnit: string;
  readonly qtyBase: string;
  readonly ratePerBase: string;
  readonly taxRate: string;
  readonly taxAmount: string;
  readonly lineSubtotal: string;
  readonly lineTotal: string;
}

export interface PurchaseReturnDto {
  readonly id: number;
  readonly returnNo: string;
  readonly returnDate: string;
  readonly purchaseId: number;
  readonly purchaseInvoiceNo: string;
  readonly supplierId: number;
  readonly supplierName: string;
  readonly supplierNameUr: string | null;
  readonly reasonCode: ReturnReasonCode;
  readonly settlementType: PurchaseReturnSettlementType;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly totalQtyBase: string;
  readonly status: 'POSTED' | 'VOIDED';
  readonly notes: string | null;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly items: readonly PurchaseReturnItemDto[];
  readonly createdAt: string;
}

export interface CalculatedPurchaseLine {
  readonly enteredQty: string;
  readonly qtyBase: string;
  readonly ratePerEnteredUnit: string;
  readonly ratePerBase: string;
  readonly taxRate: string;
  readonly lineSubtotal: string;
  readonly taxAmount: string;
  readonly lineTotal: string;
}

/**
 * Pure Decimal calculation for a single purchase line (never uses floating point).
 * If enteredUnit == baseUnit (conversionFactor == 1), lineSubtotal = qtyBase * ratePerEnteredUnit.
 * If enteredUnit is an alternate unit (e.g. BAG) and user overrode qtyBase (actual weighed kg),
 * ratePerBase = (enteredQty * ratePerEnteredUnit) / qtyBase so the total matches the agreed price,
 * or if conversionFactor is fixed, ratePerBase = ratePerEnteredUnit / conversionFactor.
 */
export function calculatePurchaseLineAmounts(input: {
  enteredQty: string;
  qtyBase: string;
  ratePerEnteredUnit: string;
  taxRate?: string;
}): CalculatedPurchaseLine {
  const enteredQty = new Decimal(input.enteredQty).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const qtyBase = new Decimal(input.qtyBase).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const ratePerEnteredUnit = new Decimal(input.ratePerEnteredUnit).toDecimalPlaces(
    4,
    Decimal.ROUND_HALF_UP,
  );
  const taxRate = new Decimal(input.taxRate ?? '0').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const lineSubtotal = enteredQty.mul(ratePerEnteredUnit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const ratePerBase = qtyBase.gt(0)
    ? lineSubtotal.div(qtyBase).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const taxAmount = lineSubtotal.mul(taxRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const lineTotal = lineSubtotal.plus(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    enteredQty: enteredQty.toFixed(3),
    qtyBase: qtyBase.toFixed(3),
    ratePerEnteredUnit: ratePerEnteredUnit.toFixed(4),
    ratePerBase: ratePerBase.toFixed(4),
    taxRate: taxRate.toFixed(2),
    lineSubtotal: lineSubtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    lineTotal: lineTotal.toFixed(2),
  };
}

export type { PaymentMethod };
