import { healthResponseSchema } from '@mini-erp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../config/env.js';
import type { PrismaService } from '../database/prisma.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

const env = { APP_VERSION: '1.2.3' } as AppEnv;

function serviceWith(queryRaw: () => Promise<unknown>): HealthService {
  // Only $queryRaw is used by HealthService.
  const prisma = { $queryRaw: vi.fn(queryRaw) } as unknown as PrismaService;
  return new HealthService(prisma, env);
}

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const result = await serviceWith(() => Promise.resolve([{ '?column?': 1 }])).check();
    expect(healthResponseSchema.parse(result)).toMatchObject({
      status: 'ok',
      db: 'up',
      version: '1.2.3',
    });
  });

  it('reports error when the database is down', async () => {
    const result = await serviceWith(() => Promise.reject(new Error('ECONNREFUSED'))).check();
    expect(result).toMatchObject({ status: 'error', db: 'down' });
  });
});

describe('HealthController', () => {
  it('returns 503 when the database is down', async () => {
    const controller = new HealthController(
      serviceWith(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const res = { status: vi.fn() };
    await controller.get(res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('keeps the default 200 when healthy', async () => {
    const controller = new HealthController(serviceWith(() => Promise.resolve([])));
    const res = { status: vi.fn() };
    await controller.get(res);
    expect(res.status).not.toHaveBeenCalled();
  });
});
