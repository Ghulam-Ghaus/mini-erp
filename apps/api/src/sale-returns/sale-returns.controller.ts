import {
  createSaleReturnSchema,
  listSaleReturnsQuerySchema,
  voidSaleReturnSchema,
  type PaginatedResponse,
  type SaleReturnDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { SaleReturnsService } from './sale-returns.service.js';

@Controller('sale-returns')
export class SaleReturnsController {
  constructor(private readonly saleReturnsService: SaleReturnsService) {}

  @RequirePermission('returns', 'view')
  @Get()
  listSaleReturns(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<SaleReturnDto>> {
    const query = parseWithZod(listSaleReturnsQuerySchema, rawQuery);
    return this.saleReturnsService.listSaleReturns(auth.user.organizationId, query);
  }

  @RequirePermission('returns', 'view')
  @Get(':id')
  getSaleReturn(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SaleReturnDto> {
    return this.saleReturnsService.getSaleReturnById(auth.user.organizationId, id);
  }

  @RequirePermission('returns', 'create')
  @Post()
  createSaleReturn(
    @CurrentUser() auth: RequestUserContext,
    @Body() rawBody: unknown,
  ): Promise<SaleReturnDto> {
    const input = parseWithZod(createSaleReturnSchema, rawBody);
    return this.saleReturnsService.createSaleReturn(auth.user.organizationId, input, auth.user.id);
  }

  @RequirePermission('returns', 'delete')
  @Post(':id/void')
  voidSaleReturn(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() rawBody: unknown,
  ): Promise<SaleReturnDto> {
    const input = parseWithZod(voidSaleReturnSchema, rawBody);
    return this.saleReturnsService.voidSaleReturn(
      auth.user.organizationId,
      id,
      input.reason,
      auth.user.id,
    );
  }
}
