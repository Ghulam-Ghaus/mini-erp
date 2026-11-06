import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import type { AppEnv } from '../src/config/env.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { OrgService } from '../src/org/org.service.js';
import { UsersService } from '../src/users/users.service.js';
import { requireTestDatabaseUrl } from './test-db.js';

let prisma: PrismaClient;
let orgService: OrgService;
let authService: AuthService;
let usersService: UsersService;

const testEnv: AppEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test',
  PORT: 3000,
  HOST: '127.0.0.1',
  CORS_ORIGINS: ['http://127.0.0.1:5173'],
  APP_VERSION: '0.1.0',
  JWT_SECRET: 'integration-test-jwt-secret-key',
};

beforeAll(() => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });
  const audit = new AuditService();
  const prismaAsService = prisma as unknown as PrismaService;
  orgService = new OrgService(prismaAsService, audit);
  authService = new AuthService(prismaAsService, audit, testEnv);
  usersService = new UsersService(prismaAsService, audit);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Phase 2: First-run wizard, PIN auth, roles/permissions, and user management', () => {
  it('initializes organization #1, 6 system roles (#1..6), and admin user #1 with gapless IDs', async () => {
    expect(await orgService.getSetupStatus()).toEqual({ isInitialized: false });

    const org = await orgService.initializeFirstRun({
      organization: {
        name: 'Al-Barakah Pulses',
        nameUr: 'البرکہ دال ٹریڈرز',
        phone: '0300-1234567',
        address: 'Grain Market, Faisalabad',
        email: 'info@albarakah.pk',
        taxNo: 'NTN-998877',
        currency: 'PKR',
        dateFormat: 'DD/MM/YYYY',
        taxEnabled: false,
        taxName: 'GST',
        defaultTaxRate: '0.00',
        inactivityLockMinutes: 15,
      },
      admin: {
        firstName: 'Muhammad',
        lastName: 'Usman',
        username: 'admin',
        pin: '1234',
      },
    });

    expect(org.id).toBe(1);
    expect(org.name).toBe('Al-Barakah Pulses');
    expect(await orgService.getSetupStatus()).toEqual({ isInitialized: true });

    // Second setup attempt must be blocked
    await expect(
      orgService.initializeFirstRun({
        organization: {
          name: 'Second Org',
          currency: 'PKR',
          dateFormat: 'DD/MM/YYYY',
          taxEnabled: false,
          taxName: 'GST',
          defaultTaxRate: '0.00',
          inactivityLockMinutes: 15,
        },
        admin: {
          firstName: 'Test',
          lastName: 'Admin',
          username: 'admin2',
          pin: '1234',
        },
      }),
    ).rejects.toThrow(/already initialized/);

    // Roles have contiguous gapless IDs 1..6
    const roles = await usersService.listRoles(org.id);
    expect(roles.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(roles.map((r) => r.code)).toEqual([
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'SALES',
      'RECOVERY_OFFICER',
      'STORE_RIDER',
    ]);

    // Login with PIN works and returns JWT + permissions
    const session = await authService.login({ username: 'admin', pin: '1234' });
    expect(session.user.id).toBe(1);
    expect(session.user.role.code).toBe('ADMIN');
    expect(session.accessToken.split('.').length).toBe(3);

    // Wrong PIN is rejected
    await expect(authService.login({ username: 'admin', pin: '0000' })).rejects.toThrow(
      /Invalid username or PIN/,
    );
  });

  it('creates users with gapless IDs, paginates, changes PIN, and updates role permissions with audit logs', async () => {
    const org = await orgService.initializeFirstRun({
      organization: {
        name: 'Al-Barakah Pulses',
        currency: 'PKR',
        dateFormat: 'DD/MM/YYYY',
        taxEnabled: false,
        taxName: 'GST',
        defaultTaxRate: '0.00',
        inactivityLockMinutes: 15,
      },
      admin: {
        firstName: 'Muhammad',
        lastName: 'Usman',
        username: 'admin',
        pin: '1234',
      },
    });

    const roles = await usersService.listRoles(org.id);
    const recoveryRole = roles.find((r) => r.code === 'RECOVERY_OFFICER');
    expect(recoveryRole).toBeDefined();

    // Create second user (Recovery Officer) -> gets gapless ID 2
    const officer = await usersService.createUser(org.id, 1, {
      firstName: 'Bilal',
      lastName: 'Ahmad',
      username: 'bilal',
      pin: '5678',
      roleId: recoveryRole!.id,
      isActive: true,
    });
    expect(officer.id).toBe(2);
    expect(officer.role.code).toBe('RECOVERY_OFFICER');

    // Duplicate username fails and does NOT skip ID 3
    await expect(
      usersService.createUser(org.id, 1, {
        firstName: 'Dup',
        lastName: 'User',
        username: 'bilal',
        pin: '5678',
        roleId: recoveryRole!.id,
        isActive: true,
      }),
    ).rejects.toThrow(/already taken/);

    const thirdUser = await usersService.createUser(org.id, 1, {
      firstName: 'Kashif',
      lastName: 'Ali',
      username: 'kashif',
      pin: '4321',
      roleId: recoveryRole!.id,
      isActive: true,
    });
    expect(thirdUser.id).toBe(3);

    // Server-side pagination and search
    const page1 = await usersService.listUsers(org.id, {
      page: 1,
      pageSize: 10,
      sortOrder: 'asc',
      search: 'bilal',
    });
    expect(page1.total).toBe(1);
    expect(page1.data[0]?.username).toBe('bilal');

    // Change PIN and verify
    await authService.changePin(officer.id, org.id, {
      currentPin: '5678',
      newPin: '8888',
      confirmPin: '8888',
    });
    await expect(authService.verifyCurrentUserPin(officer.id, { pin: '8888' })).resolves.toEqual({
      verified: true,
    });

    // Update role permission matrix for RECOVERY_OFFICER
    const updatedRole = await usersService.updateRolePermissions(org.id, 1, recoveryRole!.id, {
      permissions: ['recovery.view', 'recovery.create', 'clients.view'],
    });
    expect([...updatedRole.permissions].sort()).toEqual([
      'clients.view',
      'recovery.create',
      'recovery.view',
    ]);

    // AuditLog entries recorded for setup, user creation, PIN change, and role matrix update
    const logs = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(logs.length).toBeGreaterThanOrEqual(5);
    expect(logs.map((l) => l.id)).toEqual(logs.map((_, idx) => idx + 1));
  });
});
