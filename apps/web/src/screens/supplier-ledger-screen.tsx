import {
  type LedgerEntryDto,
  type PageSizeOption,
  type PaymentDto,
  type PurchaseInvoiceDto,
  type PurchaseReturnDto,
  type SortOrder,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  EntityLink,
  FilterBar,
  IntegerText,
  MoneyText,
  PageHeader,
  Pagination,
  RowActions,
  Select,
  StatCard,
  StatusBadge,
  TabsBar,
  WeightText,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchPayments,
  fetchPurchaseInvoices,
  fetchPurchaseReturns,
  fetchSupplierLedger,
  fetchSuppliers,
} from '../lib/api.js';

export interface SupplierLedgerScreenProps {
  readonly initialSupplierId?: number | null;
  readonly canPay: boolean;
  readonly canPurchase: boolean;
  readonly onRecordPayment: (supplierId: number, purchaseInvoiceId?: number) => void;
  readonly onNewPurchase: (supplierId: number) => void;
  readonly onViewPurchaseInvoice: (purchaseId: number) => void;
}

export function SupplierLedgerScreen({
  initialSupplierId,
  canPay,
  canPurchase,
  onRecordPayment,
  onNewPurchase,
  onViewPurchaseInvoice,
}: SupplierLedgerScreenProps) {
  const { t } = useTranslation();

  const suppliersListQuery = useQuery({
    queryKey: ['suppliers', 'dropdown'],
    queryFn: () => fetchSuppliers({ page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const suppliers = useMemo(
    () => suppliersListQuery.data?.data ?? [],
    [suppliersListQuery.data?.data],
  );

  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(initialSupplierId ?? 0);
  const [activeTab, setActiveTab] = useState<'ledger' | 'purchases' | 'returns' | 'payments'>(
    'ledger',
  );

  useEffect(() => {
    if (initialSupplierId) {
      setSelectedSupplierId(initialSupplierId);
    } else if (!selectedSupplierId && suppliers[0]) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [initialSupplierId, selectedSupplierId, suppliers]);

  // Filters & pagination
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refType, setRefType] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  const ledgerQuery = useQuery({
    queryKey: [
      'supplier-ledger',
      selectedSupplierId,
      { page, pageSize, search, dateFrom, dateTo, refType, sortOrder },
    ],
    queryFn: () =>
      fetchSupplierLedger(selectedSupplierId, {
        page,
        pageSize,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        refType: refType || undefined,
        sortOrder,
      }),
    enabled: selectedSupplierId > 0,
  });

  const purchasesQuery = useQuery({
    queryKey: ['purchases', 'by-supplier', selectedSupplierId, page, pageSize],
    queryFn: () =>
      fetchPurchaseInvoices({
        supplierId: selectedSupplierId,
        page,
        pageSize,
        sortOrder: 'desc',
      }),
    enabled: selectedSupplierId > 0 && activeTab === 'purchases',
  });

  const returnsQuery = useQuery({
    queryKey: ['purchase-returns', 'by-supplier', selectedSupplierId, page, pageSize],
    queryFn: () =>
      fetchPurchaseReturns({
        supplierId: selectedSupplierId,
        page,
        pageSize,
        sortOrder: 'desc',
      }),
    enabled: selectedSupplierId > 0 && activeTab === 'returns',
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments', 'by-supplier', selectedSupplierId, page, pageSize],
    queryFn: () =>
      fetchPayments({
        partyType: 'SUPPLIER',
        partyId: selectedSupplierId,
        direction: 'OUT',
        page,
        pageSize,
        sortOrder: 'desc',
      }),
    enabled: selectedSupplierId > 0 && activeTab === 'payments',
  });

  const activeSupplier = ledgerQuery.data?.supplier;

  const ledgerColumns: ColumnDef<LedgerEntryDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'entryDate',
        header: t('suppliers.colEntryDate'),
        size: 115,
        cell: ({ row }) => <span className="erp-num">{row.original.entryDate.slice(0, 10)}</span>,
      },
      {
        id: 'refNo',
        header: t('suppliers.colRefNo'),
        size: 140,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.refType === 'PURCHASE_INVOICE' ? (
            <EntityLink mono onClick={() => onViewPurchaseInvoice(row.original.refId)}>
              {row.original.refNo || `#${row.original.refId}`}
            </EntityLink>
          ) : (
            <span className="erp-num font-medium">
              {row.original.refNo || `#${row.original.refId}`}
            </span>
          ),
      },
      {
        id: 'refType',
        header: t('suppliers.colRefType'),
        size: 145,
        enableSorting: false,
        cell: ({ row }) => {
          const rt = row.original.refType;
          const tone =
            rt === 'PURCHASE_INVOICE'
              ? 'info'
              : rt === 'PAYMENT_OUT' || rt === 'PURCHASE_RETURN'
                ? 'success'
                : rt.includes('VOID')
                  ? 'danger'
                  : 'neutral';
          return <StatusBadge tone={tone}>{rt}</StatusBadge>;
        },
      },
      {
        id: 'paymentMethod',
        header: t('payments.method', 'Method'),
        size: 110,
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original.paymentMethod;
          if (!m) return <span className="text-xs text-[#8c8980]">—</span>;
          const tone =
            m === 'CASH'
              ? 'success'
              : m === 'CHEQUE'
                ? 'info'
                : m === 'BANK_TRANSFER'
                  ? 'neutral'
                  : 'warning';
          const label =
            m === 'BANK_TRANSFER'
              ? 'Bank'
              : m === 'ONLINE_WALLET'
                ? 'Online'
                : m.charAt(0) + m.slice(1).toLowerCase();
          return <StatusBadge tone={tone}>{label}</StatusBadge>;
        },
      },
      {
        id: 'narration',
        header: t('suppliers.colNarration'),
        size: 270,
        enableSorting: false,
        meta: {
          footer: <span className="font-semibold">{t('common.totals')}</span>,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => row.original.narration,
      },
      {
        id: 'debit',
        header: t('suppliers.colDebit'),
        size: 135,
        enableSorting: false,
        meta: {
          align: 'right',
          footer: <MoneyText value={ledgerQuery.data?.totalDebitInRange ?? '0.00'} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          Number(row.original.debit) > 0 ? (
            <MoneyText value={row.original.debit} />
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'credit',
        header: t('suppliers.colCredit'),
        size: 135,
        enableSorting: false,
        meta: {
          align: 'right',
          footer: <MoneyText value={ledgerQuery.data?.totalCreditInRange ?? '0.00'} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          Number(row.original.credit) > 0 ? (
            <MoneyText value={row.original.credit} />
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'balance',
        header: t('suppliers.colRunningBalance'),
        size: 145,
        enableSorting: false,
        meta: {
          align: 'right',
          footer: <MoneyText value={ledgerQuery.data?.closingBalance ?? '0.00'} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.balance} />
          </span>
        ),
      },
    ],
    [
      t,
      onViewPurchaseInvoice,
      ledgerQuery.data?.totalDebitInRange,
      ledgerQuery.data?.totalCreditInRange,
      ledgerQuery.data?.closingBalance,
    ],
  );

  const purchaseColumns: ColumnDef<PurchaseInvoiceDto, unknown>[] = useMemo(
    () => [
      {
        id: 'invoiceNo',
        header: t('purchases.colInvoiceNo'),
        size: 140,
        cell: ({ row }) => (
          <EntityLink mono onClick={() => onViewPurchaseInvoice(row.original.id)}>
            {row.original.invoiceNo}
          </EntityLink>
        ),
      },
      {
        id: 'invoiceDate',
        header: t('purchases.colDate'),
        size: 110,
        cell: ({ row }) => <span className="erp-num">{row.original.invoiceDate.slice(0, 10)}</span>,
      },
      {
        id: 'totalQtyBase',
        header: t('purchases.colTotalQty'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.totalQtyBase} unit="KG" />,
      },
      {
        id: 'total',
        header: t('purchases.colTotal'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} />,
      },
      {
        id: 'paidAmount',
        header: t('purchases.colPaid'),
        size: 120,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.paidAmount} />,
      },
      {
        id: 'balanceDue',
        header: t('purchases.colBalance'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.balanceDue} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('purchases.colStatus'),
        size: 100,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.status === 'PAID'
                ? 'success'
                : row.original.status === 'VOIDED'
                  ? 'danger'
                  : row.original.status === 'PARTIAL'
                    ? 'warning'
                    : 'info'
            }
          >
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 150,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'view',
                label: t('purchases.actionView'),
                inline: true,
                onClick: () => onViewPurchaseInvoice(row.original.id),
              },
              {
                id: 'pay',
                label: t('purchases.actionPay'),
                inline: true,
                disabled:
                  !canPay || row.original.status === 'PAID' || row.original.status === 'VOIDED',
                onClick: () => onRecordPayment(row.original.supplierId, row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [t, canPay, onViewPurchaseInvoice, onRecordPayment],
  );

  const returnColumns: ColumnDef<PurchaseReturnDto, unknown>[] = useMemo(
    () => [
      {
        id: 'returnNo',
        header: t('purchaseReturns.colReturnNo'),
        size: 140,
        cell: ({ row }) => <span className="erp-num font-medium">{row.original.returnNo}</span>,
      },
      {
        id: 'returnDate',
        header: t('purchaseReturns.colDate'),
        size: 110,
        cell: ({ row }) => <span className="erp-num">{row.original.returnDate.slice(0, 10)}</span>,
      },
      {
        id: 'purchaseInvoiceNo',
        header: t('purchaseReturns.colPurchaseNo'),
        size: 140,
        cell: ({ row }) => (
          <EntityLink mono onClick={() => onViewPurchaseInvoice(row.original.purchaseId)}>
            {row.original.purchaseInvoiceNo}
          </EntityLink>
        ),
      },
      {
        id: 'reasonCode',
        header: t('purchaseReturns.colReason'),
        size: 140,
        cell: ({ row }) => t(`purchaseReturns.reasons.${row.original.reasonCode}`),
      },
      {
        id: 'totalQtyBase',
        header: t('purchaseReturns.colQtyBase'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.totalQtyBase} unit="KG" />,
      },
      {
        id: 'total',
        header: t('purchaseReturns.colTotal'),
        size: 135,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} />,
      },
    ],
    [t, onViewPurchaseInvoice],
  );

  const paymentColumns: ColumnDef<PaymentDto, unknown>[] = useMemo(
    () => [
      {
        id: 'paymentNo',
        header: t('payments.colPaymentNo'),
        size: 150,
        cell: ({ row }) => <span className="erp-num font-medium">{row.original.paymentNo}</span>,
      },
      {
        id: 'paymentDate',
        header: t('payments.colDate'),
        size: 110,
        cell: ({ row }) => <span className="erp-num">{row.original.paymentDate.slice(0, 10)}</span>,
      },
      {
        id: 'method',
        header: t('payments.colMethod'),
        size: 130,
        cell: ({ row }) => (
          <StatusBadge tone="neutral">{t(`payments.methods.${row.original.method}`)}</StatusBadge>
        ),
      },
      {
        id: 'referenceNo',
        header: t('payments.colReference'),
        size: 160,
        cell: ({ row }) =>
          [row.original.bankName, row.original.referenceNo].filter(Boolean).join(' · ') || '—',
      },
      {
        id: 'amount',
        header: t('payments.colAmount'),
        size: 135,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.amount} />,
      },
      {
        id: 'status',
        header: t('payments.colStatus'),
        size: 100,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={
          activeSupplier
            ? `${activeSupplier.name}${activeSupplier.nameUr ? ` (${activeSupplier.nameUr})` : ''}`
            : t('suppliers.profile360Title')
        }
        subtitle={t('suppliers.profile360Title')}
        primaryAction={
          canPay && selectedSupplierId > 0
            ? {
                label: t('payments.newPayment'),
                onClick: () => onRecordPayment(selectedSupplierId),
              }
            : undefined
        }
        secondaryActions={
          canPurchase && selectedSupplierId > 0 ? (
            <Button variant="secondary" onClick={() => onNewPurchase(selectedSupplierId)}>
              {t('purchases.newPurchase')}
            </Button>
          ) : undefined
        }
      />

      {/* Supplier Selector + 360 Summary Cards */}
      <div className="border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#5c5a53]">{t('purchases.supplier')}:</span>
            <div className="w-72">
              <Select
                value={selectedSupplierId ? String(selectedSupplierId) : ''}
                onChange={(e) => {
                  setSelectedSupplierId(Number(e.target.value));
                  setPage(1);
                }}
                options={suppliers.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (Payable: ${s.currentBalance})`,
                }))}
              />
            </div>
          </div>

          {activeSupplier && (
            <div className="text-xs text-[#5c5a53]">
              {activeSupplier.phone && <span className="me-3">📞 {activeSupplier.phone}</span>}
              {activeSupplier.contactPerson && (
                <span className="me-3">👤 {activeSupplier.contactPerson}</span>
              )}
              {activeSupplier.taxNo && <span>NTN: {activeSupplier.taxNo}</span>}
            </div>
          )}
        </div>

        {activeSupplier && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={t('suppliers.statOpening')}
              value={<MoneyText value={activeSupplier.openingBalance} />}
            />
            <StatCard
              label={t('suppliers.statPurchased')}
              value={<MoneyText value={activeSupplier.totalPurchased} />}
            />
            <StatCard
              label={t('suppliers.statPaid')}
              value={<MoneyText value={activeSupplier.totalPaid} />}
            />
            <StatCard
              label={t('suppliers.statPayable')}
              value={<MoneyText value={activeSupplier.currentBalance} />}
            />
          </div>
        )}
      </div>

      <TabsBar
        activeId={activeTab}
        onChange={(id) => {
          setActiveTab(id as typeof activeTab);
          setPage(1);
        }}
        tabs={[
          {
            id: 'ledger',
            label: t('suppliers.tabLedger'),
            badge: ledgerQuery.data?.entries.total,
          },
          {
            id: 'purchases',
            label: t('suppliers.tabPurchases'),
            badge: purchasesQuery.data?.total,
          },
          {
            id: 'returns',
            label: t('suppliers.tabReturns'),
            badge: returnsQuery.data?.total,
          },
          {
            id: 'payments',
            label: t('suppliers.tabPayments'),
            badge: paymentsQuery.data?.total,
          },
        ]}
      />

      {activeTab === 'ledger' && (
        <>
          <FilterBar
            searchValue={search}
            searchPlaceholder={t('purchases.searchPlaceholder')}
            onSearchChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            dateFrom={dateFrom}
            dateTo={dateTo}
            dateFromLabel={t('common.from')}
            dateToLabel={t('common.to')}
            onDateFromChange={(val) => {
              setDateFrom(val);
              setPage(1);
            }}
            onDateToChange={(val) => {
              setDateTo(val);
              setPage(1);
            }}
            selects={[
              {
                id: 'refType',
                label: t('suppliers.colRefType'),
                value: refType,
                allLabel: t('suppliers.allTypes'),
                options: [
                  { value: 'OPENING_BALANCE', label: 'OPENING_BALANCE' },
                  { value: 'PURCHASE_INVOICE', label: 'PURCHASE_INVOICE' },
                  { value: 'PURCHASE_RETURN', label: 'PURCHASE_RETURN' },
                  { value: 'PAYMENT_OUT', label: 'PAYMENT_OUT' },
                ],
                onChange: (val) => {
                  setRefType(val);
                  setPage(1);
                },
              },
            ]}
            clearLabel={t('common.clear')}
            onClear={() => {
              setSearch('');
              setDateFrom('');
              setDateTo('');
              setRefType('');
              setPage(1);
            }}
          />

          <DataTable
            columns={ledgerColumns}
            data={ledgerQuery.data?.entries.data ?? []}
            getRowId={(r) => String(r.id)}
            sortBy="id"
            sortOrder={sortOrder}
            onSortChange={(_, order) => setSortOrder(order)}
            isLoading={ledgerQuery.isLoading}
            zebra
            emptyTitle={t('suppliers.ledgerEmptyTitle')}
            emptyDescription={t('suppliers.ledgerEmptyDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />

          <Pagination
            page={page}
            pageSize={pageSize}
            total={ledgerQuery.data?.entries.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('common.rowsPerPage'),
              showingRange: (from, to, total) => t('common.showingRange', { from, to, total }),
              firstPage: t('common.firstPage'),
              previousPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
              lastPage: t('common.lastPage'),
            }}
          />
        </>
      )}

      {activeTab === 'purchases' && (
        <>
          <DataTable
            columns={purchaseColumns}
            data={purchasesQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            onRowClick={(r) => onViewPurchaseInvoice(r.id)}
            isLoading={purchasesQuery.isLoading}
            zebra
            emptyTitle={t('purchases.emptyTitle')}
            emptyDescription={t('purchases.emptyDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={purchasesQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('common.rowsPerPage'),
              showingRange: (from, to, total) => t('common.showingRange', { from, to, total }),
              firstPage: t('common.firstPage'),
              previousPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
              lastPage: t('common.lastPage'),
            }}
          />
        </>
      )}

      {activeTab === 'returns' && (
        <>
          <DataTable
            columns={returnColumns}
            data={returnsQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            isLoading={returnsQuery.isLoading}
            zebra
            emptyTitle={t('purchaseReturns.emptyTitle')}
            emptyDescription={t('purchaseReturns.emptyDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={returnsQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('common.rowsPerPage'),
              showingRange: (from, to, total) => t('common.showingRange', { from, to, total }),
              firstPage: t('common.firstPage'),
              previousPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
              lastPage: t('common.lastPage'),
            }}
          />
        </>
      )}

      {activeTab === 'payments' && (
        <>
          <DataTable
            columns={paymentColumns}
            data={paymentsQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            isLoading={paymentsQuery.isLoading}
            zebra
            emptyTitle={t('payments.emptyTitle')}
            emptyDescription={t('payments.emptyDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={paymentsQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            labels={{
              rowsPerPage: t('common.rowsPerPage'),
              showingRange: (from, to, total) => t('common.showingRange', { from, to, total }),
              firstPage: t('common.firstPage'),
              previousPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
              lastPage: t('common.lastPage'),
            }}
          />
        </>
      )}
    </div>
  );
}
