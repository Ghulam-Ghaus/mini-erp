import { auditLogQuerySchema, type AuditLogDto, type PaginatedResponse } from '@mini-erp/shared';
import { Controller, Get, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { AuditService } from './audit.service.js';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit', 'view')
  async list(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<AuditLogDto>> {
    const query = parseWithZod(auditLogQuerySchema, rawQuery);
    return this.auditService.findAll(auth.user.organizationId, query);
  }
}
