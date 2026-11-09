import {
  createClientPaymentSchema,
  createSupplierPaymentSchema,
  listChequesQuerySchema,
  listPaymentsQuerySchema,
  updateChequeStatusSchema,
  voidDocumentSchema,
  type ChequeDto,
  type PaginatedResponse,
  type PaymentDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermission('payments', 'view')
  @Get()
  listPayments(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<PaymentDto>> {
    const query = parseWithZod(listPaymentsQuerySchema, rawQuery);
    return this.paymentsService.listPayments(auth.user.organizationId, query);
  }

  @RequirePermission('payments', 'view')
  @Get('cheques')
  listCheques(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<ChequeDto>> {
    const query = parseWithZod(listChequesQuerySchema, rawQuery);
    return this.paymentsService.listCheques(auth.user.organizationId, query);
  }

  @RequirePermission('payments', 'edit')
  @Post('cheques/:id/status')
  updateChequeStatus(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<ChequeDto> {
    const input = parseWithZod(updateChequeStatusSchema, body);
    return this.paymentsService.updateChequeStatus(
      auth.user.organizationId,
      auth.user.id,
      id,
      input,
    );
  }

  @RequirePermission('payments', 'view')
  @Get(':id')
  getPayment(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PaymentDto> {
    return this.paymentsService.getPaymentById(auth.user.organizationId, id);
  }

  @RequirePermission('payments', 'create')
  @Post('supplier')
  createSupplierPayment(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<PaymentDto> {
    const input = parseWithZod(createSupplierPaymentSchema, body);
    return this.paymentsService.createSupplierPayment(
      auth.user.organizationId,
      auth.user.id,
      input,
    );
  }

  @RequirePermission('payments', 'create')
  @Post('client')
  createClientPayment(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<PaymentDto> {
    const input = parseWithZod(createClientPaymentSchema, body);
    return this.paymentsService.createClientPayment(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('payments', 'delete')
  @Post(':id/void')
  voidPayment(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<PaymentDto> {
    const input = parseWithZod(voidDocumentSchema, body);
    return this.paymentsService.voidPayment(auth.user.organizationId, auth.user.id, id, input);
  }
}
