import {
  createChallanSchema,
  listChallansQuerySchema,
  trackPrintSchema,
  updateChallanStatusSchema,
  type ChallanDto,
  type PaginatedResponse,
  type PrintTrackResultDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { ChallansService } from './challans.service.js';

@Controller('challans')
export class ChallansController {
  constructor(private readonly challansService: ChallansService) {}

  @RequirePermission('sales', 'view')
  @Get()
  listChallans(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<ChallanDto>> {
    const query = parseWithZod(listChallansQuerySchema, rawQuery);
    return this.challansService.listChallans(auth.user.organizationId, query);
  }

  @RequirePermission('sales', 'view')
  @Get(':id')
  getChallan(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ChallanDto> {
    return this.challansService.getChallan(auth.user.organizationId, id);
  }

  @RequirePermission('sales', 'create')
  @Post()
  createChallan(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<ChallanDto> {
    const input = parseWithZod(createChallanSchema, body);
    return this.challansService.createChallan(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('sales', 'edit')
  @Post(':id/status')
  updateChallanStatus(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<ChallanDto> {
    const input = parseWithZod(updateChallanStatusSchema, body);
    return this.challansService.updateChallanStatus(
      auth.user.organizationId,
      auth.user.id,
      id,
      input,
    );
  }

  @RequirePermission('sales', 'view')
  @Post('print-track')
  trackPrint(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<PrintTrackResultDto> {
    const input = parseWithZod(trackPrintSchema, body);
    return this.challansService.trackPrint(auth.user.organizationId, auth.user.id, input);
  }
}
