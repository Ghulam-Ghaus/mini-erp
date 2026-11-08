import {
  PURCHASE_RETURN_SETTLEMENT_TYPES,
  RETURN_REASON_CODES,
  type PageSizeOption,
  type PurchaseReturnDto,
  type PurchaseReturnSettlementType,
  type ReturnReasonCode,
  type SortOrder,
} from '@mini-erp/shared';
import {
  DataTable,
  DatePicker,
  Drawer,
  EntityLink,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
  MoneyText,
  NumberInput,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  TextArea,
  useHotkeys,
  useToast,
  WeightText,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createPurchaseReturn,
  fetchPurchaseInvoiceById,
  fetchPurchaseInvoices,
  fetchPurchaseReturns,
} from '../lib/api.js';

export interface PurchaseReturnsScreenProps {
  readonly canCreate: boolean;
  readonly prefillPurchaseId?: number | null;
  readonly onClearPrefill?: () => void;
  readonly onOpenSupplier360: (supplierId: number) => void;
  readonly onViewPurchaseInvoice: (purchaseId: number) => void;
}

export function PurchaseReturnsScreen({
  canCreate,
  prefillPurchaseId,
  onClearPrefill,
  onOpenSupplier360,
  onViewPurchaseInvoice,
}: PurchaseReturnsScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number>(0);
  const [returnDate, setReturnDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('QUALITY');
  const [settlementType, setSettlementType] =
    useState<PurchaseReturnSettlementType>('ADJUST_PAYABLE');
  const [notes, setNotes] = useState('');
  const [returnQtys, setReturnQtys] = useState<Record<number, string>>({});

  const returnsQuery = useQuery({
    queryKey: [
      'purchase-returns',
      { page, pageSize, search, reasonFilter, dateFrom, dateTo, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchPurchaseReturns({
        page,
        pageSize,
        search: search.trim() || undefined,
        reasonCode: (reasonFilter || undefined) as ReturnReasonCode | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
  });

  const purchasesDropdownQuery = useQuery({
    queryKey: ['purchases', 'dropdown-for-returns'],
    queryFn: () => fetchPurchaseInvoices({ page: 1, pageSize: 100, sortOrder: 'desc' }),
    enabled: drawerOpen,
  });

  const activePurchaseQuery = useQuery({
    queryKey: ['purchase-detail', selectedPurchaseId],
    queryFn: () => fetchPurchaseInvoiceById(selectedPurchaseId),
    enabled: drawerOpen && selectedPurchaseId > 0,
  });

  const openCreateDrawer = (forPurchaseId?: number) => {
    if (!canCreate) return;
    setSelectedPurchaseId(forPurchaseId ?? 0);
    setReturnDate(new Date().toISOString().slice(0, 10));
    setReasonCode('QUALITY');
    setSettlementType('ADJUST_PAYABLE');
    setNotes('');
    setReturnQtys({});
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (prefillPurchaseId) {
      openCreateDrawer(prefillPurchaseId);
      onClearPrefill?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPurchaseId]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !drawerOpen) openCreateDrawer();
      },
    },
  ]);

  const createMutation = useMutation({
    mutationFn: createPurchaseReturn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      showToast({ title: t('purchaseReturns.savedToast'), tone: 'success' });
      setDrawerOpen(false);
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to create purchase return',
        tone: 'danger',
      });
    },
  });

  const handleSave = () => {
    if (!selectedPurchaseId) {
      showToast({ title: t('purchaseReturns.selectPurchase'), tone: 'danger' });
      return;
    }

    const lines = Object.entries(returnQtys)
      .filter(([, q]) => {
        try {
          return new Decimal(q || '0').gt(0);
        } catch {
          return false;
        }
      })
      .map(([purchaseItemId, returnQtyBase]) => ({
        purchaseItemId: Number(purchaseItemId),
        returnQtyBase,
      }));

    if (lines.length === 0) {
      showToast({ title: 'Enter a return quantity > 0 on at least one line', tone: 'danger' });
      return;
    }

    createMutation.mutate({
      purchaseId: selectedPurchaseId,
      returnDate,
      reasonCode,
      settlementType,
      notes: notes.trim() || undefined,
      lines,
    });
  };

  const columns: ColumnDef<PurchaseReturnDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('purchaseReturns.colId'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'returnNo',
        header: t('purchaseReturns.colReturnNo'),
        size: 145,
        cell: ({ row }) => <span className="erp-num font-semibold">{row.original.returnNo}</span>,
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
        size: 145,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityLink mono onClick={() => onViewPurchaseInvoice(row.original.purchaseId)}>
            {row.original.purchaseInvoiceNo}
          </EntityLink>
        ),
      },
      {
        id: 'supplier',
        header: t('purchaseReturns.colSupplier'),
        size: 195,
        enableSorting: false,
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
        id: 'reasonCode',
        header: t('purchaseReturns.colReason'),
        size: 150,
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge tone="warning">
            {t(`purchaseReturns.reasons.${row.original.reasonCode}`)}
          </StatusBadge>
        ),
      },
      {
        id: 'totalQtyBase',
        header: t('purchaseReturns.colQtyBase'),
        size: 135,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.totalQtyBase} unit="KG" />,
      },
      {
        id: 'total',
        header: t('purchaseReturns.colTotal'),
        size: 140,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.total} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('purchaseReturns.colStatus'),
        size: 100,
        enableSorting: false,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
    ],
    [t, onOpenSupplier360, onViewPurchaseInvoice],
  );

  const activePurchase = activePurchaseQuery.data;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('purchaseReturns.title')}
        subtitle={t('purchaseReturns.subtitle')}
        primaryAction={
          canCreate
            ? {
                label: t('purchaseReturns.newReturn'),
                shortcutHint: 'Ctrl+N',
                onClick: () => openCreateDrawer(),
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder={t('purchaseReturns.searchPlaceholder')}
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
            id: 'reason',
            label: t('purchaseReturns.colReason'),
            value: reasonFilter,
            allLabel: t('common.all'),
            options: RETURN_REASON_CODES.map((c) => ({
              value: c,
              label: t(`purchaseReturns.reasons.${c}`),
            })),
            onChange: (val) => {
              setReasonFilter(val);
              setPage(1);
            },
          },
        ]}
        clearLabel={t('common.clear')}
        onClear={() => {
          setSearch('');
          setReasonFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={returnsQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
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

      <Drawer
        open={drawerOpen}
        title={t('purchaseReturns.newReturn')}
        widthClass="max-w-4xl"
        onClose={() => setDrawerOpen(false)}
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            cancel: t('common.cancel'),
          }}
          isSubmitting={createMutation.isPending}
          onSubmit={handleSave}
          onCancel={() => setDrawerOpen(false)}
          footerSlot={
            activePurchase && (
              <div className="mt-2 overflow-x-auto rounded border border-[#d6d3c9] bg-white">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[#f1efe9] text-[#5c5a53]">
                    <tr className="h-8 border-b border-[#d6d3c9]">
                      <th className="px-2.5 text-start">{t('purchases.colItem')}</th>
                      <th className="px-2.5 text-end">{t('purchaseReturns.colPurchasedQty')}</th>
                      <th className="px-2.5 text-end">{t('purchaseReturns.colAlreadyReturned')}</th>
                      <th className="px-2.5 text-end">{t('purchaseReturns.colAvailableQty')}</th>
                      <th className="px-2.5 text-end">{t('purchases.colRateBase')}</th>
                      <th className="w-36 px-2.5 text-end">{t('purchaseReturns.colReturnQty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePurchase.items.map((line) => (
                      <tr key={line.id} className="h-9 border-b border-[#e4e2da]">
                        <td className="px-2.5 font-medium">{line.itemName}</td>
                        <td className="px-2.5 text-end">
                          <WeightText value={line.qtyBase} unit={line.baseUnit} />
                        </td>
                        <td className="px-2.5 text-end">
                          <WeightText
                            value={new Decimal(line.returnedQtyBase)
                              .plus(new Decimal(line.allocatedQtyBase))
                              .toFixed(3)}
                            unit={line.baseUnit}
                          />
                        </td>
                        <td className="px-2.5 text-end font-semibold text-[#2c6b48]">
                          <WeightText value={line.availableToReturnQtyBase} unit={line.baseUnit} />
                        </td>
                        <td className="erp-num px-2.5 text-end">{line.ratePerBase}</td>
                        <td className="px-2.5 py-1">
                          <NumberInput
                            precision="weight"
                            value={returnQtys[line.id] ?? '0.000'}
                            onChange={(val) =>
                              setReturnQtys((prev) => ({ ...prev, [line.id]: val }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        >
          <FormField label={t('purchaseReturns.selectPurchase')} required>
            <Select
              value={selectedPurchaseId ? String(selectedPurchaseId) : ''}
              onChange={(e) => {
                setSelectedPurchaseId(Number(e.target.value));
                setReturnQtys({});
              }}
              options={[
                { value: '', label: 'Select posted purchase invoice…' },
                ...(purchasesDropdownQuery.data?.data ?? [])
                  .filter((p) => p.status !== 'VOIDED')
                  .map((p) => ({
                    value: String(p.id),
                    label: `${p.invoiceNo} — ${p.supplierName} (${p.totalQtyBase} KG)`,
                  })),
              ]}
            />
          </FormField>

          <FormField label={t('purchaseReturns.returnDate')} required>
            <DatePicker value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </FormField>

          <FormField label={t('purchaseReturns.reasonCode')} required>
            <Select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReturnReasonCode)}
              options={RETURN_REASON_CODES.map((c) => ({
                value: c,
                label: t(`purchaseReturns.reasons.${c}`),
              }))}
            />
          </FormField>

          <FormField label={t('purchaseReturns.settlementType')} required>
            <Select
              value={settlementType}
              onChange={(e) => setSettlementType(e.target.value as PurchaseReturnSettlementType)}
              options={PURCHASE_RETURN_SETTLEMENT_TYPES.map((s) => ({
                value: s,
                label: t(`purchaseReturns.settlements.${s}`),
              }))}
            />
          </FormField>

          <FormField label={t('common.notes')} fullWidth>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </FormLayout>
      </Drawer>
    </div>
  );
}
