import {
  calculatePurchaseLineAmounts,
  convertToBaseUnitQty,
  PAYMENT_METHODS,
  type ItemDto,
  type PageSizeOption,
  type PaymentMethod,
  type PurchaseInvoiceDto,
  type PurchaseStatus,
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
  createPurchaseInvoice,
  fetchItems,
  fetchPurchaseInvoices,
  fetchSuppliers,
  voidPurchaseInvoice,
} from '../lib/api.js';

interface DraftPurchaseLine {
  readonly key: string;
  readonly itemId: number;
  readonly enteredUnit: string;
  readonly conversionFactor: string;
  readonly enteredQty: string;
  readonly bagCount: string;
  readonly qtyBase: string;
  readonly ratePerEnteredUnit: string;
  readonly taxRate: string;
}

export interface PurchaseInvoicesScreenProps {
  readonly canCreate: boolean;
  readonly canVoid: boolean;
  readonly canPay: boolean;
  readonly canReturn: boolean;
  readonly taxEnabled: boolean;
  readonly defaultTaxRate: string;
  readonly prefillSupplierId?: number | null;
  readonly inspectPurchaseId?: number | null;
  readonly onClearPrefill?: () => void;
  readonly onOpenSupplier360: (supplierId: number) => void;
  readonly onRecordPayment: (supplierId: number, purchaseId: number) => void;
  readonly onCreateReturnFromPurchase: (purchaseId: number) => void;
}

function makeEmptyLine(defaultItem?: ItemDto, defaultTaxRate = '0.00'): DraftPurchaseLine {
  const defaultAlt = defaultItem?.alternateUnits.find((u) => u.isDefaultForPurchase);
  const unitName = defaultAlt ? defaultAlt.unitName : (defaultItem?.baseUnit ?? 'KG');
  const conv = defaultAlt ? defaultAlt.conversionFactor : '1.000';
  const qtyBase = convertToBaseUnitQty('1', conv);
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemId: defaultItem?.id ?? 0,
    enteredUnit: unitName,
    conversionFactor: conv,
    enteredQty: '1.000',
    bagCount: unitName === 'BAG' ? '1' : '',
    qtyBase,
    ratePerEnteredUnit: defaultItem?.lastPurchaseRatePerBase
      ? new Decimal(defaultItem.lastPurchaseRatePerBase).mul(new Decimal(conv)).toFixed(2)
      : '100.00',
    taxRate: defaultItem?.defaultTaxRate ?? defaultTaxRate,
  };
}

export function PurchaseInvoicesScreen({
  canCreate,
  canVoid,
  canPay,
  canReturn,
  taxEnabled,
  defaultTaxRate,
  prefillSupplierId,
  inspectPurchaseId,
  onClearPrefill,
  onOpenSupplier360,
  onRecordPayment,
  onCreateReturnFromPurchase,
}: PurchaseInvoicesScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // List filters
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  // Create Drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [supplierRefNo, setSupplierRefNo] = useState('');
  const [discount, setDiscount] = useState('0.00');
  const [extraCharges, setExtraCharges] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftPurchaseLine[]>([]);
  const [paidNowAmount, setPaidNowAmount] = useState('0.00');
  const [paidNowMethod, setPaidNowMethod] = useState<PaymentMethod>('CASH');
  const [paidNowRef, setPaidNowRef] = useState('');

  // Detail & Void Drawer state
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidBox, setShowVoidBox] = useState(false);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'dropdown'],
    queryFn: () => fetchSuppliers({ page: 1, pageSize: 100, isActive: true, sortOrder: 'asc' }),
  });

  const itemsQuery = useQuery({
    queryKey: ['items', 'dropdown'],
    queryFn: () => fetchItems({ page: 1, pageSize: 100, isActive: true, sortOrder: 'asc' }),
  });

  const purchasesQuery = useQuery({
    queryKey: [
      'purchases',
      { page, pageSize, search, supplierFilter, statusFilter, dateFrom, dateTo, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchPurchaseInvoices({
        page,
        pageSize,
        search: search.trim() || undefined,
        supplierId: supplierFilter ? Number(supplierFilter) : undefined,
        status: (statusFilter || undefined) as PurchaseStatus | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
  });

  const suppliers = useMemo(() => suppliersQuery.data?.data ?? [], [suppliersQuery.data?.data]);
  const items = useMemo(() => itemsQuery.data?.data ?? [], [itemsQuery.data?.data]);

  const openCreateForm = (forSupplierId?: number) => {
    if (!canCreate) return;
    const defaultSup = forSupplierId ?? 0;
    setSupplierId(defaultSup);
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setSupplierRefNo('');
    setDiscount('0.00');
    setExtraCharges('0.00');
    setNotes('');
    setPaidNowAmount('0.00');
    setPaidNowMethod('CASH');
    setPaidNowRef('');
    setLines([makeEmptyLine(undefined, taxEnabled ? defaultTaxRate : '0.00')]);
    setCreateOpen(true);
  };

  useEffect(() => {
    if (prefillSupplierId && suppliers.length > 0) {
      openCreateForm(prefillSupplierId);
      onClearPrefill?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSupplierId, suppliers.length]);

  useEffect(() => {
    if (inspectPurchaseId && purchasesQuery.data?.data) {
      const found = purchasesQuery.data.data.find((p) => p.id === inspectPurchaseId);
      if (found) {
        setSelectedInvoice(found);
        setShowVoidBox(false);
        setVoidReason('');
      }
      onClearPrefill?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectPurchaseId, purchasesQuery.data?.data]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !createOpen && !selectedInvoice) openCreateForm();
      },
    },
  ]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId],
  );

  // Live totals for draft lines
  const draftCalculations = useMemo(() => {
    let subtotal = new Decimal(0);
    let taxTotal = new Decimal(0);
    let totalQtyBase = new Decimal(0);

    const perLine = lines.map((l) => {
      try {
        const calc = calculatePurchaseLineAmounts({
          enteredQty: l.enteredQty || '0',
          qtyBase: l.qtyBase || '0',
          ratePerEnteredUnit: l.ratePerEnteredUnit || '0',
          taxRate: taxEnabled ? l.taxRate || '0' : '0',
        });
        subtotal = subtotal.plus(new Decimal(calc.lineSubtotal));
        taxTotal = taxTotal.plus(new Decimal(calc.taxAmount));
        totalQtyBase = totalQtyBase.plus(new Decimal(calc.qtyBase));
        return calc;
      } catch {
        return {
          enteredQty: '0.000',
          qtyBase: '0.000',
          ratePerEnteredUnit: '0.0000',
          ratePerBase: '0.0000',
          taxRate: '0.00',
          lineSubtotal: '0.00',
          taxAmount: '0.00',
          lineTotal: '0.00',
        };
      }
    });

    const discDec = new Decimal(discount || '0');
    const extraDec = new Decimal(extraCharges || '0');
    const netTotal = Decimal.max(0, subtotal.plus(taxTotal).minus(discDec).plus(extraDec));
    const paidDec = new Decimal(paidNowAmount || '0');
    const balanceToLedger = Decimal.max(0, netTotal.minus(paidDec));

    return {
      perLine,
      subtotal: subtotal.toFixed(2),
      taxTotal: taxTotal.toFixed(2),
      totalQtyBase: totalQtyBase.toFixed(3),
      netTotal: netTotal.toFixed(2),
      balanceToLedger: balanceToLedger.toFixed(2),
    };
  }, [lines, discount, extraCharges, paidNowAmount, taxEnabled]);

  const updateLine = (index: number, patch: Partial<DraftPurchaseLine>) => {
    setLines((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        return { ...row, ...patch };
      }),
    );
  };

  const handleSelectItemOnRow = (index: number, newItemId: number) => {
    const item = items.find((i) => i.id === newItemId);
    if (!item) return;
    const defaultAlt = item.alternateUnits.find((u) => u.isDefaultForPurchase);
    const unitName = defaultAlt ? defaultAlt.unitName : item.baseUnit;
    const conv = defaultAlt ? defaultAlt.conversionFactor : '1.000';

    setLines((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const currentEnteredQty = row.enteredQty || '1.000';
        const nextQtyBase = convertToBaseUnitQty(currentEnteredQty, conv);
        const nextRate = item.lastPurchaseRatePerBase
          ? new Decimal(item.lastPurchaseRatePerBase).mul(new Decimal(conv)).toFixed(2)
          : (row.ratePerEnteredUnit ?? '100.00');
        return {
          ...row,
          itemId: item.id,
          enteredUnit: unitName,
          conversionFactor: conv,
          qtyBase: nextQtyBase,
          bagCount: unitName === 'BAG' ? String(Math.round(Number(currentEnteredQty))) : '',
          ratePerEnteredUnit: nextRate,
          taxRate: taxEnabled ? item.defaultTaxRate : '0.00',
        };
      }),
    );
  };

  const handleSelectUnitOnRow = (index: number, unitName: string) => {
    setLines((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const item = items.find((i) => i.id === row.itemId);
        const alt = item?.alternateUnits.find((u) => u.unitName === unitName);
        const conv = alt ? alt.conversionFactor : '1.000';
        const nextQtyBase = convertToBaseUnitQty(row.enteredQty || '1', conv);
        return {
          ...row,
          enteredUnit: unitName,
          conversionFactor: conv,
          qtyBase: nextQtyBase,
          bagCount:
            unitName === 'BAG' ? String(Math.round(Number(row.enteredQty || '1'))) : row.bagCount,
        };
      }),
    );
  };

  const handleEnteredQtyChange = (index: number, val: string) => {
    setLines((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        try {
          const nextQtyBase = convertToBaseUnitQty(val || '0', row.conversionFactor);
          return {
            ...row,
            enteredQty: val,
            qtyBase: nextQtyBase,
            bagCount:
              row.enteredUnit === 'BAG' ? String(Math.round(Number(val || '0'))) : row.bagCount,
          };
        } catch {
          return { ...row, enteredQty: val };
        }
      }),
    );
  };

  const createMutation = useMutation({
    mutationFn: createPurchaseInvoice,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      showToast({ title: t('purchases.savedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to save purchase invoice',
        tone: 'danger',
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (params: { id: number; reason: string }) =>
      voidPurchaseInvoice(params.id, { reason: params.reason }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ledger'] });
      setSelectedInvoice(updated);
      setShowVoidBox(false);
      showToast({ title: t('purchases.voidedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to void purchase invoice',
        tone: 'danger',
      });
    },
  });

  const handleSavePurchase = async (keepOpen: boolean) => {
    if (!supplierId) {
      showToast({ title: t('purchases.selectSupplier'), tone: 'danger' });
      return;
    }
    const validLines = lines.filter((l) => l.itemId > 0);
    if (validLines.length === 0) {
      showToast({ title: 'Please select at least one item', tone: 'danger' });
      return;
    }

    const paidDec = new Decimal(paidNowAmount || '0');

    await createMutation.mutateAsync({
      supplierId,
      invoiceDate,
      supplierRefNo: supplierRefNo.trim() || undefined,
      discount: discount || '0.00',
      extraCharges: extraCharges || '0.00',
      notes: notes.trim() || undefined,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        enteredQty: l.enteredQty,
        enteredUnit: l.enteredUnit,
        conversionFactor: l.conversionFactor,
        bagCount: l.bagCount ? Number(l.bagCount) : undefined,
        qtyBase: l.qtyBase,
        ratePerEnteredUnit: l.ratePerEnteredUnit,
        taxRate: taxEnabled ? l.taxRate : '0.00',
      })),
      ...(paidDec.gt(0)
        ? {
            immediatePayment: {
              amount: paidDec.toFixed(2),
              method: paidNowMethod,
              referenceNo: paidNowRef.trim() || undefined,
            },
          }
        : {}),
    });

    if (keepOpen) {
      openCreateForm(supplierId);
    } else {
      setCreateOpen(false);
    }
  };

  const gridColumns: LineItemColumn<DraftPurchaseLine>[] = useMemo(
    () => [
      {
        id: 'item',
        header: t('purchases.colItem'),
        width: '210px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          const usedItemIdsOnOtherRows = new Set(
            lines.filter((r, i) => i !== rowIndex && r.itemId > 0).map((r) => r.itemId),
          );
          const availableItemsForRow = items.filter(
            (it) => !usedItemIdsOnOtherRows.has(it.id) || it.id === row.itemId,
          );
          return (
            <Combobox
              {...inputProps}
              value={row.itemId ? String(row.itemId) : ''}
              placeholder="Search item…"
              searchPlaceholder="Type item name…"
              emptyText="All items are already added"
              onChange={(val) => handleSelectItemOnRow(rowIndex, Number(val))}
              options={availableItemsForRow.map((it) => ({
                value: String(it.id),
                label: `${it.name}${it.nameUr ? ` (${it.nameUr})` : ''}`,
                subtitle: `${it.rawStockQtyBase} kg in stock`,
              }))}
            />
          );
        },
        footer: <span className="font-semibold">{t('common.totals')}</span>,
      },
      {
        id: 'unit',
        header: t('purchases.colUnit'),
        width: '105px',
        renderCell: ({ row, rowIndex, inputProps }) => {
          const item = items.find((i) => i.id === row.itemId);
          const unitOpts = [
            { value: item?.baseUnit ?? 'KG', label: item?.baseUnit ?? 'KG' },
            ...(item?.alternateUnits.map((u) => ({
              value: u.unitName,
              label: `${u.unitName} (${u.conversionFactor})`,
            })) ?? []),
          ];
          return (
            <Select
              {...inputProps}
              value={row.enteredUnit}
              onChange={(e) => handleSelectUnitOnRow(rowIndex, e.target.value)}
              options={unitOpts}
            />
          );
        },
      },
      {
        id: 'enteredQty',
        header: t('purchases.colEnteredQty'),
        width: '105px',
        align: 'right',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="weight"
            value={row.enteredQty}
            onChange={(val) => handleEnteredQtyChange(rowIndex, val)}
          />
        ),
      },
      {
        id: 'bagCount',
        header: t('purchases.colBagCount'),
        width: '85px',
        align: 'right',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="integer"
            value={row.bagCount}
            onChange={(val) => updateLine(rowIndex, { bagCount: val })}
          />
        ),
      },
      {
        id: 'qtyBase',
        header: t('purchases.colQtyBase'),
        width: '125px',
        align: 'right',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="weight"
            value={row.qtyBase}
            onChange={(val) => updateLine(rowIndex, { qtyBase: val })}
          />
        ),
        footer: <WeightText value={draftCalculations.totalQtyBase} unit="KG" />,
      },
      {
        id: 'ratePerEnteredUnit',
        header: t('purchases.colRateUnit'),
        width: '115px',
        align: 'right',
        renderCell: ({ row, rowIndex, inputProps }) => (
          <NumberInput
            {...inputProps}
            precision="money"
            value={row.ratePerEnteredUnit}
            onChange={(val) => updateLine(rowIndex, { ratePerEnteredUnit: val })}
          />
        ),
      },
      {
        id: 'ratePerBase',
        header: t('purchases.colRateBase'),
        width: '100px',
        align: 'right',
        editable: false,
        renderCell: ({ rowIndex }) => (
          <span className="erp-num text-xs text-[#5c5a53]">
            {draftCalculations.perLine[rowIndex]?.ratePerBase ?? '0.0000'}
          </span>
        ),
      },
      ...(taxEnabled
        ? [
            {
              id: 'taxRate',
              header: t('purchases.colTaxRate'),
              width: '80px',
              align: 'right' as const,
              renderCell: ({
                row,
                rowIndex,
                inputProps,
              }: {
                row: DraftPurchaseLine;
                rowIndex: number;
                inputProps: {
                  'data-grid-cell': string;
                  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
                };
              }) => (
                <NumberInput
                  {...inputProps}
                  precision="percent"
                  value={row.taxRate}
                  onChange={(val) => updateLine(rowIndex, { taxRate: val })}
                />
              ),
            },
          ]
        : []),
      {
        id: 'lineTotal',
        header: t('purchases.colLineTotal'),
        width: '125px',
        align: 'right',
        editable: false,
        renderCell: ({ rowIndex }) => (
          <span className="font-semibold">
            <MoneyText value={draftCalculations.perLine[rowIndex]?.lineTotal ?? '0.00'} />
          </span>
        ),
        footer: <MoneyText value={draftCalculations.subtotal} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, items, lines, draftCalculations, taxEnabled],
  );

  // Page table totals
  const tableFooterTotals = useMemo(() => {
    const rows = purchasesQuery.data?.data ?? [];
    let qty = new Decimal(0);
    let total = new Decimal(0);
    let paid = new Decimal(0);
    let balance = new Decimal(0);
    for (const r of rows) {
      if (r.status !== 'VOIDED') {
        qty = qty.plus(new Decimal(r.totalQtyBase));
        total = total.plus(new Decimal(r.total));
        paid = paid.plus(new Decimal(r.paidAmount));
        balance = balance.plus(new Decimal(r.balanceDue));
      }
    }
    return {
      qty: qty.toFixed(3),
      total: total.toFixed(2),
      paid: paid.toFixed(2),
      balance: balance.toFixed(2),
    };
  }, [purchasesQuery.data?.data]);

  const columns: ColumnDef<PurchaseInvoiceDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('purchases.colId'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'invoiceNo',
        header: t('purchases.colInvoiceNo'),
        size: 140,
        cell: ({ row }) => (
          <EntityLink
            mono
            onClick={() => {
              setSelectedInvoice(row.original);
              setShowVoidBox(false);
            }}
          >
            {row.original.invoiceNo}
          </EntityLink>
        ),
      },
      {
        id: 'supplierRefNo',
        header: t('purchases.colSupplierRef'),
        size: 110,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="erp-num text-xs text-[#5c5a53]">
            {row.original.supplierRefNo || '—'}
          </span>
        ),
      },
      {
        id: 'invoiceDate',
        header: t('purchases.colDate'),
        size: 105,
        cell: ({ row }) => <span className="erp-num">{row.original.invoiceDate.slice(0, 10)}</span>,
      },
      {
        id: 'supplier',
        header: t('purchases.colSupplier'),
        size: 190,
        enableSorting: false,
        meta: {
          footer: <span className="font-semibold">{t('common.totals')}</span>,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <EntityLink
            onClick={() => onOpenSupplier360(row.original.supplierId)}
            subtitle={row.original.supplierNameUr}
          >
            {row.original.supplierName}
          </EntityLink>
        ),
      },
      {
        id: 'totalQtyBase',
        header: t('purchases.colTotalQty'),
        size: 130,
        enableSorting: false,
        meta: {
          align: 'right',
          footer: <WeightText value={tableFooterTotals.qty} unit="KG" />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.totalQtyBase} unit="KG" />,
      },
      {
        id: 'total',
        header: t('purchases.colTotal'),
        size: 130,
        meta: {
          align: 'right',
          footer: <MoneyText value={tableFooterTotals.total} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} />,
      },
      {
        id: 'paidAmount',
        header: t('purchases.colPaid'),
        size: 120,
        enableSorting: false,
        meta: {
          align: 'right',
          footer: <MoneyText value={tableFooterTotals.paid} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.paidAmount} />,
      },
      {
        id: 'balanceDue',
        header: t('purchases.colBalance'),
        size: 130,
        enableSorting: false,
        meta: {
          align: 'right',
          footer: <MoneyText value={tableFooterTotals.balance} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.balanceDue} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('purchases.colStatus'),
        size: 95,
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
        size: 185,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'view',
                label: t('purchases.actionView'),
                inline: true,
                onClick: () => {
                  setSelectedInvoice(row.original);
                  setShowVoidBox(false);
                },
              },
              {
                id: 'pay',
                label: t('purchases.actionPay'),
                inline: true,
                disabled:
                  !canPay || row.original.status === 'PAID' || row.original.status === 'VOIDED',
                onClick: () => onRecordPayment(row.original.supplierId, row.original.id),
              },
              {
                id: 'return',
                label: t('purchases.actionReturn'),
                disabled: !canReturn || row.original.status === 'VOIDED',
                onClick: () => onCreateReturnFromPurchase(row.original.id),
              },
              {
                id: 'ledger',
                label: t('suppliers.actionLedger'),
                onClick: () => onOpenSupplier360(row.original.supplierId),
              },
              {
                id: 'void',
                label: t('purchases.actionVoid'),
                tone: 'danger',
                disabled: !canVoid || row.original.status === 'VOIDED',
                onClick: () => {
                  setSelectedInvoice(row.original);
                  setShowVoidBox(true);
                  setVoidReason('');
                },
              },
            ]}
          />
        ),
      },
    ],
    [
      t,
      canPay,
      canReturn,
      canVoid,
      onOpenSupplier360,
      onRecordPayment,
      onCreateReturnFromPurchase,
      tableFooterTotals,
    ],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('purchases.title')}
        subtitle={t('purchases.subtitle')}
        primaryAction={
          canCreate
            ? {
                label: t('purchases.newPurchase'),
                shortcutHint: 'Ctrl+N',
                onClick: () => openCreateForm(),
              }
            : undefined
        }
      />

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
            id: 'supplier',
            label: t('purchases.colSupplier'),
            value: supplierFilter,
            allLabel: t('purchases.allSuppliers'),
            options: suppliers.map((s) => ({
              value: String(s.id),
              label: s.name,
            })),
            onChange: (val) => {
              setSupplierFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: t('purchases.colStatus'),
            value: statusFilter,
            allLabel: t('purchases.allStatuses'),
            options: [
              { value: 'POSTED', label: 'POSTED' },
              { value: 'PARTIAL', label: 'PARTIAL' },
              { value: 'PAID', label: 'PAID' },
              { value: 'VOIDED', label: 'VOIDED' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        clearLabel={t('common.clear')}
        onClear={() => {
          setSearch('');
          setSupplierFilter('');
          setStatusFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={purchasesQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        onRowClick={(r) => {
          setSelectedInvoice(r);
          setShowVoidBox(false);
        }}
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

      {/* Create Purchase Invoice Wide Drawer */}
      <Drawer
        open={createOpen}
        title={t('purchases.newPurchase')}
        widthClass="max-w-5xl"
        onClose={() => setCreateOpen(false)}
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            saveAndNew: t('common.saveAndNew'),
            cancel: t('common.cancel'),
          }}
          isSubmitting={createMutation.isPending}
          onSubmit={() => void handleSavePurchase(false)}
          onSaveAndNew={() => void handleSavePurchase(true)}
          onCancel={() => setCreateOpen(false)}
          footerSlot={
            <div className="flex flex-col gap-4">
              <LineItemGrid
                title={t('purchases.linesTitle')}
                columns={gridColumns}
                rows={lines}
                getRowKey={(r) => r.key}
                onAddRow={() =>
                  setLines((prev) => [
                    ...prev,
                    makeEmptyLine(undefined, taxEnabled ? defaultTaxRate : '0.00'),
                  ])
                }
                onRemoveRow={(idx) => setLines((prev) => prev.filter((_, i) => i !== idx))}
                addRowLabel={t('purchases.addLine')}
                removeRowLabel={t('common.delete')}
              />

              {/* Summary & Optional Immediate Payment Panel */}
              <div className="grid grid-cols-1 gap-4 rounded border border-[#e4e2da] bg-[#faf9f5] p-3.5 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label={t('purchases.paidNow')} htmlFor="pur-paid-now">
                      <NumberInput
                        id="pur-paid-now"
                        precision="money"
                        value={paidNowAmount}
                        onChange={setPaidNowAmount}
                      />
                    </FormField>

                    <FormField label={t('purchases.paymentMethod')} htmlFor="pur-pay-method">
                      <Select
                        id="pur-pay-method"
                        value={paidNowMethod}
                        onChange={(e) => setPaidNowMethod(e.target.value as PaymentMethod)}
                        options={PAYMENT_METHODS.map((m) => ({
                          value: m,
                          label: t(`payments.methods.${m}`),
                        }))}
                      />
                    </FormField>
                  </div>

                  {Number(paidNowAmount) > 0 && (
                    <FormField label={t('purchases.paymentReference')} htmlFor="pur-pay-ref">
                      <TextInput
                        id="pur-pay-ref"
                        value={paidNowRef}
                        onChange={(e) => setPaidNowRef(e.target.value)}
                      />
                    </FormField>
                  )}

                  <FormField label={t('common.notes')} htmlFor="pur-notes">
                    <TextArea
                      id="pur-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </FormField>
                </div>

                <div className="flex flex-col justify-between rounded border border-[#e4e2da] bg-white p-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#5c5a53]">{t('purchases.subtotal')}</span>
                      <MoneyText value={draftCalculations.subtotal} />
                    </div>
                    {taxEnabled && (
                      <div className="flex justify-between">
                        <span className="text-[#5c5a53]">{t('purchases.taxTotal')}</span>
                        <MoneyText value={draftCalculations.taxTotal} />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#5c5a53]">{t('purchases.discount')}</span>
                      <div className="w-28">
                        <NumberInput precision="money" value={discount} onChange={setDiscount} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#5c5a53]">{t('purchases.extraCharges')}</span>
                      <div className="w-28">
                        <NumberInput
                          precision="money"
                          value={extraCharges}
                          onChange={setExtraCharges}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 border-t border-[#e4e2da] pt-2.5">
                    <div className="flex justify-between text-sm font-semibold text-[#1f1e1b]">
                      <span>{t('purchases.netTotal')}</span>
                      <MoneyText value={draftCalculations.netTotal} />
                    </div>
                    <div className="flex justify-between font-medium text-[#2c6b48]">
                      <span>{t('purchases.balanceToLedger')}</span>
                      <MoneyText value={draftCalculations.balanceToLedger} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        >
          <FormField label={t('purchases.supplier')} htmlFor="pur-supplier" required>
            <div className="flex flex-col gap-1">
              <Combobox
                id="pur-supplier"
                value={supplierId ? String(supplierId) : ''}
                placeholder="Search supplier…"
                searchPlaceholder="Type supplier name…"
                onChange={(val) => setSupplierId(Number(val))}
                options={suppliers.map((s) => ({
                  value: String(s.id),
                  label: `${s.name}${s.nameUr ? ` (${s.nameUr})` : ''}`,
                  subtitle: `Bal: ${s.currentBalance}`,
                }))}
              />
              {selectedSupplier && (
                <div className="flex items-center justify-between rounded bg-[#f1efe9] px-2 py-1 text-[11px]">
                  <span className="erp-num font-medium text-[#1f1e1b]">
                    {t('purchases.currentPayablePill', {
                      amount: selectedSupplier.currentBalance,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateOpen(false);
                      onOpenSupplier360(selectedSupplier.id);
                    }}
                    className="font-medium text-[#2c6b48] underline cursor-pointer"
                  >
                    {t('purchases.viewLedgerLink')}
                  </button>
                </div>
              )}
            </div>
          </FormField>

          <FormField label={t('purchases.invoiceDate')} htmlFor="pur-date" required>
            <DatePicker
              id="pur-date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </FormField>

          <FormField label={t('purchases.supplierRefNo')} htmlFor="pur-ref">
            <TextInput
              id="pur-ref"
              value={supplierRefNo}
              onChange={(e) => setSupplierRefNo(e.target.value)}
            />
          </FormField>
        </FormLayout>
      </Drawer>

      {/* Purchase Invoice Detail & Void Drawer */}
      <Drawer
        open={Boolean(selectedInvoice)}
        title={selectedInvoice ? t('purchases.detailTitle', { no: selectedInvoice.invoiceNo }) : ''}
        widthClass="max-w-4xl"
        onClose={() => setSelectedInvoice(null)}
      >
        {selectedInvoice && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#e4e2da] bg-[#faf9f5] p-3">
              <div>
                <div className="flex items-center gap-2">
                  <EntityLink
                    onClick={() => {
                      const supId = selectedInvoice.supplierId;
                      setSelectedInvoice(null);
                      onOpenSupplier360(supId);
                    }}
                  >
                    {selectedInvoice.supplierName}
                  </EntityLink>
                  <StatusBadge
                    tone={
                      selectedInvoice.status === 'PAID'
                        ? 'success'
                        : selectedInvoice.status === 'VOIDED'
                          ? 'danger'
                          : 'info'
                    }
                  >
                    {selectedInvoice.status}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-xs text-[#5c5a53]">
                  {t('purchases.colDate')}: {selectedInvoice.invoiceDate.slice(0, 10)}
                  {selectedInvoice.supplierRefNo
                    ? ` · ${t('purchases.colSupplierRef')}: ${selectedInvoice.supplierRefNo}`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {canPay &&
                  selectedInvoice.status !== 'PAID' &&
                  selectedInvoice.status !== 'VOIDED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const supId = selectedInvoice.supplierId;
                        const purId = selectedInvoice.id;
                        setSelectedInvoice(null);
                        onRecordPayment(supId, purId);
                      }}
                    >
                      {t('purchases.actionPay')}
                    </Button>
                  )}
                {canReturn && selectedInvoice.status !== 'VOIDED' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const purId = selectedInvoice.id;
                      setSelectedInvoice(null);
                      onCreateReturnFromPurchase(purId);
                    }}
                  >
                    {t('purchases.actionReturn')}
                  </Button>
                )}
                {canVoid && selectedInvoice.status !== 'VOIDED' && (
                  <Button variant="danger" size="sm" onClick={() => setShowVoidBox((v) => !v)}>
                    {t('purchases.actionVoid')}
                  </Button>
                )}
              </div>
            </div>

            {selectedInvoice.voidReason && (
              <div className="rounded border border-[#e6c3c3] bg-[#fdf3f3] p-3 text-xs text-[#9e2b2b]">
                <strong>VOIDED:</strong> {selectedInvoice.voidReason}
              </div>
            )}

            {showVoidBox && selectedInvoice.status !== 'VOIDED' && (
              <SurfaceCard
                title={t('purchases.voidDialogTitle', { no: selectedInvoice.invoiceNo })}
              >
                <div className="flex flex-col gap-3">
                  <FormField label={t('purchases.voidReasonLabel')} required>
                    <TextInput
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      placeholder="e.g. Entered wrong supplier or duplicate bill"
                    />
                  </FormField>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowVoidBox(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={voidReason.trim().length < 3 || voidMutation.isPending}
                      onClick={() =>
                        voidMutation.mutate({
                          id: selectedInvoice.id,
                          reason: voidReason.trim(),
                        })
                      }
                    >
                      {t('common.confirm')}
                    </Button>
                  </div>
                </div>
              </SurfaceCard>
            )}

            <div className="overflow-x-auto rounded border border-[#d6d3c9] bg-white">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-[#f1efe9] text-[#5c5a53]">
                  <tr className="h-8 border-b border-[#d6d3c9]">
                    <th className="px-2.5 text-start">{t('purchases.colItem')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colEnteredQty')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colQtyBase')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colRateBase')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colLineTotal')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colAllocated')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colReturned')}</th>
                    <th className="px-2.5 text-end">{t('purchases.colAvailable')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item) => (
                    <tr key={item.id} className="h-8 border-b border-[#e4e2da]">
                      <td className="px-2.5 font-medium">{item.itemName}</td>
                      <td className="erp-num px-2.5 text-end">
                        {item.enteredQty} {item.enteredUnit}
                      </td>
                      <td className="px-2.5 text-end">
                        <WeightText value={item.qtyBase} unit={item.baseUnit} />
                      </td>
                      <td className="erp-num px-2.5 text-end">{item.ratePerBase}</td>
                      <td className="px-2.5 text-end">
                        <MoneyText value={item.lineTotal} />
                      </td>
                      <td className="px-2.5 text-end">
                        <WeightText value={item.allocatedQtyBase} unit={item.baseUnit} />
                      </td>
                      <td className="px-2.5 text-end">
                        <WeightText value={item.returnedQtyBase} unit={item.baseUnit} />
                      </td>
                      <td className="px-2.5 text-end font-semibold">
                        <WeightText value={item.availableToAllocateQtyBase} unit={item.baseUnit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded border border-[#e4e2da] bg-[#faf9f5] p-3 text-xs md:grid-cols-4">
              <div>
                <span className="text-[#5c5a53]">{t('purchases.netTotal')}</span>
                <div className="mt-1 text-sm font-semibold">
                  <MoneyText value={selectedInvoice.total} />
                </div>
              </div>
              <div>
                <span className="text-[#5c5a53]">{t('purchases.colPaid')}</span>
                <div className="mt-1 text-sm font-semibold">
                  <MoneyText value={selectedInvoice.paidAmount} />
                </div>
              </div>
              <div>
                <span className="text-[#5c5a53]">{t('purchases.colReturned')}</span>
                <div className="mt-1 text-sm font-semibold">
                  <MoneyText value={selectedInvoice.returnedAmount} />
                </div>
              </div>
              <div>
                <span className="text-[#5c5a53]">{t('purchases.colBalance')}</span>
                <div className="mt-1 text-sm font-semibold text-[#9e2b2b]">
                  <MoneyText value={selectedInvoice.balanceDue} />
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
