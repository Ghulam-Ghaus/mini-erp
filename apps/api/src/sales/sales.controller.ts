import {
  createSaleInvoiceSchema,
  listSalesQuerySchema,
  voidSaleInvoiceSchema,
  type PaginatedResponse,
  type SaleInvoiceDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermission('sales', 'view')
  @Get()
  listSales(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<SaleInvoiceDto>> {
    const query = parseWithZod(listSalesQuerySchema, rawQuery);
    return this.salesService.listSales(auth.user.organizationId, query);
  }

  @RequirePermission('sales', 'view')
  @Get(':id')
  getSale(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SaleInvoiceDto> {
    return this.salesService.getSaleById(auth.user.organizationId, id);
  }

  @RequirePermission('sales', 'create')
  @Post()
  createSale(
    @CurrentUser() auth: RequestUserContext,
    @Body() rawBody: unknown,
  ): Promise<SaleInvoiceDto> {
    const input = parseWithZod(createSaleInvoiceSchema, rawBody);
    return this.salesService.createSaleInvoice(auth.user.organizationId, input, auth.user.id);
  }

  @RequirePermission('sales', 'delete')
  @Post(':id/void')
  voidSale(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() rawBody: unknown,
  ): Promise<SaleInvoiceDto> {
    const input = parseWithZod(voidSaleInvoiceSchema, rawBody);
    return this.salesService.voidSaleInvoice(
      auth.user.organizationId,
      id,
      input.reason,
      auth.user.id,
    );
  }
}
