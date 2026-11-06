import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@mini-erp/shared';
import { Public } from '../common/auth.decorators.js';
import { HealthService } from './health.service.js';

/**
 * Public liveness/readiness endpoint used by the desktop app before it opens the window.
 * It is intentionally not behind the auth guard (added in Phase 2) and exposes no data.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(
    @Res({ passthrough: true }) res: { status(code: number): unknown },
  ): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
