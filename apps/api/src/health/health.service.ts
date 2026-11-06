import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@mini-erp/shared';
import { APP_ENV } from '../config/config.module.js';
import type { AppEnv } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async check(): Promise<HealthResponse> {
    let db: HealthResponse['db'] = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'error',
      db,
      version: this.env.APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
