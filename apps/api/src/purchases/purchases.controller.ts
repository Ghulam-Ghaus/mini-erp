import {
  createPurchaseInvoiceSchema,
  createPurchaseReturnSchema,
  listPurchaseReturnsQuerySchema,
  listPurchasesQuerySchema,
  voidDocumentSchema,
  type PaginatedResponse,
  type PurchaseInvoiceDto,
  type PurchaseReturnDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { PurchasesService } from './purchases.service.js';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @RequirePermission('purchases', 'view')
  @Get()
  listPurchases(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<PurchaseInvoiceDto>> {
    const query = parseWithZod(listPurchasesQuerySchema, rawQuery);
    return this.purchasesService.listPurchaseInvoices(auth.user.organizationId, query);
  }

  @RequirePermission('purchases', 'view')
  @Get('returns')
  listPurchaseReturns(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<PurchaseReturnDto>> {
    const query = parseWithZod(listPurchaseReturnsQuerySchema, rawQuery);
    return this.purchasesService.listPurchaseReturns(auth.user.organizationId, query);
  }

  @RequirePermission('purchases', 'view')
  @Get('returns/:id')
  getPurchaseReturn(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PurchaseReturnDto> {
    return this.purchasesService.getPurchaseReturnById(auth.user.organizationId, id);
  }

  @RequirePermission('purchases', 'create')
  @Post('returns')
  createPurchaseReturn(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<PurchaseReturnDto> {
    const input = parseWithZod(createPurchaseReturnSchema, body);
    return this.purchasesService.createPurchaseReturn(
      auth.user.organizationId,
      auth.user.id,
      input,
    );
  }

  @RequirePermission('purchases', 'view')
  @Get(':id')
  getPurchase(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PurchaseInvoiceDto> {
    return this.purchasesService.getPurchaseInvoiceById(auth.user.organizationId, id);
  }

  @RequirePermission('purchases', 'create')
  @Post()
  createPurchase(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<PurchaseInvoiceDto> {
    const input = parseWithZod(createPurchaseInvoiceSchema, body);
    return this.purchasesService.createPurchaseInvoice(
      auth.user.organizationId,
      auth.user.id,
      input,
    );
  }

  @RequirePermission('purchases', 'delete')
  @Post(':id/void')
  voidPurchase(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<PurchaseInvoiceDto> {
    const input = parseWithZod(voidDocumentSchema, body);
    return this.purchasesService.voidPurchaseInvoice(
      auth.user.organizationId,
      auth.user.id,
      id,
      input,
    );
  }
}
