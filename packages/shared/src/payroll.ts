import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { PAYMENT_METHODS, type PaymentMethod } from './payments.js';

export const PAY_TYPES = ['FIXED_MONTHLY', 'DAILY_WAGE', 'PIECE_RATE'] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const PAYROLL_DOC_STATUSES = ['POSTED', 'VOIDED'] as const;
export type PayrollDocStatus = (typeof PAYROLL_DOC_STATUSES)[number];

export const createEmployeeSchema = z.object({
  code: z.string().trim().max(40).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  nameUr: z.string().trim().max(120).optional().nullable(),
  cnic: z.string().trim().max(30).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(250).optional().nullable(),
  designation: z.string().trim().max(80).optional().nullable(),
  payType: z.enum(PAY_TYPES).default('FIXED_MONTHLY'),
  baseRate: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('0.00'),
  joinDate: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(400).optional().nullable(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  payType: z.enum(PAY_TYPES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const createSalaryAdvanceSchema = z.object({
  employeeId: z.number().int().positive(),
  advanceDate: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  notes: z.string().trim().max(400).optional().nullable(),
});

export type CreateSalaryAdvanceInput = z.infer<typeof createSalaryAdvanceSchema>;

export const listSalaryAdvancesQuerySchema = paginationQuerySchema.extend({
  employeeId: z.coerce.number().int().positive().optional(),
  status: z.enum(PAYROLL_DOC_STATUSES).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListSalaryAdvancesQuery = z.infer<typeof listSalaryAdvancesQuerySchema>;

export const createSalaryRecordSchema = z.object({
  employeeId: z.number().int().positive(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Period month must be YYYY-MM'),
  paymentDate: z.string().min(1),
  payType: z.enum(PAY_TYPES),
  unitsWorked: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .default('1.000'),
  rateApplied: z.string().regex(/^\d+(\.\d{1,2})?$/),
  overtimeAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('0.00'),
  bonusAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('0.00'),
  deductionsAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('0.00'),
  advanceDeducted: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default('0.00'),
  batchId: z.number().int().positive().optional().nullable(),
  method: z.enum(PAYMENT_METHODS).default('CASH'),
  notes: z.string().trim().max(400).optional().nullable(),
});

export type CreateSalaryRecordInput = z.infer<typeof createSalaryRecordSchema>;

export const listSalaryRecordsQuerySchema = paginationQuerySchema.extend({
  employeeId: z.coerce.number().int().positive().optional(),
  periodMonth: z.string().optional(),
  payType: z.enum(PAY_TYPES).optional(),
  status: z.enum(PAYROLL_DOC_STATUSES).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListSalaryRecordsQuery = z.infer<typeof listSalaryRecordsQuerySchema>;

export const netProfitQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type NetProfitQuery = z.infer<typeof netProfitQuerySchema>;

export interface EmployeeDto {
  id: number;
  code: string | null;
  name: string;
  nameUr: string | null;
  cnic: string | null;
  phone: string | null;
  address: string | null;
  designation: string | null;
  payType: PayType;
  baseRate: string;
  joinDate: string | null;
  isActive: boolean;
  notes: string | null;
  unsettledAdvanceBalance: string;
  createdAt: string;
}

export interface SalaryAdvanceDto {
  id: number;
  advanceNo: string;
  employeeId: number;
  employeeName: string;
  advanceDate: string;
  amount: string;
  settledAmount: string;
  unsettledAmount: string;
  method: PaymentMethod;
  notes: string | null;
  status: PayrollDocStatus;
  voidReason: string | null;
  createdAt: string;
}

export interface SalaryRecordDto {
  id: number;
  salaryNo: string;
  employeeId: number;
  employeeName: string;
  employeeNameUr: string | null;
  designation: string | null;
  periodMonth: string;
  paymentDate: string;
  payType: PayType;
  unitsWorked: string;
  rateApplied: string;
  basicAmount: string;
  overtimeAmount: string;
  bonusAmount: string;
  deductionsAmount: string;
  advanceDeducted: string;
  netAmount: string;
  batchId: number | null;
  batchNo: string | null;
  batchCostId: number | null;
  method: PaymentMethod;
  notes: string | null;
  status: PayrollDocStatus;
  voidReason: string | null;
  createdAt: string;
}

export interface NetProfitSummaryDto {
  grossSalesProfit: string;
  returnProfitReversed: string;
  returnDamageLoss: string;
  netGrossProfit: string;
  operatingExpenses: string;
  operatingPayroll: string;
  batchCapitalizedExpenses: string;
  batchCapitalizedPayroll: string;
  netProfit: string;
}

/**
 * Pure Decimal helper to compute basicAmount and netAmount for a salary/payroll slip.
 */
export function calculateSalaryAmounts(params: {
  payType: PayType;
  unitsWorked: string;
  rateApplied: string;
  overtimeAmount?: string;
  bonusAmount?: string;
  deductionsAmount?: string;
  advanceDeducted?: string;
}): {
  basicAmount: string;
  grossEarnings: string;
  totalDeductions: string;
  netAmount: string;
} {
  const units = new Decimal(params.unitsWorked || 0);
  const rate = new Decimal(params.rateApplied || 0);
  const overtime = new Decimal(params.overtimeAmount || 0);
  const bonus = new Decimal(params.bonusAmount || 0);
  const deductions = new Decimal(params.deductionsAmount || 0);
  const advance = new Decimal(params.advanceDeducted || 0);

  const basic =
    params.payType === 'FIXED_MONTHLY'
      ? rate.mul(units).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : units.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const grossEarnings = basic.plus(overtime).plus(bonus);
  const totalDeductions = deductions.plus(advance);
  const net = grossEarnings.minus(totalDeductions);

  return {
    basicAmount: basic.toFixed(2),
    grossEarnings: grossEarnings.toFixed(2),
    totalDeductions: totalDeductions.toFixed(2),
    netAmount: net.toFixed(2),
  };
}
