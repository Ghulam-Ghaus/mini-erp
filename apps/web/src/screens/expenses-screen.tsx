import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  type ExpenseDto,
  type ExpenseStatus,
  type PageSizeOption,
  type PaymentMethod,
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
  TextInput,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import {
  createExpense,
  createExpenseCategory,
  fetchBatches,
  fetchExpenseCategories,
  fetchExpenses,
  voidExpense,
} from '../lib/api';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpensesScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Create Expense Drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('0.00');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [batchId, setBatchId] = useState('');
  const [description, setDescription] = useState('');

  // Create Category Modal state
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catNameUr, setCatNameUr] = useState('');

  // Void Dialog state
  const [voidTarget, setVoidTarget] = useState<ExpenseDto | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: fetchExpenseCategories,
  });

  const openBatchesQuery = useQuery({
    queryKey: ['batches', 'open-for-expenses'],
    queryFn: () => fetchBatches({ page: 1, pageSize: 100, status: 'OPEN' }),
    enabled: createOpen,
  });

  const expensesQuery = useQuery({
    queryKey: [
      'expenses',
      { page, pageSize, search, categoryFilter, statusFilter, dateFrom, dateTo },
    ],
    queryFn: () =>
      fetchExpenses({
        page,
        pageSize,
        search: search.trim() || undefined,
        categoryId: categoryFilter ? Number(categoryFilter) : undefined,
        status: (statusFilter || undefined) as ExpenseStatus | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const resetForm = () => {
    setExpenseDate(todayIso());
    setAmount('0.00');
    setMethod('CASH');
    setReferenceNo('');
    setPaidTo('');
    setBatchId('');
    setDescription('');
  };

  const createMutation = useMutation({
    mutationFn: (andNew: boolean) =>
      createExpense({
        expenseDate,
        categoryId: Number(categoryId),
        amount,
        method,
        referenceNo: referenceNo.trim() || null,
        paidTo: paidTo.trim() || null,
        batchId: batchId ? Number(batchId) : null,
        description: description.trim(),
      }).then((res) => ({ res, andNew })),
    onSuccess: ({ res, andNew }) => {
      showToast({
        tone: 'success',
        title: t('expenses.createdToast', 'Expense {{no}} recorded', { no: res.expenseNo }),
      });
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['batches'] });
      void queryClient.invalidateQueries({ queryKey: ['net-profit-summary'] });
      resetForm();
      if (!andNew) {
        setCreateOpen(false);
      }
    },
    onError: (err: Error) => {
      showToast({ tone: 'danger', title: err.message });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      createExpenseCategory({
        name: catName.trim(),
        nameUr: catNameUr.trim() || null,
        isActive: true,
      }),
    onSuccess: (created) => {
      showToast({
        tone: 'success',
        title: t('expenses.categoryCreatedToast', 'Category "{{name}}" added', {
          name: created.name,
        }),
      });
      setCatModalOpen(false);
      setCatName('');
      setCatNameUr('');
      setCategoryId(String(created.id));
      void queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    },
    onError: (err: Error) => {
      showToast({ tone: 'danger', title: err.message });
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => {
      if (!voidTarget) throw new Error('No expense selected');
      return voidExpense(voidTarget.id, voidReason.trim());
    },
    onSuccess: () => {
      showToast({
        tone: 'success',
        title: t('expenses.voidedToast', 'Expense voided'),
      });
      setVoidTarget(null);
      setVoidReason('');
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['batches'] });
      void queryClient.invalidateQueries({ queryKey: ['net-profit-summary'] });
    },
    onError: (err: Error) => {
      showToast({ tone: 'danger', title: err.message });
    },
  });

  const columns = useMemo<ColumnDef<ExpenseDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'expenseNo',
        header: t('expenses.expenseNo', 'Voucher No'),
        cell: ({ row }) => (
          <span className="font-mono font-medium text-neutral-900">{row.original.expenseNo}</span>
        ),
      },
      {
        accessorKey: 'expenseDate',
        header: t('common.date', 'Date'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.expenseDate}</span>,
      },
      {
        accessorKey: 'categoryName',
        header: t('expenses.category', 'Category'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-neutral-900">{row.original.categoryName}</div>
            {row.original.categoryNameUr && (
              <div className="text-xs text-neutral-500">{row.original.categoryNameUr}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'description',
        header: t('common.description', 'Description'),
        cell: ({ row }) => (
          <div>
            <div className="text-neutral-900">{row.original.description}</div>
            {row.original.paidTo && (
              <div className="text-xs text-neutral-500">
                {t('expenses.paidTo', 'Paid To')}: {row.original.paidTo}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'batchNo',
        header: t('expenses.batchLink', 'Cost Scope'),
        cell: ({ row }) =>
          row.original.batchNo ? (
            <StatusBadge tone="info">{row.original.batchNo}</StatusBadge>
          ) : (
            <span className="text-xs text-neutral-500">
              {t('expenses.operatingScope', 'Operating Expense')}
            </span>
          ),
      },
      {
        accessorKey: 'method',
        header: t('payments.colMethod', 'Method'),
        cell: ({ row }) => <span className="text-xs">{row.original.method}</span>,
      },
      {
        accessorKey: 'amount',
        header: t('common.amount', 'Amount'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.amount} />,
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
                disabled: row.original.status === 'VOIDED',
                onClick: () => {
                  setVoidTarget(row.original);
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

  const summary = expensesQuery.data?.summary;
  const categories = categoriesQuery.data ?? [];
  const openBatches = openBatchesQuery.data?.data ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('expenses.title', 'Operating & Batch Expenses')}
        subtitle={t(
          'expenses.subtitle',
          'Record shop/warehouse rent, utility bills, fuel, maintenance, or batch-specific expenses',
        )}
        primaryAction={{
          label: t('expenses.newExpense', 'Record Expense'),
          shortcutHint: 'Ctrl+N',
          onClick: () => {
            resetForm();
            if (!categoryId && categories[0]) {
              setCategoryId(String(categories[0].id));
            }
            setCreateOpen(true);
          },
        }}
        secondaryActions={
          <Button variant="secondary" size="sm" onClick={() => setCatModalOpen(true)}>
            {t('expenses.addCategory', '+ Add Category')}
          </Button>
        }
      />

      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label={t('expenses.statOperating', 'Operating Expenses (Deducted from Net Profit)')}
            value={<MoneyText value={summary.operatingTotal} />}
          />
          <StatCard
            label={t('expenses.statBatchLinked', 'Batch-Linked Expenses (Capitalized into COGS)')}
            value={<MoneyText value={summary.batchLinkedTotal} />}
          />
          <StatCard
            label={t('expenses.statTotal', 'Total Posted Expenses')}
            value={<MoneyText value={summary.combinedTotal} />}
          />
        </div>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder={t(
          'expenses.searchPlaceholder',
          'Search voucher no, category, description, or payee...',
        )}
        selects={[
          {
            id: 'category',
            label: t('expenses.category', 'Category'),
            value: categoryFilter,
            allLabel: t('expenses.allCategories', 'All Categories'),
            options: categories.map((c) => ({ value: String(c.id), label: c.name })),
            onChange: (val) => {
              setCategoryFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: t('common.status', 'Status'),
            value: statusFilter,
            allLabel: t('common.allStatuses', 'All Statuses'),
            options: EXPENSE_STATUSES.map((st) => ({ value: st, label: st })),
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(val) => {
          setDateFrom(val);
          setPage(1);
        }}
        onDateToChange={(val) => {
          setDateTo(val);
          setPage(1);
        }}
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setSearch('');
          setCategoryFilter('');
          setStatusFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={expensesQuery.data?.data ?? []}
        isLoading={expensesQuery.isLoading}
        emptyTitle={t('expenses.emptyTitle', 'No expenses recorded yet')}
        emptyDescription={t(
          'expenses.emptyDescription',
          'Record operating expenses (rent, bills, fuel) so Net Profit is accurately calculated.',
        )}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={expensesQuery.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
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

      {/* Record Expense Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('expenses.newExpense', 'Record Expense')}
        widthClass="max-w-2xl"
      >
        <FormLayout
          onSubmit={() => {
            if (!categoryId || !description.trim() || Number(amount) <= 0) return;
            createMutation.mutate(false);
          }}
          onSaveAndNew={() => {
            if (!categoryId || !description.trim() || Number(amount) <= 0) return;
            createMutation.mutate(true);
          }}
          onCancel={() => setCreateOpen(false)}
          isSubmitting={createMutation.isPending}
          labels={{
            save: t('common.save', 'Save'),
            saveAndNew: t('common.saveAndNew', 'Save & New'),
            cancel: t('common.cancel', 'Cancel'),
          }}
        >
          <FormField label={t('common.date', 'Expense Date')} required>
            <DatePicker value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </FormField>
          <FormField label={t('expenses.category', 'Expense Category')} required>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={[
                { value: '', label: t('expenses.selectCategory', 'Select category...') },
                ...categories.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </FormField>
          <FormField label={t('common.amount', 'Amount (PKR)')} required>
            <NumberInput precision="money" value={amount} onChange={setAmount} />
          </FormField>
          <FormField label={t('payments.colMethod', 'Payment Method')} required>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </FormField>
          <FormField label={t('expenses.paidTo', 'Paid To (Person / Vendor)')}>
            <TextInput
              value={paidTo}
              onChange={(e) => setPaidTo(e.target.value)}
              placeholder="e.g. LESCO / Landlord / Mechanic"
            />
          </FormField>
          <FormField label={t('payments.colRef', 'Reference / Bill No')}>
            <TextInput
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder={t('common.optional', 'Optional')}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField
              label={t(
                'expenses.optionalBatch',
                'Link to Open Batch (Optional — Leave blank for general operating expense)',
              )}
            >
              <Select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                options={[
                  {
                    value: '',
                    label: t('expenses.noBatchLink', 'General Operating Expense (Period P&L)'),
                  },
                  ...openBatches.map((b) => ({
                    value: String(b.id),
                    label: `${b.batchNo} — ${b.name}`,
                  })),
                ]}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label={t('common.description', 'Description / Particulars')} required>
              <TextInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Monthly warehouse rent for May 2026"
              />
            </FormField>
          </div>
        </FormLayout>
      </Drawer>

      {/* Add Category Dialog */}
      <Dialog
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={t('expenses.addCategoryTitle', 'Add Expense Category')}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!catName.trim() || createCategoryMutation.isPending}
              onClick={() => createCategoryMutation.mutate()}
            >
              {t('common.save', 'Save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <FormField label={t('common.name', 'Category Name (English)')} required>
            <TextInput value={catName} onChange={(e) => setCatName(e.target.value)} />
          </FormField>
          <FormField label={t('common.nameUr', 'Category Name (Urdu)')}>
            <TextInput dir="rtl" value={catNameUr} onChange={(e) => setCatNameUr(e.target.value)} />
          </FormField>
        </div>
      </Dialog>

      {/* Void Expense Dialog */}
      <Dialog
        open={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        title={t('expenses.voidTitle', 'Void Expense — {{no}}', {
          no: voidTarget?.expenseNo ?? '',
        })}
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
