import {
  calculateSaleLineAmounts,
  PAYMENT_METHODS,
  SALE_STATUSES,
  type BatchSummaryDto,
  type CreateSaleInvoiceInput,
  type ItemDto,
  type PageSizeOption,
  type PaymentMethod,
  type SaleInvoiceDto,
  type SaleStatus,
  type SortOrder,
} from '@mini-erp/shared';
import {
  Button,
  Combobox,
  DataTable,
  DatePicker,
  Dialog,
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
import { PrintDocumentDialog, type PrintableDocument } from '../components/print-document-dialog';
import {
  createChallan,
  createSale,
  fetchBatches,
  fetchChallan,
  fetchClients,
  fetchItems,
  fetchRoutes,
  fetchSaleById,
  fetchSales,
  voidSale,
} from '../lib/api.js';

interface DraftSaleLine {
  readonly key: string;
  readonly lineType: 'BATCH' | 'RAW';
  readonly batchId: number;
  readonly itemId: number;
  readonly enteredUnit: string;
  readonly conversionFactor: string;
  readonly enteredQty: string;
  readonly bagCount: string;
  readonly ratePerEnteredUnit: string;
  readonly taxRate: string;
  readonly batchCostRateSnapshot: string;
  readonly notes: string;
}

function makeEmptyBatchSaleLine(defaultTaxRate = '0.00'): DraftSaleLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lineType: 'BATCH',
    batchId: 0,
    itemId: 0,
    enteredUnit: 'KG',
    conversionFactor: '1.000',
    enteredQty: '0.000',
    bagCount: '0',
    ratePerEnteredUnit: '0.00',
    taxRate: defaultTaxRate,
    batchCostRateSnapshot: '0.0000',
    notes: '',
  };
}

function makeEmptyRawSaleLine(defaultTaxRate = '0.00'): DraftSaleLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lineType: 'RAW',
    batchId: 0,
    itemId: 0,
    enteredUnit: 'KG',
    conversionFactor: '1.000',
    enteredQty: '0.000',
    bagCount: '0',
    ratePerEnteredUnit: '0.00',
    taxRate: defaultTaxRate,
    batchCostRateSnapshot: '0.0000',
    notes: '',
  };
}

export interface SalesInvoicesScreenProps {
  readonly canCreate: boolean;
  readonly canVoid: boolean;
  readonly canReceivePayment?: boolean;
  readonly taxEnabled: boolean;
  readonly defaultTaxRate: string;
  readonly initialClientIdForNewSale?: number | null;
  readonly inspectSaleId?: number | null;
  readonly onClearInitial?: () => void;
  readonly onOpenClient360: (clientId: number) => void;
  readonly onOpenBatchWorkspace: (batchId: number) => void;
  readonly onCreateCreditNote: (saleId: number) => void;
  readonly onReceivePayment?: (clientId: number, saleId: number) => void;
}

export function SalesInvoicesScreen({
  canCreate,
  canVoid,
  canReceivePayment = false,
  taxEnabled,
  defaultTaxRate,
  initialClientIdForNewSale,
  inspectSaleId,
  onClearInitial,
  onOpenClient360,
  onOpenBatchWorkspace,
  onCreateCreditNote,
  onReceivePayment,
}: SalesInvoicesScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // List filters
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [sortBy, setSortBy] = useState<string>('saleDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Create drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [clientId, setClientId] = useState<number>(0);
  const [routeId, setRouteId] = useState<string>('');
  const [saleDate, setSaleDate] = useState(todayStr);
  const [discount, setDiscount] = useState('0.00');
  const [extraCharges, setExtraCharges] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [paidNowAmount, setPaidNowAmount] = useState('0.00');
  const [paidNowMethod, setPaidNowMethod] = useState<PaymentMethod>('CASH');
  const [paidNowRef, setPaidNowRef] = useState('');
  const [lines, setLines] = useState<DraftSaleLine[]>([]);

  // Detail & Void dialogs
  const [detailSaleId, setDetailSaleId] = useState<number | null>(null);
  const [voidTarget, setVoidTarget] = useState<SaleInvoiceDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);

  // Reference Queries
  const clientsQuery = useQuery({
    queryKey: ['clients', 'dropdown'],
    queryFn: () => fetchClients({ page: 1, pageSize: 100, isActive: true }),
  });

  const routesQuery = useQuery({
    queryKey: ['routes', 'dropdown'],
    queryFn: () => fetchRoutes({ page: 1, pageSize: 100, isActive: true }),
  });

  const batchesQuery = useQuery({
    queryKey: ['batches', 'open-dropdown'],
    queryFn: () => fetchBatches({ page: 1, pageSize: 100, status: 'OPEN' }),
  });

  const itemsQuery = useQuery({
    queryKey: ['items', 'dropdown'],
    queryFn: () => fetchItems({ page: 1, pageSize: 100, isActive: true }),
  });

  const clients = useMemo(() => clientsQuery.data?.data ?? [], [clientsQuery.data?.data]);
  const routes = useMemo(() => routesQuery.data?.data ?? [], [routesQuery.data?.data]);
  const openBatches = useMemo(
    () => (batchesQuery.data?.data ?? []).filter((b) => new Decimal(b.availableKg || 0).gt(0)),
    [batchesQuery.data?.data],
  );
  const items = useMemo(() => itemsQuery.data?.data ?? [], [itemsQuery.data?.data]);
  const inStockItems = useMemo(
    () => items.filter((it) => new Decimal(it.rawStockQtyBase || 0).gt(0)),
    [items],
  );

  const batchMap = useMemo(() => {
    const m = new Map<number, BatchSummaryDto>();
    for (const b of openBatches) m.set(b.id, b);
    return m;
  }, [openBatches]);

  const itemMap = useMemo(() => {
    const m = new Map<number, ItemDto>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const openCreateDrawer = (forClientId?: number) => {
    if (!canCreate) return;
    const pickedClient = forClientId ? clients.find((c) => c.id === forClientId) : undefined;
    setClientId(forClientId ?? 0);
    setRouteId(pickedClient?.routeId ? String(pickedClient.routeId) : '');
    setSaleDate(todayStr);
    setDiscount('0.00');
    setExtraCharges('0.00');
    setNotes('');
    setPaidNowAmount('0.00');
    setPaidNowMethod('CASH');
    setPaidNowRef('');
    setLines([makeEmptyBatchSaleLine(taxEnabled ? defaultTaxRate : '0.00')]);
    setCreateOpen(true);
  };

  useEffect(() => {
    if (initialClientIdForNewSale) {
      openCreateDrawer(initialClientIdForNewSale);
      onClearInitial?.();
    }
    if (inspectSaleId) {
      setDetailSaleId(inspectSaleId);
      onClearInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientIdForNewSale, inspectSaleId]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !createOpen && !detailSaleId) {
          openCreateDrawer();
        }
      },
    },
  ]);

  const salesQuery = useQuery({
    queryKey: [
      'sales',
      {
        page,
        pageSize,
        search,
        clientFilter,
        routeFilter,
        statusFilter,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      fetchSales({
        page,
        pageSize,
        search: search.trim() || undefined,
        clientId: clientFilter ? Number(clientFilter) : undefined,
        routeId: routeFilter ? Number(routeFilter) : undefined,
        status: (statusFilter || undefined) as SaleStatus | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
  });

  const detailSaleQuery = useQuery({
    queryKey: ['sales', 'detail', detailSaleId],
    queryFn: () => fetchSaleById(detailSaleId!),
    enabled: detailSaleId !== null,
  });

  // Live totals calculation
  const computedSummary = useMemo(() => {
    let subtotalDec = new Decimal(0);
    let taxTotalDec = new Decimal(0);
    let totalCogsDec = new Decimal(0);
    let totalQtyDec = new Decimal(0);

    const lineCalcs = lines.map((l) => {
      const calc = calculateSaleLineAmounts({
        enteredQty: l.enteredQty,
        conversionFactor: l.conversionFactor,
        ratePerEnteredUnit: l.ratePerEnteredUnit,
        taxRate: taxEnabled ? l.taxRate : '0.00',
        batchCostRateSnapshot: l.batchCostRateSnapshot,
      });
      subtotalDec = subtotalDec.plus(new Decimal(calc.lineSubtotal));
      taxTotalDec = taxTotalDec.plus(new Decimal(calc.taxAmount));
      totalCogsDec = totalCogsDec.plus(new Decimal(calc.lineCogs));
      totalQtyDec = totalQtyDec.plus(new Decimal(calc.qtyBase));
      return calc;
    });

    const discountDec = new Decimal(discount || 0);
    const extraDec = new Decimal(extraCharges || 0);
    const netTotalDec = subtotalDec.plus(taxTotalDec).minus(discountDec).plus(extraDec);
    const netRevenueExTaxDec = subtotalDec.minus(discountDec);
    const totalProfitDec = netRevenueExTaxDec.minus(totalCogsDec);
    const marginPercentDec = netRevenueExTaxDec.gt(0)
      ? totalProfitDec.div(netRevenueExTaxDec).mul(100)
      : new Decimal(0);

    return {
      lineCalcs,
      subtotal: subtotalDec.toFixed(2),
      taxTotal: taxTotalDec.toFixed(2),
      totalCogs: totalCogsDec.toFixed(2),
      totalProfit: totalProfitDec.toFixed(2),
      marginPercent: marginPercentDec.toFixed(2),
      totalQtyBase: totalQtyDec.toFixed(3),
      netTotal: netTotalDec.toFixed(2),
    };
  }, [lines, discount, extraCharges, taxEnabled]);

  const invalidateAllSalesData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
      queryClient.invalidateQueries({ queryKey: ['batches'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['client-ledger'] }),
    ]);
  };

  const createSaleMutation = useMutation({
    mutationFn: createSale,
    onSuccess: async () => {
      await invalidateAllSalesData();
      showToast({ title: 'Sale invoice posted and stock deducted', tone: 'success' });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const voidSaleMutation = useMutation({
    mutationFn: (vars: { id: number; reason: string }) => voidSale(vars.id, vars.reason),
    onSuccess: async () => {
      await invalidateAllSalesData();
      showToast({ title: 'Sale invoice voided and batch stock restored', tone: 'success' });
      setVoidTarget(null);
      setVoidReason('');
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const [challanDialogOpen, setChallanDialogOpen] = useState(false);
  const [challanSaleTarget, setChallanSaleTarget] = useState<SaleInvoiceDto | null>(null);
  const [challanDate, setChallanDate] = useState(todayStr);
  const [challanRiderName, setChallanRiderName] = useState('');
  const [challanVehicleNo, setChallanVehicleNo] = useState('');
  const [challanNotes, setChallanNotes] = useState('');

  const createChallanMutation = useMutation({
    mutationFn: createChallan,
    onSuccess: (newChallan) => {
      showToast({ title: `Delivery Challan ${newChallan.challanNo} created`, tone: 'success' });
      setChallanDialogOpen(false);
      setChallanSaleTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['challans'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      setPrintDoc({ type: 'CHALLAN', data: newChallan });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const handleCreateChallan = () => {
    if (!challanSaleTarget) return;
    createChallanMutation.mutate({
      saleId: challanSaleTarget.id,
      challanDate: challanDate || todayStr,
      riderName: challanRiderName.trim() || undefined,
      vehicleNo: challanVehicleNo.trim() || undefined,
      notes: challanNotes.trim() || undefined,
    });
  };

  const handleSaveSale = (andNew: boolean) => {
    if (!clientId) {
      showToast({ title: 'Please select a client', tone: 'danger' });
      return;
    }

    const validLines = lines.filter((l) => {
      const hasSource = l.lineType === 'BATCH' ? l.batchId > 0 : l.itemId > 0;
      return hasSource && new Decimal(l.enteredQty || 0).gt(0);
    });
    if (validLines.length === 0) {
      showToast({
        title: 'Add at least one sale line with a batch or raw item, and positive quantity',
        tone: 'danger',
      });
      return;
    }

    const paidDec = new Decimal(paidNowAmount || 0);
    const payload: CreateSaleInvoiceInput = {
      clientId,
      routeId: routeId ? Number(routeId) : null,
      saleDate,
      discount: new Decimal(discount || 0).toFixed(2),
      extraCharges: new Decimal(extraCharges || 0).toFixed(2),
      notes: notes.trim() || undefined,
      lines: validLines.map((l) => ({
        lineType: l.lineType,
        batchId: l.lineType === 'BATCH' ? l.batchId : null,
        itemId: l.lineType === 'RAW' ? l.itemId : l.itemId || null,
        costRate:
          l.lineType === 'RAW' ? new Decimal(l.batchCostRateSnapshot || 0).toFixed(4) : undefined,
        enteredQty: new Decimal(l.enteredQty).toFixed(3),
        enteredUnit: l.enteredUnit,
        conversionFactor: new Decimal(l.conversionFactor || 1).toFixed(3),
        bagCount: Number.parseInt(l.bagCount || '0', 10) || null,
        ratePerEnteredUnit: new Decimal(l.ratePerEnteredUnit || 0).toFixed(4),
        taxRate: taxEnabled ? new Decimal(l.taxRate || 0).toFixed(2) : '0.00',
        notes: l.notes.trim() || undefined,
      })),
      ...(paidDec.gt(0)
        ? {
            paidNow: {
              amount: paidDec.toFixed(2),
              method: paidNowMethod,
              referenceNo: paidNowRef.trim() || undefined,
            },
          }
        : {}),
    };

    createSaleMutation.mutate(payload, {
      onSuccess: () => {
        if (andNew) {
          openCreateDrawer();
        } else {
          setCreateOpen(false);
        }
      },
    });
  };

  const saleLineColumns = useMemo<LineItemColumn<DraftSaleLine>[]>(
    () => [
      {
        id: 'lineType',
        header: 'Type',
        width: '80px',
        editable: false,
        renderCell: ({ row }) => (
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
              row.lineType === 'BATCH'
                ? 'bg-[#e3effb] text-[#1b5e94]'
                : 'bg-[#fef3d6] text-[#8a5b00]'
            }`}
          >
            {row.lineType}
          </span>
        ),
        footer: <span className="font-semibold">Totals</span>,
      },
      {
        id: 'source',
        header: 'Batch / Raw Item',
        width: '260px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          if (row.lineType === 'BATCH') {
            return (
              <Combobox
                {...inputProps}
                value={row.batchId ? String(row.batchId) : ''}
                placeholder="Select batch…"
                searchPlaceholder="Search batch no or name…"
                emptyText="No open batches with available stock"
                onChange={(val) => {
                  const bId = val ? Number(val) : 0;
                  const batch = batchMap.get(bId);
                  setLines((prev) =>
                    prev.map((r, idx) =>
                      idx === rowIndex
                        ? {
                            ...r,
                            batchId: bId,
                            itemId: batch?.itemId ?? 0,
                            enteredUnit: 'KG',
                            conversionFactor: '1.000',
                            batchCostRateSnapshot: batch?.costPerKg ?? '0.0000',
                          }
                        : r,
                    ),
                  );
                }}
                options={openBatches.map((b) => ({
                  value: String(b.id),
                  label: `${b.batchNo} · ${b.name}`,
                  subtitle: `Avail: ${b.availableKg} kg @ Cost ${b.costPerKg}/kg`,
                }))}
              />
            );
          }

          // RAW Item Line
          return (
            <Combobox
              {...inputProps}
              value={row.itemId ? String(row.itemId) : ''}
              placeholder="Select raw item…"
              searchPlaceholder="Type item name to search in-stock items…"
              minSearchLength={1}
              minSearchPrompt="Type at least 1 character to search raw items in stock…"
              emptyText="No in-stock raw items match your search"
              onChange={(val) => {
                const itId = val ? Number(val) : 0;
                const matched = itemMap.get(itId);
                setLines((prev) =>
                  prev.map((r, idx) =>
                    idx === rowIndex
                      ? {
                          ...r,
                          itemId: itId,
                          batchId: 0,
                          enteredUnit: matched?.baseUnit ?? 'KG',
                          conversionFactor: '1.000',
                          batchCostRateSnapshot: matched?.lastPurchaseRatePerBase ?? '0.0000',
                        }
                      : r,
                  ),
                );
              }}
              options={inStockItems.map((it) => ({
                value: String(it.id),
                label: `${it.name}${it.nameUr ? ` (${it.nameUr})` : ''}`,
                subtitle: `Raw stock: ${it.rawStockQtyBase} ${it.baseUnit} @ Last cost: ${it.lastPurchaseRatePerBase ?? '0.00'}`,
              }))}
            />
          );
        },
      },
      {
        id: 'inStock',
        header: 'In Stock',
        width: '105px',
        align: 'right',
        editable: false,
        renderCell: ({ row }) => {
          if (row.lineType === 'BATCH') {
            const batch = batchMap.get(row.batchId);
            const avail = batch?.availableKg ?? '0.000';
            return (
              <div className="flex flex-col items-end">
                <span className="font-mono text-xs font-semibold text-[#2c6b48]">{avail} KG</span>
                <span className="text-[10px] text-[#6f6c64]">in batch</span>
              </div>
            );
          }
          const item = itemMap.get(row.itemId);
          const avail = item?.rawStockQtyBase ?? '0.000';
          return (
            <div className="flex flex-col items-end">
              <span className="font-mono text-xs font-semibold text-[#2c6b48]">
                {avail} {item?.baseUnit ?? 'KG'}
              </span>
              <span className="text-[10px] text-[#6f6c64]">raw stock</span>
            </div>
          );
        },
      },
      {
        id: 'unit',
        header: 'Unit',
        width: '95px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          if (row.lineType === 'BATCH') {
            return <span className="px-2 py-1 font-mono text-xs text-[#6f6c64]">KG</span>;
          }
          const item = itemMap.get(row.itemId);
          const unitOpts = [
            { value: item?.baseUnit ?? 'KG', label: item?.baseUnit ?? 'KG', factor: '1.000' },
            ...(item?.alternateUnits.map((u) => ({
              value: u.unitName,
              label: `${u.unitName} (${u.conversionFactor})`,
              factor: u.conversionFactor,
            })) ?? []),
          ];
          return (
            <Select
              {...inputProps}
              value={row.enteredUnit}
              onChange={(e) => {
                const picked = unitOpts.find((u) => u.value === e.target.value);
                setLines((prev) =>
                  prev.map((r, idx) =>
                    idx === rowIndex
                      ? {
                          ...r,
                          enteredUnit: e.target.value,
                          conversionFactor: picked?.factor ?? '1.000',
                        }
                      : r,
                  ),
                );
              }}
              options={unitOpts.map((u) => ({ value: u.value, label: u.label }))}
            />
          );
        },
      },
      {
        id: 'enteredQty',
        header: 'Qty',
        align: 'right',
        width: '110px',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="weight"
            value={row.enteredQty}
            onChange={(val) =>
              setLines((prev) =>
                prev.map((r, idx) => (idx === rowIndex ? { ...r, enteredQty: val } : r)),
              )
            }
          />
        ),
        footer: <WeightText value={computedSummary.totalQtyBase} />,
      },
      {
        id: 'ratePerEnteredUnit',
        header: 'Sale Rate',
        align: 'right',
        width: '115px',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="money"
            value={row.ratePerEnteredUnit}
            onChange={(val) =>
              setLines((prev) =>
                prev.map((r, idx) => (idx === rowIndex ? { ...r, ratePerEnteredUnit: val } : r)),
              )
            }
          />
        ),
      },
      {
        id: 'costSnapshot',
        header: 'Cost Rate',
        align: 'right',
        width: '110px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          if (row.lineType === 'BATCH') {
            return (
              <span className="font-mono text-xs text-[#6f6c64]">
                {new Decimal(row.batchCostRateSnapshot || 0).toFixed(2)}
              </span>
            );
          }
          return (
            <NumberInput
              {...inputProps}
              precision="money"
              value={row.batchCostRateSnapshot}
              onChange={(val) =>
                setLines((prev) =>
                  prev.map((r, idx) =>
                    idx === rowIndex ? { ...r, batchCostRateSnapshot: val } : r,
                  ),
                )
              }
            />
          );
        },
      },
      {
        id: 'lineProfit',
        header: 'Profit',
        align: 'right',
        width: '110px',
        editable: false,
        renderCell: ({ rowIndex }) => {
          const lp = computedSummary.lineCalcs[rowIndex]?.lineProfit ?? '0.00';
          return (
            <MoneyText
              value={lp}
              className={new Decimal(lp).gte(0) ? 'text-[#2c6b48]' : 'text-[#9e3b33]'}
            />
          );
        },
        footer: (
          <MoneyText
            value={computedSummary.totalProfit}
            className={
              new Decimal(computedSummary.totalProfit).gte(0) ? 'text-[#2c6b48]' : 'text-[#9e3b33]'
            }
          />
        ),
      },
      {
        id: 'lineTotal',
        header: 'Line Total',
        align: 'right',
        width: '120px',
        editable: false,
        renderCell: ({ rowIndex }) => (
          <MoneyText value={computedSummary.lineCalcs[rowIndex]?.lineTotal ?? '0.00'} />
        ),
        footer: <MoneyText value={computedSummary.subtotal} />,
      },
    ],
    [openBatches, inStockItems, batchMap, itemMap, computedSummary],
  );

  const columns = useMemo<ColumnDef<SaleInvoiceDto, unknown>[]>(
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
          <div className="flex flex-col">
            <EntityLink onClick={() => setDetailSaleId(row.original.id)}>
              <span className="font-mono font-medium">{row.original.invoiceNo}</span>
            </EntityLink>
            {row.original.challanNo && (
              <span className="font-mono text-[10px] text-[#2c6b48]">
                CH: {row.original.challanNo}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'saleDate',
        accessorKey: 'saleDate',
        header: 'Date',
        size: 105,
      },
      {
        id: 'clientName',
        accessorKey: 'clientName',
        header: 'Client',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <EntityLink onClick={() => onOpenClient360(row.original.clientId)}>
              {row.original.clientName}
            </EntityLink>
            {row.original.routeName ? (
              <span className="text-[11px] text-[#6f6c64]">{row.original.routeName}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'totalQtyBase',
        accessorKey: 'totalQtyBase',
        header: 'Qty (KG)',
        size: 105,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.totalQtyBase} />,
      },
      {
        id: 'total',
        accessorKey: 'total',
        header: 'Total',
        size: 120,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} />,
      },
      {
        id: 'totalCogs',
        accessorKey: 'totalCogs',
        header: 'Snapshot COGS',
        size: 120,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.totalCogs} />,
      },
      {
        id: 'totalProfit',
        accessorKey: 'totalProfit',
        header: 'Profit',
        size: 125,
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
        size: 120,
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
        size: 95,
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
        size: 170,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'print',
                label: 'Print',
                inline: true,
                onClick: () => setPrintDoc({ type: 'SALE_INVOICE', data: row.original }),
              },
              {
                id: 'view',
                label: 'View',
                inline: true,
                onClick: () => setDetailSaleId(row.original.id),
              },
              ...(canReceivePayment && onReceivePayment
                ? [
                    {
                      id: 'receive-payment',
                      label: 'Receive',
                      inline: true,
                      disabled:
                        row.original.status === 'VOIDED' ||
                        new Decimal(row.original.balanceDue).lte(0),
                      onClick: () => onReceivePayment(row.original.clientId, row.original.id),
                    },
                  ]
                : []),
              {
                id: 'challan-action',
                label: row.original.challanNo
                  ? `Print Challan (${row.original.challanNo})`
                  : 'Generate Delivery Challan',
                disabled: row.original.status === 'VOIDED',
                onClick: async () => {
                  if (row.original.challanId) {
                    try {
                      const ch = await fetchChallan(row.original.challanId);
                      setPrintDoc({ type: 'CHALLAN', data: ch });
                    } catch (err: unknown) {
                      showToast({
                        title: err instanceof Error ? err.message : 'Failed to load challan',
                        tone: 'danger',
                      });
                    }
                  } else {
                    setChallanSaleTarget(row.original);
                    setChallanRiderName(
                      row.original.routeId
                        ? (routes.find((r) => r.id === row.original.routeId)?.assignedOfficerName ??
                            '')
                        : '',
                    );
                    setChallanVehicleNo('');
                    setChallanNotes('');
                    setChallanDate(todayStr);
                    setChallanDialogOpen(true);
                  }
                },
              },
              {
                id: 'credit-note',
                label: 'Credit Note (Return)',
                disabled: row.original.status === 'VOIDED',
                onClick: () => onCreateCreditNote(row.original.id),
              },
              {
                id: 'void',
                label: 'Void Invoice',
                tone: 'danger',
                disabled: !canVoid || row.original.status === 'VOIDED',
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
    [
      canVoid,
      canReceivePayment,
      onReceivePayment,
      onOpenClient360,
      onCreateCreditNote,
      routes,
      todayStr,
      showToast,
    ],
  );

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Sales Invoices (Batch Dispatch)"
        subtitle="Sell batch inventory with locked batch cost snapshots, real-time profit calculation, and client ledger posting"
        primaryAction={
          canCreate
            ? {
                label: 'New Sale Invoice',
                shortcutHint: 'Ctrl+N',
                onClick: () => openCreateDrawer(),
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder="Search by invoice no or client name…"
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        selects={[
          {
            id: 'client',
            label: 'Client',
            value: clientFilter,
            allLabel: 'All Clients',
            options: clients.map((c) => ({ value: String(c.id), label: c.name })),
            onChange: (val) => {
              setClientFilter(val);
              setPage(1);
            },
          },
          {
            id: 'route',
            label: 'Route',
            value: routeFilter,
            allLabel: 'All Routes',
            options: routes.map((r) => ({ value: String(r.id), label: r.name })),
            onChange: (val) => {
              setRouteFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: 'Status',
            value: statusFilter,
            allLabel: 'All Statuses',
            options: SALE_STATUSES.map((s) => ({ value: s, label: s })),
            onChange: (val) => {
              setStatusFilter(val);
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
        clearLabel="Clear"
        onClear={() => {
          setSearch('');
          setClientFilter('');
          setRouteFilter('');
          setStatusFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={salesQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        isLoading={salesQuery.isLoading}
        zebra
        emptyTitle="No sales invoices found"
        emptyDescription="Create a sale invoice to deduct stock from open batches and bill a client."
        columnsButtonLabel="Columns"
        loadingLabel="Loading sales invoices…"
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
          rowsPerPage: 'Invoices per page',
          showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
          firstPage: 'First',
          previousPage: 'Prev',
          nextPage: 'Next',
          lastPage: 'Last',
        }}
      />

      {/* Create Sale Invoice Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Sale Invoice (From Batches)"
        widthClass="max-w-5xl"
      >
        <FormLayout
          onSubmit={() => handleSaveSale(false)}
          onSaveAndNew={() => handleSaveSale(true)}
          onCancel={() => setCreateOpen(false)}
          labels={{
            save: 'Post Sale Invoice',
            saveAndNew: 'Post & New',
            cancel: 'Cancel',
          }}
          isSubmitting={createSaleMutation.isPending}
          footerSlot={
            <div className="space-y-4">
              <LineItemGrid
                title="Sale Lines"
                headerActions={
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          makeEmptyBatchSaleLine(taxEnabled ? defaultTaxRate : '0.00'),
                        ])
                      }
                    >
                      + Add Sale Line by Batch
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          makeEmptyRawSaleLine(taxEnabled ? defaultTaxRate : '0.00'),
                        ])
                      }
                    >
                      + Add Sale Line by Raw Item
                    </Button>
                  </div>
                }
                rows={lines}
                columns={saleLineColumns}
                getRowKey={(r) => r.key}
                onAddRow={() =>
                  setLines((prev) => [
                    ...prev,
                    makeEmptyBatchSaleLine(taxEnabled ? defaultTaxRate : '0.00'),
                  ])
                }
                onRemoveRow={(idx) =>
                  setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
                }
                addRowLabel="Add Sale Line by Batch"
                removeRowLabel="Remove"
              />

              {/* Totals & Profit Summary Card */}
              <div className="grid grid-cols-1 gap-4 rounded border border-[#d6d3c9] bg-[#f7f6f2] p-3 md:grid-cols-3">
                <div className="space-y-2">
                  <FormField label="Invoice Discount">
                    <NumberInput precision="money" value={discount} onChange={setDiscount} />
                  </FormField>
                  <FormField label="Extra Delivery / Loading Charges">
                    <NumberInput
                      precision="money"
                      value={extraCharges}
                      onChange={setExtraCharges}
                    />
                  </FormField>
                </div>

                <div className="space-y-2">
                  <FormField label="Immediate Cash / Bank Received (Optional)">
                    <NumberInput
                      precision="money"
                      value={paidNowAmount}
                      onChange={setPaidNowAmount}
                    />
                  </FormField>
                  {new Decimal(paidNowAmount || 0).gt(0) && (
                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="Method">
                        <Select
                          value={paidNowMethod}
                          onChange={(e) => setPaidNowMethod(e.target.value as PaymentMethod)}
                          options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                        />
                      </FormField>
                      <FormField label="Ref No">
                        <TextInput
                          placeholder="Receipt/Slip #"
                          value={paidNowRef}
                          onChange={(e) => setPaidNowRef(e.target.value)}
                        />
                      </FormField>
                    </div>
                  )}
                </div>

                <div className="flex flex-col justify-between rounded border border-[#e4e2da] bg-white p-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#6f6c64]">Lines Subtotal:</span>
                      <MoneyText value={computedSummary.subtotal} />
                    </div>
                    {taxEnabled && (
                      <div className="flex justify-between">
                        <span className="text-[#6f6c64]">Tax Total:</span>
                        <MoneyText value={computedSummary.taxTotal} />
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#6f6c64]">Snapshot COGS:</span>
                      <MoneyText value={computedSummary.totalCogs} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6f6c64]">
                        Locked Profit ({computedSummary.marginPercent}%):
                      </span>
                      <MoneyText
                        value={computedSummary.totalProfit}
                        className={
                          new Decimal(computedSummary.totalProfit).gte(0)
                            ? 'text-[#2c6b48]'
                            : 'text-[#9e3b33]'
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[#d6d3c9] pt-2 text-sm font-semibold">
                    <span>Net Invoice Total:</span>
                    <MoneyText value={computedSummary.netTotal} />
                  </div>
                </div>
              </div>
            </div>
          }
        >
          <FormField label="Client" required>
            <div className="flex flex-col gap-1">
              <Combobox
                value={clientId ? String(clientId) : ''}
                placeholder="Search client…"
                searchPlaceholder="Type client name or code…"
                onChange={(val) => {
                  const cId = val ? Number(val) : 0;
                  setClientId(cId);
                  const found = clients.find((c) => c.id === cId);
                  if (found?.routeId) {
                    setRouteId(String(found.routeId));
                  }
                }}
                options={clients.map((c) => ({
                  value: String(c.id),
                  label: `${c.name}${c.nameUr ? ` (${c.nameUr})` : ''}`,
                  subtitle: `Bal: ${c.currentBalance} · Limit: ${c.creditLimit}`,
                }))}
              />
              {selectedClient && (
                <span className="text-[11px] text-[#6f6c64]">
                  Current Receivable: <strong>{selectedClient.currentBalance}</strong> · Credit
                  Limit: <strong>{selectedClient.creditLimit}</strong>
                </span>
              )}
            </div>
          </FormField>

          <FormField label="Sale Date" required>
            <DatePicker value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </FormField>

          <FormField label="Delivery Route">
            <Combobox
              allowClear
              value={routeId}
              placeholder="Select route…"
              searchPlaceholder="Search route…"
              onChange={setRouteId}
              options={routes.map((r) => ({
                value: String(r.id),
                label: r.name,
                subtitle: r.assignedOfficerName ?? undefined,
              }))}
            />
          </FormField>

          <FormField label="Invoice Notes">
            <TextInput
              placeholder="Challan / vehicle or delivery instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </FormLayout>
      </Drawer>

      {/* Sale Invoice Detail Drawer */}
      <Drawer
        open={detailSaleId !== null}
        onClose={() => setDetailSaleId(null)}
        title={
          detailSaleQuery.data
            ? `Sale Invoice ${detailSaleQuery.data.invoiceNo}`
            : 'Sale Invoice Detail'
        }
        widthClass="max-w-4xl"
      >
        {detailSaleQuery.data && (
          <div className="space-y-4 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#d6d3c9] bg-[#f7f6f2] p-3">
              <div>
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  {detailSaleQuery.data.clientName}
                </div>
                <div className="text-[#6f6c64]">
                  Date: {detailSaleQuery.data.saleDate} · Route:{' '}
                  {detailSaleQuery.data.routeName ?? 'Unassigned'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  tone={
                    detailSaleQuery.data.status === 'PAID'
                      ? 'success'
                      : detailSaleQuery.data.status === 'VOIDED'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {detailSaleQuery.data.status}
                </StatusBadge>
                {detailSaleQuery.data.status !== 'VOIDED' && (
                  <>
                    {detailSaleQuery.data.challanNo ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            const ch = await fetchChallan(detailSaleQuery.data!.challanId!);
                            setPrintDoc({ type: 'CHALLAN', data: ch });
                          } catch (err: unknown) {
                            showToast({
                              title: err instanceof Error ? err.message : 'Failed to load challan',
                              tone: 'danger',
                            });
                          }
                        }}
                      >
                        Print Challan ({detailSaleQuery.data.challanNo})
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const target = detailSaleQuery.data!;
                          setChallanSaleTarget(target);
                          setChallanRiderName(
                            target.routeId
                              ? (routes.find((r) => r.id === target.routeId)?.assignedOfficerName ??
                                  '')
                              : '',
                          );
                          setChallanVehicleNo('');
                          setChallanNotes('');
                          setChallanDate(todayStr);
                          setChallanDialogOpen(true);
                        }}
                      >
                        Generate Delivery Challan
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const sId = detailSaleQuery.data!.id;
                        setDetailSaleId(null);
                        onCreateCreditNote(sId);
                      }}
                    >
                      Create Credit Note (Return)
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-[#d6d3c9] bg-white">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-[#f1efe9] text-[#5c5a53]">
                  <tr className="h-8 border-b border-[#d6d3c9]">
                    <th className="px-2.5 text-left font-semibold">Batch</th>
                    <th className="px-2.5 text-left font-semibold">Description</th>
                    <th className="px-2.5 text-right font-semibold">Sold Qty (KG)</th>
                    <th className="px-2.5 text-right font-semibold">Returned (KG)</th>
                    <th className="px-2.5 text-right font-semibold">Sale Rate</th>
                    <th className="px-2.5 text-right font-semibold">Cost Snapshot</th>
                    <th className="px-2.5 text-right font-semibold">COGS</th>
                    <th className="px-2.5 text-right font-semibold">Profit</th>
                    <th className="px-2.5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSaleQuery.data.items.map((item) => (
                    <tr key={item.id} className="h-9 border-b border-[#e4e2da]">
                      <td className="px-2.5">
                        {item.batchId && item.batchNo ? (
                          <EntityLink
                            onClick={() => {
                              setDetailSaleId(null);
                              onOpenBatchWorkspace(item.batchId!);
                            }}
                          >
                            <span className="font-mono">{item.batchNo}</span>
                          </EntityLink>
                        ) : (
                          <span className="rounded bg-[#fef3d6] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a5b00]">
                            RAW ITEM
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 font-medium">
                        {item.batchName || (item.batchNo ? `Batch ${item.batchNo}` : item.itemName)}
                      </td>
                      <td className="px-2.5 text-right">
                        <WeightText value={item.qtyBase} />
                      </td>
                      <td className="px-2.5 text-right">
                        <WeightText value={item.returnedQtyBase} />
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText value={item.ratePerEnteredUnit} />
                      </td>
                      <td className="px-2.5 text-right font-mono text-[#6f6c64]">
                        {new Decimal(item.batchCostRateSnapshot).toFixed(2)}
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText value={item.lineCogs} />
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText
                          value={item.lineProfit}
                          className={
                            new Decimal(item.lineProfit).gte(0)
                              ? 'text-[#2c6b48]'
                              : 'text-[#9e3b33]'
                          }
                        />
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText value={item.lineTotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded border border-[#d6d3c9] bg-[#f7f6f2] p-3 md:grid-cols-4">
              <div>
                <div className="text-[#6f6c64]">Invoice Total</div>
                <div className="text-sm font-semibold">
                  <MoneyText value={detailSaleQuery.data.total} />
                </div>
              </div>
              <div>
                <div className="text-[#6f6c64]">Total COGS (Snapshot)</div>
                <div className="text-sm font-semibold">
                  <MoneyText value={detailSaleQuery.data.totalCogs} />
                </div>
              </div>
              <div>
                <div className="text-[#6f6c64]">
                  Locked Profit ({detailSaleQuery.data.profitMarginPercent}%)
                </div>
                <div className="text-sm font-semibold">
                  <MoneyText
                    value={detailSaleQuery.data.totalProfit}
                    className={
                      new Decimal(detailSaleQuery.data.totalProfit).gte(0)
                        ? 'text-[#2c6b48]'
                        : 'text-[#9e3b33]'
                    }
                  />
                </div>
              </div>
              <div>
                <div className="text-[#6f6c64]">Balance Due</div>
                <div className="text-sm font-semibold">
                  <MoneyText
                    value={detailSaleQuery.data.balanceDue}
                    className={
                      new Decimal(detailSaleQuery.data.balanceDue).gt(0) ? 'text-[#9e3b33]' : ''
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Void Confirmation Dialog */}
      <Dialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void Sale Invoice ${voidTarget.invoiceNo}` : 'Void Sale Invoice'}
      >
        <div className="space-y-3 p-4">
          <p className="text-xs text-[#5c5a53]">
            Voiding this invoice will restore sold quantities back to their original batches and
            post a reversal credit entry to the client&apos;s ledger.
          </p>
          <FormField label="Reason for Voiding" required>
            <TextInput
              placeholder="Enter reason (min 3 characters)…"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={voidSaleMutation.isPending || voidReason.trim().length < 3}
              onClick={() => {
                if (voidTarget) {
                  voidSaleMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() });
                }
              }}
            >
              Confirm Void
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Create Delivery Challan Dialog */}
      <Dialog
        open={challanDialogOpen}
        onClose={() => {
          if (!createChallanMutation.isPending) {
            setChallanDialogOpen(false);
            setChallanSaleTarget(null);
          }
        }}
        title={
          challanSaleTarget?.challanNo
            ? `Delivery Challan for ${challanSaleTarget?.invoiceNo ?? ''} (Already Generated)`
            : `Create Delivery Challan for ${challanSaleTarget?.invoiceNo ?? ''}`
        }
      >
        <div className="space-y-3 p-4 text-xs">
          {challanSaleTarget?.challanNo && (
            <div className="rounded border border-[#d2b770] bg-[#fbf6e8] p-2.5 text-xs text-[#6e5114]">
              <strong>Already Generated:</strong> Delivery Challan{' '}
              <span className="font-mono font-bold text-[#1f1e1b]">
                {challanSaleTarget.challanNo}
              </span>{' '}
              was already created for this invoice. Re-printing will produce a{' '}
              <strong>DUPLICATE</strong> copy.
            </div>
          )}

          <div className="rounded border border-[#d6d3c9] bg-[#f7f6f2] p-2.5">
            <div className="flex justify-between">
              <span className="text-[#6f6c64]">Client:</span>
              <span className="font-semibold text-[#1f1e1b]">{challanSaleTarget?.clientName}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[#6f6c64]">Total Weight:</span>
              <span className="font-mono font-medium">
                {challanSaleTarget?.totalQtyBase ?? '0.000'} KG
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[#6f6c64]">Route:</span>
              <span>{challanSaleTarget?.routeName ?? 'Unassigned'}</span>
            </div>
          </div>

          <FormField label="Challan Date" required>
            <DatePicker value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
          </FormField>

          <div className="grid grid-cols-2 gap-2">
            <FormField label="Rider / Driver Name">
              <TextInput
                placeholder="e.g. Tariq / Driver"
                value={challanRiderName}
                onChange={(e) => setChallanRiderName(e.target.value)}
              />
            </FormField>
            <FormField label="Vehicle No">
              <TextInput
                placeholder="e.g. LES-1234"
                value={challanVehicleNo}
                onChange={(e) => setChallanVehicleNo(e.target.value)}
              />
            </FormField>
          </div>

          <FormField label="Dispatch / Gate Pass Notes">
            <TextInput
              placeholder="Delivery instructions, seal number, etc."
              value={challanNotes}
              onChange={(e) => setChallanNotes(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setChallanDialogOpen(false);
                setChallanSaleTarget(null);
              }}
              disabled={createChallanMutation.isPending}
            >
              Cancel
            </Button>
            {challanSaleTarget?.challanNo ? (
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    const ch = await fetchChallan(challanSaleTarget.challanId!);
                    setChallanDialogOpen(false);
                    setChallanSaleTarget(null);
                    setPrintDoc({ type: 'CHALLAN', data: ch });
                  } catch (err: unknown) {
                    showToast({
                      title: err instanceof Error ? err.message : 'Failed to load challan',
                      tone: 'danger',
                    });
                  }
                }}
              >
                Print Duplicate Challan
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleCreateChallan}
                disabled={createChallanMutation.isPending}
              >
                {createChallanMutation.isPending ? 'Generating...' : 'Generate Challan & Print'}
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      <PrintDocumentDialog
        open={Boolean(printDoc)}
        document={printDoc}
        onClose={() => setPrintDoc(null)}
      />
    </div>
  );
}
