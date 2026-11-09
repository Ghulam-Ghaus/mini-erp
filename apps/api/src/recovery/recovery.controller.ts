import {
  createRecoveryEntrySchema,
  listRecoveryEntriesQuerySchema,
  recoveryAgingQuerySchema,
  todaysRecoveryQuerySchema,
  type PaginatedResponse,
  type RecoveryAgingSummaryDto,
  type RecoveryEntryDto,
  type TodaysRecoveryResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { RecoveryService } from './recovery.service.js';

@Controller('recovery')
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @RequirePermission('recovery', 'view')
  @Get('today')
  getTodaysRecovery(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<TodaysRecoveryResponse> {
    const query = parseWithZod(todaysRecoveryQuerySchema, rawQuery);
    return this.recoveryService.getTodaysRecovery(auth.user.organizationId, query);
  }

  @RequirePermission('recovery', 'view')
  @Get('entries')
  listRecoveryEntries(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<RecoveryEntryDto>> {
    const query = parseWithZod(listRecoveryEntriesQuerySchema, rawQuery);
    return this.recoveryService.listRecoveryEntries(auth.user.organizationId, query);
  }

  @RequirePermission('recovery', 'create')
  @Post('entries')
  createRecoveryEntry(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<RecoveryEntryDto> {
    const input = parseWithZod(createRecoveryEntrySchema, body);
    return this.recoveryService.createRecoveryEntry(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('recovery', 'view')
  @Get('aging')
  getReceivableAging(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<RecoveryAgingSummaryDto> {
    const query = parseWithZod(recoveryAgingQuerySchema, rawQuery);
    return this.recoveryService.getReceivableAging(auth.user.organizationId, query);
  }
}
