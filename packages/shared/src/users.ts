import { z } from 'zod';
import { pinSchema, usernameSchema } from './auth.js';
import { paginationQuerySchema } from './pagination.js';

export const userListQuerySchema = paginationQuerySchema.extend({
  roleId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  username: usernameSchema,
  pin: pinSchema,
  roleId: z.coerce.number().int().positive('Role is required'),
  isActive: z.boolean().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  newPin: pinSchema.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().regex(/^[a-z]+\.[a-z]+$/)),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

export interface UserDto {
  readonly id: number;
  readonly organizationId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly role: {
    readonly id: number;
    readonly code: string;
    readonly name: string;
    readonly nameUr: string | null;
  };
}

export interface RoleWithPermissionsDto {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly nameUr: string | null;
  readonly isSystem: boolean;
  readonly userCount: number;
  readonly permissions: readonly string[];
}
