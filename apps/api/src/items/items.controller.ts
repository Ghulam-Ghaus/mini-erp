import {
  createItemSchema,
  listItemsQuerySchema,
  updateItemSchema,
  type ItemDto,
  type PaginatedResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { ItemsService } from './items.service.js';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @RequirePermission('inventory', 'view')
  @Get()
  listItems(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<ItemDto>> {
    const query = parseWithZod(listItemsQuerySchema, rawQuery);
    return this.itemsService.listItems(auth.user.organizationId, query);
  }

  @RequirePermission('inventory', 'view')
  @Get(':id')
  getItem(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ItemDto> {
    return this.itemsService.getItemById(auth.user.organizationId, id);
  }

  @RequirePermission('inventory', 'create')
  @Post()
  createItem(@CurrentUser() auth: RequestUserContext, @Body() body: unknown): Promise<ItemDto> {
    const input = parseWithZod(createItemSchema, body);
    return this.itemsService.createItem(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('inventory', 'edit')
  @Patch(':id')
  updateItem(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<ItemDto> {
    const input = parseWithZod(updateItemSchema, body);
    return this.itemsService.updateItem(auth.user.organizationId, auth.user.id, id, input);
  }
}
