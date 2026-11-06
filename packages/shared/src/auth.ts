import { z } from 'zod';

/** 4 to 8 numeric digits for user PINs. */
export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'PIN must be 4 to 8 numeric digits');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may only contain letters, numbers, dots, hyphens, or underscores',
  );

export const organizationSettingsSchema = z.object({
  taxEnabled: z.boolean().default(false),
  taxName: z.string().default('GST'),
  defaultTaxRate: z.string().default('0.00'),
  strnNo: z.string().optional(),
  inactivityLockMinutes: z.number().int().min(1).max(240).default(15),
});

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

export const setupOrganizationStepSchema = z.object({
  name: z.string().trim().min(2, 'Organization name is required').max(120),
  nameUr: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(250).optional(),
  email: z.union([z.email(), z.literal('')]).optional(),
  taxNo: z.string().trim().max(60).optional(),
  currency: z.string().trim().min(2).max(10).default('PKR'),
  dateFormat: z.enum(['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']).default('DD/MM/YYYY'),
  logoDataUrl: z.string().max(5_000_000).optional(),
  taxEnabled: z.boolean().default(false),
  taxName: z.string().trim().max(40).default('GST'),
  defaultTaxRate: z.string().trim().default('0.00'),
  inactivityLockMinutes: z.coerce.number().int().min(1).max(240).default(15),
});

export const setupAdminStepSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(60),
    lastName: z.string().trim().min(1, 'Last name is required').max(60),
    username: usernameSchema,
    pin: pinSchema,
    confirmPin: pinSchema,
  })
  .refine((data) => data.pin === data.confirmPin, {
    path: ['confirmPin'],
    message: 'PIN confirmation does not match',
  });

export const setupInitializeSchema = z.object({
  organization: setupOrganizationStepSchema,
  admin: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    username: usernameSchema,
    pin: pinSchema,
  }),
});

export type SetupInitializeInput = z.infer<typeof setupInitializeSchema>;

export const updateOrganizationSchema = setupOrganizationStepSchema.partial().extend({
  name: z.string().trim().min(2).max(120),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  pin: pinSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyPinSchema = z.object({
  pin: pinSchema,
});

export type VerifyPinInput = z.infer<typeof verifyPinSchema>;

export const changePinSchema = z
  .object({
    currentPin: pinSchema,
    newPin: pinSchema,
    confirmPin: pinSchema,
  })
  .refine((data) => data.newPin === data.confirmPin, {
    path: ['confirmPin'],
    message: 'PIN confirmation does not match',
  });

export type ChangePinInput = z.infer<typeof changePinSchema>;

export interface SetupStatusResponse {
  readonly isInitialized: boolean;
}

export interface OrganizationDto {
  readonly id: number;
  readonly name: string;
  readonly nameUr: string | null;
  readonly logoPath: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly taxNo: string | null;
  readonly currency: string;
  readonly dateFormat: string;
  readonly settings: OrganizationSettings;
}

export interface AuthenticatedUserDto {
  readonly id: number;
  readonly organizationId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly username: string;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  readonly role: {
    readonly id: number;
    readonly code: string;
    readonly name: string;
    readonly nameUr: string | null;
  };
}

export interface AuthSessionResponse {
  readonly accessToken: string;
  readonly user: AuthenticatedUserDto;
  readonly organization: OrganizationDto;
  readonly permissions: readonly string[];
}
