import {
  BATCH_ADJUSTMENT_REASONS,
  BATCH_COST_TYPES,
  BATCH_STATUSES,
  calculateAllocationAmount,
  calculateBatchMetrics,
  type AvailablePurchaseItemDto,
  type BatchAdjustmentReason,
  type BatchCostType,
  type BatchStatus,
  type BatchSummaryDto,
  type PageSizeOption,
  type SortOrder,
} from '@mini-erp/shared';
import {
  Button,
  Combobox,
  DataTable,
  DatePicker,
  Drawer,
  EntityLink,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
  LineItemGrid,
  MoneyText,
  NumberInput,
  PageHeader,
  Pagination,
  RowActions,
  Select,
  StatusBadge,
  SurfaceCard,
  TextArea,
  TextInput,
  useHotkeys,
  useToast,
  WeightText,
  type ColumnDef,
  type DataTableColumnMeta,
  type LineItemColumn,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addBatchAllocations,
  addBatchCost,
  adjustBatchStock,
  closeBatch,
  createBatch,
  fetchAvailablePurchaseItems,
  fetchBatchById,
  fetchBatches,
  fetchItems,
  updateBatchWastage,
  voidBatchCost,
} from '../lib/api.js';

interface DraftAllocationRow {
  readonly key: string;
  readonly filterItemId: number;
  readonly purchaseItemId: number;
  readonly kgUsed: string;
  readonly notes: string;
}

interface DraftCostRow {
  readonly key: string;
  readonly costType: BatchCostType;
  readonly costDate: string;
  readonly description: string;
  readonly amount: string;
}

export interface BatchesScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly inspectBatchId?: number | null;
  readonly onClearInspect?: () => void;
  readonly onOpenSupplier360: (supplierId: number) => void;
  readonly onOpenPurchaseDetail: (purchaseId: number) => void;
}

function makeEmptyAllocationRow(target?: AvailablePurchaseItemDto): DraftAllocationRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filterItemId: target?.itemId ?? 0,
    purchaseItemId: target?.purchaseItemId ?? 0,
    kgUsed: target?.availableQtyBase ?? '0.000',
    notes: '',
  };
}

function makeEmptyCostRow(today: string): DraftCostRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    costType: 'LABOUR',
    costDate: today,
    description: '',
    amount: '0.00',
  };
}

export function BatchesScreen({
  canCreate,
  canEdit,
  inspectBatchId,
  onClearInspect,
  onOpenSupplier360,
  onOpenPurchaseDetail,
}: BatchesScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // List filters & pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [itemFilter, setItemFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [sortBy, setSortBy] = useState<string>('batchDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Create Batch drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [batchNameUr, setBatchNameUr] = useState('');
  const [batchDate, setBatchDate] = useState(todayStr);
  const [primaryItemId, setPrimaryItemId] = useState<string>('');
  const [wastageMode, setWastageMode] = useState<'PERCENT' | 'KG'>('PERCENT');
  const [wastagePercent, setWastagePercent] = useState('2.000');
  const [wastageKg, setWastageKg] = useState('0.000');
  const [batchNotes, setBatchNotes] = useState('');
  const [allocations, setAllocations] = useState<DraftAllocationRow[]>([]);
  const [costs, setCosts] = useState<DraftCostRow[]>([]);

  // 360° Batch Workspace drawer state
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'sources' | 'costs' | 'wastage' | 'movements'>(
    'sources',
  );

  // Workspace inline forms
  const [extraAllocPurchaseItemId, setExtraAllocPurchaseItemId] = useState<string>('');
  const [extraAllocKg, setExtraAllocKg] = useState('0.000');
  const [extraAllocNote, setExtraAllocNote] = useState('');

  const [newCostType, setNewCostType] = useState<BatchCostType>('LABOUR');
  const [newCostDate, setNewCostDate] = useState(todayStr);
  const [newCostDesc, setNewCostDesc] = useState('');
  const [newCostAmount, setNewCostAmount] = useState('0.00');

  const [editWastageMode, setEditWastageMode] = useState<'PERCENT' | 'KG'>('PERCENT');
  const [editWastagePercent, setEditWastagePercent] = useState('0.000');
  const [editWastageKg, setEditWastageKg] = useState('0.000');
  const [actualOutputOnClose, setActualOutputOnClose] = useState('');
  const [closeNote, setCloseNote] = useState('');

  const [adjDeltaKg, setAdjDeltaKg] = useState('-1.000');
  const [adjReason, setAdjReason] = useState<BatchAdjustmentReason>('SPILLAGE');
  const [adjNote, setAdjNote] = useState('');

  useEffect(() => {
    if (inspectBatchId) {
      setActiveBatchId(inspectBatchId);
      setWorkspaceTab('sources');
      onClearInspect?.();
    }
  }, [inspectBatchId, onClearInspect]);

  const itemsQuery = useQuery({
    queryKey: ['items', 'dropdown'],
    queryFn: () => fetchItems({ page: 1, pageSize: 100, isActive: true }),
  });

  const batchesQuery = useQuery({
    queryKey: [
      'batches',
      { page, pageSize, search, statusFilter, itemFilter, dateFrom, dateTo, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchBatches({
        page,
        pageSize,
        search: search || undefined,
        status: (statusFilter || undefined) as BatchStatus | undefined,
        itemId: itemFilter ? Number(itemFilter) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
  });

  // Always load ALL unallocated purchase items across ALL purchases and ALL items
  // so no item is ever hidden when allocating from multiple purchases.
  const availablePurchasesQuery = useQuery({
    queryKey: ['batches', 'available-purchase-items'],
    queryFn: () => fetchAvailablePurchaseItems(),
  });

  const activeBatchQuery = useQuery({
    queryKey: ['batches', 'detail', activeBatchId],
    queryFn: () => fetchBatchById(activeBatchId!),
    enabled: activeBatchId !== null,
  });

  useEffect(() => {
    if (activeBatchQuery.data) {
      setEditWastageMode('PERCENT');
      setEditWastagePercent(activeBatchQuery.data.wastagePercent);
      setEditWastageKg(activeBatchQuery.data.wastageKg);
      setActualOutputOnClose(activeBatchQuery.data.outputKg);
    }
  }, [activeBatchQuery.data]);

  const availablePurchases = useMemo(
    () => availablePurchasesQuery.data ?? [],
    [availablePurchasesQuery.data],
  );

  const availablePurchaseMap = useMemo(() => {
    const map = new Map<number, AvailablePurchaseItemDto>();
    for (const row of availablePurchases) {
      map.set(row.purchaseItemId, row);
    }
    return map;
  }, [availablePurchases]);

  // Distinct items that currently have unallocated purchase stock
  const itemsInRawStock = useMemo(() => {
    const byItem = new Map<
      number,
      {
        itemId: number;
        itemName: string;
        totalUnallocatedKg: Decimal;
        lotCount: number;
      }
    >();
    for (const p of availablePurchases) {
      const existing = byItem.get(p.itemId);
      const availDec = new Decimal(p.availableQtyBase || '0');
      if (existing) {
        existing.totalUnallocatedKg = existing.totalUnallocatedKg.plus(availDec);
        existing.lotCount += 1;
      } else {
        byItem.set(p.itemId, {
          itemId: p.itemId,
          itemName: p.itemName,
          totalUnallocatedKg: availDec,
          lotCount: 1,
        });
      }
    }
    return Array.from(byItem.values());
  }, [availablePurchases]);

  const openCreateDrawer = () => {
    setBatchName('');
    setBatchNameUr('');
    setBatchDate(todayStr);
    setPrimaryItemId('');
    setWastageMode('PERCENT');
    setWastagePercent('2.000');
    setWastageKg('0.000');
    setBatchNotes('');
    setAllocations([makeEmptyAllocationRow()]);
    setCosts([]);
    setCreateOpen(true);
  };

  const handleAddNextAllocationRow = () => {
    const usedIds = new Set(
      allocations.filter((r) => r.purchaseItemId > 0).map((r) => r.purchaseItemId),
    );
    const remainingLots = availablePurchases.filter((p) => !usedIds.has(p.purchaseItemId));
    if (remainingLots.length === 0) {
      showToast({
        title: 'All available purchase lines in stock are already added to this batch.',
        tone: 'neutral',
      });
      return;
    }
    setAllocations((prev) => [...prev, makeEmptyAllocationRow()]);
  };

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !createOpen && activeBatchId === null) {
          openCreateDrawer();
        }
      },
    },
  ]);

  // Live calculation in Create Batch drawer
  const livePreview = useMemo(() => {
    try {
      const allocComputed = allocations
        .filter((a) => a.purchaseItemId > 0)
        .map((a) => {
          const pItem = availablePurchaseMap.get(a.purchaseItemId);
          const rate = pItem?.ratePerBase ?? '0.0000';
          const kg = new Decimal(a.kgUsed || '0').gt(0) ? a.kgUsed : '0.000';
          return {
            kgUsed: kg,
            amount: calculateAllocationAmount(kg, rate),
          };
        });

      const activeCostList = costs
        .filter((c) => new Decimal(c.amount || '0').gt(0))
        .map((c) => ({ amount: c.amount }));

      return calculateBatchMetrics({
        allocations: allocComputed,
        activeCosts: activeCostList,
        wastageMode,
        wastagePercent,
        wastageKg,
      });
    } catch {
      return {
        rawKg: '0.000',
        wastagePercent: '0.000',
        wastageKg: '0.000',
        outputKg: '0.000',
        rawCost: '0.00',
        extraCost: '0.00',
        totalCost: '0.00',
        costPerKg: '0.00',
      };
    }
  }, [allocations, costs, availablePurchaseMap, wastageMode, wastagePercent, wastageKg]);

  const invalidateAllBatchData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['batches'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['purchases'] }),
    ]);
  };

  const createBatchMutation = useMutation({
    mutationFn: createBatch,
    onSuccess: async (created) => {
      await invalidateAllBatchData();
      showToast({ title: t('batches.savedToast'), tone: 'success' });
      setCreateOpen(false);
      setActiveBatchId(created.id);
      setWorkspaceTab('sources');
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const allocateMutation = useMutation({
    mutationFn: (vars: {
      batchId: number;
      purchaseItemId: number;
      kgUsed: string;
      notes?: string;
    }) =>
      addBatchAllocations(vars.batchId, {
        allocations: [
          {
            purchaseItemId: vars.purchaseItemId,
            kgUsed: vars.kgUsed,
            notes: vars.notes,
          },
        ],
      }),
    onSuccess: async () => {
      await invalidateAllBatchData();
      setExtraAllocKg('0.000');
      setExtraAllocNote('');
      showToast({ title: t('batches.allocatedToast'), tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const addCostMutation = useMutation({
    mutationFn: (vars: {
      batchId: number;
      costType: BatchCostType;
      costDate: string;
      description: string;
      amount: string;
    }) =>
      addBatchCost(vars.batchId, {
        costType: vars.costType,
        costDate: vars.costDate,
        description: vars.description,
        amount: vars.amount,
      }),
    onSuccess: async () => {
      await invalidateAllBatchData();
      setNewCostDesc('');
      setNewCostAmount('0.00');
      showToast({ title: t('batches.costAddedToast'), tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const voidCostMutation = useMutation({
    mutationFn: (vars: { batchId: number; costId: number }) =>
      voidBatchCost(vars.batchId, vars.costId, { reason: 'Voided by user from batch workspace' }),
    onSuccess: async () => {
      await invalidateAllBatchData();
      showToast({ title: t('batches.costVoidedToast'), tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const updateWastageMutation = useMutation({
    mutationFn: (vars: {
      batchId: number;
      wastageMode: 'PERCENT' | 'KG';
      wastagePercent: string;
      wastageKg: string;
    }) =>
      updateBatchWastage(vars.batchId, {
        wastageMode: vars.wastageMode,
        wastagePercent: vars.wastagePercent,
        wastageKg: vars.wastageKg,
      }),
    onSuccess: async () => {
      await invalidateAllBatchData();
      showToast({ title: t('batches.wastageUpdatedToast'), tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const closeBatchMutation = useMutation({
    mutationFn: (vars: { batchId: number; actualOutputKg?: string; note?: string }) =>
      closeBatch(vars.batchId, {
        actualOutputKg: vars.actualOutputKg,
        note: vars.note,
      }),
    onSuccess: async () => {
      await invalidateAllBatchData();
      showToast({ title: t('batches.closedToast'), tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: (vars: {
      batchId: number;
      deltaQtyBase: string;
      reasonCode: BatchAdjustmentReason;
      note: string;
    }) =>
      adjustBatchStock(vars.batchId, {
        deltaQtyBase: vars.deltaQtyBase,
        reasonCode: vars.reasonCode,
        note: vars.note,
      }),
    onSuccess: async () => {
      await invalidateAllBatchData();
      setAdjNote('');
      showToast({ title: t('batches.adjustedToast'), tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const handleSaveNewBatch = (andNew: boolean) => {
    const validAllocations = allocations.filter(
      (a) => a.purchaseItemId > 0 && new Decimal(a.kgUsed || '0').gt(0),
    );
    if (!batchName.trim() || validAllocations.length === 0) {
      showToast({ title: t('batches.noAvailablePurchases'), tone: 'danger' });
      return;
    }

    // Merge duplicate purchaseItemId rows if any
    const mergedMap = new Map<number, { purchaseItemId: number; kgUsed: Decimal; notes: string }>();
    for (const a of validAllocations) {
      const existing = mergedMap.get(a.purchaseItemId);
      const kg = new Decimal(a.kgUsed);
      if (existing) {
        existing.kgUsed = existing.kgUsed.plus(kg);
      } else {
        mergedMap.set(a.purchaseItemId, {
          purchaseItemId: a.purchaseItemId,
          kgUsed: kg,
          notes: a.notes.trim(),
        });
      }
    }

    // Validate against available unallocated stock before sending
    for (const m of mergedMap.values()) {
      const pItem = availablePurchaseMap.get(m.purchaseItemId);
      if (pItem && m.kgUsed.gt(new Decimal(pItem.availableQtyBase))) {
        showToast({
          title: `Cannot allocate ${m.kgUsed.toFixed(3)} kg from ${pItem.invoiceNo} (${pItem.itemName}): only ${pItem.availableQtyBase} kg available in stock.`,
          tone: 'danger',
        });
        return;
      }
    }

    const validCosts = costs.filter(
      (c) => c.description.trim().length > 0 && new Decimal(c.amount || '0').gt(0),
    );

    createBatchMutation.mutate(
      {
        name: batchName.trim(),
        nameUr: batchNameUr.trim() || undefined,
        itemId: primaryItemId ? Number(primaryItemId) : undefined,
        batchDate,
        status: 'OPEN',
        wastageMode,
        wastagePercent,
        wastageKg,
        notes: batchNotes.trim() || undefined,
        allocations: Array.from(mergedMap.values()).map((a) => ({
          purchaseItemId: a.purchaseItemId,
          kgUsed: a.kgUsed.toFixed(3),
          notes: a.notes || undefined,
        })),
        costs: validCosts.map((c) => ({
          costType: c.costType,
          costDate: c.costDate,
          description: c.description.trim(),
          amount: c.amount,
        })),
      },
      {
        onSuccess: () => {
          if (andNew) {
            openCreateDrawer();
          }
        },
      },
    );
  };

  // Totals footer row
  const pageTotals = useMemo(() => {
    const rows = batchesQuery.data?.data ?? [];
    let rawKg = new Decimal(0);
    let outputKg = new Decimal(0);
    let availKg = new Decimal(0);
    let totalCost = new Decimal(0);
    for (const r of rows) {
      rawKg = rawKg.plus(r.rawKg);
      outputKg = outputKg.plus(r.outputKg);
      availKg = availKg.plus(r.availableKg);
      totalCost = totalCost.plus(r.totalCost);
    }
    return {
      rawKg: rawKg.toFixed(3),
      outputKg: outputKg.toFixed(3),
      availKg: availKg.toFixed(3),
      totalCost: totalCost.toFixed(2),
    };
  }, [batchesQuery.data?.data]);

  const columns = useMemo<ColumnDef<BatchSummaryDto, unknown>[]>(
    () => [
      {
        id: 'id',
        accessorKey: 'id',
        header: t('batches.colId'),
        size: 56,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'batchNo',
        accessorKey: 'batchNo',
        header: t('batches.colBatchNo'),
        size: 135,
        meta: {
          footer: <span className="font-semibold">{t('common.totals')}</span>,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <EntityLink
            mono
            onClick={() => {
              setActiveBatchId(row.original.id);
              setWorkspaceTab('sources');
            }}
          >
            {row.original.batchNo}
          </EntityLink>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('batches.colName'),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-[#1f1e1b]">{row.original.name}</span>
            {row.original.nameUr ? (
              <span className="font-urdu text-xs text-[#6f6c64]">{row.original.nameUr}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'itemName',
        accessorKey: 'itemName',
        header: t('batches.colItem'),
        cell: ({ row }) => row.original.itemName ?? '—',
      },
      {
        id: 'batchDate',
        accessorKey: 'batchDate',
        header: t('batches.colDate'),
        size: 105,
      },
      {
        id: 'rawKg',
        accessorKey: 'rawKg',
        header: t('batches.colRawKg'),
        meta: {
          align: 'right',
          footer: <WeightText value={pageTotals.rawKg} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.rawKg} />,
      },
      {
        id: 'wastage',
        header: t('batches.colWastage'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-[#6f6c64]">
            {row.original.wastageKg} kg ({row.original.wastagePercent}%)
          </span>
        ),
      },
      {
        id: 'outputKg',
        accessorKey: 'outputKg',
        header: t('batches.colOutputKg'),
        meta: {
          align: 'right',
          footer: <WeightText value={pageTotals.outputKg} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.outputKg} />,
      },
      {
        id: 'availableKg',
        accessorKey: 'availableKg',
        header: t('batches.colAvailableKg'),
        meta: {
          align: 'right',
          footer: <WeightText value={pageTotals.availKg} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.availableKg} />,
      },
      {
        id: 'totalCost',
        accessorKey: 'totalCost',
        header: t('batches.colTotalCost'),
        meta: {
          align: 'right',
          footer: <MoneyText value={pageTotals.totalCost} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.totalCost} />,
      },
      {
        id: 'costPerKg',
        accessorKey: 'costPerKg',
        header: t('batches.colCostPerKg'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold text-[#1f1e1b]">
            <MoneyText value={row.original.costPerKg} />
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('batches.colStatus'),
        size: 95,
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.status === 'CLOSED'
                ? 'neutral'
                : row.original.status === 'OPEN'
                  ? 'success'
                  : 'warning'
            }
          >
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 195,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <RowActions
              actions={[
                {
                  id: 'view',
                  label: t('batches.actionView'),
                  inline: true,
                  onClick: () => {
                    setActiveBatchId(b.id);
                    setWorkspaceTab('sources');
                  },
                },
                {
                  id: 'cost',
                  label: t('batches.actionAddCost'),
                  inline: true,
                  disabled: !canEdit || b.status === 'CLOSED',
                  onClick: () => {
                    setActiveBatchId(b.id);
                    setWorkspaceTab('costs');
                  },
                },
                {
                  id: 'adjust',
                  label: t('batches.actionAdjust'),
                  disabled: !canEdit,
                  onClick: () => {
                    setActiveBatchId(b.id);
                    setWorkspaceTab('movements');
                  },
                },
                {
                  id: 'close',
                  label: t('batches.actionClose'),
                  disabled: !canEdit || b.status === 'CLOSED',
                  onClick: () => {
                    setActiveBatchId(b.id);
                    setWorkspaceTab('wastage');
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [t, canEdit, pageTotals],
  );

  // Searchable Item + Purchase Line columns so users can search & pick any item from any purchase in stock
  // Already-added purchase lines are excluded from other rows so the same purchase item cannot be added twice.
  const allocationColumns = useMemo<LineItemColumn<DraftAllocationRow>[]>(
    () => [
      {
        id: 'filterItemId',
        header: t('batches.colItem'),
        width: '195px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          const selectedPurchase = availablePurchaseMap.get(row.purchaseItemId);
          const effectiveItemId = row.filterItemId || selectedPurchase?.itemId || 0;

          // Purchase lines already added on OTHER rows
          const usedIdsOnOtherRows = new Set(
            allocations
              .filter((r, i) => i !== rowIndex && r.purchaseItemId > 0)
              .map((r) => r.purchaseItemId),
          );

          // Only show items that still have unadded purchase lines (plus the current row's selected item so its label renders)
          const itemOptions = itemsInRawStock
            .map((it) => {
              const unusedLotsForItem = availablePurchases.filter(
                (p) => p.itemId === it.itemId && !usedIdsOnOtherRows.has(p.purchaseItemId),
              );
              const remainingKgToSelect = unusedLotsForItem.reduce(
                (acc, p) => acc.plus(new Decimal(p.availableQtyBase || '0')),
                new Decimal(0),
              );
              return {
                itemId: it.itemId,
                itemName: it.itemName,
                unusedLotCount: unusedLotsForItem.length,
                remainingKg: remainingKgToSelect,
              };
            })
            .filter((it) => it.unusedLotCount > 0 || it.itemId === effectiveItemId)
            .map((it) => ({
              value: String(it.itemId),
              label: it.itemName,
              subtitle: `${it.remainingKg.toFixed(3)} kg in stock`,
            }));

          return (
            <Combobox
              {...inputProps}
              allowClear
              value={effectiveItemId ? String(effectiveItemId) : ''}
              placeholder="Search item…"
              searchPlaceholder="Type item name…"
              emptyText="All items in stock are already added"
              onChange={(val) => {
                const nextItemId = val ? Number(val) : 0;
                setAllocations((prev) => {
                  if (!nextItemId) {
                    return prev.map((r, idx) =>
                      idx === rowIndex
                        ? {
                            ...r,
                            filterItemId: 0,
                            purchaseItemId: 0,
                            kgUsed: '0.000',
                          }
                        : r,
                    );
                  }
                  const otherUsed = new Set(
                    prev
                      .filter((_, i) => i !== rowIndex && _.purchaseItemId > 0)
                      .map((r) => r.purchaseItemId),
                  );
                  const bestLot = availablePurchases.find(
                    (p) => p.itemId === nextItemId && !otherUsed.has(p.purchaseItemId),
                  );
                  return prev.map((r, idx) =>
                    idx === rowIndex
                      ? {
                          ...r,
                          filterItemId: nextItemId,
                          purchaseItemId: bestLot?.purchaseItemId ?? 0,
                          kgUsed: bestLot?.availableQtyBase ?? '0.000',
                        }
                      : r,
                  );
                });
              }}
              options={itemOptions}
            />
          );
        },
      },
      {
        id: 'purchaseItemId',
        header: t('batches.colPurchaseRef'),
        width: '290px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          const selectedPurchase = availablePurchaseMap.get(row.purchaseItemId);
          const effectiveItemId = row.filterItemId || selectedPurchase?.itemId || 0;

          // Exclude purchase lines already selected on OTHER rows
          const usedIdsOnOtherRows = new Set(
            allocations
              .filter((r, i) => i !== rowIndex && r.purchaseItemId > 0)
              .map((r) => r.purchaseItemId),
          );

          const filteredLots = availablePurchases.filter((p) => {
            if (usedIdsOnOtherRows.has(p.purchaseItemId)) return false;
            if (effectiveItemId && p.itemId !== effectiveItemId) return false;
            return true;
          });

          return (
            <Combobox
              {...inputProps}
              value={row.purchaseItemId ? String(row.purchaseItemId) : ''}
              placeholder="Search purchase / item…"
              searchPlaceholder="Search invoice no, item, or supplier…"
              emptyText="No more unallocated purchase lines left"
              onChange={(val) => {
                const selectedId = val ? Number(val) : 0;
                const found = availablePurchaseMap.get(selectedId);
                setAllocations((prev) =>
                  prev.map((r, idx) =>
                    idx === rowIndex
                      ? {
                          ...r,
                          filterItemId: found?.itemId ?? r.filterItemId,
                          purchaseItemId: selectedId,
                          kgUsed: found?.availableQtyBase ?? '0.000',
                        }
                      : r,
                  ),
                );
              }}
              options={filteredLots.map((p) => ({
                value: String(p.purchaseItemId),
                label: `${p.invoiceNo} · ${p.itemName} (${p.supplierName})`,
                subtitle: `${p.availableQtyBase} kg @ ${Number(p.ratePerBase).toFixed(2)}/kg`,
              }))}
            />
          );
        },
      },
      {
        id: 'unallocated',
        header: t('batches.colUnallocatedKg'),
        align: 'right',
        width: '115px',
        editable: false,
        renderCell: ({ row }) => {
          const found = availablePurchaseMap.get(row.purchaseItemId);
          return <WeightText value={found?.availableQtyBase ?? '0.000'} />;
        },
      },
      {
        id: 'kgUsed',
        header: t('batches.colAllocateKg'),
        align: 'right',
        width: '135px',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="weight"
            value={row.kgUsed}
            onChange={(val) =>
              setAllocations((prev) =>
                prev.map((r, idx) => (idx === rowIndex ? { ...r, kgUsed: val } : r)),
              )
            }
          />
        ),
      },
      {
        id: 'remainingLotKg',
        header: 'Remain (KG)',
        align: 'right',
        width: '115px',
        editable: false,
        renderCell: ({ row }) => {
          const found = availablePurchaseMap.get(row.purchaseItemId);
          if (!found) return <WeightText value="0.000" />;
          const rem = new Decimal(found.availableQtyBase || '0').minus(
            new Decimal(row.kgUsed || '0'),
          );
          return (
            <span className={rem.lt(0) ? 'font-semibold text-[#9e3b33]' : 'text-[#2c6b48]'}>
              <WeightText value={rem.toFixed(3)} />
            </span>
          );
        },
      },
      {
        id: 'ratePerKg',
        header: t('batches.colRatePerKg'),
        align: 'right',
        width: '115px',
        editable: false,
        renderCell: ({ row }) => {
          const found = availablePurchaseMap.get(row.purchaseItemId);
          return <MoneyText value={found ? new Decimal(found.ratePerBase).toFixed(2) : '0.00'} />;
        },
      },
      {
        id: 'lineCost',
        header: t('batches.colLineCost'),
        align: 'right',
        width: '130px',
        editable: false,
        renderCell: ({ row }) => {
          const found = availablePurchaseMap.get(row.purchaseItemId);
          const amt =
            found && new Decimal(row.kgUsed || '0').gt(0)
              ? calculateAllocationAmount(row.kgUsed, found.ratePerBase)
              : '0.00';
          return <MoneyText value={amt} />;
        },
      },
    ],
    [t, allocations, availablePurchaseMap, availablePurchases, itemsInRawStock],
  );

  const costColumns = useMemo<LineItemColumn<DraftCostRow>[]>(
    () => [
      {
        id: 'costType',
        header: t('batches.colCostType'),
        width: '180px',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <Select
            {...inputProps}
            value={row.costType}
            onChange={(e) =>
              setCosts((prev) =>
                prev.map((r, idx) =>
                  idx === rowIndex ? { ...r, costType: e.target.value as BatchCostType } : r,
                ),
              )
            }
            options={BATCH_COST_TYPES.map((ct) => ({
              value: ct,
              label: t(`batches.costTypes.${ct}`),
            }))}
          />
        ),
      },
      {
        id: 'costDate',
        header: t('batches.colCostDate'),
        width: '145px',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <DatePicker
            {...inputProps}
            value={row.costDate}
            onChange={(e) =>
              setCosts((prev) =>
                prev.map((r, idx) => (idx === rowIndex ? { ...r, costDate: e.target.value } : r)),
              )
            }
          />
        ),
      },
      {
        id: 'description',
        header: t('batches.colDescription'),
        renderCell: ({ row, rowIndex, inputProps }) => (
          <TextInput
            {...inputProps}
            value={row.description}
            onChange={(e) =>
              setCosts((prev) =>
                prev.map((r, idx) =>
                  idx === rowIndex ? { ...r, description: e.target.value } : r,
                ),
              )
            }
          />
        ),
      },
      {
        id: 'amount',
        header: t('batches.colAmount'),
        align: 'right',
        width: '150px',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="money"
            value={row.amount}
            onChange={(val) =>
              setCosts((prev) =>
                prev.map((r, idx) => (idx === rowIndex ? { ...r, amount: val } : r)),
              )
            }
          />
        ),
      },
    ],
    [t],
  );

  const activeBatch = activeBatchQuery.data;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('batches.title')}
        subtitle={t('batches.subtitle')}
        primaryAction={
          canCreate
            ? {
                label: t('batches.newBatch'),
                shortcutHint: 'Ctrl+N',
                onClick: openCreateDrawer,
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder={t('batches.searchPlaceholder')}
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
            id: 'status',
            label: t('batches.colStatus'),
            value: statusFilter,
            allLabel: t('batches.allStatuses'),
            options: BATCH_STATUSES.map((s) => ({ value: s, label: s })),
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
          {
            id: 'item',
            label: t('batches.colItem'),
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
        ]}
        clearLabel={t('common.clear')}
        onClear={() => {
          setSearch('');
          setStatusFilter('');
          setItemFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        data={batchesQuery.data?.data ?? []}
        columns={columns}
        getRowId={(row) => String(row.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(colId, order) => {
          setSortBy(colId);
          setSortOrder(order);
        }}
        onRowClick={(row) => {
          setActiveBatchId(row.id);
          setWorkspaceTab('sources');
        }}
        isLoading={batchesQuery.isLoading}
        zebra
        emptyTitle={t('batches.emptyTitle')}
        emptyDescription={t('batches.emptyDescription')}
        columnsButtonLabel={t('common.columns')}
        loadingLabel={t('common.loading')}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={batchesQuery.data?.total ?? 0}
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

      {/* Create Batch Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('batches.newBatch')}
        widthClass="max-w-5xl"
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            saveAndNew: t('common.saveAndNew'),
            cancel: t('common.cancel'),
          }}
          onSubmit={() => handleSaveNewBatch(false)}
          onSaveAndNew={() => handleSaveNewBatch(true)}
          onCancel={() => setCreateOpen(false)}
          isSubmitting={createBatchMutation.isPending}
          footerSlot={
            <div className="space-y-4">
              {/* 1. Purchase Allocations */}
              <LineItemGrid
                title={t('batches.allocationsTitle')}
                rows={allocations}
                columns={allocationColumns}
                getRowKey={(r) => r.key}
                onAddRow={handleAddNextAllocationRow}
                onRemoveRow={(idx) =>
                  setAllocations((prev) =>
                    prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                  )
                }
                addRowLabel={t('batches.addAllocationRow')}
                removeRowLabel={t('common.delete')}
              />

              {/* 2. Extra Batch Expenses */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                    {t('batches.costsTitle')}
                  </h4>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setCosts((prev) => [...prev, makeEmptyCostRow(batchDate)])}
                  >
                    + {t('batches.addCostRow')}
                  </Button>
                </div>
                {costs.length > 0 ? (
                  <LineItemGrid
                    rows={costs}
                    columns={costColumns}
                    getRowKey={(r) => r.key}
                    onAddRow={() => setCosts((prev) => [...prev, makeEmptyCostRow(batchDate)])}
                    onRemoveRow={(idx) => setCosts((prev) => prev.filter((_, i) => i !== idx))}
                    addRowLabel={t('batches.addCostRow')}
                    removeRowLabel={t('common.delete')}
                  />
                ) : null}
              </div>

              {/* Live Costing Summary Bar */}
              <SurfaceCard className="bg-[#faf9f5] p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                  <div>
                    <div className="text-xs text-[#6f6c64]">{t('batches.summaryRawKg')}</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      <WeightText value={livePreview.rawKg} /> kg
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6f6c64]">{t('batches.summaryWastage')}</div>
                    <div className="mt-0.5 text-sm font-semibold text-[#9e3b33]">
                      {livePreview.wastageKg} kg ({livePreview.wastagePercent}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6f6c64]">{t('batches.summaryOutputKg')}</div>
                    <div className="mt-0.5 text-sm font-semibold text-[#2c6b48]">
                      <WeightText value={livePreview.outputKg} /> kg
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6f6c64]">{t('batches.summaryRawCost')}</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      <MoneyText value={livePreview.rawCost} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6f6c64]">{t('batches.summaryTotalCost')}</div>
                    <div className="mt-0.5 text-sm font-semibold">
                      <MoneyText value={livePreview.totalCost} />
                    </div>
                  </div>
                  <div className="rounded border border-[#d6d3c9] bg-white px-2.5 py-1">
                    <div className="text-xs font-medium text-[#6f6c64]">
                      {t('batches.summaryCostPerKg')}
                    </div>
                    <div className="mt-0.5 text-base font-bold text-[#1f1e1b]">
                      <MoneyText value={livePreview.costPerKg} /> / kg
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            </div>
          }
        >
          <FormField label={t('batches.name')} required>
            <TextInput
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Daal Chana — Lot 01"
            />
          </FormField>

          <FormField label={t('batches.nameUr')}>
            <TextInput
              dir="rtl"
              className="font-urdu"
              value={batchNameUr}
              onChange={(e) => setBatchNameUr(e.target.value)}
              placeholder="دال چنا — لاٹ 01"
            />
          </FormField>

          <FormField label={t('batches.batchDate')} required>
            <DatePicker value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
          </FormField>

          <FormField label={t('batches.primaryItem')}>
            <Combobox
              allowClear
              value={primaryItemId}
              placeholder="Search item…"
              searchPlaceholder="Type item name…"
              onChange={(val) => setPrimaryItemId(val)}
              options={(itemsQuery.data?.data ?? []).map((item) => ({
                value: String(item.id),
                label: item.name,
                subtitle: `${item.rawStockQtyBase} kg in raw stock`,
              }))}
            />
          </FormField>

          <FormField label={t('batches.wastageMode')}>
            <Select
              value={wastageMode}
              onChange={(e) => setWastageMode(e.target.value as 'PERCENT' | 'KG')}
              options={[
                { value: 'PERCENT', label: t('batches.wastageModePercent') },
                { value: 'KG', label: t('batches.wastageModeKg') },
              ]}
            />
          </FormField>

          {wastageMode === 'PERCENT' ? (
            <FormField
              label={`${t('batches.wastagePercent')} (= ${livePreview.wastageKg} kg)`}
              required
            >
              <NumberInput precision="weight" value={wastagePercent} onChange={setWastagePercent} />
            </FormField>
          ) : (
            <FormField
              label={`${t('batches.wastageKg')} (= ${livePreview.wastagePercent}%)`}
              required
            >
              <NumberInput precision="weight" value={wastageKg} onChange={setWastageKg} />
            </FormField>
          )}

          <div className="sm:col-span-2">
            <FormField label={t('common.notes')}>
              <TextArea
                rows={2}
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
              />
            </FormField>
          </div>
        </FormLayout>
      </Drawer>

      {/* Batch 360° Workspace Drawer */}
      <Drawer
        open={activeBatchId !== null}
        onClose={() => setActiveBatchId(null)}
        title={t('batches.workspaceTitle', { no: activeBatch?.batchNo ?? '' })}
        widthClass="max-w-5xl"
      >
        {activeBatch ? (
          <div className="space-y-4 p-4">
            {activeBatch.status === 'CLOSED' ? (
              <div className="rounded border border-[#d6d3c9] bg-[#f4f2ec] px-3 py-2 text-xs font-medium text-[#1f1e1b]">
                {t('batches.lockedBanner', { costPerKg: activeBatch.costPerKg })}
              </div>
            ) : null}

            {/* 6 KPI Summary Cards */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
              <SurfaceCard className="p-2.5">
                <div className="text-xs text-[#6f6c64]">{t('batches.colRawKg')}</div>
                <div className="mt-1 text-sm font-semibold">
                  <WeightText value={activeBatch.rawKg} /> kg
                </div>
              </SurfaceCard>
              <SurfaceCard className="p-2.5">
                <div className="text-xs text-[#6f6c64]">{t('batches.colWastage')}</div>
                <div className="mt-1 text-sm font-semibold text-[#9e3b33]">
                  {activeBatch.wastageKg} kg ({activeBatch.wastagePercent}%)
                </div>
              </SurfaceCard>
              <SurfaceCard className="p-2.5">
                <div className="text-xs text-[#6f6c64]">{t('batches.colOutputKg')}</div>
                <div className="mt-1 text-sm font-semibold">
                  <WeightText value={activeBatch.outputKg} /> kg
                </div>
              </SurfaceCard>
              <SurfaceCard className="p-2.5">
                <div className="text-xs text-[#6f6c64]">{t('batches.colAvailableKg')}</div>
                <div className="mt-1 text-sm font-semibold text-[#2c6b48]">
                  <WeightText value={activeBatch.availableKg} /> kg
                </div>
              </SurfaceCard>
              <SurfaceCard className="p-2.5">
                <div className="text-xs text-[#6f6c64]">{t('batches.colTotalCost')}</div>
                <div className="mt-1 text-sm font-semibold">
                  <MoneyText value={activeBatch.totalCost} />
                </div>
              </SurfaceCard>
              <SurfaceCard className="border-[#1f1e1b]/30 bg-[#f4f2ec] p-2.5">
                <div className="text-xs font-medium text-[#6f6c64]">
                  {t('batches.colCostPerKg')}
                </div>
                <div className="mt-1 text-base font-bold text-[#1f1e1b]">
                  <MoneyText value={activeBatch.costPerKg} /> / kg
                </div>
              </SurfaceCard>
            </div>

            {/* Workspace Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-[#e4e2da] pb-2">
              <Button
                size="sm"
                variant={workspaceTab === 'sources' ? 'primary' : 'secondary'}
                onClick={() => setWorkspaceTab('sources')}
              >
                {t('batches.tabSources')} ({activeBatch.sources.length})
              </Button>
              <Button
                size="sm"
                variant={workspaceTab === 'costs' ? 'primary' : 'secondary'}
                onClick={() => setWorkspaceTab('costs')}
              >
                {t('batches.tabCosts')} ({activeBatch.costs.filter((c) => !c.isVoided).length})
              </Button>
              <Button
                size="sm"
                variant={workspaceTab === 'wastage' ? 'primary' : 'secondary'}
                onClick={() => setWorkspaceTab('wastage')}
              >
                {t('batches.tabWastageClose')}
              </Button>
              <Button
                size="sm"
                variant={workspaceTab === 'movements' ? 'primary' : 'secondary'}
                onClick={() => setWorkspaceTab('movements')}
              >
                {t('batches.tabMovements')} ({activeBatch.movements.length})
              </Button>
            </div>

            {/* Tab 1: Purchase Allocations */}
            {workspaceTab === 'sources' ? (
              <div className="space-y-3">
                {canEdit && activeBatch.status !== 'CLOSED' ? (
                  <SurfaceCard className="p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                      + {t('batches.addAllocationRow')}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <Combobox
                          value={extraAllocPurchaseItemId}
                          placeholder={t('batches.selectPurchaseLine')}
                          searchPlaceholder="Search invoice no, item, or supplier…"
                          onChange={(val) => {
                            setExtraAllocPurchaseItemId(val);
                            const found = availablePurchaseMap.get(Number(val));
                            if (found) setExtraAllocKg(found.availableQtyBase);
                          }}
                          options={availablePurchases.map((p) => ({
                            value: String(p.purchaseItemId),
                            label: `${p.invoiceNo} · ${p.itemName} (${p.supplierName})`,
                            subtitle: `${p.availableQtyBase} kg avail @ ${Number(p.ratePerBase).toFixed(2)}/kg`,
                          }))}
                        />
                      </div>
                      <div>
                        <NumberInput
                          precision="weight"
                          value={extraAllocKg}
                          onChange={setExtraAllocKg}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <TextInput
                          placeholder={t('common.notes')}
                          value={extraAllocNote}
                          onChange={(e) => setExtraAllocNote(e.target.value)}
                        />
                        <Button
                          variant="primary"
                          disabled={
                            !extraAllocPurchaseItemId ||
                            new Decimal(extraAllocKg || '0').lte(0) ||
                            allocateMutation.isPending
                          }
                          onClick={() =>
                            allocateMutation.mutate({
                              batchId: activeBatch.id,
                              purchaseItemId: Number(extraAllocPurchaseItemId),
                              kgUsed: extraAllocKg,
                              notes: extraAllocNote || undefined,
                            })
                          }
                        >
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  </SurfaceCard>
                ) : null}

                <div className="overflow-x-auto rounded border border-[#e4e2da]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-[#f4f2ec] text-[#6f6c64]">
                      <tr className="border-b border-[#e4e2da]">
                        <th className="px-2.5 py-2">{t('purchases.colInvoiceNo')}</th>
                        <th className="px-2.5 py-2">{t('batches.colSupplier')}</th>
                        <th className="px-2.5 py-2">{t('batches.colItem')}</th>
                        <th className="px-2.5 py-2 text-end">{t('batches.colAllocateKg')}</th>
                        <th className="px-2.5 py-2 text-end">{t('batches.colRatePerKg')}</th>
                        <th className="px-2.5 py-2 text-end">{t('batches.colLineCost')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e4e2da]">
                      {activeBatch.sources.map((s) => (
                        <tr key={s.id} className="hover:bg-[#faf9f5]">
                          <td className="px-2.5 py-1.5">
                            <EntityLink
                              mono
                              onClick={() => {
                                setActiveBatchId(null);
                                onOpenPurchaseDetail(s.purchaseId);
                              }}
                            >
                              {s.invoiceNo}
                            </EntityLink>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <EntityLink
                              onClick={() => {
                                setActiveBatchId(null);
                                onOpenSupplier360(s.supplierId);
                              }}
                            >
                              {s.supplierName}
                            </EntityLink>
                          </td>
                          <td className="px-2.5 py-1.5">{s.itemName}</td>
                          <td className="px-2.5 py-1.5 text-end">
                            <WeightText value={s.kgUsed} />
                          </td>
                          <td className="px-2.5 py-1.5 text-end">
                            <MoneyText value={new Decimal(s.ratePerBase).toFixed(2)} />
                          </td>
                          <td className="px-2.5 py-1.5 text-end font-medium">
                            <MoneyText value={s.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Tab 2: Batch Expenses */}
            {workspaceTab === 'costs' ? (
              <div className="space-y-3">
                {canEdit && activeBatch.status !== 'CLOSED' ? (
                  <SurfaceCard className="p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                      + {t('batches.addCostRow')}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                      <Select
                        value={newCostType}
                        onChange={(e) => setNewCostType(e.target.value as BatchCostType)}
                        options={BATCH_COST_TYPES.map((ct) => ({
                          value: ct,
                          label: t(`batches.costTypes.${ct}`),
                        }))}
                      />
                      <DatePicker
                        value={newCostDate}
                        onChange={(e) => setNewCostDate(e.target.value)}
                      />
                      <div className="sm:col-span-2">
                        <TextInput
                          placeholder={t('batches.colDescription')}
                          value={newCostDesc}
                          onChange={(e) => setNewCostDesc(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <NumberInput
                          precision="money"
                          value={newCostAmount}
                          onChange={setNewCostAmount}
                        />
                        <Button
                          variant="primary"
                          disabled={
                            !newCostDesc.trim() ||
                            new Decimal(newCostAmount || '0').lte(0) ||
                            addCostMutation.isPending
                          }
                          onClick={() =>
                            addCostMutation.mutate({
                              batchId: activeBatch.id,
                              costType: newCostType,
                              costDate: newCostDate,
                              description: newCostDesc.trim(),
                              amount: newCostAmount,
                            })
                          }
                        >
                          {t('common.save')}
                        </Button>
                      </div>
                    </div>
                  </SurfaceCard>
                ) : null}

                <div className="overflow-x-auto rounded border border-[#e4e2da]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-[#f4f2ec] text-[#6f6c64]">
                      <tr className="border-b border-[#e4e2da]">
                        <th className="px-2.5 py-2">{t('batches.colCostDate')}</th>
                        <th className="px-2.5 py-2">{t('batches.colCostType')}</th>
                        <th className="px-2.5 py-2">{t('batches.colDescription')}</th>
                        <th className="px-2.5 py-2 text-end">{t('batches.colAmount')}</th>
                        <th className="px-2.5 py-2 text-end">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e4e2da]">
                      {activeBatch.costs.map((c) => (
                        <tr
                          key={c.id}
                          className={c.isVoided ? 'line-through opacity-50' : 'hover:bg-[#faf9f5]'}
                        >
                          <td className="px-2.5 py-1.5">{c.costDate}</td>
                          <td className="px-2.5 py-1.5">{t(`batches.costTypes.${c.costType}`)}</td>
                          <td className="px-2.5 py-1.5">{c.description}</td>
                          <td className="px-2.5 py-1.5 text-end font-medium">
                            <MoneyText value={c.amount} />
                          </td>
                          <td className="px-2.5 py-1.5 text-end">
                            {!c.isVoided && canEdit && activeBatch.status !== 'CLOSED' ? (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  voidCostMutation.mutate({
                                    batchId: activeBatch.id,
                                    costId: c.id,
                                  })
                                }
                              >
                                Void
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Tab 3: Wastage & Close Batch */}
            {workspaceTab === 'wastage' ? (
              <div className="space-y-4">
                <SurfaceCard className="p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                    {t('batches.varianceTitle')}
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-[#6f6c64]">{t('batches.plannedWastage')}</div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {activeBatch.variance.plannedWastageKg} kg (
                        {activeBatch.variance.plannedWastagePercent}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6f6c64]">{t('batches.actualWastage')}</div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {activeBatch.variance.actualWastageKg} kg (
                        {activeBatch.variance.actualWastagePercent}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6f6c64]">{t('batches.wastageDiff')}</div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {activeBatch.variance.wastageDiffKg} kg
                      </div>
                    </div>
                  </div>
                </SurfaceCard>

                {canEdit && activeBatch.status !== 'CLOSED' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SurfaceCard className="space-y-3 p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                        {t('batches.wastageMode')}
                      </h4>
                      <FormField label={t('batches.wastageMode')}>
                        <Select
                          value={editWastageMode}
                          onChange={(e) => setEditWastageMode(e.target.value as 'PERCENT' | 'KG')}
                          options={[
                            { value: 'PERCENT', label: t('batches.wastageModePercent') },
                            { value: 'KG', label: t('batches.wastageModeKg') },
                          ]}
                        />
                      </FormField>
                      {editWastageMode === 'PERCENT' ? (
                        <FormField label={t('batches.wastagePercent')}>
                          <NumberInput
                            precision="weight"
                            value={editWastagePercent}
                            onChange={setEditWastagePercent}
                          />
                        </FormField>
                      ) : (
                        <FormField label={t('batches.wastageKg')}>
                          <NumberInput
                            precision="weight"
                            value={editWastageKg}
                            onChange={setEditWastageKg}
                          />
                        </FormField>
                      )}
                      <Button
                        variant="primary"
                        disabled={updateWastageMutation.isPending}
                        onClick={() =>
                          updateWastageMutation.mutate({
                            batchId: activeBatch.id,
                            wastageMode: editWastageMode,
                            wastagePercent: editWastagePercent,
                            wastageKg: editWastageKg,
                          })
                        }
                      >
                        {t('common.save')}
                      </Button>
                    </SurfaceCard>

                    <SurfaceCard className="space-y-3 p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                        {t('batches.actionClose')}
                      </h4>
                      <FormField
                        label={t('batches.actualOutputLabel')}
                        hint={t('batches.actualOutputHint', { outputKg: activeBatch.outputKg })}
                      >
                        <NumberInput
                          precision="weight"
                          value={actualOutputOnClose}
                          onChange={setActualOutputOnClose}
                        />
                      </FormField>
                      <FormField label={t('common.notes')}>
                        <TextInput
                          value={closeNote}
                          onChange={(e) => setCloseNote(e.target.value)}
                        />
                      </FormField>
                      <Button
                        variant="primary"
                        disabled={closeBatchMutation.isPending}
                        onClick={() =>
                          closeBatchMutation.mutate({
                            batchId: activeBatch.id,
                            actualOutputKg: actualOutputOnClose || undefined,
                            note: closeNote || undefined,
                          })
                        }
                      >
                        {t('batches.closeConfirmBtn')}
                      </Button>
                    </SurfaceCard>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Tab 4: Stock Movements Log & Stock Adjustment */}
            {workspaceTab === 'movements' ? (
              <div className="space-y-3">
                {canEdit ? (
                  <SurfaceCard className="p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6f6c64]">
                      {t('batches.adjustTitle')}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div>
                        <FormField label={t('batches.deltaQtyLabel')}>
                          <TextInput
                            value={adjDeltaKg}
                            onChange={(e) => setAdjDeltaKg(e.target.value)}
                            placeholder="-5.000"
                          />
                        </FormField>
                      </div>
                      <div>
                        <FormField label={t('batches.reasonLabel')}>
                          <Select
                            value={adjReason}
                            onChange={(e) => setAdjReason(e.target.value as BatchAdjustmentReason)}
                            options={BATCH_ADJUSTMENT_REASONS.map((r) => ({
                              value: r,
                              label: t(`batches.adjustReasons.${r}`),
                            }))}
                          />
                        </FormField>
                      </div>
                      <div className="sm:col-span-2">
                        <FormField label={t('common.notes')} required>
                          <div className="flex items-center gap-2">
                            <TextInput
                              value={adjNote}
                              onChange={(e) => setAdjNote(e.target.value)}
                              placeholder="Reason / physical count note…"
                            />
                            <Button
                              variant="primary"
                              disabled={adjNote.trim().length < 3 || adjustStockMutation.isPending}
                              onClick={() =>
                                adjustStockMutation.mutate({
                                  batchId: activeBatch.id,
                                  deltaQtyBase: adjDeltaKg,
                                  reasonCode: adjReason,
                                  note: adjNote.trim(),
                                })
                              }
                            >
                              {t('common.save')}
                            </Button>
                          </div>
                        </FormField>
                      </div>
                    </div>
                  </SurfaceCard>
                ) : null}

                <div className="overflow-x-auto rounded border border-[#e4e2da]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-[#f4f2ec] text-[#6f6c64]">
                      <tr className="border-b border-[#e4e2da]">
                        <th className="px-2.5 py-2">{t('inventory.colDate')}</th>
                        <th className="px-2.5 py-2">{t('inventory.colType')}</th>
                        <th className="px-2.5 py-2">{t('inventory.colRefNo')}</th>
                        <th className="px-2.5 py-2 text-end">{t('inventory.colQtyBase')}</th>
                        <th className="px-2.5 py-2">{t('inventory.colNote')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e4e2da]">
                      {activeBatch.movements.map((m) => (
                        <tr key={m.id} className="hover:bg-[#faf9f5]">
                          <td className="px-2.5 py-1.5 tabular-nums">
                            {m.createdAt.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <StatusBadge
                              tone={new Decimal(m.qtyBase).gte(0) ? 'success' : 'danger'}
                            >
                              {t(`inventory.movementTypes.${m.type}`)}
                            </StatusBadge>
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">{m.refNo ?? '—'}</td>
                          <td className="px-2.5 py-1.5 text-end font-semibold">
                            <WeightText value={m.qtyBase} />
                          </td>
                          <td className="px-2.5 py-1.5 text-[#6f6c64]">{m.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
