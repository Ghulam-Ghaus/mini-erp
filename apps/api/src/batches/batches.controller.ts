import {
  addBatchAllocationSchema,
  addBatchCostSchema,
  adjustBatchStockSchema,
  closeBatchSchema,
  createBatchSchema,
  listBatchesQuerySchema,
  listStockMovementsQuerySchema,
  updateBatchWastageSchema,
  voidBatchCostSchema,
  type AvailablePurchaseItemDto,
  type BatchDetailDto,
  type BatchSummaryDto,
  type PaginatedResponse,
  type StockMovementDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { BatchesService } from './batches.service.js';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @RequirePermission('batches', 'view')
  @Get()
  listBatches(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<BatchSummaryDto>> {
    const query = parseWithZod(listBatchesQuerySchema, rawQuery);
    return this.batchesService.listBatches(auth.user.organizationId, query);
  }

  @RequirePermission('batches', 'view')
  @Get('available-purchase-items')
  listAvailablePurchaseItems(
    @CurrentUser() auth: RequestUserContext,
    @Query('itemId') itemIdStr?: string,
  ): Promise<AvailablePurchaseItemDto[]> {
    const itemId = itemIdStr ? Number.parseInt(itemIdStr, 10) : undefined;
    return this.batchesService.listAvailablePurchaseItems(
      auth.user.organizationId,
      itemId && Number.isFinite(itemId) ? itemId : undefined,
    );
  }

  @RequirePermission('batches', 'view')
  @Get('inventory/movements')
  listStockMovements(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<StockMovementDto>> {
    const query = parseWithZod(listStockMovementsQuerySchema, rawQuery);
    return this.batchesService.listStockMovements(auth.user.organizationId, query);
  }

  @RequirePermission('batches', 'view')
  @Get(':id')
  getBatch(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<BatchDetailDto> {
    return this.batchesService.getBatchById(auth.user.organizationId, id);
  }

  @RequirePermission('batches', 'create')
  @Post()
  createBatch(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(createBatchSchema, body);
    return this.batchesService.createBatch(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('batches', 'edit')
  @Post(':id/allocations')
  addAllocations(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(addBatchAllocationSchema, body);
    return this.batchesService.addAllocations(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('batches', 'edit')
  @Post(':id/costs')
  addCost(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(addBatchCostSchema, body);
    return this.batchesService.addCost(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('batches', 'edit')
  @Post(':id/costs/:costId/void')
  voidCost(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Param('costId', ParseIntPipe) costId: number,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(voidBatchCostSchema, body);
    return this.batchesService.voidCost(auth.user.organizationId, auth.user.id, id, costId, input);
  }

  @RequirePermission('batches', 'edit')
  @Patch(':id/wastage')
  updateWastage(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(updateBatchWastageSchema, body);
    return this.batchesService.updateWastage(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('batches', 'edit')
  @Post(':id/close')
  closeBatch(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(closeBatchSchema, body);
    return this.batchesService.closeBatch(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('batches', 'edit')
  @Post(':id/adjust-stock')
  adjustBatchStock(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<BatchDetailDto> {
    const input = parseWithZod(adjustBatchStockSchema, body);
    return this.batchesService.adjustBatchStock(auth.user.organizationId, auth.user.id, id, input);
  }
}
