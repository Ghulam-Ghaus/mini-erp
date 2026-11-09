import { z } from 'zod';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .refine((val): val is PageSizeOption => (PAGE_SIZE_OPTIONS as readonly number[]).includes(val), {
    message: 'pageSize must be 10, 25, 50, or 100',
  });

export const sortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: pageSizeSchema.default(25),
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema.default('desc'),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
