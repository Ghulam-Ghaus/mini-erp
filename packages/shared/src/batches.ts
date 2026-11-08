import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { nonNegativeDecimalStringSchema, positiveDecimalStringSchema } from './items.js';
import { paginationQuerySchema } from './pagination.js';

export const BATCH_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_COST_TYPES = ['LABOUR', 'RENT', 'FUEL', 'PACKING', 'LOADING', 'OTHER'] as const;
export type BatchCostType = (typeof BATCH_COST_TYPES)[number];

export const BATCH_ADJUSTMENT_REASONS = [
  'SPILLAGE',
  'THEFT',
  'COUNT_CORRECTION',
  'DAMAGED',
  'OTHER',
] as const;
export type BatchAdjustmentReason = (typeof BATCH_ADJUSTMENT_REASONS)[number];

export const STOCK_MOVEMENT_TYPES = [
  'PURCHASE_IN',
  'PURCHASE_VOID_OUT',
  'RETURN_OUT',
  'RETURN_VOID_IN',
  'BATCH_ALLOCATE_OUT',
  'PRODUCTION_IN',
  'SALE_OUT',
  'RETURN_IN',
  'ADJUSTMENT',
  'WASTAGE',
] as const;
export type StockMovementTypeDto = (typeof STOCK_MOVEMENT_TYPES)[number];

export const signedDecimalStringSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      try {
        const d = new Decimal(val);
        return d.isFinite() && !d.isZero();
      } catch {
        return false;
      }
    },
    { message: 'Must be a non-zero decimal number' },
  );

export const batchAllocationLineInputSchema = z.object({
  purchaseItemId: z.coerce.number().int().positive('Purchase line is required'),
  kgUsed: positiveDecimalStringSchema,
  notes: z.string().trim().max(250).optional(),
});

export type BatchAllocationLineInput = z.infer<typeof batchAllocationLineInputSchema>;

export const batchCostLineInputSchema = z.object({
  costType: z.enum(BATCH_COST_TYPES),
  costDate: z.string().trim().min(1, 'Cost date is required'),
  description: z.string().trim().min(1, 'Description is required').max(200),
  amount: positiveDecimalStringSchema,
});

export type BatchCostLineInput = z.infer<typeof batchCostLineInputSchema>;

export const createBatchSchema = z.object({
  name: z.string().trim().min(1, 'Batch name is required').max(120),
  nameUr: z.string().trim().max(120).optional(),
  itemId: z.coerce.number().int().positive().optional(),
  batchDate: z.string().trim().min(1, 'Batch date is required'),
  status: z.enum(['DRAFT', 'OPEN']).default('OPEN'),
  wastageMode: z.enum(['PERCENT', 'KG']).default('PERCENT'),
  wastagePercent: nonNegativeDecimalStringSchema.default('0.000'),
  wastageKg: nonNegativeDecimalStringSchema.default('0.000'),
  notes: z.string().trim().max(500).optional(),
  allocations: z
    .array(batchAllocationLineInputSchema)
    .min(1, 'Allocate at least one purchase line to create a batch'),
  costs: z.array(batchCostLineInputSchema).default([]),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const addBatchAllocationSchema = z.object({
  allocations: z
    .array(batchAllocationLineInputSchema)
    .min(1, 'Select at least one purchase line to allocate'),
});

export type AddBatchAllocationInput = z.infer<typeof addBatchAllocationSchema>;

export const addBatchCostSchema = batchCostLineInputSchema;
export type AddBatchCostInput = z.infer<typeof addBatchCostSchema>;

export const voidBatchCostSchema = z.object({
  reason: z.string().trim().min(3, 'Void reason is required').max(250),
});
export type VoidBatchCostInput = z.infer<typeof voidBatchCostSchema>;

export const updateBatchWastageSchema = z.object({
  wastageMode: z.enum(['PERCENT', 'KG']),
  wastagePercent: nonNegativeDecimalStringSchema.default('0.000'),
  wastageKg: nonNegativeDecimalStringSchema.default('0.000'),
  note: z.string().trim().max(250).optional(),
});
export type UpdateBatchWastageInput = z.infer<typeof updateBatchWastageSchema>;

export const closeBatchSchema = z.object({
  actualOutputKg: positiveDecimalStringSchema.optional(),
  note: z.string().trim().max(250).optional(),
});
export type CloseBatchInput = z.infer<typeof closeBatchSchema>;

export const adjustBatchStockSchema = z.object({
  deltaQtyBase: signedDecimalStringSchema,
  reasonCode: z.enum(BATCH_ADJUSTMENT_REASONS),
  note: z.string().trim().min(3, 'Adjustment note is required').max(250),
});
export type AdjustBatchStockInput = z.infer<typeof adjustBatchStockSchema>;

export const listBatchesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(BATCH_STATUSES).optional(),
  itemId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;

export const listStockMovementsQuerySchema = paginationQuerySchema.extend({
  itemId: z.coerce.number().int().positive().optional(),
  batchId: z.coerce.number().int().positive().optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  scope: z.enum(['ALL', 'RAW', 'BATCH']).default('ALL'),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});
export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;

export interface AvailablePurchaseItemDto {
  readonly purchaseItemId: number;
  readonly purchaseId: number;
  readonly invoiceNo: string;
  readonly invoiceDate: string;
  readonly supplierId: number;
  readonly supplierName: string;
  readonly itemId: number;
  readonly itemName: string;
  readonly itemNameUr: string | null;
  readonly baseUnit: string;
  readonly enteredQty: string;
  readonly enteredUnit: string;
  readonly qtyBase: string;
  readonly returnedQtyBase: string;
  readonly allocatedQtyBase: string;
  readonly availableQtyBase: string;
  readonly ratePerBase: string;
}

export interface BatchSourceDto {
  readonly id: number;
  readonly batchId: number;
  readonly purchaseItemId: number;
  readonly purchaseId: number;
  readonly invoiceNo: string;
  readonly supplierId: number;
  readonly supplierName: string;
  readonly itemId: number;
  readonly itemName: string;
  readonly itemNameUr: string | null;
  readonly kgUsed: string;
  readonly ratePerBase: string;
  readonly amount: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface BatchCostDto {
  readonly id: number;
  readonly batchId: number;
  readonly costType: BatchCostType;
  readonly costDate: string;
  readonly description: string;
  readonly amount: string;
  readonly isVoided: boolean;
  readonly voidReason: string | null;
  readonly createdAt: string;
}

export interface StockMovementDto {
  readonly id: number;
  readonly itemId: number;
  readonly itemName: string;
  readonly itemNameUr: string | null;
  readonly batchId: number | null;
  readonly batchNo: string | null;
  readonly batchName: string | null;
  readonly purchaseItemId: number | null;
  readonly type: StockMovementTypeDto;
  readonly qtyBase: string;
  readonly refType: string;
  readonly refId: number;
  readonly refNo: string | null;
  readonly note: string | null;
  readonly userId: number;
  readonly createdAt: string;
}

export interface BatchVarianceDto {
  readonly plannedWastagePercent: string;
  readonly plannedWastageKg: string;
  readonly actualWastagePercent: string;
  readonly actualWastageKg: string;
  readonly wastageDiffKg: string;
  readonly plannedOutputKg: string;
  readonly actualOutputKg: string;
}

export interface BatchSummaryDto {
  readonly id: number;
  readonly batchNo: string;
  readonly name: string;
  readonly nameUr: string | null;
  readonly itemId: number | null;
  readonly itemName: string | null;
  readonly itemNameUr: string | null;
  readonly batchDate: string;
  readonly status: BatchStatus;
  readonly rawKg: string;
  readonly plannedWastagePercent: string;
  readonly plannedWastageKg: string;
  readonly wastagePercent: string;
  readonly wastageKg: string;
  readonly outputKg: string;
  readonly availableKg: string;
  readonly soldKg: string;
  readonly rawCost: string;
  readonly extraCost: string;
  readonly totalCost: string;
  readonly costPerKg: string;
  readonly notes: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
}

export interface BatchDetailDto extends BatchSummaryDto {
  readonly sources: readonly BatchSourceDto[];
  readonly costs: readonly BatchCostDto[];
  readonly movements: readonly StockMovementDto[];
  readonly variance: BatchVarianceDto;
}

export interface CalculatedBatchMetrics {
  readonly rawKg: string;
  readonly wastagePercent: string;
  readonly wastageKg: string;
  readonly outputKg: string;
  readonly rawCost: string;
  readonly extraCost: string;
  readonly totalCost: string;
  readonly costPerKg: string;
}

/**
 * Computes the monetary amount of a purchase allocation (`kgUsed * ratePerBase`)
 * rounded to 2 decimal places using ROUND_HALF_UP.
 */
export function calculateAllocationAmount(kgUsed: string, ratePerBase: string): string {
  const kg = new Decimal(kgUsed).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const rate = new Decimal(ratePerBase).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return kg.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Pure Decimal batch costing calculator following Section 4.1 and 4.5b of PROJECT_START.md:
 * - Supports entering wastage as PERCENT or KG (calculates the other automatically).
 * - output_kg = raw_kg - wastage_kg (must be > 0 when raw_kg > 0).
 * - total_cost = raw_cost + extra_cost.
 * - cost_per_kg = total_cost / output_kg (rounded to 2 decimal places).
 */
export function calculateBatchMetrics(input: {
  readonly allocations: ReadonlyArray<{ readonly kgUsed: string; readonly amount: string }>;
  readonly activeCosts: ReadonlyArray<{ readonly amount: string }>;
  readonly wastageMode: 'PERCENT' | 'KG';
  readonly wastagePercent?: string;
  readonly wastageKg?: string;
}): CalculatedBatchMetrics {
  let rawKgDec = new Decimal(0);
  let rawCostDec = new Decimal(0);

  for (const alloc of input.allocations) {
    rawKgDec = rawKgDec.plus(new Decimal(alloc.kgUsed).toDecimalPlaces(3, Decimal.ROUND_HALF_UP));
    rawCostDec = rawCostDec.plus(
      new Decimal(alloc.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    );
  }

  let extraCostDec = new Decimal(0);
  for (const cost of input.activeCosts) {
    extraCostDec = extraCostDec.plus(
      new Decimal(cost.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    );
  }

  const totalCostDec = rawCostDec.plus(extraCostDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (rawKgDec.lte(0)) {
    return {
      rawKg: '0.000',
      wastagePercent: '0.000',
      wastageKg: '0.000',
      outputKg: '0.000',
      rawCost: rawCostDec.toFixed(2),
      extraCost: extraCostDec.toFixed(2),
      totalCost: totalCostDec.toFixed(2),
      costPerKg: '0.00',
    };
  }

  let wastagePercentDec: Decimal;
  let wastageKgDec: Decimal;

  if (input.wastageMode === 'PERCENT') {
    wastagePercentDec = new Decimal(input.wastagePercent ?? '0').toDecimalPlaces(
      3,
      Decimal.ROUND_HALF_UP,
    );
    if (wastagePercentDec.lt(0) || wastagePercentDec.gte(100)) {
      throw new Error('Wastage percent must be between 0 and less than 100');
    }
    wastageKgDec = rawKgDec
      .mul(wastagePercentDec)
      .div(100)
      .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  } else {
    wastageKgDec = new Decimal(input.wastageKg ?? '0').toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    if (wastageKgDec.lt(0) || wastageKgDec.gte(rawKgDec)) {
      throw new Error('Wastage kg must be at least 0 and less than total raw kg');
    }
    wastagePercentDec = wastageKgDec
      .div(rawKgDec)
      .mul(100)
      .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  }

  const outputKgDec = rawKgDec.minus(wastageKgDec).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  if (outputKgDec.lte(0)) {
    throw new Error('Batch output kg after wastage must be greater than zero');
  }

  const costPerKgDec = totalCostDec.div(outputKgDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    rawKg: rawKgDec.toFixed(3),
    wastagePercent: wastagePercentDec.toFixed(3),
    wastageKg: wastageKgDec.toFixed(3),
    outputKg: outputKgDec.toFixed(3),
    rawCost: rawCostDec.toFixed(2),
    extraCost: extraCostDec.toFixed(2),
    totalCost: totalCostDec.toFixed(2),
    costPerKg: costPerKgDec.toFixed(2),
  };
}

/**
 * Computes planned vs actual wastage and output variance when a batch is closed
 * with an actual weighed output kg (Section 4.5b of PROJECT_START.md).
 */
export function calculateBatchVariance(input: {
  readonly rawKg: string;
  readonly plannedWastagePercent: string;
  readonly plannedWastageKg: string;
  readonly actualWastagePercent: string;
  readonly actualWastageKg: string;
  readonly actualOutputKg: string;
}): BatchVarianceDto {
  const raw = new Decimal(input.rawKg).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const plannedWastageKg = new Decimal(input.plannedWastageKg).toDecimalPlaces(
    3,
    Decimal.ROUND_HALF_UP,
  );
  const actualWastageKg = new Decimal(input.actualWastageKg).toDecimalPlaces(
    3,
    Decimal.ROUND_HALF_UP,
  );
  const plannedOutputKg = raw.minus(plannedWastageKg).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const wastageDiffKg = actualWastageKg
    .minus(plannedWastageKg)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

  return {
    plannedWastagePercent: new Decimal(input.plannedWastagePercent).toFixed(3),
    plannedWastageKg: plannedWastageKg.toFixed(3),
    actualWastagePercent: new Decimal(input.actualWastagePercent).toFixed(3),
    actualWastageKg: actualWastageKg.toFixed(3),
    wastageDiffKg: wastageDiffKg.toFixed(3),
    plannedOutputKg: plannedOutputKg.toFixed(3),
    actualOutputKg: new Decimal(input.actualOutputKg).toFixed(3),
  };
}
