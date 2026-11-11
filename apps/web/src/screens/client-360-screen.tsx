import {
  type LedgerEntryDto,
  type PageSizeOption,
  type SaleInvoiceDto,
  type SaleReturnDto,
  type SortOrder,
} from '@mini-erp/shared';
import {
  Button,
  Combobox,
  DataTable,
  FilterBar,
  IntegerText,
  MoneyText,
  PageHeader,
  Pagination,
  RowActions,
  StatCard,
  StatusBadge,
  TabsBar,
  WeightText,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import { fetchClientLedger, fetchClients, fetchSaleReturns, fetchSales } from '../lib/api.js';

export interface Client360ScreenProps {
  readonly initialClientId?: number | null;
  readonly canCreateSale: boolean;
  readonly canReceivePayment?: boolean;
  readonly onNewSale: (clientId: number) => void;
  readonly onReceivePayment?: (clientId: number) => void;
  readonly onViewSaleInvoice: (saleId: number) => void;
  readonly onCreateCreditNote: (saleId: number) => void;
}

export function Client360Screen({
  initialClientId,
  canCreateSale,
  canReceivePayment = false,
  onNewSale,
  onReceivePayment,
  onViewSaleInvoice,
  onCreateCreditNote,
}: Client360ScreenProps) {
  const clientsListQuery = useQuery({
    queryKey: ['clients', 'dropdown'],
    queryFn: () => fetchClients({ page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const clients = useMemo(() => clientsListQuery.data?.data ?? [], [clientsListQuery.data?.data]);

  const [selectedClientId, setSelectedClientId] = useState<number>(initialClientId ?? 0);
  const [activeTab, setActiveTab] = useState<'ledger' | 'sales' | 'returns'>('ledger');

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
      setPage(1);
    }
  }, [initialClientId]);

  useEffect(() => {
    if (!initialClientId && !selectedClientId && clients[0]) {
      setSelectedClientId(clients[0].id);
    }
  }, [initialClientId, selectedClientId, clients]);

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
      'client-ledger',
      selectedClientId,
      { page, pageSize, search, dateFrom, dateTo, refType, sortOrder },
    ],
    queryFn: () =>
      fetchClientLedger(selectedClientId, {
        page,
        pageSize,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        refType: refType || undefined,
      }),
    enabled: selectedClientId > 0,
  });

  const salesQuery = useQuery({
    queryKey: ['sales', 'by-client', selectedClientId, page, pageSize],
    queryFn: () =>
      fetchSales({
        clientId: selectedClientId,
        page,
        pageSize,
        sortOrder: 'desc',
      }),
    enabled: selectedClientId > 0 && activeTab === 'sales',
  });

  const returnsQuery = useQuery({
    queryKey: ['sale-returns', 'by-client', selectedClientId, page, pageSize],
    queryFn: () =>
      fetchSaleReturns({
        clientId: selectedClientId,
        page,
        pageSize,
        sortOrder: 'desc',
      }),
    enabled: selectedClientId > 0 && activeTab === 'returns',
  });

  const client = ledgerQuery.data?.client;

  const isOverLimit = useMemo(() => {
    if (!client) return false;
    const bal = new Decimal(client.currentBalance || 0);
    const lim = new Decimal(client.creditLimit || 0);
    return lim.gt(0) && bal.gt(lim);
  }, [client]);

  const ledgerColumns = useMemo<ColumnDef<LedgerEntryDto, unknown>[]>(
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
        accessorKey: 'entryDate',
        header: 'Date',
        size: 105,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.entryDate.slice(0, 10)}</span>
        ),
      },
      {
        id: 'refNo',
        accessorKey: 'refNo',
        header: 'Ref No',
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-[#1f1e1b]">{row.original.refNo}</span>
        ),
      },
      {
        id: 'refType',
        accessorKey: 'refType',
        header: 'Type',
        size: 120,
        cell: ({ row }) => <StatusBadge tone="neutral">{row.original.refType}</StatusBadge>,
      },
      {
        id: 'paymentMethod',
        header: 'Method',
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
        accessorKey: 'narration',
        header: 'Narration',
        cell: ({ row }) => <span className="text-xs text-[#3b3934]">{row.original.narration}</span>,
      },
      {
        id: 'debit',
        accessorKey: 'debit',
        header: 'Debit (+)',
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          new Decimal(row.original.debit).gt(0) ? (
            <MoneyText value={row.original.debit} className="text-[#9e3b33]" />
          ) : (
            <span className="text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'credit',
        accessorKey: 'credit',
        header: 'Credit (-)',
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          new Decimal(row.original.credit).gt(0) ? (
            <MoneyText value={row.original.credit} className="text-[#2c6b48]" />
          ) : (
            <span className="text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'balance',
        accessorKey: 'balance',
        header: 'Running Balance',
        size: 145,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <MoneyText
            value={row.original.balance}
            className={
              new Decimal(row.original.balance).gt(0) ? 'font-semibold text-[#9e3b33]' : ''
            }
          />
        ),
      },
    ],
    [],
  );

  const salesColumns = useMemo<ColumnDef<SaleInvoiceDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'invoiceNo',
        accessorKey: 'invoiceNo',
        header: 'Invoice No',
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-[#1f1e1b]">
            {row.original.invoiceNo}
          </span>
        ),
      },
      {
        id: 'saleDate',
        accessorKey: 'saleDate',
        header: 'Date',
        size: 110,
      },
      {
        id: 'totalQtyBase',
        accessorKey: 'totalQtyBase',
        header: 'Qty (KG)',
        size: 110,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.totalQtyBase} />,
      },
      {
        id: 'total',
        accessorKey: 'total',
        header: 'Invoice Total',
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} />,
      },
      {
        id: 'totalProfit',
        accessorKey: 'totalProfit',
        header: 'Net Profit',
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex flex-col items-end">
            <MoneyText
              value={row.original.totalProfit}
              className={
                new Decimal(row.original.totalProfit).gte(0) ? 'text-[#2c6b48]' : 'text-[#9e3b33]'
              }
            />
            <span className="font-mono text-[10px] text-[#6f6c64]">
              {row.original.profitMarginPercent}%
            </span>
          </div>
        ),
      },
      {
        id: 'balanceDue',
        accessorKey: 'balanceDue',
        header: 'Balance Due',
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <MoneyText
            value={row.original.balanceDue}
            className={new Decimal(row.original.balanceDue).gt(0) ? 'text-[#9e3b33]' : ''}
          />
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        size: 110,
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.status === 'PAID'
                ? 'success'
                : row.original.status === 'VOIDED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 150,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'view',
                label: 'View',
                inline: true,
                onClick: () => onViewSaleInvoice(row.original.id),
              },
              {
                id: 'return',
                label: 'Credit Note',
                inline: true,
                disabled: row.original.status === 'VOIDED',
                onClick: () => onCreateCreditNote(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [onViewSaleInvoice, onCreateCreditNote],
  );

  const returnsColumns = useMemo<ColumnDef<SaleReturnDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'returnNo',
        accessorKey: 'returnNo',
        header: 'Credit Note No',
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-[#1f1e1b]">
            {row.original.returnNo}
          </span>
        ),
      },
      {
        id: 'returnDate',
        accessorKey: 'returnDate',
        header: 'Date',
        size: 110,
      },
      {
        id: 'invoiceNo',
        accessorKey: 'invoiceNo',
        header: 'Original Invoice',
        size: 140,
      },
      {
        id: 'reasonCode',
        accessorKey: 'reasonCode',
        header: 'Reason',
        size: 130,
      },
      {
        id: 'total',
        accessorKey: 'total',
        header: 'Credit Total',
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} className="text-[#2c6b48]" />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        size: 100,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={client ? `Client 360° — ${client.name}` : 'Client 360° & Statement'}
        subtitle={
          client
            ? `${client.routeName ? `Route: ${client.routeName} · ` : ''}${client.phone ?? 'No phone'} · Recovery: ${client.recoveryDay}`
            : 'Select a client to inspect append-only ledger, credit exposure, sales, and credit notes'
        }
        secondaryActions={
          canReceivePayment && onReceivePayment && selectedClientId > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onReceivePayment(selectedClientId)}
            >
              Receive Payment
            </Button>
          ) : undefined
        }
        primaryAction={
          canCreateSale && selectedClientId > 0
            ? {
                label: 'New Sale Invoice',
                onClick: () => onNewSale(selectedClientId),
              }
            : undefined
        }
      />

      {/* Client Selector & KPI Strip */}
      <div className="border-b border-[#d6d3c9] bg-[#f7f6f2] px-5 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
              Client Account:
            </span>
            <div className="w-80">
              <Combobox
                value={selectedClientId ? String(selectedClientId) : ''}
                placeholder="Search client…"
                searchPlaceholder="Type client name or code…"
                onChange={(val) => {
                  if (val) {
                    setSelectedClientId(Number(val));
                    setPage(1);
                  }
                }}
                options={clients.map((c) => ({
                  value: String(c.id),
                  label: `${c.name}${c.nameUr ? ` (${c.nameUr})` : ''}`,
                  subtitle: `Receivable: ${c.currentBalance}`,
                }))}
              />
            </div>
          </div>

          {isOverLimit && (
            <div className="rounded border border-[#d88c84] bg-[#fbf2f1] px-3 py-1 text-xs font-medium text-[#9e3b33]">
              Credit Limit Exceeded: Current Receivable ({client?.currentBalance}) exceeds limit (
              {client?.creditLimit})
            </div>
          )}
        </div>

        {client && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label="Current Receivable"
              value={<MoneyText value={client.currentBalance} />}
              hint="Total net balance due from client"
            />
            <StatCard
              label="Period Debits (Sales)"
              value={<MoneyText value={ledgerQuery.data?.totalDebitInRange ?? '0.00'} />}
              hint="Total sales billed in filter range"
            />
            <StatCard
              label="Period Credits (Receipts / CRN)"
              value={<MoneyText value={ledgerQuery.data?.totalCreditInRange ?? '0.00'} />}
              hint="Payments & returns in filter range"
            />
            <StatCard
              label="Credit Limit"
              value={<MoneyText value={client.creditLimit} />}
              hint={isOverLimit ? 'Over credit limit' : 'Within credit limit'}
            />
            <StatCard
              label="Opening Balance"
              value={<MoneyText value={client.openingBalance} />}
              hint={`Recovery Day: ${client.recoveryDay}`}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <TabsBar
        activeId={activeTab}
        onChange={(id) => {
          setActiveTab(id as 'ledger' | 'sales' | 'returns');
          setPage(1);
        }}
        tabs={[
          { id: 'ledger', label: 'Running Statement (Ledger)', badge: ledgerQuery.data?.total },
          { id: 'sales', label: 'Sales Invoices', badge: salesQuery.data?.total },
          { id: 'returns', label: 'Credit Notes (Returns)', badge: returnsQuery.data?.total },
        ]}
      />

      {activeTab === 'ledger' && (
        <>
          <FilterBar
            searchValue={search}
            searchPlaceholder="Search narration or reference number…"
            onSearchChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            selects={[
              {
                id: 'refType',
                label: 'Entry Type',
                value: refType,
                allLabel: 'All Entries',
                options: [
                  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
                  { value: 'SALE_INVOICE', label: 'Sale Invoice' },
                  { value: 'SALE_VOID', label: 'Sale Void' },
                  { value: 'SALE_RETURN', label: 'Credit Note (Return)' },
                  { value: 'SALE_RETURN_VOID', label: 'Return Void' },
                  { value: 'PAYMENT_IN', label: 'Payment Received' },
                ],
                onChange: (val) => {
                  setRefType(val);
                  setPage(1);
                },
              },
            ]}
            dateFromLabel="From"
            dateToLabel="To"
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={(val: string) => {
              setDateFrom(val);
              setPage(1);
            }}
            onDateToChange={(val: string) => {
              setDateTo(val);
              setPage(1);
            }}
            clearLabel="Reset"
            onClear={() => {
              setSearch('');
              setRefType('');
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
          />

          <DataTable
            columns={ledgerColumns}
            data={ledgerQuery.data?.entries ?? []}
            getRowId={(r) => String(r.id)}
            sortBy="entryDate"
            sortOrder={sortOrder}
            onSortChange={(_, order) => setSortOrder(order)}
            isLoading={ledgerQuery.isLoading}
            zebra
            emptyTitle="No ledger entries found"
            emptyDescription="Transactions for this client will appear here in append-only chronological order."
            columnsButtonLabel="Columns"
            loadingLabel="Loading statement…"
          />

          <Pagination
            page={page}
            pageSize={pageSize}
            total={ledgerQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            labels={{
              rowsPerPage: 'Rows per page',
              showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
              firstPage: 'First',
              previousPage: 'Prev',
              nextPage: 'Next',
              lastPage: 'Last',
            }}
          />
        </>
      )}

      {activeTab === 'sales' && (
        <>
          <DataTable
            columns={salesColumns}
            data={salesQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            isLoading={salesQuery.isLoading}
            zebra
            emptyTitle="No sales invoices for this client"
            emptyDescription="Create a sale invoice to bill batches to this client."
            columnsButtonLabel="Columns"
            loadingLabel="Loading sales…"
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={salesQuery.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            labels={{
              rowsPerPage: 'Rows per page',
              showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
              firstPage: 'First',
              previousPage: 'Prev',
              nextPage: 'Next',
              lastPage: 'Last',
            }}
          />
        </>
      )}

      {activeTab === 'returns' && (
        <>
          <DataTable
            columns={returnsColumns}
            data={returnsQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            isLoading={returnsQuery.isLoading}
            zebra
            emptyTitle="No credit notes for this client"
            emptyDescription="Sale returns issued against this client's invoices will appear here."
            columnsButtonLabel="Columns"
            loadingLabel="Loading credit notes…"
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
              rowsPerPage: 'Rows per page',
              showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
              firstPage: 'First',
              previousPage: 'Prev',
              nextPage: 'Next',
              lastPage: 'Last',
            }}
          />
        </>
      )}
    </div>
  );
}
