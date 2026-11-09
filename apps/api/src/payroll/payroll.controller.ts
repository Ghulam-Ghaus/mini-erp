import {
  createEmployeeSchema,
  createSalaryAdvanceSchema,
  createSalaryRecordSchema,
  listEmployeesQuerySchema,
  listSalaryAdvancesQuerySchema,
  listSalaryRecordsQuerySchema,
  netProfitQuerySchema,
  updateEmployeeSchema,
  voidDocumentSchema,
  type EmployeeDto,
  type NetProfitSummaryDto,
  type PaginatedResponse,
  type SalaryAdvanceDto,
  type SalaryRecordDto,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { PayrollService } from './payroll.service.js';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @RequirePermission('payroll', 'view')
  @Get('employees')
  listEmployees(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<EmployeeDto>> {
    const query = parseWithZod(listEmployeesQuerySchema, rawQuery);
    return this.payrollService.listEmployees(auth.user.organizationId, query);
  }

  @RequirePermission('payroll', 'create')
  @Post('employees')
  createEmployee(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<EmployeeDto> {
    const input = parseWithZod(createEmployeeSchema, body);
    return this.payrollService.createEmployee(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('payroll', 'edit')
  @Patch('employees/:id')
  updateEmployee(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<EmployeeDto> {
    const input = parseWithZod(updateEmployeeSchema, body);
    return this.payrollService.updateEmployee(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('payroll', 'view')
  @Get('advances')
  listAdvances(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<SalaryAdvanceDto>> {
    const query = parseWithZod(listSalaryAdvancesQuerySchema, rawQuery);
    return this.payrollService.listAdvances(auth.user.organizationId, query);
  }

  @RequirePermission('payroll', 'create')
  @Post('advances')
  createAdvance(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<SalaryAdvanceDto> {
    const input = parseWithZod(createSalaryAdvanceSchema, body);
    return this.payrollService.createAdvance(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('payroll', 'delete')
  @Post('advances/:id/void')
  voidAdvance(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<SalaryAdvanceDto> {
    const input = parseWithZod(voidDocumentSchema, body);
    return this.payrollService.voidAdvance(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('payroll', 'view')
  @Get('salaries')
  listSalaries(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<SalaryRecordDto>> {
    const query = parseWithZod(listSalaryRecordsQuerySchema, rawQuery);
    return this.payrollService.listSalaries(auth.user.organizationId, query);
  }

  @RequirePermission('payroll', 'create')
  @Post('salaries')
  createSalaryRecord(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<SalaryRecordDto> {
    const input = parseWithZod(createSalaryRecordSchema, body);
    return this.payrollService.createSalaryRecord(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('payroll', 'delete')
  @Post('salaries/:id/void')
  voidSalaryRecord(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<SalaryRecordDto> {
    const input = parseWithZod(voidDocumentSchema, body);
    return this.payrollService.voidSalaryRecord(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('payroll', 'view')
  @Get('net-profit-summary')
  getNetProfitSummary(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<NetProfitSummaryDto> {
    const query = parseWithZod(netProfitQuerySchema, rawQuery);
    return this.payrollService.getNetProfitSummary(auth.user.organizationId, query);
  }
}
