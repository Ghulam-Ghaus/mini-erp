import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  REPORT_PAYMENT_STATUSES,
  formatMoney,
  formatWeight,
  type CashBookEntryDto,
  type DashboardBatchPerformanceRowDto,
  type DetailedSalesReportRowDto,
  type ReceivableAgingRowDto,
  type ReportPaymentStatus,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  FilterBar,
  MoneyText,
  PageHeader,
  StatCard,
  StatusBadge,
  TabsBar,
  useHotkeys,
  type ColumnDef,
} from '@mini-erp/ui';
import {
  fetchBatches,
  fetchClients,
  fetchDashboardReport,
  fetchDetailedSalesReport,
  fetchItems,
  fetchOtherReportsSummary,
  fetchRoutes,
} from '../lib/api.js';

type ReportTab = 'detailed-sales' | 'batch-profitability' | 'cash-book' | 'receivable-aging';

function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];
  // UTF-8 BOM so Excel opens English & Urdu characters cleanly
  const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReportsScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReportTab>('detailed-sales');

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [batchId, setBatchId] = useState('');
  const [clientId, setClientId] = useState('');
  const [itemId, setItemId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  // Filter lookup queries
  const batchesLookup = useQuery({
    queryKey: ['batches', 'reports-lookup'],
    queryFn: () => fetchBatches({ page: 1, pageSize: 100 }),
  });
  const clientsLookup = useQuery({
    queryKey: ['clients', 'reports-lookup'],
    queryFn: () => fetchClients({ page: 1, pageSize: 100 }),
  });
  const itemsLookup = useQuery({
    queryKey: ['items', 'reports-lookup'],
    queryFn: () => fetchItems({ page: 1, pageSize: 100 }),
  });
  const routesLookup = useQuery({
    queryKey: ['routes', 'reports-lookup'],
    queryFn: () => fetchRoutes({ page: 1, pageSize: 100 }),
  });

  // 1. Detailed Sales Report Query (Section 5.4)
  const detailedSalesQuery = useQuery({
    queryKey: [
      'reports',
      'detailed-sales',
      dateFrom,
      dateTo,
      batchId,
      clientId,
      itemId,
      routeId,
      paymentStatus,
      search,
    ],
    queryFn: () =>
      fetchDetailedSalesReport({
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(batchId ? { batchId: Number(batchId) } : {}),
        ...(clientId ? { clientId: Number(clientId) } : {}),
        ...(itemId ? { itemId: Number(itemId) } : {}),
        ...(routeId ? { routeId: Number(routeId) } : {}),
        ...(paymentStatus ? { paymentStatus: paymentStatus as ReportPaymentStatus } : {}),
        ...(search ? { search } : {}),
      }),
    enabled: activeTab === 'detailed-sales',
  });

  // 2. Batch Profitability Query
  const batchDashboardQuery = useQuery({
    queryKey: ['reports', 'dashboard-batches', dateFrom, dateTo],
    queryFn: () =>
      fetchDashboardReport({
        preset: dateFrom || dateTo ? 'CUSTOM' : 'THIS_MONTH',
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }),
    enabled: activeTab === 'batch-profitability',
  });

  // 3. Cash Book & Receivable Aging Query (Section 5.5)
  const otherReportsQuery = useQuery({
    queryKey: ['reports', 'other-summary', dateFrom, dateTo],
    queryFn: () =>
      fetchOtherReportsSummary({
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }),
    enabled: activeTab === 'cash-book' || activeTab === 'receivable-aging',
  });

  const handlePrint = () => {
    window.print();
  };

  useHotkeys([
    {
      key: 'p',
      ctrlOrMeta: true,
      handler: handlePrint,
    },
  ]);

  const handleExportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (activeTab === 'detailed-sales') {
      const rows = detailedSalesQuery.data?.rows ?? [];
      const totals = detailedSalesQuery.data?.totals;
      downloadCsv(
        `detailed-sales-report-${stamp}.csv`,
        [
          'Date',
          'Invoice ID',
          'Challan ID',
          'Batch',
          'Item',
          'Client',
          'Batch Cost/kg',
          'Sale Rate/kg',
          'Qty (kg)',
          'Amount',
          'Cost (COGS)',
          'Profit/Loss',
          'Profit/kg',
          'Payment Status',
          'Salesperson',
        ],
        [
          ...rows.map((r) => [
            r.saleDate,
            r.invoiceNo,
            r.challanNo ?? '-',
            r.batchNo,
            r.itemName,
            r.clientName,
            r.batchCostPerKg,
            r.saleRatePerKg,
            r.netQtyKg,
            r.amount,
            r.cogs,
            r.profit,
            r.profitPerKg,
            r.paymentStatus,
            r.salespersonName,
          ]),
          ...(totals
            ? [
                [
                  'TOTALS',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  totals.totalNetQtyKg,
                  totals.totalAmount,
                  totals.totalCogs,
                  totals.totalProfit,
                  totals.avgProfitPerKg,
                  '',
                  '',
                ],
              ]
            : []),
        ],
      );
    } else if (activeTab === 'batch-profitability') {
      const rows = batchDashboardQuery.data?.batchPerformance ?? [];
      downloadCsv(
        `batch-profitability-${stamp}.csv`,
        [
          'Batch No',
          'Batch Name',
          'Item',
          'Status',
          'Output KG',
          'Sold KG',
          'Remaining KG',
          'Cost/KG',
          'Avg Sale/KG',
          'Profit/KG',
          'Total Profit',
        ],
        rows.map((r) => [
          r.batchNo,
          r.batchName,
          r.itemName ?? '-',
          r.status,
          r.outputKg,
          r.soldKg,
          r.remainingKg,
          r.costPerKg,
          r.avgSaleRatePerKg,
          r.profitPerKg,
          r.totalProfit,
        ]),
      );
    } else if (activeTab === 'cash-book') {
      const entries = otherReportsQuery.data?.cashBook.entries ?? [];
      downloadCsv(
        `daily-cash-book-${stamp}.csv`,
        ['Date', 'Type', 'Ref No', 'Party / Payee', 'Description', 'Method', 'Cash In', 'Cash Out'],
        entries.map((e) => [
          e.date,
          e.type,
          e.refNo,
          e.partyOrPayee,
          e.description,
          e.method,
          e.cashIn,
          e.cashOut,
        ]),
      );
    } else {
      const rows = otherReportsQuery.data?.receivableAging.rows ?? [];
      downloadCsv(
        `receivable-aging-${stamp}.csv`,
        [
          'Client',
          'Route',
          'Phone',
          'Credit Limit',
          'Total Balance',
          '0-30 Days',
          '31-60 Days',
          '61-90 Days',
          '90+ Days',
        ],
        rows.map((r) => [
          r.clientName,
          r.routeName ?? '-',
          r.phone ?? '-',
          r.creditLimit,
          r.currentBalance,
          r.bucket0To30,
          r.bucket31To60,
          r.bucket61To90,
          r.bucket90Plus,
        ]),
      );
    }
  };

  // Notebook Page 2 Columns (15 columns)
  const detailedSalesColumns = useMemo<ColumnDef<DetailedSalesReportRowDto, unknown>[]>(
    () => [
      {
        accessorKey: 'saleDate',
        header: t('reports.colDate', 'Date'),
      },
      {
        accessorKey: 'invoiceNo',
        header: t('reports.colInvoiceId', 'Invoice ID'),
        cell: ({ row }) => (
          <span className="font-mono font-medium text-[#1f1e1b]">{row.original.invoiceNo}</span>
        ),
      },
      {
        accessorKey: 'challanNo',
        header: t('reports.colChallanId', 'Challan ID'),
        cell: ({ row }) => (
          <span className="font-mono text-[#5c5a53]">{row.original.challanNo ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'batchNo',
        header: t('reports.colBatch', 'Batch'),
        cell: ({ row }) => <span className="font-mono">{row.original.batchNo}</span>,
      },
      {
        accessorKey: 'itemName',
        header: t('reports.colItem', 'Item'),
      },
      {
        accessorKey: 'clientName',
        header: t('reports.colClient', 'Client'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[#1f1e1b]">{row.original.clientName}</div>
            {row.original.routeName && (
              <div className="text-[11px] text-[#6f6c64]">{row.original.routeName}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'batchCostPerKg',
        header: t('reports.colBatchCostKg', 'Batch Cost/kg'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.batchCostPerKg} />,
      },
      {
        accessorKey: 'saleRatePerKg',
        header: t('reports.colSaleRateKg', 'Sale Rate/kg'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.saleRatePerKg} />,
      },
      {
        accessorKey: 'netQtyKg',
        header: t('reports.colQtyKg', 'Qty (kg)'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono">
            {formatWeight(row.original.netQtyKg)}
            {Number(row.original.returnedQtyKg) > 0 && (
              <span className="ms-1 text-[10px] text-[#b45309]">
                (-{formatWeight(row.original.returnedQtyKg)})
              </span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: t('reports.colAmount', 'Amount'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.amount} />,
      },
      {
        accessorKey: 'cogs',
        header: t('reports.colCost', 'Cost'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.cogs} />,
      },
      {
        accessorKey: 'profit',
        header: t('reports.colProfitLoss', 'Profit/Loss'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.profit} className="font-semibold" />,
      },
      {
        accessorKey: 'profitPerKg',
        header: t('reports.colProfitPerKg', 'Profit/kg'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.profitPerKg} />,
      },
      {
        accessorKey: 'paymentStatus',
        header: t('reports.colPaymentStatus', 'Payment Status'),
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.paymentStatus === 'PAID'
                ? 'success'
                : row.original.paymentStatus === 'PARTIAL'
                  ? 'warning'
                  : 'danger'
            }
          >
            {row.original.paymentStatus}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'salespersonName',
        header: t('reports.colSalesperson', 'Salesperson'),
      },
    ],
    [t],
  );

  const batchColumns = useMemo<ColumnDef<DashboardBatchPerformanceRowDto, unknown>[]>(
    () => [
      {
        accessorKey: 'batchNo',
        header: t('reports.colBatch', 'Batch'),
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.batchNo}</span>,
      },
      {
        accessorKey: 'batchName',
        header: t('batches.batchName', 'Batch Name'),
      },
      {
        accessorKey: 'itemName',
        header: t('reports.colItem', 'Item'),
        cell: ({ row }) => row.original.itemName ?? '—',
      },
      {
        accessorKey: 'status',
        header: t('common.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'OPEN' ? 'success' : 'neutral'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'outputKg',
        header: t('batches.outputKg', 'Output KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-mono">{formatWeight(row.original.outputKg)}</span>,
      },
      {
        accessorKey: 'soldKg',
        header: t('dashboard.colSoldKg', 'KG Sold'),
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-mono">{formatWeight(row.original.soldKg)}</span>,
      },
      {
        accessorKey: 'remainingKg',
        header: t('dashboard.colRemainingKg', 'Remaining KG'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{formatWeight(row.original.remainingKg)}</span>
        ),
      },
      {
        accessorKey: 'costPerKg',
        header: t('dashboard.colAvgCostKg', 'Cost / KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.costPerKg} />,
      },
      {
        accessorKey: 'avgSaleRatePerKg',
        header: t('dashboard.colAvgSaleKg', 'Avg Sale / KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.avgSaleRatePerKg} />,
      },
      {
        accessorKey: 'profitPerKg',
        header: t('dashboard.colProfitKg', 'Profit / KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.profitPerKg} />,
      },
      {
        accessorKey: 'totalProfit',
        header: t('dashboard.colTotalProfit', 'Total Profit'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.totalProfit} className="font-semibold" />,
      },
    ],
    [t],
  );

  const cashBookColumns = useMemo<ColumnDef<CashBookEntryDto, unknown>[]>(
    () => [
      {
        accessorKey: 'date',
        header: t('reports.colDate', 'Date'),
      },
      {
        accessorKey: 'type',
        header: t('reports.colType', 'Type'),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.type === 'CLIENT_RECEIPT' ? 'success' : 'neutral'}>
            {row.original.type}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'refNo',
        header: t('reports.colRefNo', 'Ref No'),
        cell: ({ row }) => <span className="font-mono">{row.original.refNo}</span>,
      },
      {
        accessorKey: 'partyOrPayee',
        header: t('reports.colPartyPayee', 'Party / Payee'),
      },
      {
        accessorKey: 'description',
        header: t('expenses.colDescription', 'Description'),
      },
      {
        accessorKey: 'method',
        header: t('payments.colMethod', 'Method'),
      },
      {
        accessorKey: 'cashIn',
        header: t('reports.colCashIn', 'Cash In'),
        meta: { align: 'right' },
        cell: ({ row }) =>
          Number(row.original.cashIn) > 0 ? (
            <MoneyText value={row.original.cashIn} className="font-medium text-[#2e6b4e]" />
          ) : (
            '—'
          ),
      },
      {
        accessorKey: 'cashOut',
        header: t('reports.colCashOut', 'Cash Out'),
        meta: { align: 'right' },
        cell: ({ row }) =>
          Number(row.original.cashOut) > 0 ? (
            <MoneyText value={row.original.cashOut} className="font-medium text-[#b91c1c]" />
          ) : (
            '—'
          ),
      },
    ],
    [t],
  );

  const agingColumns = useMemo<ColumnDef<ReceivableAgingRowDto, unknown>[]>(
    () => [
      {
        accessorKey: 'clientName',
        header: t('reports.colClient', 'Client'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[#1f1e1b]">{row.original.clientName}</div>
            {row.original.phone && (
              <div className="text-[11px] text-[#6f6c64]">{row.original.phone}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'routeName',
        header: t('clients.colRoute', 'Route'),
        cell: ({ row }) => row.original.routeName ?? '—',
      },
      {
        accessorKey: 'creditLimit',
        header: t('clients.colCreditLimit', 'Credit Limit'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.creditLimit} />,
      },
      {
        accessorKey: 'currentBalance',
        header: t('clients.colBalance', 'Total Receivable'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <MoneyText value={row.original.currentBalance} className="font-semibold" />
        ),
      },
      {
        accessorKey: 'bucket0To30',
        header: t('reports.bucket0To30', '0–30 Days'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.bucket0To30} />,
      },
      {
        accessorKey: 'bucket31To60',
        header: t('reports.bucket31To60', '31–60 Days'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.bucket31To60} />,
      },
      {
        accessorKey: 'bucket61To90',
        header: t('reports.bucket61To90', '61–90 Days'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.bucket61To90} />,
      },
      {
        accessorKey: 'bucket90Plus',
        header: t('reports.bucket90Plus', '90+ Days'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <MoneyText value={row.original.bucket90Plus} className="font-semibold text-[#b91c1c]" />
        ),
      },
    ],
    [t],
  );

  const totals = detailedSalesQuery.data?.totals;
  const cashBook = otherReportsQuery.data?.cashBook;
  const aging = otherReportsQuery.data?.receivableAging;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('reports.title', 'Reports & Analytics')}
        subtitle={t(
          'reports.subtitle',
          'Detailed Sales Report (Notebook Page 2), Batch Profitability, Daily Cash Book & Receivable Aging',
        )}
        secondaryActions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleExportCsv}>
              {t('reports.exportExcelCsv', 'Export Excel (CSV)')}
            </Button>
            <Button variant="primary" onClick={handlePrint} shortcutHint="Ctrl+P">
              {t('reports.printPdf', 'Print / PDF')}
            </Button>
          </div>
        }
      />

      <TabsBar
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as ReportTab)}
        tabs={[
          {
            id: 'detailed-sales',
            label: t('reports.tabDetailedSales', 'Detailed Sales Report'),
          },
          {
            id: 'batch-profitability',
            label: t('reports.tabBatchProfitability', 'Batch Profitability & Stock'),
          },
          {
            id: 'cash-book',
            label: t('reports.tabCashBook', 'Daily Cash Book & Closing'),
          },
          {
            id: 'receivable-aging',
            label: t('reports.tabReceivableAging', 'Receivable Aging'),
          },
        ]}
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t(
          'reports.searchPlaceholder',
          'Search invoice no, challan, batch, item, client, or salesperson...',
        )}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        selects={
          activeTab === 'detailed-sales'
            ? [
                {
                  id: 'batch',
                  label: t('reports.colBatch', 'Batch'),
                  value: batchId,
                  allLabel: t('reports.allBatches', 'All Batches'),
                  options: (batchesLookup.data?.data ?? []).map((b) => ({
                    value: String(b.id),
                    label: `${b.batchNo} (${b.name})`,
                  })),
                  onChange: setBatchId,
                },
                {
                  id: 'client',
                  label: t('reports.colClient', 'Client'),
                  value: clientId,
                  allLabel: t('reports.allClients', 'All Clients'),
                  options: (clientsLookup.data?.data ?? []).map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                  onChange: setClientId,
                },
                {
                  id: 'item',
                  label: t('reports.colItem', 'Item'),
                  value: itemId,
                  allLabel: t('reports.allItems', 'All Items'),
                  options: (itemsLookup.data?.data ?? []).map((it) => ({
                    value: String(it.id),
                    label: it.name,
                  })),
                  onChange: setItemId,
                },
                {
                  id: 'route',
                  label: t('clients.colRoute', 'Route'),
                  value: routeId,
                  allLabel: t('reports.allRoutes', 'All Routes'),
                  options: (routesLookup.data?.data ?? []).map((r) => ({
                    value: String(r.id),
                    label: r.name,
                  })),
                  onChange: setRouteId,
                },
                {
                  id: 'paymentStatus',
                  label: t('reports.colPaymentStatus', 'Payment Status'),
                  value: paymentStatus,
                  allLabel: t('common.allStatuses', 'All Statuses'),
                  options: REPORT_PAYMENT_STATUSES.map((st) => ({ value: st, label: st })),
                  onChange: setPaymentStatus,
                },
              ]
            : []
        }
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setSearch('');
          setDateFrom('');
          setDateTo('');
          setBatchId('');
          setClientId('');
          setItemId('');
          setRouteId('');
          setPaymentStatus('');
        }}
      />

      {/* TAB 1: DETAILED SALES REPORT (Section 5.4) */}
      {activeTab === 'detailed-sales' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <DataTable
              columns={detailedSalesColumns}
              data={detailedSalesQuery.data?.rows ?? []}
              isLoading={detailedSalesQuery.isLoading}
              emptyTitle={t('reports.emptyDetailedSales', 'No sales lines match these filters')}
              emptyDescription={t(
                'reports.emptyDetailedSalesDesc',
                'Adjust your date range, batch, client, or payment status filter to view itemized batch sales and profit.',
              )}
            />
          </div>

          {/* Sticky Bottom Totals Row (Section 5.4) */}
          {totals && (
            <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[#2c2b28] bg-[#faf9f5] px-5 py-2.5 text-xs">
              <div className="font-semibold text-[#1f1e1b]">
                {t('reports.totalsRowLabel', 'REPORT TOTALS')} ({totals.rowCount}{' '}
                {t('reports.linesCount', 'lines')})
              </div>
              <div className="flex flex-wrap items-center gap-6 font-mono">
                <div>
                  <span className="font-sans text-[#6f6c64]">
                    {t('reports.colQtyKg', 'Net Qty (kg)')}:{' '}
                  </span>
                  <span className="font-semibold text-[#1f1e1b]">
                    {formatWeight(totals.totalNetQtyKg)} kg
                  </span>
                </div>
                <div>
                  <span className="font-sans text-[#6f6c64]">
                    {t('reports.colAmount', 'Total Amount')}:{' '}
                  </span>
                  <MoneyText value={totals.totalAmount} className="font-semibold" />
                </div>
                <div>
                  <span className="font-sans text-[#6f6c64]">
                    {t('reports.colCost', 'Total Cost (COGS)')}:{' '}
                  </span>
                  <MoneyText value={totals.totalCogs} className="font-semibold" />
                </div>
                <div>
                  <span className="font-sans text-[#6f6c64]">
                    {t('reports.colProfitLoss', 'Total Profit')}:{' '}
                  </span>
                  <MoneyText value={totals.totalProfit} className="font-bold" />
                </div>
                <div>
                  <span className="font-sans text-[#6f6c64]">
                    {t('reports.colProfitPerKg', 'Avg Profit/kg')}:{' '}
                  </span>
                  <MoneyText value={totals.avgProfitPerKg} className="font-semibold" />
                </div>
              </div>
            </footer>
          )}
        </div>
      )}

      {/* TAB 2: BATCH PROFITABILITY & STOCK POSITION */}
      {activeTab === 'batch-profitability' && (
        <div className="flex-1 overflow-auto">
          <DataTable
            columns={batchColumns}
            data={batchDashboardQuery.data?.batchPerformance ?? []}
            isLoading={batchDashboardQuery.isLoading}
            emptyTitle={t('dashboard.noBatchesTitle', 'No batches found')}
            emptyDescription={t(
              'dashboard.noBatchesDesc',
              'Create a batch from purchase invoices to view profitability and stock position.',
            )}
          />
        </div>
      )}

      {/* TAB 3: DAILY CASH BOOK & DAY-END CLOSING */}
      {activeTab === 'cash-book' && (
        <div className="flex flex-1 flex-col overflow-auto">
          {cashBook && (
            <div className="grid grid-cols-1 gap-3 border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-3 sm:grid-cols-3">
              <StatCard
                label={t('reports.totalCashIn', 'Total Inflows (Receipts)')}
                value={<MoneyText value={cashBook.totalIn} />}
              />
              <StatCard
                label={t('reports.totalCashOut', 'Total Outflows (Payments, Expenses & Payroll)')}
                value={<MoneyText value={cashBook.totalOut} />}
              />
              <StatCard
                label={t('reports.netCashFlow', 'Net Period Cash Flow')}
                value={<MoneyText value={cashBook.netCashFlow} />}
              />
            </div>
          )}

          {cashBook && cashBook.byMethod.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 border-b border-[#e4e2da] bg-white px-5 py-2 text-xs">
              <span className="font-semibold text-[#5c5a53]">
                {t('reports.byMethod', 'By Payment Method')}:
              </span>
              {cashBook.byMethod.map((m) => (
                <div
                  key={m.method}
                  className="rounded border border-[#e4e2da] bg-[#faf9f5] px-2.5 py-1 font-mono"
                >
                  <span className="font-sans font-semibold text-[#1f1e1b]">{m.method}: </span>
                  <span className="text-[#2e6b4e]">+{formatMoney(m.totalIn)}</span>
                  {' / '}
                  <span className="text-[#b91c1c]">-{formatMoney(m.totalOut)}</span>
                  {' = '}
                  <span className="font-semibold">{formatMoney(m.netFlow)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1">
            <DataTable
              columns={cashBookColumns}
              data={cashBook?.entries ?? []}
              isLoading={otherReportsQuery.isLoading}
              emptyTitle={t('reports.emptyCashBook', 'No cash book entries in this date range')}
              emptyDescription={t(
                'reports.emptyCashBookDesc',
                'Client receipts, supplier payments, expenses, and salary disbursements appear here.',
              )}
            />
          </div>
        </div>
      )}

      {/* TAB 4: RECEIVABLE AGING */}
      {activeTab === 'receivable-aging' && (
        <div className="flex flex-1 flex-col overflow-auto">
          {aging && (
            <div className="grid grid-cols-1 gap-3 border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-3 sm:grid-cols-5">
              <StatCard
                label={t('reports.totalReceivable', 'Total Receivable')}
                value={<MoneyText value={aging.totalReceivable} />}
              />
              <StatCard
                label={t('reports.bucket0To30', '0–30 Days')}
                value={<MoneyText value={aging.total0To30} />}
              />
              <StatCard
                label={t('reports.bucket31To60', '31–60 Days')}
                value={<MoneyText value={aging.total31To60} />}
              />
              <StatCard
                label={t('reports.bucket61To90', '61–90 Days')}
                value={<MoneyText value={aging.total61To90} />}
              />
              <StatCard
                label={t('reports.bucket90Plus', '90+ Days (Overdue)')}
                value={<MoneyText value={aging.total90Plus} />}
              />
            </div>
          )}

          <div className="flex-1">
            <DataTable
              columns={agingColumns}
              data={aging?.rows ?? []}
              isLoading={otherReportsQuery.isLoading}
              emptyTitle={t('reports.emptyAging', 'No outstanding client receivables')}
              emptyDescription={t(
                'reports.emptyAgingDesc',
                'Clients with positive receivable balances are bucketed here by invoice age.',
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
