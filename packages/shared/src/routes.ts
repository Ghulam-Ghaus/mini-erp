import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';

export const createRouteSchema = z.object({
  code: z.string().trim().max(30).optional(),
  name: z.string().trim().min(1, 'Route name is required').max(120),
  nameUr: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  assignedOfficerId: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateRouteInput = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = createRouteSchema.partial();

export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;

export const listRoutesQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListRoutesQuery = z.infer<typeof listRoutesQuerySchema>;

export interface RouteDto {
  readonly id: number;
  readonly code: string | null;
  readonly name: string;
  readonly nameUr: string | null;
  readonly description: string | null;
  readonly assignedOfficerId: number | null;
  readonly assignedOfficerName?: string | null;
  readonly clientCount: number;
  readonly isActive: boolean;
  readonly createdAt: string;
}
