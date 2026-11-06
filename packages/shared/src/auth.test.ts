import { describe, expect, it } from 'vitest';
import { changePinSchema, pinSchema, setupAdminStepSchema } from './auth.js';
import { DEFAULT_SYSTEM_ROLES, hasPermission } from './permissions.js';

describe('pinSchema & setupAdminStepSchema', () => {
  it('accepts 4 to 8 numeric digits and rejects letters or short PINs', () => {
    expect(pinSchema.safeParse('1234').success).toBe(true);
    expect(pinSchema.safeParse('12345678').success).toBe(true);
    expect(pinSchema.safeParse('123').success).toBe(false);
    expect(pinSchema.safeParse('12a4').success).toBe(false);
  });

  it('requires confirmPin to match pin', () => {
    expect(
      setupAdminStepSchema.safeParse({
        firstName: 'Ali',
        lastName: 'Khan',
        username: 'admin',
        pin: '1234',
        confirmPin: '9999',
      }).success,
    ).toBe(false);
    expect(
      changePinSchema.safeParse({
        currentPin: '1234',
        newPin: '5678',
        confirmPin: '5678',
      }).success,
    ).toBe(true);
  });
});

describe('hasPermission & DEFAULT_SYSTEM_ROLES', () => {
  it('always grants ADMIN every permission', () => {
    expect(hasPermission([], 'ADMIN', 'users', 'delete')).toBe(true);
  });

  it('grants RECOVERY_OFFICER recovery.view but not batches.view or reports.view', () => {
    const officer = DEFAULT_SYSTEM_ROLES.find((r) => r.code === 'RECOVERY_OFFICER');
    expect(officer).toBeDefined();
    const perms = officer?.permissions ?? [];
    expect(hasPermission(perms, 'RECOVERY_OFFICER', 'recovery', 'view')).toBe(true);
    expect(hasPermission(perms, 'RECOVERY_OFFICER', 'batches', 'view')).toBe(false);
    expect(hasPermission(perms, 'RECOVERY_OFFICER', 'reports', 'view')).toBe(false);
  });
});
