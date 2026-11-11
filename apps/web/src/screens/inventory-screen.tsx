import {
  STOCK_MOVEMENT_TYPES,
  type BatchSummaryDto,
  type ItemDto,
  type PageSizeOption,
  type StockMovementDto,
  type StockMovementTypeDto,
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
  StatusBadge,
  SurfaceCard,
  WeightText,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchBatches, fetchItems, fetchStockMovements } from '../lib/api.js';

export interface InventoryScreenProps {
  readonly onOpenBatch360: (batchId: number) => void;
}

export function InventoryScreen({ onOpenBatch360 }: InventoryScreenProps) {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'position' | 'movements'>('position');

  // Movements filters & pagination
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'ALL' | 'RAW' | 'BATCH'>('ALL');
  const [itemFilter, setItemFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  const batchesQuery = useQuery({
    queryKey: ['batches', 'inventory-overview'],
    queryFn: () => fetchBatches({ page: 1, pageSize: 100 }),
  });

  const itemsQuery = useQuery({
    queryKey: ['items', 'inventory-overview'],
    queryFn: () => fetchItems({ page: 1, pageSize: 100 }),
  });

  const movementsQuery = useQuery({
    queryKey: [
      'batches',
      'movements',
      { page, pageSize, search, scope, itemFilter, typeFilter, dateFrom, dateTo },
    ],
    queryFn: () =>
      fetchStockMovements({
        page,
        pageSize,
        search: search || undefined,
        scope,
        itemId: itemFilter ? Number(itemFilter) : undefined,
        type: (typeFilter || undefined) as StockMovementTypeDto | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    enabled: activeTab === 'movements',
  });

  const overviewStats = useMemo(() => {
    const batches = batchesQuery.data?.data ?? [];
    const items = itemsQuery.data?.data ?? [];

    let totalBatchStockKg = new Decimal(0);
    let totalValuation = new Decimal(0);
    let openBatches = 0;

    for (const b of batches) {
      const avail = new Decimal(b.availableKg || '0');
      const costPerKg = new Decimal(b.costPerKg || '0');
      if (avail.gt(0)) {
        totalBatchStockKg = totalBatchStockKg.plus(avail);
        totalValuation = totalValuation.plus(avail.mul(costPerKg));
      }
      if (b.status === 'OPEN') {
        openBatches += 1;
      }
    }

    let totalRawStockKg = new Decimal(0);
    for (const it of items) {
      totalRawStockKg = totalRawStockKg.plus(new Decimal(it.rawStockQtyBase || '0'));
    }

    return {
      totalBatchStockKg: totalBatchStockKg.toFixed(3),
      totalRawStockKg: totalRawStockKg.toFixed(3),
      openBatches,
      totalValuation: totalValuation.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    };
  }, [batchesQuery.data?.data, itemsQuery.data?.data]);

  const batchStockColumns = useMemo<ColumnDef<BatchSummaryDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.index + 1} />,
      },
      {
        id: 'batchNo',
        accessorKey: 'batchNo',
        header: t('batches.colBatchNo'),
        cell: ({ row }) => (
          <EntityLink mono onClick={() => onOpenBatch360(row.original.id)}>
            {row.original.batchNo}
          </EntityLink>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('batches.colName'),
      },
      {
        id: 'itemName',
        accessorKey: 'itemName',
        header: t('batches.colItem'),
        cell: ({ row }) => row.original.itemName ?? '—',
      },
      {
        id: 'outputKg',
        accessorKey: 'outputKg',
        header: t('batches.colOutputKg'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.outputKg} />,
      },
      {
        id: 'availableKg',
        accessorKey: 'availableKg',
        header: t('batches.colAvailableKg'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold text-[#2c6b48]">
            <WeightText value={row.original.availableKg} />
          </span>
        ),
      },
      {
        id: 'costPerKg',
        accessorKey: 'costPerKg',
        header: t('batches.colCostPerKg'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.costPerKg} />,
      },
      {
        id: 'valuation',
        header: t('inventory.statBatchValue'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const val = new Decimal(row.original.availableKg)
            .mul(row.original.costPerKg)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            .toFixed(2);
          return <MoneyText value={val} />;
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('batches.colStatus'),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'OPEN' ? 'success' : 'neutral'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'view',
                label: t('batches.actionView'),
                inline: true,
                onClick: () => onOpenBatch360(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [t, onOpenBatch360],
  );

  const rawItemColumns = useMemo<ColumnDef<ItemDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.index + 1} />,
      },
      {
        id: 'code',
        accessorKey: 'code',
        header: t('items.colCode'),
        cell: ({ row }) => <span className="font-mono">{row.original.code ?? '—'}</span>,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('items.colName'),
      },
      {
        id: 'baseUnit',
        accessorKey: 'baseUnit',
        header: t('items.colBaseUnit'),
      },
      {
        id: 'rawStockQtyBase',
        accessorKey: 'rawStockQtyBase',
        header: t('items.colRawStock'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <WeightText value={row.original.rawStockQtyBase} />
          </span>
        ),
      },
      {
        id: 'lastPurchaseRatePerBase',
        accessorKey: 'lastPurchaseRatePerBase',
        header: t('items.colLastRate'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.lastPurchaseRatePerBase ? (
            <MoneyText value={new Decimal(row.original.lastPurchaseRatePerBase).toFixed(2)} />
          ) : (
            '—'
          ),
      },
    ],
    [t],
  );

  const movementColumns = useMemo<ColumnDef<StockMovementDto, unknown>[]>(
    () => [
      {
        id: 'id',
        accessorKey: 'id',
        header: t('inventory.colMovementId'),
        size: 60,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: t('inventory.colDate'),
        cell: ({ row }) => (
          <span className="tabular-nums text-xs">
            {row.original.createdAt.slice(0, 19).replace('T', ' ')}
          </span>
        ),
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: t('inventory.colType'),
        cell: ({ row }) => (
          <StatusBadge tone={new Decimal(row.original.qtyBase).gte(0) ? 'success' : 'danger'}>
            {t(`inventory.movementTypes.${row.original.type}`)}
          </StatusBadge>
        ),
      },
      {
        id: 'itemName',
        accessorKey: 'itemName',
        header: t('inventory.colItem'),
      },
      {
        id: 'batchNo',
        accessorKey: 'batchNo',
        header: t('inventory.colBatch'),
        cell: ({ row }) =>
          row.original.batchId && row.original.batchNo ? (
            <EntityLink mono onClick={() => onOpenBatch360(row.original.batchId!)}>
              {row.original.batchNo}
            </EntityLink>
          ) : (
            <span className="text-xs text-[#6f6c64]">RAW</span>
          ),
      },
      {
        id: 'refNo',
        accessorKey: 'refNo',
        header: t('inventory.colRefNo'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.refNo ?? '—'}</span>,
      },
      {
        id: 'qtyBase',
        accessorKey: 'qtyBase',
        header: t('inventory.colQtyBase'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <WeightText value={row.original.qtyBase} />
          </span>
        ),
      },
      {
        id: 'note',
        accessorKey: 'note',
        header: t('inventory.colNote'),
        cell: ({ row }) => (
          <span className="text-xs text-[#6f6c64]">{row.original.note ?? '—'}</span>
        ),
      },
    ],
    [t, onOpenBatch360],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader title={t('inventory.title')} subtitle={t('inventory.subtitle')} />

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 px-5 py-3 sm:grid-cols-4">
        <SurfaceCard className="p-3">
          <div className="text-xs text-[#6f6c64]">{t('inventory.statBatchStock')}</div>
          <div className="mt-1 text-base font-bold text-[#2c6b48]">
            <WeightText value={overviewStats.totalBatchStockKg} /> kg
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-xs text-[#6f6c64]">{t('inventory.statRawStock')}</div>
          <div className="mt-1 text-base font-bold text-[#1f1e1b]">
            <WeightText value={overviewStats.totalRawStockKg} /> kg
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-xs text-[#6f6c64]">{t('inventory.statOpenBatches')}</div>
          <div className="mt-1 text-base font-bold text-[#1f1e1b]">
            <IntegerText value={overviewStats.openBatches} />
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-xs text-[#6f6c64]">{t('inventory.statBatchValue')}</div>
          <div className="mt-1 text-base font-bold text-[#1f1e1b]">
            <MoneyText value={overviewStats.totalValuation} />
          </div>
        </SurfaceCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#e4e2da] px-5 pb-2">
        <Button
          size="sm"
          variant={activeTab === 'position' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('position')}
        >
          {t('inventory.tabPosition')}
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'movements' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('movements')}
        >
          {t('inventory.tabMovements')}
        </Button>
      </div>

      {activeTab === 'position' ? (
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
              {t('inventory.batchStockSection')}
            </h3>
            <DataTable
              data={batchesQuery.data?.data ?? []}
              columns={batchStockColumns}
              getRowId={(r) => String(r.id)}
              onRowClick={(r) => onOpenBatch360(r.id)}
              isLoading={batchesQuery.isLoading}
              zebra
              emptyTitle={t('batches.emptyTitle')}
              emptyDescription={t('batches.emptyDescription')}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
              {t('inventory.rawStockSection')}
            </h3>
            <DataTable
              data={itemsQuery.data?.data ?? []}
              columns={rawItemColumns}
              getRowId={(r) => String(r.id)}
              isLoading={itemsQuery.isLoading}
              zebra
              emptyTitle={t('items.emptyTitle')}
              emptyDescription={t('items.emptyDescription')}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <FilterBar
            searchValue={search}
            searchPlaceholder={t('inventory.searchMovements')}
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
                id: 'scope',
                label: 'Scope',
                value: scope,
                allLabel: t('inventory.allScopes'),
                options: [
                  { value: 'RAW', label: t('inventory.scopeRaw') },
                  { value: 'BATCH', label: t('inventory.scopeBatch') },
                ],
                onChange: (val) => {
                  setScope((val || 'ALL') as 'ALL' | 'RAW' | 'BATCH');
                  setPage(1);
                },
              },
              {
                id: 'item',
                label: t('inventory.colItem'),
                value: itemFilter,
                allLabel: t('batches.allItems'),
                options: (itemsQuery.data?.data ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.name,
                })),
                onChange: (val) => {
                  setItemFilter(val);
                  setPage(1);
                },
              },
              {
                id: 'type',
                label: t('inventory.colType'),
                value: typeFilter,
                allLabel: t('inventory.allMovementTypes'),
                options: STOCK_MOVEMENT_TYPES.map((mt) => ({
                  value: mt,
                  label: t(`inventory.movementTypes.${mt}`),
                })),
                onChange: (val) => {
                  setTypeFilter(val);
                  setPage(1);
                },
              },
            ]}
            clearLabel={t('common.clear')}
            onClear={() => {
              setSearch('');
              setScope('ALL');
              setItemFilter('');
              setTypeFilter('');
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
          />

          <DataTable
            data={movementsQuery.data?.data ?? []}
            columns={movementColumns}
            getRowId={(r) => String(r.id)}
            isLoading={movementsQuery.isLoading}
            zebra
            emptyTitle={t('batches.emptyTitle')}
            emptyDescription={t('batches.emptyDescription')}
          />

          <Pagination
            page={page}
            pageSize={pageSize}
            total={movementsQuery.data?.total ?? 0}
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
        </div>
      )}
    </div>
  );
}
