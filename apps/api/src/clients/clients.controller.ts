import {
  clientLedgerQuerySchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type ClientDto,
  type ClientLedgerResponse,
  type PaginatedResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { ClientsService } from './clients.service.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @RequirePermission('clients', 'view')
  @Get()
  listClients(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<ClientDto>> {
    const query = parseWithZod(listClientsQuerySchema, rawQuery);
    return this.clientsService.listClients(auth.user.organizationId, query);
  }

  @RequirePermission('clients', 'view')
  @Get(':id')
  getClient(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientDto> {
    return this.clientsService.getClientById(auth.user.organizationId, id);
  }

  @RequirePermission('clients', 'view')
  @Get(':id/ledger')
  getClientLedger(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Query() rawQuery: unknown,
  ): Promise<ClientLedgerResponse> {
    const query = parseWithZod(clientLedgerQuerySchema, rawQuery);
    return this.clientsService.getClientLedger(auth.user.organizationId, id, query);
  }

  @RequirePermission('clients', 'create')
  @Post()
  createClient(
    @CurrentUser() auth: RequestUserContext,
    @Body() rawBody: unknown,
  ): Promise<ClientDto> {
    const input = parseWithZod(createClientSchema, rawBody);
    return this.clientsService.createClient(auth.user.organizationId, input, auth.user.id);
  }

  @RequirePermission('clients', 'edit')
  @Patch(':id')
  updateClient(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() rawBody: unknown,
  ): Promise<ClientDto> {
    const input = parseWithZod(updateClientSchema, rawBody);
    return this.clientsService.updateClient(auth.user.organizationId, id, input, auth.user.id);
  }
}
