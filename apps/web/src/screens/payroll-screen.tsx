import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calculateSalaryAmounts,
  formatMoney,
  formatWeight,
  PAY_TYPES,
  PAYMENT_METHODS,
  type EmployeeDto,
  type PageSizeOption,
  type PaymentMethod,
  type PayType,
  type SalaryAdvanceDto,
  type SalaryRecordDto,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  DatePicker,
  Dialog,
  Drawer,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
  MoneyText,
  NumberInput,
  PageHeader,
  Pagination,
  RowActions,
  Select,
  StatCard,
  StatusBadge,
  TabsBar,
  TextInput,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import {
  createEmployee,
  createSalaryAdvance,
  createSalaryRecord,
  fetchBatches,
  fetchEmployees,
  fetchNetProfitSummary,
  fetchSalaryAdvances,
  fetchSalaryRecords,
  voidSalaryAdvance,
  voidSalaryRecord,
} from '../lib/api';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

type PayrollTab = 'employees' | 'advances' | 'salaries';

export function PayrollScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<PayrollTab>('employees');

  // Pagination & Search per tab
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [search, setSearch] = useState('');
  const [payTypeFilter, setPayTypeFilter] = useState('');

  // Employee Drawer state
  const [empDrawerOpen, setEmpDrawerOpen] = useState(false);
  const [empCode, setEmpCode] = useState('');
  const [empName, setEmpName] = useState('');
  const [empNameUr, setEmpNameUr] = useState('');
  const [empCnic, setEmpCnic] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empDesignation, setEmpDesignation] = useState('');
  const [empPayType, setEmpPayType] = useState<PayType>('FIXED_MONTHLY');
  const [empBaseRate, setEmpBaseRate] = useState('0.00');
  const [empJoinDate, setEmpJoinDate] = useState(todayIso());

  // Advance Drawer state
  const [advDrawerOpen, setAdvDrawerOpen] = useState(false);
  const [advEmployeeId, setAdvEmployeeId] = useState('');
  const [advDate, setAdvDate] = useState(todayIso());
  const [advAmount, setAdvAmount] = useState('0.00');
  const [advMethod, setAdvMethod] = useState<PaymentMethod>('CASH');
  const [advNotes, setAdvNotes] = useState('');

  // Salary / Bonus Drawer state
  const [salDrawerOpen, setSalDrawerOpen] = useState(false);
  const [salEmployeeId, setSalEmployeeId] = useState('');
  const [salMonth, setSalMonth] = useState(currentMonthIso());
  const [salDate, setSalDate] = useState(todayIso());
  const [salPayType, setSalPayType] = useState<PayType>('FIXED_MONTHLY');
  const [salUnitsWorked, setSalUnitsWorked] = useState('1.000');
  const [salRateApplied, setSalRateApplied] = useState('0.00');
  const [salOvertime, setSalOvertime] = useState('0.00');
  const [salBonus, setSalBonus] = useState('0.00');
  const [salDeductions, setSalDeductions] = useState('0.00');
  const [salAdvanceDeducted, setSalAdvanceDeducted] = useState('0.00');
  const [salBatchId, setSalBatchId] = useState('');
  const [salMethod, setSalMethod] = useState<PaymentMethod>('CASH');
  const [salNotes, setSalNotes] = useState('');

  // Printable Salary Slip Modal state
  const [slipTarget, setSlipTarget] = useState<SalaryRecordDto | null>(null);
  const slipPrintRef = useRef<HTMLDivElement | null>(null);

  // Void Dialog state
  const [voidTarget, setVoidTarget] = useState<
    { kind: 'ADVANCE'; id: number; no: string } | { kind: 'SALARY'; id: number; no: string } | null
  >(null);
  const [voidReason, setVoidReason] = useState('');

  const netProfitQuery = useQuery({
    queryKey: ['net-profit-summary'],
    queryFn: () => fetchNetProfitSummary(),
  });

  const employeesQuery = useQuery({
    queryKey: ['employees', { page, pageSize, search, payTypeFilter }],
    queryFn: () =>
      fetchEmployees({
        page,
        pageSize,
        search: search.trim() || undefined,
        payType: (payTypeFilter || undefined) as PayType | undefined,
      }),
  });

  const allEmployeesQuery = useQuery({
    queryKey: ['employees', 'dropdown'],
    queryFn: () => fetchEmployees({ page: 1, pageSize: 100, isActive: true }),
  });

  const advancesQuery = useQuery({
    queryKey: ['salary-advances', { page, pageSize, search }],
    queryFn: () =>
      fetchSalaryAdvances({
        page,
        pageSize,
        search: search.trim() || undefined,
      }),
    enabled: activeTab === 'advances',
  });

  const salariesQuery = useQuery({
    queryKey: ['salary-records', { page, pageSize, search, payTypeFilter }],
    queryFn: () =>
      fetchSalaryRecords({
        page,
        pageSize,
        search: search.trim() || undefined,
        payType: (payTypeFilter || undefined) as PayType | undefined,
      }),
    enabled: activeTab === 'salaries',
  });

  const openBatchesQuery = useQuery({
    queryKey: ['batches', 'open-for-payroll'],
    queryFn: () => fetchBatches({ page: 1, pageSize: 100, status: 'OPEN' }),
    enabled: salDrawerOpen,
  });

  const invalidatePayroll = () => {
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['salary-advances'] });
    void queryClient.invalidateQueries({ queryKey: ['salary-records'] });
    void queryClient.invalidateQueries({ queryKey: ['batches'] });
    void queryClient.invalidateQueries({ queryKey: ['net-profit-summary'] });
  };

  const createEmpMutation = useMutation({
    mutationFn: () =>
      createEmployee({
        code: empCode.trim() || null,
        name: empName.trim(),
        nameUr: empNameUr.trim() || null,
        cnic: empCnic.trim() || null,
        phone: empPhone.trim() || null,
        designation: empDesignation.trim() || null,
        payType: empPayType,
        baseRate: empBaseRate,
        joinDate: empJoinDate || null,
        isActive: true,
      }),
    onSuccess: (created) => {
      showToast({
        tone: 'success',
        title: t('payroll.employeeCreatedToast', 'Employee {{name}} added', {
          name: created.name,
        }),
      });
      setEmpDrawerOpen(false);
      setEmpCode('');
      setEmpName('');
      setEmpNameUr('');
      setEmpCnic('');
      setEmpPhone('');
      setEmpDesignation('');
      setEmpBaseRate('0.00');
      invalidatePayroll();
    },
    onError: (err: Error) => showToast({ tone: 'danger', title: err.message }),
  });

  const createAdvMutation = useMutation({
    mutationFn: () =>
      createSalaryAdvance({
        employeeId: Number(advEmployeeId),
        advanceDate: advDate,
        amount: advAmount,
        method: advMethod,
        notes: advNotes.trim() || null,
      }),
    onSuccess: (created) => {
      showToast({
        tone: 'success',
        title: t('payroll.advanceCreatedToast', 'Salary Advance {{no}} recorded', {
          no: created.advanceNo,
        }),
      });
      setAdvDrawerOpen(false);
      setAdvAmount('0.00');
      setAdvNotes('');
      invalidatePayroll();
    },
    onError: (err: Error) => showToast({ tone: 'danger', title: err.message }),
  });

  const createSalMutation = useMutation({
    mutationFn: () =>
      createSalaryRecord({
        employeeId: Number(salEmployeeId),
        periodMonth: salMonth,
        paymentDate: salDate,
        payType: salPayType,
        unitsWorked: salUnitsWorked,
        rateApplied: salRateApplied,
        overtimeAmount: salOvertime,
        bonusAmount: salBonus,
        deductionsAmount: salDeductions,
        advanceDeducted: salAdvanceDeducted,
        batchId: salBatchId ? Number(salBatchId) : null,
        method: salMethod,
        notes: salNotes.trim() || null,
      }),
    onSuccess: (created) => {
      showToast({
        tone: 'success',
        title: t('payroll.salaryCreatedToast', 'Salary Slip {{no}} posted', {
          no: created.salaryNo,
        }),
      });
      setSalDrawerOpen(false);
      invalidatePayroll();
      setSlipTarget(created);
    },
    onError: (err: Error) => showToast({ tone: 'danger', title: err.message }),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!voidTarget) throw new Error('No document selected');
      if (voidTarget.kind === 'ADVANCE') {
        await voidSalaryAdvance(voidTarget.id, voidReason.trim());
        return;
      }
      await voidSalaryRecord(voidTarget.id, voidReason.trim());
    },
    onSuccess: () => {
      showToast({ tone: 'success', title: t('common.voidedToast', 'Document voided') });
      setVoidTarget(null);
      setVoidReason('');
      invalidatePayroll();
    },
    onError: (err: Error) => showToast({ tone: 'danger', title: err.message }),
  });

  const liveSalaryPreview = useMemo(
    () =>
      calculateSalaryAmounts({
        payType: salPayType,
        unitsWorked: salUnitsWorked,
        rateApplied: salRateApplied,
        overtimeAmount: salOvertime,
        bonusAmount: salBonus,
        deductionsAmount: salDeductions,
        advanceDeducted: salAdvanceDeducted,
      }),
    [
      salPayType,
      salUnitsWorked,
      salRateApplied,
      salOvertime,
      salBonus,
      salDeductions,
      salAdvanceDeducted,
    ],
  );

  const allEmployees = useMemo(
    () => allEmployeesQuery.data?.data ?? [],
    [allEmployeesQuery.data?.data],
  );
  const selectedEmployeeForSalary = allEmployees.find((e) => String(e.id) === salEmployeeId);

  const handleSelectSalaryEmployee = useCallback(
    (empIdStr: string) => {
      setSalEmployeeId(empIdStr);
      const emp = allEmployees.find((e) => String(e.id) === empIdStr);
      if (emp) {
        setSalPayType(emp.payType);
        setSalRateApplied(emp.baseRate);
        setSalUnitsWorked(emp.payType === 'FIXED_MONTHLY' ? '1.000' : '26.000');
        setSalAdvanceDeducted(emp.unsettledAdvanceBalance);
      }
    },
    [allEmployees],
  );

  const handlePrintSalarySlip = () => {
    const html = slipPrintRef.current?.innerHTML;
    if (!html) return;
    const iframe = window.document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    window.document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Salary Slip</title>
      <style>
        body { font-family: 'Inter', 'Noto Nastaliq Urdu', sans-serif; padding: 16px; font-size: 13px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; }
        .text-right { text-align: right; }
        .font-mono { font-family: monospace; }
      </style></head><body>${html}</body></html>`);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (window.document.body.contains(iframe)) window.document.body.removeChild(iframe);
      }, 1000);
    }, 150);
  };

  const employeeColumns = useMemo<ColumnDef<EmployeeDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'name',
        header: t('payroll.employeeName', 'Employee'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-neutral-900">{row.original.name}</div>
            {row.original.nameUr && (
              <div className="text-xs text-neutral-500">{row.original.nameUr}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'designation',
        header: t('payroll.designation', 'Designation'),
        cell: ({ row }) => row.original.designation || '—',
      },
      {
        accessorKey: 'phone',
        header: t('common.phone', 'Phone'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.phone || '—'}</span>,
      },
      {
        accessorKey: 'payType',
        header: t('payroll.payType', 'Pay Type'),
        cell: ({ row }) => <StatusBadge tone="info">{row.original.payType}</StatusBadge>,
      },
      {
        accessorKey: 'baseRate',
        header: t('payroll.baseRate', 'Base Rate / Salary'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.baseRate} />,
      },
      {
        accessorKey: 'unsettledAdvanceBalance',
        header: t('payroll.openAdvance', 'Open Advance'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <MoneyText
            value={row.original.unsettledAdvanceBalance}
            className={
              Number(row.original.unsettledAdvanceBalance) > 0 ? 'text-[#9e3b33]' : undefined
            }
          />
        ),
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAdvEmployeeId(String(row.original.id));
                setAdvDate(todayIso());
                setAdvAmount('0.00');
                setAdvDrawerOpen(true);
              }}
            >
              {t('payroll.giveAdvance', 'Advance')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                handleSelectSalaryEmployee(String(row.original.id));
                setSalDrawerOpen(true);
              }}
            >
              {t('payroll.paySalary', 'Pay Salary')}
            </Button>
          </div>
        ),
      },
    ],
    [t, handleSelectSalaryEmployee],
  );

  const advanceColumns = useMemo<ColumnDef<SalaryAdvanceDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'advanceNo',
        header: t('payroll.advanceNo', 'Advance No'),
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.advanceNo}</span>,
      },
      {
        accessorKey: 'advanceDate',
        header: t('common.date', 'Date'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.advanceDate}</span>,
      },
      {
        accessorKey: 'employeeName',
        header: t('payroll.employeeName', 'Employee'),
      },
      {
        accessorKey: 'amount',
        header: t('common.amount', 'Advance Amount'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.amount} />,
      },
      {
        accessorKey: 'settledAmount',
        header: t('payroll.deductedSoFar', 'Deducted'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.settledAmount} />,
      },
      {
        accessorKey: 'unsettledAmount',
        header: t('payroll.remainingAdvance', 'Remaining'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.unsettledAmount} />,
      },
      {
        accessorKey: 'status',
        header: t('common.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'void',
                label: t('common.void', 'Void'),
                tone: 'danger',
                disabled:
                  row.original.status === 'VOIDED' || Number(row.original.settledAmount) > 0,
                onClick: () => {
                  setVoidTarget({
                    kind: 'ADVANCE',
                    id: row.original.id,
                    no: row.original.advanceNo,
                  });
                  setVoidReason('');
                },
              },
            ]}
          />
        ),
      },
    ],
    [t],
  );

  const salaryColumns = useMemo<ColumnDef<SalaryRecordDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'salaryNo',
        header: t('payroll.salaryNo', 'Slip No'),
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.salaryNo}</span>,
      },
      {
        accessorKey: 'periodMonth',
        header: t('payroll.periodMonth', 'Month'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.periodMonth}</span>,
      },
      {
        accessorKey: 'employeeName',
        header: t('payroll.employeeName', 'Employee'),
      },
      {
        accessorKey: 'payType',
        header: t('payroll.payType', 'Pay Type'),
        cell: ({ row }) => (
          <div>
            <StatusBadge tone="neutral">{row.original.payType}</StatusBadge>
            {row.original.batchNo && (
              <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
                Batch: {row.original.batchNo}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'basicAmount',
        header: t('payroll.basicAmount', 'Basic / Earned'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.basicAmount} />,
      },
      {
        accessorKey: 'bonusAmount',
        header: t('payroll.bonusOvertime', 'Bonus + OT'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <MoneyText
            value={(Number(row.original.bonusAmount) + Number(row.original.overtimeAmount)).toFixed(
              2,
            )}
          />
        ),
      },
      {
        accessorKey: 'advanceDeducted',
        header: t('payroll.advanceDeducted', 'Adv. Deducted'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.advanceDeducted} />,
      },
      {
        accessorKey: 'netAmount',
        header: t('payroll.netPaid', 'Net Paid'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.netAmount} />
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('common.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'print',
                label: t('print.printButtonShort', 'Print Slip'),
                inline: true,
                onClick: () => setSlipTarget(row.original),
              },
              {
                id: 'void',
                label: t('common.void', 'Void'),
                tone: 'danger',
                disabled: row.original.status === 'VOIDED',
                onClick: () => {
                  setVoidTarget({
                    kind: 'SALARY',
                    id: row.original.id,
                    no: row.original.salaryNo,
                  });
                  setVoidReason('');
                },
              },
            ]}
          />
        ),
      },
    ],
    [t],
  );

  const np = netProfitQuery.data;

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('payroll.title', 'Payroll (Employees, Advances, Salaries & Bonus)')}
        subtitle={t(
          'payroll.subtitle',
          'Fixed monthly, daily wage & piece-rate workers with advance recovery, batch labour link, and printable salary slips',
        )}
        primaryAction={
          activeTab === 'employees'
            ? {
                label: t('payroll.newEmployee', 'Add Employee'),
                onClick: () => setEmpDrawerOpen(true),
              }
            : activeTab === 'advances'
              ? {
                  label: t('payroll.newAdvance', 'Issue Salary Advance'),
                  onClick: () => setAdvDrawerOpen(true),
                }
              : {
                  label: t('payroll.newSalary', 'Process Salary / Bonus'),
                  onClick: () => setSalDrawerOpen(true),
                }
        }
      />

      {np && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <StatCard
            label={t('payroll.statGrossProfit', 'Net Gross Profit (After Returns)')}
            value={<MoneyText value={np.netGrossProfit} />}
          />
          <StatCard
            label={t('payroll.statOpExpenses', 'Operating Expenses')}
            value={<MoneyText value={np.operatingExpenses} />}
          />
          <StatCard
            label={t('payroll.statOpPayroll', 'Operating Salaries & Bonus')}
            value={<MoneyText value={np.operatingPayroll} />}
          />
          <StatCard
            label={t('payroll.statNetProfit', 'Net Profit (Gross − Expenses − Payroll)')}
            value={<MoneyText value={np.netProfit} />}
          />
        </div>
      )}

      <TabsBar
        activeId={activeTab}
        onChange={(id) => {
          setActiveTab(id as PayrollTab);
          setPage(1);
          setSearch('');
        }}
        tabs={[
          { id: 'employees', label: t('payroll.tabEmployees', 'Employees') },
          { id: 'advances', label: t('payroll.tabAdvances', 'Salary Advances') },
          { id: 'salaries', label: t('payroll.tabSalaries', 'Salaries & Bonus Slips') },
        ]}
      />

      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder={t('payroll.searchPlaceholder', 'Search employee, slip no, or month...')}
        selects={
          activeTab !== 'advances'
            ? [
                {
                  id: 'payType',
                  label: t('payroll.payType', 'Pay Type'),
                  value: payTypeFilter,
                  allLabel: t('payroll.allPayTypes', 'All Pay Types'),
                  options: PAY_TYPES.map((pt) => ({ value: pt, label: pt })),
                  onChange: (val) => {
                    setPayTypeFilter(val);
                    setPage(1);
                  },
                },
              ]
            : []
        }
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setSearch('');
          setPayTypeFilter('');
          setPage(1);
        }}
      />

      {activeTab === 'employees' && (
        <>
          <DataTable
            columns={employeeColumns}
            data={employeesQuery.data?.data ?? []}
            isLoading={employeesQuery.isLoading}
            emptyTitle={t('payroll.emptyEmployees', 'No employees added yet')}
            emptyDescription={t(
              'payroll.emptyEmployeesDesc',
              'Add fixed monthly, daily wage, or piece-rate workers to manage advances and payroll.',
            )}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={employeesQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('pagination.rowsPerPage', 'Rows per page'),
              showingRange: (from, to, total) => `${from}-${to} of ${total}`,
              firstPage: t('pagination.firstPage', 'First page'),
              previousPage: t('pagination.previousPage', 'Previous page'),
              nextPage: t('pagination.nextPage', 'Next page'),
              lastPage: t('pagination.lastPage', 'Last page'),
            }}
          />
        </>
      )}

      {activeTab === 'advances' && (
        <>
          <DataTable
            columns={advanceColumns}
            data={advancesQuery.data?.data ?? []}
            isLoading={advancesQuery.isLoading}
            emptyTitle={t('payroll.emptyAdvances', 'No salary advances recorded')}
            emptyDescription={t(
              'payroll.emptyAdvancesDesc',
              'Advances issued to employees are automatically tracked and deducted during salary settlement.',
            )}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={advancesQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('pagination.rowsPerPage', 'Rows per page'),
              showingRange: (from, to, total) => `${from}-${to} of ${total}`,
              firstPage: t('pagination.firstPage', 'First page'),
              previousPage: t('pagination.previousPage', 'Previous page'),
              nextPage: t('pagination.nextPage', 'Next page'),
              lastPage: t('pagination.lastPage', 'Last page'),
            }}
          />
        </>
      )}

      {activeTab === 'salaries' && (
        <>
          <DataTable
            columns={salaryColumns}
            data={salariesQuery.data?.data ?? []}
            isLoading={salariesQuery.isLoading}
            emptyTitle={t('payroll.emptySalaries', 'No salary slips processed yet')}
            emptyDescription={t(
              'payroll.emptySalariesDesc',
              'Process monthly salaries, daily wages, or piece-rate work entries to generate printable salary slips.',
            )}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={salariesQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('pagination.rowsPerPage', 'Rows per page'),
              showingRange: (from, to, total) => `${from}-${to} of ${total}`,
              firstPage: t('pagination.firstPage', 'First page'),
              previousPage: t('pagination.previousPage', 'Previous page'),
              nextPage: t('pagination.nextPage', 'Next page'),
              lastPage: t('pagination.lastPage', 'Last page'),
            }}
          />
        </>
      )}

      {/* Add Employee Drawer */}
      <Drawer
        open={empDrawerOpen}
        onClose={() => setEmpDrawerOpen(false)}
        title={t('payroll.newEmployee', 'Add Employee')}
        widthClass="max-w-2xl"
      >
        <FormLayout
          onSubmit={() => {
            if (!empName.trim()) return;
            createEmpMutation.mutate();
          }}
          onCancel={() => setEmpDrawerOpen(false)}
          isSubmitting={createEmpMutation.isPending}
          labels={{
            save: t('common.save', 'Save'),
            cancel: t('common.cancel', 'Cancel'),
          }}
        >
          <FormField label={t('payroll.employeeName', 'Full Name (English)')} required>
            <TextInput value={empName} onChange={(e) => setEmpName(e.target.value)} />
          </FormField>
          <FormField label={t('common.nameUr', 'Name (Urdu)')}>
            <TextInput dir="rtl" value={empNameUr} onChange={(e) => setEmpNameUr(e.target.value)} />
          </FormField>
          <FormField label={t('payroll.employeeCode', 'Employee Code')}>
            <TextInput
              value={empCode}
              onChange={(e) => setEmpCode(e.target.value)}
              placeholder="e.g. EMP-01"
            />
          </FormField>
          <FormField label={t('payroll.designation', 'Designation / Role')}>
            <TextInput
              value={empDesignation}
              onChange={(e) => setEmpDesignation(e.target.value)}
              placeholder="e.g. Machine Operator / Loader / Accountant"
            />
          </FormField>
          <FormField label={t('payroll.payType', 'Pay Type')} required>
            <Select
              value={empPayType}
              onChange={(e) => setEmpPayType(e.target.value as PayType)}
              options={[
                { value: 'FIXED_MONTHLY', label: 'FIXED_MONTHLY (Monthly Salary)' },
                { value: 'DAILY_WAGE', label: 'DAILY_WAGE (Days × Daily Rate)' },
                { value: 'PIECE_RATE', label: 'PIECE_RATE (KG / Bags × Piece Rate)' },
              ]}
            />
          </FormField>
          <FormField
            label={
              empPayType === 'FIXED_MONTHLY'
                ? t('payroll.monthlySalary', 'Monthly Salary (PKR)')
                : empPayType === 'DAILY_WAGE'
                  ? t('payroll.dailyRate', 'Daily Wage Rate (PKR)')
                  : t('payroll.pieceRate', 'Piece Rate per Unit/KG (PKR)')
            }
            required
          >
            <NumberInput precision="money" value={empBaseRate} onChange={setEmpBaseRate} />
          </FormField>
          <FormField label={t('common.phone', 'Phone')}>
            <TextInput value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} />
          </FormField>
          <FormField label={t('payroll.cnic', 'CNIC No')}>
            <TextInput value={empCnic} onChange={(e) => setEmpCnic(e.target.value)} />
          </FormField>
          <FormField label={t('payroll.joinDate', 'Joining Date')}>
            <DatePicker value={empJoinDate} onChange={(e) => setEmpJoinDate(e.target.value)} />
          </FormField>
        </FormLayout>
      </Drawer>

      {/* Issue Salary Advance Drawer */}
      <Drawer
        open={advDrawerOpen}
        onClose={() => setAdvDrawerOpen(false)}
        title={t('payroll.newAdvance', 'Issue Salary Advance')}
        widthClass="max-w-lg"
      >
        <FormLayout
          onSubmit={() => {
            if (!advEmployeeId || Number(advAmount) <= 0) return;
            createAdvMutation.mutate();
          }}
          onCancel={() => setAdvDrawerOpen(false)}
          isSubmitting={createAdvMutation.isPending}
          labels={{
            save: t('common.save', 'Save'),
            cancel: t('common.cancel', 'Cancel'),
          }}
        >
          <div className="sm:col-span-2">
            <FormField label={t('payroll.employeeName', 'Employee')} required>
              <Select
                value={advEmployeeId}
                onChange={(e) => setAdvEmployeeId(e.target.value)}
                options={[
                  { value: '', label: t('payroll.selectEmployee', 'Select employee...') },
                  ...allEmployees.map((e) => ({
                    value: String(e.id),
                    label: `${e.name} (Open Advance: PKR ${formatMoney(e.unsettledAdvanceBalance)})`,
                  })),
                ]}
              />
            </FormField>
          </div>
          <FormField label={t('common.date', 'Advance Date')} required>
            <DatePicker value={advDate} onChange={(e) => setAdvDate(e.target.value)} />
          </FormField>
          <FormField label={t('common.amount', 'Advance Amount (PKR)')} required>
            <NumberInput precision="money" value={advAmount} onChange={setAdvAmount} />
          </FormField>
          <FormField label={t('payments.colMethod', 'Payment Method')} required>
            <Select
              value={advMethod}
              onChange={(e) => setAdvMethod(e.target.value as PaymentMethod)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </FormField>
          <FormField label={t('common.notes', 'Notes')}>
            <TextInput value={advNotes} onChange={(e) => setAdvNotes(e.target.value)} />
          </FormField>
        </FormLayout>
      </Drawer>

      {/* Process Salary / Bonus Drawer */}
      <Drawer
        open={salDrawerOpen}
        onClose={() => setSalDrawerOpen(false)}
        title={t('payroll.newSalary', 'Process Salary / Bonus')}
        widthClass="max-w-2xl"
      >
        <FormLayout
          onSubmit={() => {
            if (!salEmployeeId || Number(liveSalaryPreview.netAmount) < 0) return;
            createSalMutation.mutate();
          }}
          onCancel={() => setSalDrawerOpen(false)}
          isSubmitting={createSalMutation.isPending}
          labels={{
            save: t('common.save', 'Save'),
            cancel: t('common.cancel', 'Cancel'),
          }}
        >
          <div className="sm:col-span-2">
            <FormField label={t('payroll.employeeName', 'Employee')} required>
              <Select
                value={salEmployeeId}
                onChange={(e) => handleSelectSalaryEmployee(e.target.value)}
                options={[
                  { value: '', label: t('payroll.selectEmployee', 'Select employee...') },
                  ...allEmployees.map((e) => ({
                    value: String(e.id),
                    label: `${e.name} (${e.payType} — Base: ${formatMoney(e.baseRate)})`,
                  })),
                ]}
              />
            </FormField>
          </div>
          <FormField label={t('payroll.periodMonth', 'Salary Month (YYYY-MM)')} required>
            <TextInput
              value={salMonth}
              onChange={(e) => setSalMonth(e.target.value)}
              placeholder="2026-05"
            />
          </FormField>
          <FormField label={t('common.date', 'Payment Date')} required>
            <DatePicker value={salDate} onChange={(e) => setSalDate(e.target.value)} />
          </FormField>
          <FormField
            label={
              salPayType === 'FIXED_MONTHLY'
                ? t('payroll.monthsWorked', 'Months (1.000 = Full Month)')
                : salPayType === 'DAILY_WAGE'
                  ? t('payroll.daysWorked', 'Days Worked')
                  : t('payroll.piecesProcessed', 'Quantity Processed (KG / Bags)')
            }
            required
          >
            <NumberInput precision="weight" value={salUnitsWorked} onChange={setSalUnitsWorked} />
          </FormField>
          <FormField label={t('payroll.rateApplied', 'Rate Applied (PKR)')} required>
            <NumberInput precision="money" value={salRateApplied} onChange={setSalRateApplied} />
          </FormField>
          <FormField label={t('payroll.overtimeAmount', 'Overtime (PKR)')}>
            <NumberInput precision="money" value={salOvertime} onChange={setSalOvertime} />
          </FormField>
          <FormField label={t('payroll.bonusAmount', 'Bonus / Eid Bonus (PKR)')}>
            <NumberInput precision="money" value={salBonus} onChange={setSalBonus} />
          </FormField>
          <FormField label={t('payroll.deductionsAmount', 'Other Deductions / Fine (PKR)')}>
            <NumberInput precision="money" value={salDeductions} onChange={setSalDeductions} />
          </FormField>
          <FormField
            label={t('payroll.advanceDeductedLabel', 'Advance Deduction (Unsettled: {{avail}})', {
              avail: formatMoney(selectedEmployeeForSalary?.unsettledAdvanceBalance ?? '0.00'),
            })}
          >
            <NumberInput
              precision="money"
              value={salAdvanceDeducted}
              onChange={setSalAdvanceDeducted}
            />
          </FormField>
          <FormField label={t('payments.colMethod', 'Payment Method')} required>
            <Select
              value={salMethod}
              onChange={(e) => setSalMethod(e.target.value as PaymentMethod)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </FormField>
          <FormField label={t('common.notes', 'Notes')}>
            <TextInput value={salNotes} onChange={(e) => setSalNotes(e.target.value)} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label={t(
                'payroll.optionalBatch',
                'Link Piece-Rate / Labour to Open Batch (Optional — Flows into Batch Cost/KG)',
              )}
            >
              <Select
                value={salBatchId}
                onChange={(e) => setSalBatchId(e.target.value)}
                options={[
                  {
                    value: '',
                    label: t('payroll.noBatchLink', 'General Operating Payroll (Period P&L)'),
                  },
                  ...(openBatchesQuery.data?.data ?? []).map((b) => ({
                    value: String(b.id),
                    label: `${b.batchNo} — ${b.name}`,
                  })),
                ]}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2 rounded border border-neutral-300 bg-neutral-50 p-3 text-xs">
            <div className="flex justify-between">
              <span>{t('payroll.basicAmount', 'Basic / Earned')}:</span>
              <span className="font-mono">{formatMoney(liveSalaryPreview.basicAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('payroll.grossEarnings', 'Gross Earnings (incl. OT & Bonus)')}:</span>
              <span className="font-mono">{formatMoney(liveSalaryPreview.grossEarnings)}</span>
            </div>
            <div className="flex justify-between text-neutral-700">
              <span>{t('payroll.totalDeductions', 'Total Deductions (incl. Advance)')}:</span>
              <span className="font-mono">-{formatMoney(liveSalaryPreview.totalDeductions)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-neutral-800 pt-1 text-sm font-bold">
              <span>{t('payroll.netPayable', 'Net Payable Salary')}:</span>
              <span className="font-mono">PKR {formatMoney(liveSalaryPreview.netAmount)}</span>
            </div>
          </div>
        </FormLayout>
      </Drawer>

      {/* Printable Salary Slip Dialog */}
      <Dialog
        open={Boolean(slipTarget)}
        onClose={() => setSlipTarget(null)}
        title={t('payroll.salarySlipTitle', 'Printable Salary Slip — {{no}}', {
          no: slipTarget?.salaryNo ?? '',
        })}
        maxWidthClass="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSlipTarget(null)}>
              {t('common.close', 'Close')}
            </Button>
            <Button variant="primary" onClick={handlePrintSalarySlip}>
              {t('print.printButton', 'Print (Ctrl+P)')}
            </Button>
          </div>
        }
      >
        {slipTarget && (
          <div
            ref={slipPrintRef}
            className="rounded border border-neutral-300 bg-white p-5 text-xs"
          >
            <div className="border-b-2 border-neutral-800 pb-2 text-center">
              <div className="text-base font-bold">SALARY & BONUS SLIP / تنخواہ سلپ</div>
              <div className="mt-0.5 font-mono text-xs">
                {slipTarget.salaryNo} · Period: {slipTarget.periodMonth} · Date:{' '}
                {slipTarget.paymentDate}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <strong>Employee / ملازم:</strong> {slipTarget.employeeName}
                {slipTarget.employeeNameUr ? ` (${slipTarget.employeeNameUr})` : ''}
              </div>
              <div className="text-right">
                <strong>Pay Type:</strong> {slipTarget.payType}
              </div>
              <div>
                <strong>Designation:</strong> {slipTarget.designation || '—'}
              </div>
              <div className="text-right">
                <strong>Method:</strong> {slipTarget.method}
              </div>
            </div>
            <table className="mt-3 w-full border-collapse border border-neutral-300">
              <tbody>
                <tr>
                  <td className="border border-neutral-300 px-2 py-1">
                    Basic Earned ({formatWeight(slipTarget.unitsWorked)} ×{' '}
                    {formatMoney(slipTarget.rateApplied)})
                  </td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                    {formatMoney(slipTarget.basicAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-neutral-300 px-2 py-1">Overtime / اوور ٹائم</td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                    +{formatMoney(slipTarget.overtimeAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-neutral-300 px-2 py-1">Bonus / انعام</td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                    +{formatMoney(slipTarget.bonusAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-neutral-300 px-2 py-1">
                    Advance Deducted / ایڈوانس کٹوتی
                  </td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                    -{formatMoney(slipTarget.advanceDeducted)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-neutral-300 px-2 py-1">Other Deductions / کٹوتی</td>
                  <td className="border border-neutral-300 px-2 py-1 text-right font-mono">
                    -{formatMoney(slipTarget.deductionsAmount)}
                  </td>
                </tr>
                <tr className="bg-neutral-100 font-bold">
                  <td className="border border-neutral-300 px-2 py-1.5">
                    Net Amount Paid / صافی ادا شدہ رقم
                  </td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right font-mono text-sm">
                    PKR {formatMoney(slipTarget.netAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="mt-8 grid grid-cols-2 gap-8 pt-4 text-center">
              <div className="border-t border-neutral-400 pt-1">Authorized Signature</div>
              <div className="border-t border-neutral-400 pt-1">
                Employee Signature / دستخط ملازم
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Void Dialog */}
      <Dialog
        open={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        title={t('common.voidTitle', 'Void {{no}}', { no: voidTarget?.no ?? '' })}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={voidReason.trim().length < 3 || voidMutation.isPending}
              onClick={() => voidMutation.mutate()}
            >
              {t('common.confirmVoid', 'Confirm Void')}
            </Button>
          </div>
        }
      >
        <FormField label={t('common.voidReason', 'Reason for Voiding')} required>
          <TextInput
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Enter reason (min 3 characters)"
          />
        </FormField>
      </Dialog>
    </div>
  );
}
