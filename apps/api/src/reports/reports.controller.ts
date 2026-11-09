import {
  DashboardQuerySchema,
  DetailedSalesReportQuerySchema,
  OtherReportsQuerySchema,
  type DashboardResponseDto,
  type DetailedSalesReportResponseDto,
  type OtherReportsResponseDto,
} from '@mini-erp/shared';
import { Controller, Get, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermission('dashboard', 'view')
  async getDashboard(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<DashboardResponseDto> {
    const query = parseWithZod(DashboardQuerySchema, rawQuery);
    return this.reportsService.getDashboard(auth.user.organizationId, query);
  }

  @Get('detailed-sales')
  @RequirePermission('reports', 'view')
  async getDetailedSalesReport(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<DetailedSalesReportResponseDto> {
    const query = parseWithZod(DetailedSalesReportQuerySchema, rawQuery);
    return this.reportsService.getDetailedSalesReport(auth.user.organizationId, query);
  }

  @Get('summary')
  @RequirePermission('reports', 'view')
  async getOtherReports(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<OtherReportsResponseDto> {
    const query = parseWithZod(OtherReportsQuerySchema, rawQuery);
    return this.reportsService.getOtherReports(auth.user.organizationId, query);
  }
}
