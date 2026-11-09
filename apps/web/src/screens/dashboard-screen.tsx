import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  formatMoney,
  formatWeight,
  type DashboardBatchPerformanceRowDto,
  type DashboardPreset,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  DatePicker,
  MoneyText,
  PageHeader,
  StatCard,
  StatusBadge,
  SurfaceCard,
  type ColumnDef,
} from '@mini-erp/ui';
import { fetchDashboardReport } from '../lib/api.js';

export interface DashboardScreenProps {
  readonly orgName: string;
  readonly currency: string;
  readonly canManageUsers: boolean;
  readonly canManageSettings: boolean;
  readonly onNavigate: (navId: string) => void;
}

const PRESETS: readonly { id: DashboardPreset; labelKey: string; fallback: string }[] = [
  { id: 'TODAY', labelKey: 'dashboard.presetToday', fallback: 'Today' },
  { id: 'THIS_WEEK', labelKey: 'dashboard.presetThisWeek', fallback: 'This Week' },
  { id: 'THIS_MONTH', labelKey: 'dashboard.presetThisMonth', fallback: 'This Month' },
  { id: 'CUSTOM', labelKey: 'dashboard.presetCustom', fallback: 'Custom Range' },
];

export function DashboardScreen({ orgName, currency, onNavigate }: DashboardScreenProps) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<DashboardPreset>('THIS_MONTH');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const dashboardQuery = useQuery({
    queryKey: ['reports', 'dashboard', preset, dateFrom, dateTo],
    queryFn: () =>
      fetchDashboardReport({
        preset,
        ...(preset === 'CUSTOM' && dateFrom ? { dateFrom } : {}),
        ...(preset === 'CUSTOM' && dateTo ? { dateTo } : {}),
      }),
  });

  const data = dashboardQuery.data;
  const kpis = data?.kpis;

  const batchColumns = useMemo<ColumnDef<DashboardBatchPerformanceRowDto, unknown>[]>(
    () => [
      {
        accessorKey: 'batchNo',
        header: t('reports.colBatch', 'Batch'),
        cell: ({ row }) => (
          <div>
            <span className="font-mono font-medium text-[#1f1e1b]">{row.original.batchNo}</span>
            <span className="ms-1.5 text-xs text-[#6f6c64]">{row.original.batchName}</span>
          </div>
        ),
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
        accessorKey: 'soldKg',
        header: t('dashboard.colSoldKg', 'KG Sold'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono">{formatWeight(row.original.soldKg)} kg</span>
        ),
      },
      {
        accessorKey: 'remainingKg',
        header: t('dashboard.colRemainingKg', 'Remaining KG'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono font-medium">{formatWeight(row.original.remainingKg)} kg</span>
        ),
      },
      {
        accessorKey: 'costPerKg',
        header: t('dashboard.colAvgCostKg', 'Avg Cost / KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.costPerKg} currency={currency} />,
      },
      {
        accessorKey: 'avgSaleRatePerKg',
        header: t('dashboard.colAvgSaleKg', 'Avg Sale / KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.avgSaleRatePerKg} currency={currency} />,
      },
      {
        accessorKey: 'profitPerKg',
        header: t('dashboard.colProfitKg', 'Profit / KG'),
        meta: { align: 'right' },
        cell: ({ row }) => <MoneyText value={row.original.profitPerKg} currency={currency} />,
      },
      {
        accessorKey: 'totalProfit',
        header: t('dashboard.colTotalProfit', 'Total Profit'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <MoneyText
            value={row.original.totalProfit}
            currency={currency}
            className="font-semibold"
          />
        ),
      },
    ],
    [t, currency],
  );

  const dailySeries = data?.charts.dailySalesVsReceived ?? [];
  const maxDailyVal = useMemo(() => {
    let m = 1;
    for (const pt of dailySeries) {
      const s = Math.abs(Number(pt.salesAmount));
      const r = Math.abs(Number(pt.receivedAmount));
      if (s > m) m = s;
      if (r > m) m = r;
    }
    return m;
  }, [dailySeries]);

  const batchProfitSeries = data?.charts.profitByBatch ?? [];
  const maxBatchProfitVal = useMemo(() => {
    let m = 1;
    for (const pt of batchProfitSeries) {
      const rev = Math.abs(Number(pt.revenue));
      const prof = Math.abs(Number(pt.grossProfit));
      if (rev > m) m = rev;
      if (prof > m) m = prof;
    }
    return m;
  }, [batchProfitSeries]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PageHeader
        title={t('dashboard.title', 'Dashboard')}
        subtitle={t('dashboard.subtitle', { orgName })}
        secondaryActions={
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={preset === p.id ? 'primary' : 'secondary'}
                onClick={() => setPreset(p.id)}
              >
                {t(p.labelKey, p.fallback)}
              </Button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => onNavigate('reports')}>
              {t('dashboard.openReports', 'Detailed Reports')}
            </Button>
          </div>
        }
      />

      {preset === 'CUSTOM' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-2.5 text-xs">
          <span className="font-medium text-[#5c5a53]">
            {t('dashboard.customRange', 'Custom Date Range')}:
          </span>
          <DatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-[#6f6c64]">→</span>
          <DatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      )}

      {/* 7 KPI Cards (Section 5.3) */}
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label={t('dashboard.totalSales', 'Total Sales (Net)')}
          value={<MoneyText value={kpis?.totalSales ?? '0.00'} currency={currency} />}
          hint={
            kpis && Number(kpis.saleReturnsTotal) > 0
              ? `${t('dashboard.returns', 'Returns')}: ${formatMoney(kpis.saleReturnsTotal)}`
              : undefined
          }
        />
        <StatCard
          label={t('dashboard.totalReceived', 'Received')}
          value={<MoneyText value={kpis?.totalReceived ?? '0.00'} currency={currency} />}
        />
        <StatCard
          label={t('dashboard.totalReceivable', 'Receivable (Outstanding)')}
          value={<MoneyText value={kpis?.totalReceivable ?? '0.00'} currency={currency} />}
        />
        <StatCard
          label={t('dashboard.pendingCheques', 'Pending Cheques')}
          value={
            <div className="flex flex-col">
              <MoneyText value={kpis?.pendingChequesAmount ?? '0.00'} currency={currency} />
              <span className="text-[11px] font-normal text-[#6f6c64]">
                {kpis?.pendingChequesCount ?? 0} {t('dashboard.chequesCount', 'cheques')}
              </span>
            </div>
          }
        />
        <StatCard
          label={t('dashboard.grossProfit', 'Gross Profit')}
          value={<MoneyText value={kpis?.grossProfit ?? '0.00'} currency={currency} />}
        />
        <StatCard
          label={t('dashboard.operatingExpenses', 'Operating Expenses')}
          value={<MoneyText value={kpis?.operatingExpenses ?? '0.00'} currency={currency} />}
        />
        <StatCard
          label={t('dashboard.netProfit', 'Net Profit')}
          value={<MoneyText value={kpis?.netProfit ?? '0.00'} currency={currency} />}
        />
      </div>

      {/* 2 Simple Charts (Section 5.3: Sales vs Received per day; Profit by Batch) */}
      <div className="grid grid-cols-1 gap-4 px-5 pb-4 lg:grid-cols-2">
        <SurfaceCard>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5c5a53]">
                {t('dashboard.chartSalesVsReceived', 'Sales vs Received per Day')}
              </h3>
              <p className="text-[11px] text-[#6f6c64]">
                {data?.dateFrom ?? ''} → {data?.dateTo ?? ''}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2c2b28]" />
                {t('dashboard.legendSales', 'Sales')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2e6b4e]" />
                {t('dashboard.legendReceived', 'Received')}
              </span>
            </div>
          </div>
          {dailySeries.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8c8980]">
              {t('dashboard.noChartData', 'No sales or receipts recorded in this period')}
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pe-1">
              {dailySeries.map((pt) => {
                const salesPct = Math.min(
                  100,
                  Math.max(2, (Math.abs(Number(pt.salesAmount)) / maxDailyVal) * 100),
                );
                const recPct = Math.min(
                  100,
                  Math.max(2, (Math.abs(Number(pt.receivedAmount)) / maxDailyVal) * 100),
                );
                return (
                  <div key={pt.date} className="text-xs">
                    <div className="mb-0.5 flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#5c5a53]">{pt.date}</span>
                      <span>
                        <span className="text-[#1f1e1b]">{formatMoney(pt.salesAmount)}</span>
                        {' / '}
                        <span className="text-[#2e6b4e]">{formatMoney(pt.receivedAmount)}</span>
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div
                        className="h-2 rounded-sm bg-[#2c2b28]"
                        style={{ width: `${salesPct}%` }}
                      />
                      <div
                        className="h-2 rounded-sm bg-[#2e6b4e]"
                        style={{ width: `${recPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5c5a53]">
                {t('dashboard.chartProfitByBatch', 'Profit by Batch')}
              </h3>
              <p className="text-[11px] text-[#6f6c64]">
                {t(
                  'dashboard.snapshotProfitHint',
                  'Calculated from sale-time batch cost snapshots',
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#a39e93]" />
                {t('dashboard.legendRevenue', 'Revenue')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2e6b4e]" />
                {t('dashboard.legendProfit', 'Gross Profit')}
              </span>
            </div>
          </div>
          {batchProfitSeries.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8c8980]">
              {t('dashboard.noBatchProfitData', 'No batch sales recorded yet')}
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pe-1">
              {batchProfitSeries.map((pt) => {
                const revPct = Math.min(
                  100,
                  Math.max(2, (Math.abs(Number(pt.revenue)) / maxBatchProfitVal) * 100),
                );
                const profPct = Math.min(
                  100,
                  Math.max(2, (Math.abs(Number(pt.grossProfit)) / maxBatchProfitVal) * 100),
                );
                return (
                  <div key={pt.batchId} className="text-xs">
                    <div className="mb-0.5 flex items-center justify-between text-[11px]">
                      <span className="font-mono font-medium text-[#1f1e1b]">
                        {pt.batchNo}{' '}
                        <span className="font-sans font-normal text-[#6f6c64]">
                          ({pt.batchName})
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-[#2e6b4e]">
                        {formatMoney(pt.grossProfit)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div
                        className="h-2 rounded-sm bg-[#a39e93]"
                        style={{ width: `${revPct}%` }}
                      />
                      <div
                        className="h-2 rounded-sm bg-[#2e6b4e]"
                        style={{ width: `${profPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Batch Performance Table (Section 5.3) */}
      <div className="px-5 pb-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5c5a53]">
            {t('dashboard.batchPerformanceTitle', 'Batch Performance')}
          </h3>
          <Button size="sm" variant="ghost" onClick={() => onNavigate('batches')}>
            {t('dashboard.viewAllBatches', 'View Batches')}
          </Button>
        </div>
        <div className="rounded border border-[#e4e2da] bg-white">
          <DataTable
            columns={batchColumns}
            data={data?.batchPerformance ?? []}
            isLoading={dashboardQuery.isLoading}
            emptyTitle={t('dashboard.noBatchesTitle', 'No batches created yet')}
            emptyDescription={t(
              'dashboard.noBatchesDesc',
              'Create a processing batch from purchase invoices to track kg sold, remaining stock, and profit per kg.',
            )}
          />
        </div>
      </div>

      {/* 4 Operational Alert Lists (Section 5.3) */}
      <div className="grid grid-cols-1 gap-4 px-5 pb-6 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. Cheques Due for Deposit (Next 7 Days) */}
        <SurfaceCard>
          <div className="mb-2.5 flex items-center justify-between border-b border-[#e4e2da] pb-2">
            <h4 className="text-xs font-semibold text-[#1f1e1b]">
              {t('dashboard.chequesDueSoon', 'Cheques Due (Next 7 Days)')}
            </h4>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('payments-cheques')}>
              {t('common.viewAll', 'View')}
            </Button>
          </div>
          {(data?.chequesDueSoon.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-[#8c8980]">
              {t('dashboard.noChequesDue', 'No cheques due within 7 days')}
            </p>
          ) : (
            <ul className="divide-y divide-[#efede7] text-xs">
              {data?.chequesDueSoon.map((chq) => (
                <li key={chq.chequeId} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-[#1f1e1b]">
                      #{chq.chequeNo} · {chq.bankName}
                    </div>
                    <div className="text-[11px] text-[#6f6c64]">
                      {chq.partyName} · {chq.chequeDate}
                    </div>
                  </div>
                  <div className="text-end">
                    <MoneyText value={chq.amount} currency={currency} className="font-semibold" />
                    <div className="text-[10px] text-[#b45309]">
                      {chq.daysUntilDue <= 0
                        ? t('dashboard.dueTodayOrOverdue', 'Due Now')
                        : `${chq.daysUntilDue}d`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        {/* 2. Today's Recovery Due */}
        <SurfaceCard>
          <div className="mb-2.5 flex items-center justify-between border-b border-[#e4e2da] pb-2">
            <h4 className="text-xs font-semibold text-[#1f1e1b]">
              {t('dashboard.todaysRecoveryDue', "Today's Recovery Due")}
            </h4>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('todays-recovery')}>
              {t('common.viewAll', 'View')}
            </Button>
          </div>
          {(data?.todaysRecoveryDue.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-[#8c8980]">
              {t('dashboard.noRecoveryToday', 'No scheduled recoveries due today')}
            </p>
          ) : (
            <ul className="divide-y divide-[#efede7] text-xs">
              {data?.todaysRecoveryDue.map((rec) => (
                <li key={rec.clientId} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-[#1f1e1b]">{rec.clientName}</div>
                    <div className="text-[11px] text-[#6f6c64]">
                      {rec.routeName ?? '—'} {rec.officerName ? `· ${rec.officerName}` : ''}
                    </div>
                  </div>
                  <div className="text-end">
                    <MoneyText
                      value={rec.currentBalance}
                      currency={currency}
                      className="font-semibold"
                    />
                    {rec.promisedAmount && (
                      <div className="text-[10px] text-[#2e6b4e]">
                        {t('dashboard.promised', 'Promised')}: {formatMoney(rec.promisedAmount)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        {/* 3. Overdue Clients (Top 10) */}
        <SurfaceCard>
          <div className="mb-2.5 flex items-center justify-between border-b border-[#e4e2da] pb-2">
            <h4 className="text-xs font-semibold text-[#1f1e1b]">
              {t('dashboard.overdueClients', 'Overdue Clients (Top 10)')}
            </h4>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('client-list')}>
              {t('common.viewAll', 'View')}
            </Button>
          </div>
          {(data?.overdueClients.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-[#8c8980]">
              {t('dashboard.noOverdueClients', 'No outstanding client balances')}
            </p>
          ) : (
            <ul className="divide-y divide-[#efede7] text-xs">
              {data?.overdueClients.map((cl) => (
                <li key={cl.clientId} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-[#1f1e1b]">{cl.clientName}</div>
                    <div className="text-[11px] text-[#6f6c64]">
                      {cl.routeName ?? '—'} · {cl.oldestUnpaidDays}d
                    </div>
                  </div>
                  <MoneyText
                    value={cl.currentBalance}
                    currency={currency}
                    className="font-semibold text-[#b91c1c]"
                  />
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        {/* 4. Low Batch Stock */}
        <SurfaceCard>
          <div className="mb-2.5 flex items-center justify-between border-b border-[#e4e2da] pb-2">
            <h4 className="text-xs font-semibold text-[#1f1e1b]">
              {t('dashboard.lowBatchStock', 'Low Batch Stock')}
            </h4>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('inventory')}>
              {t('common.viewAll', 'View')}
            </Button>
          </div>
          {(data?.lowBatchStock.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-[#8c8980]">
              {t('dashboard.noLowStock', 'All active batches have healthy stock')}
            </p>
          ) : (
            <ul className="divide-y divide-[#efede7] text-xs">
              {data?.lowBatchStock.map((b) => (
                <li key={b.batchId} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-mono font-medium text-[#1f1e1b]">{b.batchNo}</div>
                    <div className="text-[11px] text-[#6f6c64]">
                      {b.batchName} {b.itemName ? `(${b.itemName})` : ''}
                    </div>
                  </div>
                  <div className="text-end font-mono">
                    <span className="font-semibold text-[#b45309]">
                      {formatWeight(b.remainingKg)} kg
                    </span>
                    <div className="text-[10px] text-[#6f6c64]">
                      / {formatWeight(b.outputKg)} kg
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
