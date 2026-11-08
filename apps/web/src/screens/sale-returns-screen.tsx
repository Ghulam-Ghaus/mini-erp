import {
  calculateSaleReturnAmounts,
  SALE_RETURN_CONDITIONS,
  SALE_RETURN_REASONS,
  SALE_RETURN_SETTLEMENTS,
  type CreateSaleReturnInput,
  type PageSizeOption,
  type SaleReturnCondition,
  type SaleReturnDto,
  type SaleReturnReason,
  type SaleReturnSettlement,
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
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import {
  createSaleReturn,
  fetchClients,
  fetchSaleById,
  fetchSaleReturns,
  fetchSales,
  voidSaleReturn,
} from '../lib/api.js';

interface DraftReturnLine {
  readonly saleItemId: number;
  readonly batchNo: string;
  readonly itemName: string;
  readonly enteredUnit: string;
  readonly conversionFactor: string;
  readonly soldQtyBase: string;
  readonly alreadyReturnedQtyBase: string;
  readonly availableToReturnQtyBase: string;
  readonly ratePerBase: string;
  readonly taxRate: string;
  readonly batchCostRateSnapshot: string;
  readonly returnEnteredQty: string;
  readonly condition: SaleReturnCondition;
}

export interface SaleReturnsScreenProps {
  readonly canCreate: boolean;
  readonly canVoid: boolean;
  readonly initialSaleIdForReturn?: number | null;
  readonly onClearInitialSale?: () => void;
  readonly onOpenClient360: (clientId: number) => void;
  readonly onViewSaleInvoice: (saleId: number) => void;
}

export function SaleReturnsScreen({
  canCreate,
  canVoid,
  initialSaleIdForReturn,
  onClearInitialSale,
  onOpenClient360,
  onViewSaleInvoice,
}: SaleReturnsScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // List filters
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [sortBy, setSortBy] = useState<string>('returnDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Create drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<number>(0);
  const [returnDate, setReturnDate] = useState(todayStr);
  const [reasonCode, setReasonCode] = useState<SaleReturnReason>('QUALITY');
  const [settlementType, setSettlementType] = useState<SaleReturnSettlement>('ADJUST_BALANCE');
  const [deduction, setDeduction] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftReturnLine[]>([]);

  // Detail & Void
  const [detailReturn, setDetailReturn] = useState<SaleReturnDto | null>(null);
  const [voidTarget, setVoidTarget] = useState<SaleReturnDto | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const clientsQuery = useQuery({
    queryKey: ['clients', 'dropdown'],
    queryFn: () => fetchClients({ page: 1, pageSize: 100 }),
  });

  const salesDropdownQuery = useQuery({
    queryKey: ['sales', 'dropdown'],
    queryFn: () => fetchSales({ page: 1, pageSize: 100 }),
    enabled: createOpen,
  });

  const selectedSaleQuery = useQuery({
    queryKey: ['sales', 'detail-for-return', selectedSaleId],
    queryFn: () => fetchSaleById(selectedSaleId),
    enabled: createOpen && selectedSaleId > 0,
  });

  const clients = useMemo(() => clientsQuery.data?.data ?? [], [clientsQuery.data?.data]);
  const eligibleSales = useMemo(
    () => (salesDropdownQuery.data?.data ?? []).filter((s) => s.status !== 'VOIDED'),
    [salesDropdownQuery.data?.data],
  );

  // Populate return lines when sale is fetched
  useEffect(() => {
    if (selectedSaleQuery.data) {
      setLines(
        selectedSaleQuery.data.items.map((it) => ({
          saleItemId: it.id,
          batchNo: it.batchNo,
          itemName: it.itemName,
          enteredUnit: it.enteredUnit,
          conversionFactor: it.conversionFactor,
          soldQtyBase: it.qtyBase,
          alreadyReturnedQtyBase: it.returnedQtyBase,
          availableToReturnQtyBase: it.availableToReturnQtyBase,
          ratePerBase: it.ratePerBase,
          taxRate: it.taxRate,
          batchCostRateSnapshot: it.batchCostRateSnapshot,
          returnEnteredQty: '0.000',
          condition: 'RESALEABLE',
        })),
      );
    } else {
      setLines([]);
    }
  }, [selectedSaleQuery.data]);

  const openCreateDrawer = (forSaleId?: number) => {
    if (!canCreate) return;
    setSelectedSaleId(forSaleId ?? 0);
    setReturnDate(todayStr);
    setReasonCode('QUALITY');
    setSettlementType('ADJUST_BALANCE');
    setDeduction('0.00');
    setNotes('');
    setLines([]);
    setCreateOpen(true);
  };

  useEffect(() => {
    if (initialSaleIdForReturn) {
      openCreateDrawer(initialSaleIdForReturn);
      onClearInitialSale?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSaleIdForReturn]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !createOpen && !detailReturn) {
          openCreateDrawer();
        }
      },
    },
  ]);

  const returnsQuery = useQuery({
    queryKey: [
      'sale-returns',
      { page, pageSize, search, clientFilter, statusFilter, dateFrom, dateTo, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchSaleReturns({
        page,
        pageSize,
        search: search.trim() || undefined,
        clientId: clientFilter ? Number(clientFilter) : undefined,
        status: (statusFilter || undefined) as 'POSTED' | 'VOIDED' | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
  });

  // Live return calculation
  const computedReturn = useMemo(() => {
    let subtotalDec = new Decimal(0);
    let taxTotalDec = new Decimal(0);
    let cogsReversedDec = new Decimal(0);
    let lossTotalDec = new Decimal(0);

    const lineCalcs = lines.map((l) => {
      const calc = calculateSaleReturnAmounts({
        enteredQty: l.returnEnteredQty,
        conversionFactor: l.conversionFactor,
        ratePerBase: l.ratePerBase,
        taxRate: l.taxRate,
        batchCostRateSnapshot: l.batchCostRateSnapshot,
        condition: l.condition,
      });
      subtotalDec = subtotalDec.plus(new Decimal(calc.lineSubtotal));
      taxTotalDec = taxTotalDec.plus(new Decimal(calc.taxAmount));
      cogsReversedDec = cogsReversedDec.plus(new Decimal(calc.cogsReversed));
      lossTotalDec = lossTotalDec.plus(new Decimal(calc.lossAmount));
      return calc;
    });

    const deductionDec = new Decimal(deduction || 0);
    const totalCreditDec = Decimal.max(
      new Decimal(0),
      subtotalDec.plus(taxTotalDec).minus(deductionDec),
    );

    return {
      lineCalcs,
      subtotal: subtotalDec.toFixed(2),
      taxTotal: taxTotalDec.toFixed(2),
      cogsReversed: cogsReversedDec.toFixed(2),
      lossAmount: lossTotalDec.toFixed(2),
      totalCredit: totalCreditDec.toFixed(2),
    };
  }, [lines, deduction]);

  const invalidateAllReturnData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] }),
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
      queryClient.invalidateQueries({ queryKey: ['batches'] }),
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['client-ledger'] }),
    ]);
  };

  const createReturnMutation = useMutation({
    mutationFn: createSaleReturn,
    onSuccess: async () => {
      await invalidateAllReturnData();
      showToast({
        title: 'Credit note (sale return) posted and client ledger credited',
        tone: 'success',
      });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const voidReturnMutation = useMutation({
    mutationFn: (vars: { id: number; reason: string }) => voidSaleReturn(vars.id, vars.reason),
    onSuccess: async () => {
      await invalidateAllReturnData();
      showToast({ title: 'Credit note voided and ledger/stock reversed', tone: 'success' });
      setVoidTarget(null);
      setVoidReason('');
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const handleSaveReturn = (andNew: boolean) => {
    if (!selectedSaleId) {
      showToast({ title: 'Select an original sale invoice', tone: 'danger' });
      return;
    }

    const activeLines = lines.filter((l) => new Decimal(l.returnEnteredQty || 0).gt(0));
    if (activeLines.length === 0) {
      showToast({ title: 'Enter a positive return quantity on at least one item', tone: 'danger' });
      return;
    }

    // Validate against available returnable quantity
    for (const l of activeLines) {
      const returnBase = new Decimal(l.returnEnteredQty).mul(new Decimal(l.conversionFactor || 1));
      const maxAvail = new Decimal(l.availableToReturnQtyBase || 0);
      if (returnBase.gt(maxAvail)) {
        showToast({
          title: `Cannot return ${returnBase.toFixed(3)} kg of ${l.itemName}: max returnable is ${maxAvail.toFixed(3)} kg`,
          tone: 'danger',
        });
        return;
      }
    }

    const payload: CreateSaleReturnInput = {
      saleId: selectedSaleId,
      returnDate,
      reasonCode,
      deduction: new Decimal(deduction || 0).toFixed(2),
      settlementType,
      notes: notes.trim() || undefined,
      lines: activeLines.map((l) => ({
        saleItemId: l.saleItemId,
        enteredQty: new Decimal(l.returnEnteredQty).toFixed(3),
        condition: l.condition,
      })),
    };

    createReturnMutation.mutate(payload, {
      onSuccess: () => {
        if (andNew) {
          openCreateDrawer();
        } else {
          setCreateOpen(false);
        }
      },
    });
  };

  const columns = useMemo<ColumnDef<SaleReturnDto, unknown>[]>(
    () => [
      {
        id: 'returnNo',
        accessorKey: 'returnNo',
        header: 'Credit Note No',
        size: 140,
        cell: ({ row }) => (
          <EntityLink onClick={() => setDetailReturn(row.original)}>
            <span className="font-mono">{row.original.returnNo}</span>
          </EntityLink>
        ),
      },
      {
        id: 'returnDate',
        accessorKey: 'returnDate',
        header: 'Date',
        size: 105,
      },
      {
        id: 'invoiceNo',
        accessorKey: 'invoiceNo',
        header: 'Original Invoice',
        size: 140,
        cell: ({ row }) => (
          <EntityLink onClick={() => onViewSaleInvoice(row.original.saleId)}>
            <span className="font-mono">{row.original.invoiceNo}</span>
          </EntityLink>
        ),
      },
      {
        id: 'clientName',
        accessorKey: 'clientName',
        header: 'Client',
        cell: ({ row }) => (
          <EntityLink onClick={() => onOpenClient360(row.original.clientId)}>
            {row.original.clientName}
          </EntityLink>
        ),
      },
      {
        id: 'reasonCode',
        accessorKey: 'reasonCode',
        header: 'Reason',
        size: 130,
      },
      {
        id: 'settlementType',
        accessorKey: 'settlementType',
        header: 'Settlement',
        size: 135,
      },
      {
        id: 'total',
        accessorKey: 'total',
        header: 'Credit Total',
        size: 125,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.total} className="text-[#2c6b48]" />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        size: 95,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 130,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'view',
                label: 'View',
                inline: true,
                onClick: () => setDetailReturn(row.original),
              },
              {
                id: 'void',
                label: 'Void Return',
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
    [canVoid, onOpenClient360, onViewSaleInvoice],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Sale Returns (Credit Notes)"
        subtitle="Issue credit notes against sales invoices, return resaleable stock to original batch at snapshot cost, or log damaged return losses"
        primaryAction={
          canCreate
            ? {
                label: 'New Credit Note',
                shortcutHint: 'Ctrl+N',
                onClick: () => openCreateDrawer(),
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder="Search by credit note no, invoice no, or client…"
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
            id: 'status',
            label: 'Status',
            value: statusFilter,
            allLabel: 'All Statuses',
            options: [
              { value: 'POSTED', label: 'POSTED' },
              { value: 'VOIDED', label: 'VOIDED' },
            ],
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
          setStatusFilter('');
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
        emptyTitle="No sale returns found"
        emptyDescription="Create a credit note from a sale invoice when a client returns goods."
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
          rowsPerPage: 'Returns per page',
          showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
          firstPage: 'First',
          previousPage: 'Prev',
          nextPage: 'Next',
          lastPage: 'Last',
        }}
      />

      {/* Create Credit Note Drawer */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Credit Note (Sale Return)"
        widthClass="max-w-5xl"
      >
        <FormLayout
          onSubmit={() => handleSaveReturn(false)}
          onSaveAndNew={() => handleSaveReturn(true)}
          onCancel={() => setCreateOpen(false)}
          labels={{
            save: 'Post Credit Note',
            saveAndNew: 'Post & New',
            cancel: 'Cancel',
          }}
          isSubmitting={createReturnMutation.isPending}
          footerSlot={
            <div className="space-y-4">
              {selectedSaleId > 0 && (
                <div className="overflow-x-auto rounded border border-[#d6d3c9] bg-white">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-[#f1efe9] text-[#5c5a53]">
                      <tr className="h-8 border-b border-[#d6d3c9]">
                        <th className="px-2.5 text-left font-semibold">Batch</th>
                        <th className="px-2.5 text-left font-semibold">Item</th>
                        <th className="px-2.5 text-right font-semibold">Sold (KG)</th>
                        <th className="px-2.5 text-right font-semibold">Already Ret (KG)</th>
                        <th className="px-2.5 text-right font-semibold">Max Returnable</th>
                        <th className="w-36 px-2.5 text-right font-semibold">
                          Return Qty ({lines[0]?.enteredUnit ?? 'KG'})
                        </th>
                        <th className="w-40 px-2.5 text-left font-semibold">Condition</th>
                        <th className="px-2.5 text-right font-semibold">Credit Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => {
                        const calc = computedReturn.lineCalcs[idx];
                        const maxAvail = new Decimal(line.availableToReturnQtyBase || 0);
                        return (
                          <tr key={line.saleItemId} className="h-10 border-b border-[#e4e2da]">
                            <td className="px-2.5 font-mono text-[#5c5a53]">{line.batchNo}</td>
                            <td className="px-2.5 font-medium">{line.itemName}</td>
                            <td className="px-2.5 text-right">
                              <WeightText value={line.soldQtyBase} />
                            </td>
                            <td className="px-2.5 text-right">
                              <WeightText value={line.alreadyReturnedQtyBase} />
                            </td>
                            <td className="px-2.5 text-right font-semibold text-[#2c6b48]">
                              <WeightText value={line.availableToReturnQtyBase} />
                            </td>
                            <td className="px-2.5">
                              <NumberInput
                                precision="weight"
                                disabled={maxAvail.lte(0)}
                                value={line.returnEnteredQty}
                                onChange={(val) =>
                                  setLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, returnEnteredQty: val } : r,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-2.5">
                              <Select
                                disabled={maxAvail.lte(0)}
                                value={line.condition}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            condition: e.target.value as SaleReturnCondition,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                                options={SALE_RETURN_CONDITIONS.map((c) => ({
                                  value: c,
                                  label:
                                    c === 'RESALEABLE'
                                      ? 'RESALEABLE (Back to Batch)'
                                      : 'DAMAGED (Loss)',
                                }))}
                              />
                            </td>
                            <td className="px-2.5 text-right">
                              <MoneyText value={calc?.lineTotal ?? '0.00'} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 rounded border border-[#d6d3c9] bg-[#f7f6f2] p-3 md:grid-cols-2">
                <FormField label="Handling / Restocking Deduction">
                  <NumberInput precision="money" value={deduction} onChange={setDeduction} />
                </FormField>

                <div className="flex flex-col justify-between rounded border border-[#e4e2da] bg-white p-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#6f6c64]">Return Subtotal:</span>
                      <MoneyText value={computedReturn.subtotal} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6f6c64]">COGS Restored to Batch:</span>
                      <MoneyText value={computedReturn.cogsReversed} className="text-[#2c6b48]" />
                    </div>
                    {new Decimal(computedReturn.lossAmount).gt(0) && (
                      <div className="flex justify-between">
                        <span className="text-[#9e3b33]">Damaged Return Loss:</span>
                        <MoneyText value={computedReturn.lossAmount} className="text-[#9e3b33]" />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[#d6d3c9] pt-2 text-sm font-semibold">
                    <span>Net Credit to Client:</span>
                    <MoneyText value={computedReturn.totalCredit} className="text-[#2c6b48]" />
                  </div>
                </div>
              </div>
            </div>
          }
        >
          <FormField label="Original Sale Invoice" required>
            <Combobox
              value={selectedSaleId ? String(selectedSaleId) : ''}
              placeholder="Search sale invoice…"
              searchPlaceholder="Type invoice no or client name…"
              onChange={(val) => setSelectedSaleId(val ? Number(val) : 0)}
              options={eligibleSales.map((s) => ({
                value: String(s.id),
                label: `${s.invoiceNo} · ${s.clientName}`,
                subtitle: `Date: ${s.saleDate} · Total: ${s.total}`,
              }))}
            />
          </FormField>

          <FormField label="Return Date" required>
            <DatePicker value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </FormField>

          <FormField label="Return Reason" required>
            <Select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as SaleReturnReason)}
              options={SALE_RETURN_REASONS.map((r) => ({ value: r, label: r }))}
            />
          </FormField>

          <FormField label="Settlement Method" required>
            <Select
              value={settlementType}
              onChange={(e) => setSettlementType(e.target.value as SaleReturnSettlement)}
              options={SALE_RETURN_SETTLEMENTS.map((s) => ({ value: s, label: s }))}
            />
          </FormField>

          <FormField label="Notes">
            <TextInput
              placeholder="Inspection remarks or pickup challan ref"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </FormLayout>
      </Drawer>

      {/* Credit Note Detail Drawer */}
      <Drawer
        open={detailReturn !== null}
        onClose={() => setDetailReturn(null)}
        title={detailReturn ? `Credit Note ${detailReturn.returnNo}` : 'Credit Note Detail'}
        widthClass="max-w-4xl"
      >
        {detailReturn && (
          <div className="space-y-4 p-4 text-xs">
            <div className="flex items-center justify-between rounded border border-[#d6d3c9] bg-[#f7f6f2] p-3">
              <div>
                <div className="text-sm font-semibold">{detailReturn.clientName}</div>
                <div className="text-[#6f6c64]">
                  Original Invoice: {detailReturn.invoiceNo} · Date: {detailReturn.returnDate} ·
                  Reason: {detailReturn.reasonCode}
                </div>
              </div>
              <StatusBadge tone={detailReturn.status === 'POSTED' ? 'success' : 'danger'}>
                {detailReturn.status}
              </StatusBadge>
            </div>

            <div className="overflow-x-auto rounded border border-[#d6d3c9] bg-white">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-[#f1efe9] text-[#5c5a53]">
                  <tr className="h-8 border-b border-[#d6d3c9]">
                    <th className="px-2.5 text-left font-semibold">Batch</th>
                    <th className="px-2.5 text-left font-semibold">Item</th>
                    <th className="px-2.5 text-right font-semibold">Returned (KG)</th>
                    <th className="px-2.5 text-left font-semibold">Condition</th>
                    <th className="px-2.5 text-right font-semibold">COGS Reversed</th>
                    <th className="px-2.5 text-right font-semibold">Loss</th>
                    <th className="px-2.5 text-right font-semibold">Credit Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailReturn.items.map((it) => (
                    <tr key={it.id} className="h-9 border-b border-[#e4e2da]">
                      <td className="px-2.5 font-mono">{it.batchNo}</td>
                      <td className="px-2.5 font-medium">{it.itemName}</td>
                      <td className="px-2.5 text-right">
                        <WeightText value={it.qtyBase} />
                      </td>
                      <td className="px-2.5">
                        <StatusBadge tone={it.condition === 'RESALEABLE' ? 'success' : 'danger'}>
                          {it.condition}
                        </StatusBadge>
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText value={it.cogsReversed} />
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText value={it.lossAmount} />
                      </td>
                      <td className="px-2.5 text-right">
                        <MoneyText value={it.lineTotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>

      {/* Void Confirmation Dialog */}
      <Dialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void Credit Note ${voidTarget.returnNo}` : 'Void Credit Note'}
      >
        <div className="space-y-3 p-4">
          <p className="text-xs text-[#5c5a53]">
            Voiding this credit note will deduct any resaleable returned stock back from the batch
            and reverse the client ledger credit.
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
              disabled={voidReturnMutation.isPending || voidReason.trim().length < 3}
              onClick={() => {
                if (voidTarget) {
                  voidReturnMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() });
                }
              }}
            >
              Confirm Void
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
