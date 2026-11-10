import { z } from 'zod';

export const DASHBOARD_PRESETS = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM'] as const;
export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number];

export const DashboardQuerySchema = z.object({
  preset: z.enum(DASHBOARD_PRESETS).optional().default('THIS_MONTH'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type DashboardQueryInput = z.infer<typeof DashboardQuerySchema>;

export interface DashboardBatchPerformanceRowDto {
  readonly batchId: number;
  readonly batchNo: string;
  readonly batchName: string;
  readonly itemName: string | null;
  readonly status: string;
  readonly outputKg: string;
  readonly soldKg: string;
  readonly remainingKg: string;
  readonly costPerKg: string;
  readonly avgSaleRatePerKg: string;
  readonly profitPerKg: string;
  readonly totalProfit: string;
}

export interface DashboardChequeDueItemDto {
  readonly chequeId: number;
  readonly chequeNo: string;
  readonly bankName: string;
  readonly chequeDate: string;
  readonly amount: string;
  readonly status: string;
  readonly partyType: string;
  readonly partyId: number;
  readonly partyName: string;
  readonly daysUntilDue: number;
}

export interface DashboardRecoveryDueItemDto {
  readonly clientId: number;
  readonly clientName: string;
  readonly routeName: string | null;
  readonly officerName: string | null;
  readonly currentBalance: string;
  readonly promisedAmount: string | null;
  readonly recoveryDay: string | null;
}

export interface DashboardOverdueClientItemDto {
  readonly clientId: number;
  readonly clientName: string;
  readonly phone: string | null;
  readonly routeName: string | null;
  readonly creditLimit: string;
  readonly currentBalance: string;
  readonly oldestUnpaidDays: number;
}

export interface DashboardLowStockBatchItemDto {
  readonly batchId: number;
  readonly batchNo: string;
  readonly batchName: string;
  readonly itemName: string | null;
  readonly outputKg: string;
  readonly remainingKg: string;
}

export interface DashboardDailySalesChartPointDto {
  readonly date: string;
  readonly salesAmount: string;
  readonly receivedAmount: string;
}

export interface DashboardBatchProfitChartPointDto {
  readonly batchId: number;
  readonly batchNo: string;
  readonly batchName: string;
  readonly revenue: string;
  readonly grossProfit: string;
}

export interface DashboardResponseDto {
  readonly preset: DashboardPreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly kpis: {
    readonly totalSales: string;
    readonly grossSales: string;
    readonly saleReturnsTotal: string;
    readonly totalReceived: string;
    readonly totalReceivable: string;
    readonly pendingChequesCount: number;
    readonly pendingChequesAmount: string;
    readonly grossProfit: string;
    readonly operatingExpenses: string;
    readonly netProfit: string;
  };
  readonly batchPerformance: readonly DashboardBatchPerformanceRowDto[];
  readonly chequesDueSoon: readonly DashboardChequeDueItemDto[];
  readonly todaysRecoveryDue: readonly DashboardRecoveryDueItemDto[];
  readonly overdueClients: readonly DashboardOverdueClientItemDto[];
  readonly lowBatchStock: readonly DashboardLowStockBatchItemDto[];
  readonly charts: {
    readonly dailySalesVsReceived: readonly DashboardDailySalesChartPointDto[];
    readonly profitByBatch: readonly DashboardBatchProfitChartPointDto[];
  };
}

export const REPORT_PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID'] as const;
export type ReportPaymentStatus = (typeof REPORT_PAYMENT_STATUSES)[number];

export const DetailedSalesReportQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  batchId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  itemId: z.coerce.number().int().positive().optional(),
  routeId: z.coerce.number().int().positive().optional(),
  salespersonId: z.coerce.number().int().positive().optional(),
  paymentStatus: z.enum(REPORT_PAYMENT_STATUSES).optional(),
  search: z.string().optional(),
});

export type DetailedSalesReportQueryInput = z.infer<typeof DetailedSalesReportQuerySchema>;

/**
 * Notebook page 2 Detailed Sales Report row:
 * Date | Invoice ID | Challan ID | Batch | Item | Client | Batch cost/kg | Sale rate/kg |
 * Qty (kg) | Amount | Cost | Profit/Loss | Profit/kg | Payment status | Salesperson
 */
export interface DetailedSalesReportRowDto {
  readonly saleItemId: number;
  readonly saleId: number;
  readonly saleDate: string;
  readonly invoiceNo: string;
  readonly challanNo: string | null;
  readonly batchId: number | null;
  readonly batchNo: string | null;
  readonly batchName: string | null;
  readonly itemId: number | null;
  readonly itemName: string | null;
  readonly clientId: number;
  readonly clientName: string;
  readonly routeId: number | null;
  readonly routeName: string | null;
  readonly batchCostPerKg: string;
  readonly saleRatePerKg: string;
  readonly grossQtyKg: string;
  readonly returnedQtyKg: string;
  readonly netQtyKg: string;
  readonly amount: string;
  readonly cogs: string;
  readonly profit: string;
  readonly profitPerKg: string;
  readonly paymentStatus: ReportPaymentStatus;
  readonly salespersonId: number;
  readonly salespersonName: string;
}

export interface DetailedSalesReportTotalsDto {
  readonly rowCount: number;
  readonly totalGrossQtyKg: string;
  readonly totalReturnedQtyKg: string;
  readonly totalNetQtyKg: string;
  readonly totalAmount: string;
  readonly totalCogs: string;
  readonly totalProfit: string;
  readonly avgProfitPerKg: string;
}

export interface DetailedSalesReportResponseDto {
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly rows: readonly DetailedSalesReportRowDto[];
  readonly totals: DetailedSalesReportTotalsDto;
}

export const OtherReportsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type OtherReportsQueryInput = z.infer<typeof OtherReportsQuerySchema>;

export interface CashBookEntryDto {
  readonly id: string;
  readonly date: string;
  readonly type:
    'CLIENT_RECEIPT' | 'SUPPLIER_PAYMENT' | 'EXPENSE' | 'SALARY_ADVANCE' | 'SALARY_SLIP';
  readonly refNo: string;
  readonly partyOrPayee: string;
  readonly description: string;
  readonly method: string;
  readonly cashIn: string;
  readonly cashOut: string;
}

export interface CashBookMethodBreakdownDto {
  readonly method: string;
  readonly totalIn: string;
  readonly totalOut: string;
  readonly netFlow: string;
}

export interface ReceivableAgingRowDto {
  readonly clientId: number;
  readonly clientCode: string | null;
  readonly clientName: string;
  readonly phone: string | null;
  readonly routeName: string | null;
  readonly creditLimit: string;
  readonly currentBalance: string;
  readonly bucket0To30: string;
  readonly bucket31To60: string;
  readonly bucket61To90: string;
  readonly bucket90Plus: string;
}

export interface OtherReportsResponseDto {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly cashBook: {
    readonly totalIn: string;
    readonly totalOut: string;
    readonly netCashFlow: string;
    readonly byMethod: readonly CashBookMethodBreakdownDto[];
    readonly entries: readonly CashBookEntryDto[];
  };
  readonly receivableAging: {
    readonly totalReceivable: string;
    readonly total0To30: string;
    readonly total31To60: string;
    readonly total61To90: string;
    readonly total90Plus: string;
    readonly rows: readonly ReceivableAgingRowDto[];
  };
}
