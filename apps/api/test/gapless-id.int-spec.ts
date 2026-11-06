import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inTransaction, nextId } from '../src/database/gapless-id.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { requireTestDatabaseUrl } from './test-db.js';

let prisma: PrismaClient;

function createOrg(name: string) {
  return inTransaction(prisma, async (tx) => {
    const id = await nextId(tx, 'organizations');
    return tx.organization.create({ data: { id, name } });
  });
}

function createRole(organizationId: number, code: string) {
  return inTransaction(prisma, async (tx) => {
    const id = await nextId(tx, 'roles');
    return tx.role.create({
      data: { id, organizationId, code, name: code, isSystem: true },
    });
  });
}

function createUser(organizationId: number, roleId: number, username: string) {
  return inTransaction(prisma, async (tx) => {
    const id = await nextId(tx, 'users');
    return tx.user.create({
      data: {
        id,
        organizationId,
        roleId,
        username,
        firstName: 'Test',
        lastName: 'User',
        pinHash: 'x',
      },
    });
  });
}

beforeAll(() => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireTestDatabaseUrl() }),
  });
});

beforeEach(async () => {
  // Test database only (guarded by requireTestDatabaseUrl).
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "role_permissions", "permissions", "users", "roles", "organizations", "id_counters" CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('gapless ids (integration)', () => {
  it('assigns 1, 2, 3 in order', async () => {
    const ids = [(await createOrg('A')).id, (await createOrg('B')).id, (await createOrg('C')).id];
    expect(ids).toEqual([1, 2, 3]);
  });

  it('reuses the number when the transaction fails', async () => {
    await createOrg('A'); // 1

    await expect(
      inTransaction(prisma, async (tx) => {
        const id = await nextId(tx, 'organizations');
        expect(id).toBe(2);
        await tx.organization.create({ data: { id, name: 'B' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect((await createOrg('C')).id).toBe(2);
    expect(await prisma.organization.count()).toBe(2);
  });

  it('reuses the number when a database constraint fails', async () => {
    const org = await createOrg('A');
    const role = await createRole(org.id, 'ADMIN');
    expect((await createUser(org.id, role.id, 'ali')).id).toBe(1);
    await expect(createUser(org.id, role.id, 'ali')).rejects.toThrow(); // duplicate username
    expect((await createUser(org.id, role.id, 'sara')).id).toBe(2);
  });

  it('gives contiguous ids to concurrent inserts', async () => {
    const orgs = await Promise.all(Array.from({ length: 8 }, (_, i) => createOrg(`Org ${i}`)));
    const ids = orgs.map((o) => o.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps a separate counter per table', async () => {
    const org = await createOrg('A');
    await createOrg('B');
    const role = await createRole(org.id, 'ADMIN');
    expect((await createUser(org.id, role.id, 'ali')).id).toBe(1);
  });
});
