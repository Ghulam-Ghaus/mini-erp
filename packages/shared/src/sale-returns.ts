import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';

export const SALE_RETURN_REASONS = [
  'QUALITY',
  'WRONG_ITEM',
  'SHORT_WEIGHT',
  'CUSTOMER_CANCELLED',
  'DAMAGED_TRANSIT',
  'OTHER',
] as const;

export type SaleReturnReason = (typeof SALE_RETURN_REASONS)[number];

export const SALE_RETURN_CONDITIONS = ['RESALEABLE', 'DAMAGED'] as const;
export type SaleReturnCondition = (typeof SALE_RETURN_CONDITIONS)[number];

export const SALE_RETURN_SETTLEMENTS = ['ADJUST_BALANCE', 'CREDIT_ON_ACCOUNT', 'REFUND'] as const;
export type SaleReturnSettlement = (typeof SALE_RETURN_SETTLEMENTS)[number];

export const createSaleReturnLineSchema = z.object({
  saleItemId: z.number().int().positive('Sale item ID is required'),
  enteredQty: positiveDecimalStringSchema,
  condition: z.enum(SALE_RETURN_CONDITIONS).default('RESALEABLE'),
});

export type CreateSaleReturnLineInput = z.infer<typeof createSaleReturnLineSchema>;

export const createSaleReturnSchema = z.object({
  saleId: z.number().int().positive('Sale invoice ID is required'),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reasonCode: z.enum(SALE_RETURN_REASONS),
  deduction: nonNegativeDecimalStringSchema.default('0.00'),
  settlementType: z.enum(SALE_RETURN_SETTLEMENTS).default('ADJUST_BALANCE'),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(createSaleReturnLineSchema).min(1, 'At least one return line is required'),
});

export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;

export const voidSaleReturnSchema = z.object({
  reason: z.string().trim().min(3, 'Void reason must be at least 3 characters').max(300),
});

export type VoidSaleReturnInput = z.infer<typeof voidSaleReturnSchema>;

export const listSaleReturnsQuerySchema = paginationQuerySchema.extend({
  clientId: z.coerce.number().int().positive().optional(),
  saleId: z.coerce.number().int().positive().optional(),
  status: z.enum(['POSTED', 'VOIDED']).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListSaleReturnsQuery = z.infer<typeof listSaleReturnsQuerySchema>;

export interface CalculatedSaleReturnLine {
  readonly qtyBase: string;
  readonly lineSubtotal: string;
  readonly taxAmount: string;
  readonly lineTotal: string;
  readonly cogsReversed: string;
  readonly lossAmount: string;
}

export function calculateSaleReturnAmounts(params: {
  enteredQty: string | number | Decimal;
  conversionFactor?: string | number | Decimal;
  ratePerBase: string | number | Decimal;
  taxRate?: string | number | Decimal;
  batchCostRateSnapshot: string | number | Decimal;
  condition: SaleReturnCondition;
}): CalculatedSaleReturnLine {
  const enteredQtyDec = new Decimal(params.enteredQty || 0);
  const convDec = new Decimal(params.conversionFactor || 1);
  const qtyBaseDec = enteredQtyDec.mul(convDec);

  const rateBaseDec = new Decimal(params.ratePerBase || 0);
  const lineSubtotalDec = qtyBaseDec.mul(rateBaseDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const taxRateDec = new Decimal(params.taxRate || 0);
  const taxAmountDec = lineSubtotalDec
    .mul(taxRateDec)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const lineTotalDec = lineSubtotalDec.plus(taxAmountDec);

  const costSnapshotDec = new Decimal(params.batchCostRateSnapshot || 0);
  const totalCostDec = qtyBaseDec.mul(costSnapshotDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const cogsReversedDec = params.condition === 'RESALEABLE' ? totalCostDec : new Decimal(0);
  const lossAmountDec = params.condition === 'DAMAGED' ? totalCostDec : new Decimal(0);

  return {
    qtyBase: qtyBaseDec.toFixed(3),
    lineSubtotal: lineSubtotalDec.toFixed(2),
    taxAmount: taxAmountDec.toFixed(2),
    lineTotal: lineTotalDec.toFixed(2),
    cogsReversed: cogsReversedDec.toFixed(2),
    lossAmount: lossAmountDec.toFixed(2),
  };
}

export interface SaleReturnItemDto {
  readonly id: number;
  readonly saleReturnId: number;
  readonly saleItemId: number;
  readonly batchId: number;
  readonly batchNo: string;
  readonly itemId: number;
  readonly itemName: string;
  readonly enteredQty: string;
  readonly enteredUnit: string;
  readonly qtyBase: string;
  readonly ratePerBase: string;
  readonly taxRate: string;
  readonly taxAmount: string;
  readonly lineSubtotal: string;
  readonly lineTotal: string;
  readonly condition: SaleReturnCondition;
  readonly batchCostRateSnapshot: string;
  readonly cogsReversed: string;
  readonly lossAmount: string;
}

export interface SaleReturnDto {
  readonly id: number;
  readonly returnNo: string;
  readonly returnDate: string;
  readonly saleId: number;
  readonly invoiceNo: string;
  readonly clientId: number;
  readonly clientName: string;
  readonly clientNameUr?: string | null;
  readonly reasonCode: SaleReturnReason;
  readonly notes: string | null;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly deduction: string;
  readonly total: string;
  readonly settlementType: SaleReturnSettlement;
  readonly status: 'POSTED' | 'VOIDED';
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly createdByName?: string | null;
  readonly createdAt: string;
  readonly items: readonly SaleReturnItemDto[];
}
