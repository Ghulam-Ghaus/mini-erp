import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierLedgerQuerySchema,
  updateSupplierSchema,
  type PaginatedResponse,
  type SupplierDto,
  type SupplierLedgerResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { SuppliersService } from './suppliers.service.js';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequirePermission('suppliers', 'view')
  @Get()
  listSuppliers(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<SupplierDto>> {
    const query = parseWithZod(listSuppliersQuerySchema, rawQuery);
    return this.suppliersService.listSuppliers(auth.user.organizationId, query);
  }

  @RequirePermission('suppliers', 'view')
  @Get(':id')
  getSupplier(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SupplierDto> {
    return this.suppliersService.getSupplierById(auth.user.organizationId, id);
  }

  @RequirePermission('suppliers', 'view')
  @Get(':id/ledger')
  getSupplierLedger(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Query() rawQuery: unknown,
  ): Promise<SupplierLedgerResponse> {
    const query = parseWithZod(supplierLedgerQuerySchema, rawQuery);
    return this.suppliersService.getSupplierLedger(auth.user.organizationId, id, query);
  }

  @RequirePermission('suppliers', 'create')
  @Post()
  createSupplier(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<SupplierDto> {
    const input = parseWithZod(createSupplierSchema, body);
    return this.suppliersService.createSupplier(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('suppliers', 'edit')
  @Patch(':id')
  updateSupplier(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<SupplierDto> {
    const input = parseWithZod(updateSupplierSchema, body);
    return this.suppliersService.updateSupplier(auth.user.organizationId, auth.user.id, id, input);
  }
}
