import {
  createRouteSchema,
  listRoutesQuerySchema,
  updateRouteSchema,
  type PaginatedResponse,
  type RouteDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { RoutesService } from './routes.service.js';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @RequirePermission('clients', 'view')
  @Get()
  listRoutes(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<RouteDto>> {
    const query = parseWithZod(listRoutesQuerySchema, rawQuery);
    return this.routesService.listRoutes(auth.user.organizationId, query);
  }

  @RequirePermission('clients', 'view')
  @Get(':id')
  getRoute(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RouteDto> {
    return this.routesService.getRouteById(auth.user.organizationId, id);
  }

  @RequirePermission('clients', 'create')
  @Post()
  createRoute(
    @CurrentUser() auth: RequestUserContext,
    @Body() rawBody: unknown,
  ): Promise<RouteDto> {
    const input = parseWithZod(createRouteSchema, rawBody);
    return this.routesService.createRoute(auth.user.organizationId, input, auth.user.id);
  }

  @RequirePermission('clients', 'edit')
  @Patch(':id')
  updateRoute(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() rawBody: unknown,
  ): Promise<RouteDto> {
    const input = parseWithZod(updateRouteSchema, rawBody);
    return this.routesService.updateRoute(auth.user.organizationId, id, input, auth.user.id);
  }
}
