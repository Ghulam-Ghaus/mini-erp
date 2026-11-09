import {
  createExpenseCategorySchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  voidDocumentSchema,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpensesSummaryDto,
  type PaginatedResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { ExpensesService } from './expenses.service.js';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequirePermission('expenses', 'view')
  @Get('categories')
  listCategories(@CurrentUser() auth: RequestUserContext): Promise<ExpenseCategoryDto[]> {
    return this.expensesService.listCategories(auth.user.organizationId);
  }

  @RequirePermission('expenses', 'create')
  @Post('categories')
  createCategory(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<ExpenseCategoryDto> {
    const input = parseWithZod(createExpenseCategorySchema, body);
    return this.expensesService.createCategory(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('expenses', 'view')
  @Get()
  listExpenses(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<ExpenseDto> & { summary: ExpensesSummaryDto }> {
    const query = parseWithZod(listExpensesQuerySchema, rawQuery);
    return this.expensesService.listExpenses(auth.user.organizationId, query);
  }

  @RequirePermission('expenses', 'create')
  @Post()
  createExpense(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<ExpenseDto> {
    const input = parseWithZod(createExpenseSchema, body);
    return this.expensesService.createExpense(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('expenses', 'delete')
  @Post(':id/void')
  voidExpense(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<ExpenseDto> {
    const input = parseWithZod(voidDocumentSchema, body);
    return this.expensesService.voidExpense(auth.user.organizationId, auth.user.id, id, input);
  }
}
