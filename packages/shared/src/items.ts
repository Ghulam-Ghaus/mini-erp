import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';

/** Validates a positive decimal string (e.g. "50" or "50.000"). */
export const positiveDecimalStringSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      try {
        const d = new Decimal(val);
        return d.isFinite() && d.gt(0);
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid number greater than 0' },
  );

/** Validates a non-negative decimal string (e.g. "0", "17.00"). */
export const nonNegativeDecimalStringSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      try {
        const d = new Decimal(val);
        return d.isFinite() && d.gte(0);
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid number 0 or greater' },
  );

export const itemUnitInputSchema = z.object({
  unitName: z.string().trim().min(1, 'Unit name is required').max(30),
  unitNameUr: z.string().trim().max(40).optional(),
  conversionFactor: positiveDecimalStringSchema,
  isDefaultForPurchase: z.boolean().default(false),
  isDefaultForSale: z.boolean().default(false),
});

export type ItemUnitInput = z.infer<typeof itemUnitInputSchema>;

export const createItemSchema = z.object({
  code: z.string().trim().max(30).optional(),
  name: z.string().trim().min(1, 'Item name is required').max(120),
  nameUr: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  baseUnit: z.string().trim().min(1).max(20).default('KG'),
  defaultTaxRate: nonNegativeDecimalStringSchema.default('0.00'),
  notes: z.string().trim().max(400).optional(),
  isActive: z.boolean().default(true),
  alternateUnits: z.array(itemUnitInputSchema).default([]),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const listItemsQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  category: z.string().trim().optional(),
});

export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export interface ItemUnitDto {
  readonly id: number;
  readonly unitName: string;
  readonly unitNameUr: string | null;
  readonly conversionFactor: string;
  readonly isDefaultForPurchase: boolean;
  readonly isDefaultForSale: boolean;
}

export interface ItemDto {
  readonly id: number;
  readonly code: string | null;
  readonly name: string;
  readonly nameUr: string | null;
  readonly category: string | null;
  readonly baseUnit: string;
  readonly defaultTaxRate: string;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly alternateUnits: readonly ItemUnitDto[];
  readonly rawStockQtyBase: string;
  readonly lastPurchaseRatePerBase: string | null;
  readonly createdAt: string;
}

/**
 * Converts an entered quantity in an alternate unit into the item's base unit (3 decimal places).
 */
export function convertToBaseUnitQty(
  enteredQty: string | number | Decimal,
  conversionFactor: string | number | Decimal,
): string {
  const qty = new Decimal(enteredQty);
  const factor = new Decimal(conversionFactor);
  return qty.mul(factor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
}
