import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';
import { PAYMENT_METHODS } from './payments.js';

export const SALE_STATUSES = ['POSTED', 'PAID', 'PARTIAL', 'VOIDED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const createSaleLineSchema = z
  .object({
    lineType: z.enum(['BATCH', 'RAW']).optional(),
    batchId: z.number().int().positive('Batch is required').optional().nullable(),
    itemId: z.number().int().positive('Item is required').optional().nullable(),
    costRate: nonNegativeDecimalStringSchema.optional().nullable(),
    enteredQty: positiveDecimalStringSchema,
    enteredUnit: z.string().trim().min(1, 'Unit is required').max(30),
    conversionFactor: positiveDecimalStringSchema.default('1.000'),
    bagCount: z.number().int().nonnegative().optional().nullable(),
    ratePerEnteredUnit: nonNegativeDecimalStringSchema,
    taxRate: nonNegativeDecimalStringSchema.default('0.00'),
    notes: z.string().trim().max(300).optional(),
  })
  .refine(
    (data) => {
      const type = data.lineType ?? (data.batchId ? 'BATCH' : 'RAW');
      if (type === 'BATCH') {
        return !!data.batchId;
      }
      return !!data.itemId;
    },
    {
      message: 'Batch is required for BATCH line; Item is required for RAW line',
      path: ['batchId'],
    },
  );

export type CreateSaleLineInput = z.infer<typeof createSaleLineSchema>;

export const createSaleInvoiceSchema = z.object({
  clientId: z.number().int().positive('Client is required'),
  routeId: z.number().int().positive().optional().nullable(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  discount: nonNegativeDecimalStringSchema.default('0.00'),
  extraCharges: nonNegativeDecimalStringSchema.default('0.00'),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(createSaleLineSchema).min(1, 'At least one sale line is required'),
  paidNow: z
    .object({
      amount: positiveDecimalStringSchema,
      method: z.enum(PAYMENT_METHODS).default('CASH'),
      referenceNo: z.string().trim().max(100).optional(),
    })
    .optional(),
});

export type CreateSaleInvoiceInput = z.infer<typeof createSaleInvoiceSchema>;

export const voidSaleInvoiceSchema = z.object({
  reason: z.string().trim().min(3, 'Void reason must be at least 3 characters').max(300),
});

export type VoidSaleInvoiceInput = z.infer<typeof voidSaleInvoiceSchema>;

export const listSalesQuerySchema = paginationQuerySchema.extend({
  clientId: z.coerce.number().int().positive().optional(),
  routeId: z.coerce.number().int().positive().optional(),
  status: z.enum(SALE_STATUSES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

export interface CalculatedSaleLine {
  readonly enteredQty: string;
  readonly conversionFactor: string;
  readonly qtyBase: string;
  readonly ratePerEnteredUnit: string;
  readonly ratePerBase: string;
  readonly taxRate: string;
  readonly lineSubtotal: string;
  readonly taxAmount: string;
  readonly lineTotal: string;
  readonly batchCostRateSnapshot: string;
  readonly lineCogs: string;
  readonly lineProfit: string;
}

export function calculateSaleLineAmounts(params: {
  enteredQty: string | number | Decimal;
  conversionFactor?: string | number | Decimal;
  ratePerEnteredUnit: string | number | Decimal;
  taxRate?: string | number | Decimal;
  batchCostRateSnapshot?: string | number | Decimal;
}): CalculatedSaleLine {
  const enteredQtyDec = new Decimal(params.enteredQty || 0);
  const convDec = new Decimal(params.conversionFactor || 1);
  const qtyBaseDec = enteredQtyDec.mul(convDec);

  const rateEnteredDec = new Decimal(params.ratePerEnteredUnit || 0);
  const rateBaseDec = convDec.isZero() ? rateEnteredDec : rateEnteredDec.div(convDec);

  const lineSubtotalDec = enteredQtyDec
    .mul(rateEnteredDec)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const taxRateDec = new Decimal(params.taxRate || 0);
  const taxAmountDec = lineSubtotalDec
    .mul(taxRateDec)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const lineTotalDec = lineSubtotalDec.plus(taxAmountDec);

  const costSnapshotDec = new Decimal(params.batchCostRateSnapshot || 0);
  const lineCogsDec = qtyBaseDec.mul(costSnapshotDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const lineProfitDec = lineSubtotalDec.minus(lineCogsDec);

  return {
    enteredQty: enteredQtyDec.toFixed(3),
    conversionFactor: convDec.toFixed(3),
    qtyBase: qtyBaseDec.toFixed(3),
    ratePerEnteredUnit: rateEnteredDec.toFixed(4),
    ratePerBase: rateBaseDec.toFixed(4),
    taxRate: taxRateDec.toFixed(2),
    lineSubtotal: lineSubtotalDec.toFixed(2),
    taxAmount: taxAmountDec.toFixed(2),
    lineTotal: lineTotalDec.toFixed(2),
    batchCostRateSnapshot: costSnapshotDec.toFixed(4),
    lineCogs: lineCogsDec.toFixed(2),
    lineProfit: lineProfitDec.toFixed(2),
  };
}

export interface SaleItemDto {
  readonly id: number;
  readonly saleId: number;
  readonly lineType?: 'BATCH' | 'RAW';
  readonly batchId: number | null;
  readonly batchNo: string | null;
  readonly batchName?: string | null;
  readonly itemId: number | null;
  readonly itemName: string | null;
  readonly itemNameUr?: string | null;
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
  readonly batchCostRateSnapshot: string;
  readonly lineCogs: string;
  readonly lineProfit: string;
  readonly returnedQtyBase: string;
  readonly availableToReturnQtyBase: string;
  readonly notes: string | null;
}

export interface SaleInvoiceDto {
  readonly id: number;
  readonly invoiceNo: string;
  readonly saleDate: string;
  readonly clientId: number;
  readonly clientName: string;
  readonly clientNameUr?: string | null;
  readonly routeId: number | null;
  readonly routeName?: string | null;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly discount: string;
  readonly extraCharges: string;
  readonly total: string;
  readonly totalCogs: string;
  readonly totalProfit: string;
  readonly profitMarginPercent: string;
  readonly totalQtyBase: string;
  readonly paidAmount: string;
  readonly returnedAmount: string;
  readonly balanceDue: string;
  readonly status: SaleStatus;
  readonly challanId?: number | null;
  readonly challanNo?: string | null;
  readonly challanStatus?: string | null;
  readonly notes: string | null;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly voidedByName?: string | null;
  readonly createdByName?: string | null;
  readonly createdAt: string;
  readonly items: readonly SaleItemDto[];
}
