import {
  PAYMENT_METHODS,
  type PageSizeOption,
  type PaymentDto,
  type PaymentMethod,
  type PaymentStatus,
  type SortOrder,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  DatePicker,
  Drawer,
  EntityLink,
  FileUpload,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
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
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createSupplierPayment,
  fetchPayments,
  fetchPurchaseInvoices,
  fetchSuppliers,
  voidPayment,
} from '../lib/api.js';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read proof file'));
    reader.readAsDataURL(file);
  });
}

export interface PaymentsOutScreenProps {
  readonly canCreate: boolean;
  readonly canVoid: boolean;
  readonly prefillSupplierId?: number | null;
  readonly prefillPurchaseId?: number | null;
  readonly onClearPrefill?: () => void;
  readonly onOpenSupplier360: (supplierId: number) => void;
  readonly onViewPurchaseInvoice: (purchaseId: number) => void;
}

export function PaymentsOutScreen({
  canCreate,
  canVoid,
  prefillSupplierId,
  prefillPurchaseId,
  onClearPrefill,
  onOpenSupplier360,
  onViewPurchaseInvoice,
}: PaymentsOutScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState('0.00');
  const [referenceNo, setReferenceNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | undefined>(undefined);
  const [allocations, setAllocations] = useState<Record<number, string>>({});

  // Detail & Void Drawer
  const [selectedPayment, setSelectedPayment] = useState<PaymentDto | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'dropdown'],
    queryFn: () => fetchSuppliers({ page: 1, pageSize: 100, isActive: true, sortOrder: 'asc' }),
  });

  const paymentsQuery = useQuery({
    queryKey: [
      'payments',
      'OUT',
      { page, pageSize, search, methodFilter, statusFilter, dateFrom, dateTo, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchPayments({
        direction: 'OUT',
        partyType: 'SUPPLIER',
        page,
        pageSize,
        search: search.trim() || undefined,
        method: (methodFilter || undefined) as PaymentMethod | undefined,
        status: (statusFilter || undefined) as PaymentStatus | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      }),
  });

  const openPurchasesQuery = useQuery({
    queryKey: ['purchases', 'open-for-supplier', supplierId],
    queryFn: () =>
      fetchPurchaseInvoices({
        supplierId,
        page: 1,
        pageSize: 50,
        sortOrder: 'asc',
      }),
    enabled: drawerOpen && supplierId > 0,
  });

  const suppliers = useMemo(() => suppliersQuery.data?.data ?? [], [suppliersQuery.data?.data]);

  const openInvoices = useMemo(
    () =>
      (openPurchasesQuery.data?.data ?? []).filter(
        (inv) => inv.status !== 'VOIDED' && new Decimal(inv.balanceDue).gt(0),
      ),
    [openPurchasesQuery.data?.data],
  );

  const openCreateDrawer = (forSupplierId?: number, forPurchaseId?: number) => {
    if (!canCreate) return;
    const supId = forSupplierId ?? suppliers[0]?.id ?? 0;
    setSupplierId(supId);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMethod('CASH');
    setAmount('0.00');
    setReferenceNo('');
    setBankName('');
    setChequeDate('');
    setNotes('');
    setProofFile(null);
    setProofDataUrl(undefined);
    setAllocations({});
    setDrawerOpen(true);

    if (forPurchaseId) {
      // Pre-fill allocation when openInvoices loads
      setTimeout(() => {
        setAllocations({ [forPurchaseId]: 'AUTO' });
      }, 25);
    }
  };

  useEffect(() => {
    if (prefillSupplierId && suppliers.length > 0) {
      openCreateDrawer(prefillSupplierId, prefillPurchaseId ?? undefined);
      onClearPrefill?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSupplierId, prefillPurchaseId, suppliers.length]);

  useEffect(() => {
    // Resolve 'AUTO' pre-fill once openInvoices for that supplier finishes loading
    for (const [invIdStr, val] of Object.entries(allocations)) {
      if (val === 'AUTO') {
        const inv = openInvoices.find((i) => i.id === Number(invIdStr));
        if (inv) {
          setAllocations({ [inv.id]: inv.balanceDue });
          setAmount(inv.balanceDue);
        }
      }
    }
  }, [allocations, openInvoices]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !drawerOpen && !selectedPayment) openCreateDrawer();
      },
    },
  ]);

  const handleAutoAllocate = () => {
    let remaining = new Decimal(amount || '0');
    const next: Record<number, string> = {};
    for (const inv of openInvoices) {
      if (remaining.lte(0)) break;
      const due = new Decimal(inv.balanceDue);
      const alloc = Decimal.min(remaining, due);
      next[inv.id] = alloc.toFixed(2);
      remaining = remaining.minus(alloc);
    }
    setAllocations(next);
  };

  const createMutation = useMutation({
    mutationFn: createSupplierPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ledger'] });
      showToast({ title: t('payments.savedToast'), tone: 'success' });
      setDrawerOpen(false);
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to record payment',
        tone: 'danger',
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (params: { id: number; reason: string }) =>
      voidPayment(params.id, { reason: params.reason }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ledger'] });
      setSelectedPayment(updated);
      setVoidReason('');
      showToast({ title: t('payments.voidedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to void payment',
        tone: 'danger',
      });
    },
  });

  const handleSave = () => {
    if (!supplierId) {
      showToast({ title: t('purchases.selectSupplier'), tone: 'danger' });
      return;
    }

    const validAllocations = Object.entries(allocations)
      .filter(([, amt]) => {
        try {
          return amt !== 'AUTO' && new Decimal(amt || '0').gt(0);
        } catch {
          return false;
        }
      })
      .map(([invId, amt]) => ({
        invoiceType: 'PURCHASE_INVOICE' as const,
        invoiceId: Number(invId),
        amount: new Decimal(amt).toFixed(2),
      }));

    createMutation.mutate({
      supplierId,
      paymentDate,
      method,
      amount,
      referenceNo: referenceNo.trim() || undefined,
      bankName: bankName.trim() || undefined,
      chequeDate: chequeDate || undefined,
      notes: notes.trim() || undefined,
      proofDataUrl,
      proofFileName: proofFile?.name,
      allocations: validAllocations,
    });
  };

  const columns: ColumnDef<PaymentDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('payments.colId'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'paymentNo',
        header: t('payments.colPaymentNo'),
        size: 150,
        cell: ({ row }) => (
          <EntityLink mono onClick={() => setSelectedPayment(row.original)}>
            {row.original.paymentNo}
          </EntityLink>
        ),
      },
      {
        id: 'paymentDate',
        header: t('payments.colDate'),
        size: 105,
        cell: ({ row }) => <span className="erp-num">{row.original.paymentDate.slice(0, 10)}</span>,
      },
      {
        id: 'supplier',
        header: t('payments.colSupplier'),
        size: 195,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityLink
            onClick={() => onOpenSupplier360(row.original.partyId)}
            subtitle={row.original.partyNameUr}
          >
            {row.original.partyName}
          </EntityLink>
        ),
      },
      {
        id: 'method',
        header: t('payments.colMethod'),
        size: 130,
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge tone="neutral">{t(`payments.methods.${row.original.method}`)}</StatusBadge>
        ),
      },
      {
        id: 'referenceNo',
        header: t('payments.colReference'),
        size: 160,
        enableSorting: false,
        cell: ({ row }) =>
          [row.original.bankName, row.original.referenceNo].filter(Boolean).join(' · ') || '—',
      },
      {
        id: 'allocations',
        header: t('payments.colAllocated'),
        size: 170,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.allocations.length === 0 ? (
            <span className="text-xs text-[#8c8980]">On Account</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.allocations.map((al) => (
                <EntityLink key={al.id} mono onClick={() => onViewPurchaseInvoice(al.invoiceId)}>
                  {al.invoiceNo || `#${al.invoiceId}`}
                </EntityLink>
              ))}
            </div>
          ),
      },
      {
        id: 'amount',
        header: t('payments.colAmount'),
        size: 135,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.amount} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('payments.colStatus'),
        size: 95,
        enableSorting: false,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === 'POSTED' ? 'success' : 'danger'}>
            {row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 155,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'view',
                label: t('common.view'),
                inline: true,
                onClick: () => setSelectedPayment(row.original),
              },
              {
                id: 'ledger',
                label: t('suppliers.actionLedger'),
                inline: true,
                onClick: () => onOpenSupplier360(row.original.partyId),
              },
              {
                id: 'void',
                label: t('common.void'),
                tone: 'danger',
                disabled: !canVoid || row.original.status === 'VOIDED',
                onClick: () => {
                  setSelectedPayment(row.original);
                  setVoidReason('');
                },
              },
            ]}
          />
        ),
      },
    ],
    [t, canVoid, onOpenSupplier360, onViewPurchaseInvoice],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('payments.title')}
        subtitle={t('payments.subtitle')}
        primaryAction={
          canCreate
            ? {
                label: t('payments.newPayment'),
                shortcutHint: 'Ctrl+N',
                onClick: () => openCreateDrawer(),
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder={t('payments.searchPlaceholder')}
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
            id: 'method',
            label: t('payments.colMethod'),
            value: methodFilter,
            allLabel: t('payments.allMethods'),
            options: PAYMENT_METHODS.map((m) => ({
              value: m,
              label: t(`payments.methods.${m}`),
            })),
            onChange: (val) => {
              setMethodFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: t('payments.colStatus'),
            value: statusFilter,
            allLabel: t('purchases.allStatuses'),
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
        clearLabel={t('common.clear')}
        onClear={() => {
          setSearch('');
          setMethodFilter('');
          setStatusFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={paymentsQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        onRowClick={(r) => setSelectedPayment(r)}
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

      {/* Record Payment Out Drawer */}
      <Drawer
        open={drawerOpen}
        title={t('payments.newPayment')}
        widthClass="max-w-3xl"
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
            openInvoices.length > 0 && (
              <div className="mt-2 rounded border border-[#e4e2da] bg-[#faf9f5] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1f1e1b]">
                    {t('payments.allocateTitle')}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleAutoAllocate}>
                    {t('payments.autoAllocate')}
                  </Button>
                </div>
                <table className="w-full border-collapse rounded border border-[#d6d3c9] bg-white text-xs">
                  <thead className="bg-[#f1efe9] text-[#5c5a53]">
                    <tr className="h-8 border-b border-[#d6d3c9]">
                      <th className="px-2.5 text-start">{t('purchases.colInvoiceNo')}</th>
                      <th className="px-2.5 text-start">{t('purchases.colDate')}</th>
                      <th className="px-2.5 text-end">{t('purchases.colTotal')}</th>
                      <th className="px-2.5 text-end">{t('payments.colInvoiceBalance')}</th>
                      <th className="w-36 px-2.5 text-end">{t('payments.colAllocateAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openInvoices.map((inv) => (
                      <tr key={inv.id} className="h-9 border-b border-[#e4e2da]">
                        <td className="erp-num px-2.5 font-medium">{inv.invoiceNo}</td>
                        <td className="erp-num px-2.5">{inv.invoiceDate.slice(0, 10)}</td>
                        <td className="px-2.5 text-end">
                          <MoneyText value={inv.total} />
                        </td>
                        <td className="px-2.5 text-end font-semibold text-[#9e2b2b]">
                          <MoneyText value={inv.balanceDue} />
                        </td>
                        <td className="px-2.5 py-1">
                          <NumberInput
                            precision="money"
                            value={
                              allocations[inv.id] === 'AUTO'
                                ? inv.balanceDue
                                : (allocations[inv.id] ?? '0.00')
                            }
                            onChange={(val) =>
                              setAllocations((prev) => ({ ...prev, [inv.id]: val }))
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
          <FormField label={t('payments.supplier')} required>
            <Select
              value={supplierId ? String(supplierId) : ''}
              onChange={(e) => {
                setSupplierId(Number(e.target.value));
                setAllocations({});
              }}
              options={suppliers.map((s) => ({
                value: String(s.id),
                label: `${s.name} (Payable: ${s.currentBalance})`,
              }))}
            />
          </FormField>

          <FormField label={t('payments.paymentDate')} required>
            <DatePicker value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </FormField>

          <FormField label={t('payments.method')} required>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: t(`payments.methods.${m}`),
              }))}
            />
          </FormField>

          <FormField label={t('payments.amount')} required>
            <NumberInput precision="money" value={amount} onChange={setAmount} />
          </FormField>

          <FormField label={t('payments.referenceNo')}>
            <TextInput value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          </FormField>

          <FormField label={t('payments.bankName')}>
            <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </FormField>

          {method === 'CHEQUE' && (
            <FormField label={t('payments.chequeDate')}>
              <DatePicker value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </FormField>
          )}

          <FormField label={t('payments.proofUpload')} fullWidth>
            <FileUpload
              value={proofFile}
              previewUrl={proofDataUrl ?? null}
              chooseLabel={t('demo.form.chooseFile')}
              removeLabel={t('common.delete')}
              hintLabel={t('demo.form.proofHint')}
              onChange={(file) => {
                setProofFile(file);
                if (file) {
                  void readFileAsDataUrl(file).then(setProofDataUrl);
                } else {
                  setProofDataUrl(undefined);
                }
              }}
            />
          </FormField>

          <FormField label={t('common.notes')} fullWidth>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </FormLayout>
      </Drawer>

      {/* Payment Detail & Void Drawer */}
      <Drawer
        open={Boolean(selectedPayment)}
        title={selectedPayment ? selectedPayment.paymentNo : ''}
        onClose={() => setSelectedPayment(null)}
      >
        {selectedPayment && (
          <div className="flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between rounded border border-[#e4e2da] bg-[#faf9f5] p-3">
              <div>
                <EntityLink
                  onClick={() => {
                    const supId = selectedPayment.partyId;
                    setSelectedPayment(null);
                    onOpenSupplier360(supId);
                  }}
                >
                  {selectedPayment.partyName}
                </EntityLink>
                <p className="mt-1 text-[#5c5a53]">
                  {selectedPayment.paymentDate.slice(0, 10)} ·{' '}
                  {t(`payments.methods.${selectedPayment.method}`)}
                </p>
              </div>
              <div className="text-end">
                <div className="text-base font-semibold">
                  <MoneyText value={selectedPayment.amount} />
                </div>
                <StatusBadge tone={selectedPayment.status === 'POSTED' ? 'success' : 'danger'}>
                  {selectedPayment.status}
                </StatusBadge>
              </div>
            </div>

            {selectedPayment.attachments.length > 0 && (
              <SurfaceCard title={t('payments.proofUpload')}>
                <div className="flex flex-wrap gap-3">
                  {selectedPayment.attachments.map((att) => (
                    <img
                      key={att.id}
                      src={att.filePath}
                      alt={att.fileName}
                      className="max-h-48 rounded border border-[#d6d3c9] object-contain"
                    />
                  ))}
                </div>
              </SurfaceCard>
            )}

            {canVoid && selectedPayment.status === 'POSTED' && (
              <SurfaceCard title={t('common.void')}>
                <div className="flex flex-col gap-3">
                  <FormField label={t('purchases.voidReasonLabel')} required>
                    <TextInput value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                  </FormField>
                  <div className="flex justify-end">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={voidReason.trim().length < 3 || voidMutation.isPending}
                      onClick={() =>
                        voidMutation.mutate({
                          id: selectedPayment.id,
                          reason: voidReason.trim(),
                        })
                      }
                    >
                      {t('common.void')}
                    </Button>
                  </div>
                </div>
              </SurfaceCard>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
