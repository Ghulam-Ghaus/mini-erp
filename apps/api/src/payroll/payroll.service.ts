import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateBatchMetrics,
  calculateSalaryAmounts,
  type CreateEmployeeInput,
  type CreateSalaryAdvanceInput,
  type CreateSalaryRecordInput,
  type EmployeeDto,
  type ListEmployeesQuery,
  type ListSalaryAdvancesQuery,
  type ListSalaryRecordsQuery,
  type NetProfitQuery,
  type NetProfitSummaryDto,
  type PaginatedResponse,
  type PaymentMethod,
  type PayrollDocStatus,
  type PayType,
  type SalaryAdvanceDto,
  type SalaryRecordDto,
  type UpdateEmployeeInput,
  type VoidDocumentInput,
} from '@mini-erp/shared';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.module.js';

type EmployeeWithAdvances = Prisma.EmployeeGetPayload<{
  include: {
    salaryAdvances: {
      where: { status: 'POSTED' };
    };
  };
}>;

type AdvanceWithEmployee = Prisma.SalaryAdvanceGetPayload<{
  include: { employee: true };
}>;

type SalaryWithRelations = Prisma.SalaryRecordGetPayload<{
  include: { employee: true; batch: true };
}>;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  private toEmployeeDto(row: EmployeeWithAdvances): EmployeeDto {
    let unsettled = new Decimal(0);
    for (const adv of row.salaryAdvances) {
      const rem = new Decimal(adv.amount.toString()).minus(
        new Decimal(adv.settledAmount.toString()),
      );
      if (rem.gt(0)) unsettled = unsettled.plus(rem);
    }

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      nameUr: row.nameUr,
      cnic: row.cnic,
      phone: row.phone,
      address: row.address,
      designation: row.designation,
      payType: row.payType as PayType,
      baseRate: new Decimal(row.baseRate.toString()).toFixed(2),
      joinDate: row.joinDate ? row.joinDate.toISOString().slice(0, 10) : null,
      isActive: row.isActive,
      notes: row.notes,
      unsettledAdvanceBalance: unsettled.toFixed(2),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAdvanceDto(row: AdvanceWithEmployee): SalaryAdvanceDto {
    const amt = new Decimal(row.amount.toString());
    const settled = new Decimal(row.settledAmount.toString());
    const unsettled = amt.minus(settled);
    return {
      id: row.id,
      advanceNo: row.advanceNo,
      employeeId: row.employeeId,
      employeeName: row.employee.name,
      advanceDate: row.advanceDate.toISOString().slice(0, 10),
      amount: amt.toFixed(2),
      settledAmount: settled.toFixed(2),
      unsettledAmount: Decimal.max(unsettled, 0).toFixed(2),
      method: row.method as PaymentMethod,
      notes: row.notes,
      status: row.status as PayrollDocStatus,
      voidReason: row.voidReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toSalaryDto(row: SalaryWithRelations): SalaryRecordDto {
    return {
      id: row.id,
      salaryNo: row.salaryNo,
      employeeId: row.employeeId,
      employeeName: row.employee.name,
      employeeNameUr: row.employee.nameUr,
      designation: row.employee.designation,
      periodMonth: row.periodMonth,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      payType: row.payType as PayType,
      unitsWorked: new Decimal(row.unitsWorked.toString()).toFixed(3),
      rateApplied: new Decimal(row.rateApplied.toString()).toFixed(2),
      basicAmount: new Decimal(row.basicAmount.toString()).toFixed(2),
      overtimeAmount: new Decimal(row.overtimeAmount.toString()).toFixed(2),
      bonusAmount: new Decimal(row.bonusAmount.toString()).toFixed(2),
      deductionsAmount: new Decimal(row.deductionsAmount.toString()).toFixed(2),
      advanceDeducted: new Decimal(row.advanceDeducted.toString()).toFixed(2),
      netAmount: new Decimal(row.netAmount.toString()).toFixed(2),
      batchId: row.batchId,
      batchNo: row.batch?.batchNo ?? null,
      batchCostId: row.batchCostId,
      method: row.method as PaymentMethod,
      notes: row.notes,
      status: row.status as PayrollDocStatus,
      voidReason: row.voidReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listEmployees(
    organizationId: number,
    query: ListEmployeesQuery,
  ): Promise<PaginatedResponse<EmployeeDto>> {
    const where: Prisma.EmployeeWhereInput = { organizationId };
    if (query.payType) where.payType = query.payType;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameUr: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { designation: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: {
          salaryAdvances: { where: { status: 'POSTED' } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toEmployeeDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createEmployee(
    organizationId: number,
    userId: number,
    input: CreateEmployeeInput,
  ): Promise<EmployeeDto> {
    const empId = await inTransaction(this.prisma, async (tx) => {
      const id = await nextId(tx, 'employees');
      const created = await tx.employee.create({
        data: {
          id,
          organizationId,
          code: input.code?.trim() || null,
          name: input.name.trim(),
          nameUr: input.nameUr?.trim() || null,
          cnic: input.cnic?.trim() || null,
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          designation: input.designation?.trim() || null,
          payType: input.payType,
          baseRate: new Prisma.Decimal(new Decimal(input.baseRate).toFixed(2)),
          joinDate: input.joinDate ? new Date(`${input.joinDate}T00:00:00.000Z`) : null,
          isActive: input.isActive,
          notes: input.notes?.trim() || null,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'Employee',
        entityId: created.id,
        afterJson: {
          name: created.name,
          payType: created.payType,
          baseRate: created.baseRate.toString(),
        },
      });

      return created.id;
    });

    const row = await this.prisma.employee.findUniqueOrThrow({
      where: { id: empId },
      include: { salaryAdvances: { where: { status: 'POSTED' } } },
    });
    return this.toEmployeeDto(row);
  }

  async updateEmployee(
    organizationId: number,
    userId: number,
    id: number,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeDto> {
    await inTransaction(this.prisma, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        throw new NotFoundException(`Employee #${id} not found`);
      }

      const updated = await tx.employee.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.nameUr !== undefined ? { nameUr: input.nameUr?.trim() || null } : {}),
          ...(input.cnic !== undefined ? { cnic: input.cnic?.trim() || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
          ...(input.designation !== undefined
            ? { designation: input.designation?.trim() || null }
            : {}),
          ...(input.payType !== undefined ? { payType: input.payType } : {}),
          ...(input.baseRate !== undefined
            ? { baseRate: new Prisma.Decimal(new Decimal(input.baseRate).toFixed(2)) }
            : {}),
          ...(input.joinDate !== undefined
            ? { joinDate: input.joinDate ? new Date(`${input.joinDate}T00:00:00.000Z`) : null }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'UPDATE',
        entity: 'Employee',
        entityId: id,
        beforeJson: {
          name: existing.name,
          payType: existing.payType,
          baseRate: existing.baseRate.toString(),
        },
        afterJson: {
          name: updated.name,
          payType: updated.payType,
          baseRate: updated.baseRate.toString(),
        },
      });
    });

    const row = await this.prisma.employee.findUniqueOrThrow({
      where: { id },
      include: { salaryAdvances: { where: { status: 'POSTED' } } },
    });
    return this.toEmployeeDto(row);
  }

  async listAdvances(
    organizationId: number,
    query: ListSalaryAdvancesQuery,
  ): Promise<PaginatedResponse<SalaryAdvanceDto>> {
    const where: Prisma.SalaryAdvanceWhereInput = { organizationId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.advanceDate = {
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { advanceNo: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { employee: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.salaryAdvance.findMany({
        where,
        include: { employee: true },
        orderBy: [{ advanceDate: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.salaryAdvance.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toAdvanceDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createAdvance(
    organizationId: number,
    userId: number,
    input: CreateSalaryAdvanceInput,
  ): Promise<SalaryAdvanceDto> {
    const amountDec = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amountDec.lte(0)) {
      throw new BadRequestException('Advance amount must be greater than zero');
    }

    const advId = await inTransaction(this.prisma, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, organizationId },
      });
      if (!employee) {
        throw new NotFoundException(`Employee #${input.employeeId} not found`);
      }

      const advanceDate = new Date(`${input.advanceDate}T00:00:00.000Z`);
      const advanceNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'SALARY_ADVANCE',
        advanceDate,
      );
      const id = await nextId(tx, 'salary_advances');

      const created = await tx.salaryAdvance.create({
        data: {
          id,
          organizationId,
          advanceNo,
          employeeId: employee.id,
          advanceDate,
          amount: new Prisma.Decimal(amountDec.toFixed(2)),
          settledAmount: new Prisma.Decimal('0.00'),
          method: input.method,
          notes: input.notes?.trim() || null,
          status: 'POSTED',
          createdById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'SalaryAdvance',
        entityId: created.id,
        afterJson: {
          advanceNo,
          employeeId: employee.id,
          amount: amountDec.toFixed(2),
        },
      });

      return created.id;
    });

    const row = await this.prisma.salaryAdvance.findUniqueOrThrow({
      where: { id: advId },
      include: { employee: true },
    });
    return this.toAdvanceDto(row);
  }

  async voidAdvance(
    organizationId: number,
    userId: number,
    id: number,
    input: VoidDocumentInput,
  ): Promise<SalaryAdvanceDto> {
    await inTransaction(this.prisma, async (tx) => {
      const existing = await tx.salaryAdvance.findFirst({
        where: { id, organizationId },
      });
      if (!existing) {
        throw new NotFoundException(`Salary advance #${id} not found`);
      }
      if (existing.status === 'VOIDED') {
        throw new BadRequestException('Salary advance is already voided');
      }
      if (new Decimal(existing.settledAmount.toString()).gt(0)) {
        throw new BadRequestException(
          'Cannot void a salary advance that has already been partially or fully deducted from salary',
        );
      }

      await tx.salaryAdvance.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'VOID',
        entity: 'SalaryAdvance',
        entityId: id,
        beforeJson: { status: 'POSTED' },
        afterJson: { status: 'VOIDED', voidReason: input.reason },
      });
    });

    const row = await this.prisma.salaryAdvance.findUniqueOrThrow({
      where: { id },
      include: { employee: true },
    });
    return this.toAdvanceDto(row);
  }

  private async syncOpenBatchCostInTx(tx: TxClient, batchId: number): Promise<void> {
    const batch = await tx.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: {
        sources: true,
        costs: { where: { isVoided: false } },
      },
    });

    const metrics = calculateBatchMetrics({
      allocations: batch.sources.map((s) => ({
        kgUsed: s.kgUsed.toString(),
        amount: s.amount.toString(),
      })),
      activeCosts: batch.costs.map((c) => ({
        amount: c.amount.toString(),
      })),
      wastageMode: 'KG',
      wastageKg: batch.wastageKg.toString(),
    });

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        rawCost: new Prisma.Decimal(metrics.rawCost),
        extraCost: new Prisma.Decimal(metrics.extraCost),
        totalCost: new Prisma.Decimal(metrics.totalCost),
        costPerKg: new Prisma.Decimal(metrics.costPerKg),
      },
    });
  }

  async listSalaries(
    organizationId: number,
    query: ListSalaryRecordsQuery,
  ): Promise<PaginatedResponse<SalaryRecordDto>> {
    const where: Prisma.SalaryRecordWhereInput = { organizationId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.periodMonth) where.periodMonth = query.periodMonth;
    if (query.payType) where.payType = query.payType;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.paymentDate = {
        ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
        ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { salaryNo: { contains: q, mode: 'insensitive' } },
        { periodMonth: { contains: q, mode: 'insensitive' } },
        { employee: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.salaryRecord.findMany({
        where,
        include: { employee: true, batch: true },
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.salaryRecord.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toSalaryDto(r)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createSalaryRecord(
    organizationId: number,
    userId: number,
    input: CreateSalaryRecordInput,
  ): Promise<SalaryRecordDto> {
    const calc = calculateSalaryAmounts({
      payType: input.payType,
      unitsWorked: input.unitsWorked,
      rateApplied: input.rateApplied,
      overtimeAmount: input.overtimeAmount,
      bonusAmount: input.bonusAmount,
      deductionsAmount: input.deductionsAmount,
      advanceDeducted: input.advanceDeducted,
    });

    const netDec = new Decimal(calc.netAmount);
    if (netDec.lt(0)) {
      throw new BadRequestException('Net salary amount cannot be negative');
    }

    const advanceDeductedDec = new Decimal(input.advanceDeducted || 0).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );

    const salaryId = await inTransaction(this.prisma, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: input.employeeId, organizationId },
      });
      if (!employee) {
        throw new NotFoundException(`Employee #${input.employeeId} not found`);
      }

      // 1. If advanceDeducted > 0, allocate FIFO across employee's unsettled POSTED advances
      if (advanceDeductedDec.gt(0)) {
        const openAdvances = await tx.salaryAdvance.findMany({
          where: {
            organizationId,
            employeeId: employee.id,
            status: 'POSTED',
          },
          orderBy: [{ advanceDate: 'asc' }, { id: 'asc' }],
        });

        let totalUnsettled = new Decimal(0);
        for (const adv of openAdvances) {
          const rem = new Decimal(adv.amount.toString()).minus(
            new Decimal(adv.settledAmount.toString()),
          );
          if (rem.gt(0)) totalUnsettled = totalUnsettled.plus(rem);
        }

        if (advanceDeductedDec.gt(totalUnsettled)) {
          throw new BadRequestException(
            `Cannot deduct ${advanceDeductedDec.toFixed(2)} in advance: employee only has ${totalUnsettled.toFixed(2)} unsettled advance balance`,
          );
        }

        let remainingToDeduct = advanceDeductedDec;
        for (const adv of openAdvances) {
          if (remainingToDeduct.lte(0)) break;
          const settled = new Decimal(adv.settledAmount.toString());
          const rem = new Decimal(adv.amount.toString()).minus(settled);
          if (rem.lte(0)) continue;

          const alloc = Decimal.min(remainingToDeduct, rem);
          await tx.salaryAdvance.update({
            where: { id: adv.id },
            data: {
              settledAmount: new Prisma.Decimal(settled.plus(alloc).toFixed(2)),
            },
          });
          remainingToDeduct = remainingToDeduct.minus(alloc);
        }
      }

      const paymentDate = new Date(`${input.paymentDate}T00:00:00.000Z`);
      const salaryNo = await this.numbering.nextDocumentNumber(
        tx,
        organizationId,
        'SALARY_SLIP',
        paymentDate,
      );

      // 2. Optional link to OPEN batch (e.g. PIECE_RATE labour flows into batch cost per §4.5d)
      let batchCostId: number | null = null;
      if (input.batchId) {
        await tx.$queryRaw`
          SELECT "id" FROM "batches"
          WHERE "id" = ${input.batchId} AND "organization_id" = ${organizationId}
          FOR UPDATE
        `;
        const batch = await tx.batch.findFirst({
          where: { id: input.batchId, organizationId },
        });
        if (!batch) {
          throw new NotFoundException(`Batch #${input.batchId} not found`);
        }
        if (batch.status === 'CLOSED') {
          throw new BadRequestException(
            `Batch ${batch.batchNo} is CLOSED and locked. Cannot link payroll labour to a closed batch.`,
          );
        }

        const labourCostAmount = new Decimal(calc.grossEarnings)
          .minus(new Decimal(input.deductionsAmount || 0))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        if (labourCostAmount.gt(0)) {
          batchCostId = await nextId(tx, 'batch_costs');
          await tx.batchCost.create({
            data: {
              id: batchCostId,
              batchId: batch.id,
              costType: 'LABOUR',
              costDate: paymentDate,
              description: `${salaryNo} (${employee.name} — ${input.payType})`,
              amount: new Prisma.Decimal(labourCostAmount.toFixed(2)),
              createdById: userId,
            },
          });

          await this.syncOpenBatchCostInTx(tx, batch.id);
        }
      }

      const id = await nextId(tx, 'salary_records');
      const created = await tx.salaryRecord.create({
        data: {
          id,
          organizationId,
          salaryNo,
          employeeId: employee.id,
          periodMonth: input.periodMonth,
          paymentDate,
          payType: input.payType,
          unitsWorked: new Prisma.Decimal(new Decimal(input.unitsWorked).toFixed(3)),
          rateApplied: new Prisma.Decimal(new Decimal(input.rateApplied).toFixed(2)),
          basicAmount: new Prisma.Decimal(calc.basicAmount),
          overtimeAmount: new Prisma.Decimal(new Decimal(input.overtimeAmount || 0).toFixed(2)),
          bonusAmount: new Prisma.Decimal(new Decimal(input.bonusAmount || 0).toFixed(2)),
          deductionsAmount: new Prisma.Decimal(new Decimal(input.deductionsAmount || 0).toFixed(2)),
          advanceDeducted: new Prisma.Decimal(advanceDeductedDec.toFixed(2)),
          netAmount: new Prisma.Decimal(calc.netAmount),
          batchId: input.batchId ?? null,
          batchCostId,
          method: input.method,
          notes: input.notes?.trim() || null,
          status: 'POSTED',
          createdById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'SalaryRecord',
        entityId: created.id,
        afterJson: {
          salaryNo,
          employeeId: employee.id,
          periodMonth: created.periodMonth,
          basicAmount: calc.basicAmount,
          advanceDeducted: advanceDeductedDec.toFixed(2),
          netAmount: calc.netAmount,
          batchId: created.batchId,
          batchCostId,
        },
      });

      return created.id;
    });

    const row = await this.prisma.salaryRecord.findUniqueOrThrow({
      where: { id: salaryId },
      include: { employee: true, batch: true },
    });
    return this.toSalaryDto(row);
  }

  async voidSalaryRecord(
    organizationId: number,
    userId: number,
    id: number,
    input: VoidDocumentInput,
  ): Promise<SalaryRecordDto> {
    await inTransaction(this.prisma, async (tx) => {
      const existing = await tx.salaryRecord.findFirst({
        where: { id, organizationId },
        include: { batch: true },
      });
      if (!existing) {
        throw new NotFoundException(`Salary record #${id} not found`);
      }
      if (existing.status === 'VOIDED') {
        throw new BadRequestException('Salary record is already voided');
      }

      // 1. Reverse advanceDeducted on employee's POSTED advances (LIFO)
      let toRestore = new Decimal(existing.advanceDeducted.toString());
      if (toRestore.gt(0)) {
        const settledAdvances = await tx.salaryAdvance.findMany({
          where: {
            organizationId,
            employeeId: existing.employeeId,
            status: 'POSTED',
          },
          orderBy: [{ advanceDate: 'desc' }, { id: 'desc' }],
        });

        for (const adv of settledAdvances) {
          if (toRestore.lte(0)) break;
          const settled = new Decimal(adv.settledAmount.toString());
          if (settled.lte(0)) continue;
          const restoreAmt = Decimal.min(toRestore, settled);
          await tx.salaryAdvance.update({
            where: { id: adv.id },
            data: {
              settledAmount: new Prisma.Decimal(settled.minus(restoreAmt).toFixed(2)),
            },
          });
          toRestore = toRestore.minus(restoreAmt);
        }
      }

      // 2. If linked to a batch cost, void the BatchCost and recalculate batch cost/kg
      if (existing.batchId && existing.batchCostId) {
        if (existing.batch?.status === 'CLOSED') {
          throw new BadRequestException(
            `Cannot void payroll record linked to closed batch ${existing.batch.batchNo}`,
          );
        }
        await tx.batchCost.update({
          where: { id: existing.batchCostId },
          data: {
            isVoided: true,
            voidReason: input.reason,
            voidedAt: new Date(),
            voidedById: userId,
          },
        });
        await this.syncOpenBatchCostInTx(tx, existing.batchId);
      }

      await tx.salaryRecord.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason,
          voidedAt: new Date(),
          voidedById: userId,
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'VOID',
        entity: 'SalaryRecord',
        entityId: id,
        beforeJson: { status: 'POSTED' },
        afterJson: { status: 'VOIDED', voidReason: input.reason },
      });
    });

    const row = await this.prisma.salaryRecord.findUniqueOrThrow({
      where: { id },
      include: { employee: true, batch: true },
    });
    return this.toSalaryDto(row);
  }

  /**
   * Computes Net Profit per PROJECT_START.md §4.6:
   * Gross Profit (net of returns) - Operating Expenses (non-batch) - Operating Salaries/Bonuses (non-batch).
   */
  async getNetProfitSummary(
    organizationId: number,
    query: NetProfitQuery,
  ): Promise<NetProfitSummaryDto> {
    const dateRange =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
          }
        : undefined;

    const [sales, saleReturns, expenses, salaries] = await Promise.all([
      this.prisma.saleInvoice.findMany({
        where: {
          organizationId,
          status: { not: 'VOIDED' },
          ...(dateRange ? { saleDate: dateRange } : {}),
        },
        select: { totalProfit: true },
      }),
      this.prisma.saleReturn.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          ...(dateRange ? { returnDate: dateRange } : {}),
        },
        include: { items: true },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          ...(dateRange ? { expenseDate: dateRange } : {}),
        },
        select: { amount: true, batchId: true },
      }),
      this.prisma.salaryRecord.findMany({
        where: {
          organizationId,
          status: 'POSTED',
          ...(dateRange ? { paymentDate: dateRange } : {}),
        },
        select: {
          basicAmount: true,
          overtimeAmount: true,
          bonusAmount: true,
          deductionsAmount: true,
          batchId: true,
        },
      }),
    ]);

    let grossSalesProfit = new Decimal(0);
    for (const s of sales) {
      grossSalesProfit = grossSalesProfit.plus(new Decimal(s.totalProfit.toString()));
    }

    let returnProfitReversed = new Decimal(0);
    let returnDamageLoss = new Decimal(0);
    for (const ret of saleReturns) {
      for (const item of ret.items) {
        const sub = new Decimal(item.lineSubtotal.toString());
        const cogsRev = new Decimal(item.cogsReversed.toString());
        const loss = new Decimal(item.lossAmount.toString());
        // For RESALEABLE items, profit reversed = lineSubtotal - cogsReversed
        // For DAMAGED items, cogsReversed is 0 and lossAmount is the damaged COGS, so profit reversed = lineSubtotal
        const profitRev = item.condition === 'RESALEABLE' ? sub.minus(cogsRev) : sub.minus(cogsRev);
        returnProfitReversed = returnProfitReversed.plus(profitRev);
        returnDamageLoss = returnDamageLoss.plus(loss);
      }
    }

    const netGrossProfit = grossSalesProfit.minus(returnProfitReversed);

    let operatingExpenses = new Decimal(0);
    let batchCapitalizedExpenses = new Decimal(0);
    for (const exp of expenses) {
      const amt = new Decimal(exp.amount.toString());
      if (exp.batchId !== null) {
        batchCapitalizedExpenses = batchCapitalizedExpenses.plus(amt);
      } else {
        operatingExpenses = operatingExpenses.plus(amt);
      }
    }

    let operatingPayroll = new Decimal(0);
    let batchCapitalizedPayroll = new Decimal(0);
    for (const sal of salaries) {
      const payrollCost = new Decimal(sal.basicAmount.toString())
        .plus(new Decimal(sal.overtimeAmount.toString()))
        .plus(new Decimal(sal.bonusAmount.toString()))
        .minus(new Decimal(sal.deductionsAmount.toString()));
      if (sal.batchId !== null) {
        batchCapitalizedPayroll = batchCapitalizedPayroll.plus(payrollCost);
      } else {
        operatingPayroll = operatingPayroll.plus(payrollCost);
      }
    }

    const netProfit = netGrossProfit.minus(operatingExpenses).minus(operatingPayroll);

    return {
      grossSalesProfit: grossSalesProfit.toFixed(2),
      returnProfitReversed: returnProfitReversed.toFixed(2),
      returnDamageLoss: returnDamageLoss.toFixed(2),
      netGrossProfit: netGrossProfit.toFixed(2),
      operatingExpenses: operatingExpenses.toFixed(2),
      operatingPayroll: operatingPayroll.toFixed(2),
      batchCapitalizedExpenses: batchCapitalizedExpenses.toFixed(2),
      batchCapitalizedPayroll: batchCapitalizedPayroll.toFixed(2),
      netProfit: netProfit.toFixed(2),
    };
  }
}
