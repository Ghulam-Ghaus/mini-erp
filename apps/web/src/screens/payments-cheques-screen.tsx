import {
  CHEQUE_STATUSES,
  PAYMENT_METHODS,
  type ChequeDto,
  type ChequeStatus,
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
  Dialog,
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
  TabsBar,
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
import { PrintDocumentDialog, type PrintableDocument } from '../components/print-document-dialog';
import {
  createClientPayment,
  fetchCheques,
  fetchClients,
  fetchPayments,
  fetchSales,
  updateChequeStatus,
  voidPayment,
} from '../lib/api.js';
import { PaymentsOutScreen } from './payments-out-screen.js';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read proof file'));
    reader.readAsDataURL(file);
  });
}

export interface PaymentsChequesScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly canVoid: boolean;
  readonly prefillClientId?: number | null;
  readonly prefillSaleId?: number | null;
  readonly prefillSupplierId?: number | null;
  readonly prefillPurchaseId?: number | null;
  readonly onClearPrefill?: () => void;
  readonly onOpenClient360: (clientId: number) => void;
  readonly onViewSaleInvoice: (saleId: number) => void;
  readonly onOpenSupplier360: (supplierId: number) => void;
  readonly onViewPurchaseInvoice: (purchaseId: number) => void;
}

export function PaymentsChequesScreen({
  canCreate,
  canEdit,
  canVoid,
  prefillClientId,
  prefillSaleId,
  prefillSupplierId,
  prefillPurchaseId,
  onClearPrefill,
  onOpenClient360,
  onViewSaleInvoice,
  onOpenSupplier360,
  onViewPurchaseInvoice,
}: PaymentsChequesScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'receipts-in' | 'cheques' | 'payments-out'>(
    'receipts-in',
  );

  // Switch tab automatically if supplier prefill is passed
  useEffect(() => {
    if (prefillSupplierId) {
      setActiveTab('payments-out');
    } else if (prefillClientId) {
      setActiveTab('receipts-in');
    }
  }, [prefillSupplierId, prefillClientId]);

  // --- Tab 1: Client Receipts (Payments In) state ---
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  const [receiptDrawerOpen, setReceiptDrawerOpen] = useState(false);
  const [clientId, setClientId] = useState<number>(0);
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

  const [selectedReceipt, setSelectedReceipt] = useState<PaymentDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);

  // --- Tab 2: Cheques Register state ---
  const [chequeSearch, setChequeSearch] = useState('');
  const [chequeStatusFilter, setChequeStatusFilter] = useState('');
  const [chequeDirectionFilter, setChequeDirectionFilter] = useState('');
  const [chequeDateFrom, setChequeDateFrom] = useState('');
  const [chequeDateTo, setChequeDateTo] = useState('');
  const [chequeSortBy, setChequeSortBy] = useState('chequeDate');
  const [chequeSortOrder, setChequeSortOrder] = useState<SortOrder>('asc');
  const [chequePage, setChequePage] = useState(1);
  const [chequePageSize, setChequePageSize] = useState<PageSizeOption>(25);

  const [chequeActionModal, setChequeActionModal] = useState<{
    cheque: ChequeDto;
    targetStatus: 'DEPOSITED' | 'CLEARED' | 'BOUNCED';
  } | null>(null);
  const [actionDate, setActionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [depositBankInput, setDepositBankInput] = useState('');
  const [bounceReasonInput, setBounceReasonInput] = useState('');
  const [bounceFeeInput, setBounceFeeInput] = useState('0.00');
  const [actionNotesInput, setActionNotesInput] = useState('');

  const clientsQuery = useQuery({
    queryKey: ['clients', 'dropdown'],
    queryFn: () => fetchClients({ page: 1, pageSize: 100, isActive: true, sortOrder: 'asc' }),
  });

  const receiptsQuery = useQuery({
    queryKey: [
      'payments',
      'IN',
      { page, pageSize, search, methodFilter, statusFilter, dateFrom, dateTo, sortBy, sortOrder },
    ],
    queryFn: () =>
      fetchPayments({
        direction: 'IN',
        partyType: 'CLIENT',
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
    enabled: activeTab === 'receipts-in',
  });

  const chequesQuery = useQuery({
    queryKey: [
      'cheques',
      {
        page: chequePage,
        pageSize: chequePageSize,
        search: chequeSearch,
        status: chequeStatusFilter,
        direction: chequeDirectionFilter,
        dateFrom: chequeDateFrom,
        dateTo: chequeDateTo,
        sortBy: chequeSortBy,
        sortOrder: chequeSortOrder,
      },
    ],
    queryFn: () =>
      fetchCheques({
        page: chequePage,
        pageSize: chequePageSize,
        search: chequeSearch.trim() || undefined,
        status: (chequeStatusFilter || undefined) as ChequeStatus | undefined,
        direction: (chequeDirectionFilter || undefined) as 'IN' | 'OUT' | undefined,
        dateFrom: chequeDateFrom || undefined,
        dateTo: chequeDateTo || undefined,
        sortBy: chequeSortBy,
        sortOrder: chequeSortOrder,
      }),
    enabled: activeTab === 'cheques',
  });

  const openSalesQuery = useQuery({
    queryKey: ['sales', 'open-for-client', clientId],
    queryFn: () =>
      fetchSales({
        clientId,
        page: 1,
        pageSize: 50,
        sortOrder: 'asc',
      }),
    enabled: receiptDrawerOpen && clientId > 0,
  });

  const clients = useMemo(() => clientsQuery.data?.data ?? [], [clientsQuery.data?.data]);

  const openSaleInvoices = useMemo(
    () =>
      (openSalesQuery.data?.data ?? []).filter(
        (inv) => inv.status !== 'VOIDED' && new Decimal(inv.balanceDue).gt(0),
      ),
    [openSalesQuery.data?.data],
  );

  const openReceiptDrawer = (forClientId?: number, forSaleId?: number) => {
    if (!canCreate) return;
    const cId = forClientId ?? clients[0]?.id ?? 0;
    setClientId(cId);
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
    setReceiptDrawerOpen(true);

    if (forSaleId) {
      setTimeout(() => {
        setAllocations({ [forSaleId]: 'AUTO' });
      }, 25);
    }
  };

  useEffect(() => {
    if (prefillClientId && clients.length > 0) {
      setActiveTab('receipts-in');
      openReceiptDrawer(prefillClientId, prefillSaleId ?? undefined);
      onClearPrefill?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClientId, prefillSaleId, clients.length]);

  useEffect(() => {
    for (const [invIdStr, val] of Object.entries(allocations)) {
      if (val === 'AUTO') {
        const inv = openSaleInvoices.find((i) => i.id === Number(invIdStr));
        if (inv) {
          setAllocations({ [inv.id]: inv.balanceDue });
          setAmount(inv.balanceDue);
        }
      }
    }
  }, [allocations, openSaleInvoices]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (activeTab === 'receipts-in' && canCreate && !receiptDrawerOpen && !selectedReceipt) {
          openReceiptDrawer();
        }
      },
    },
  ]);

  const handleAutoAllocateSales = () => {
    let remaining = new Decimal(amount || '0');
    const next: Record<number, string> = {};
    for (const inv of openSaleInvoices) {
      if (remaining.lte(0)) break;
      const due = new Decimal(inv.balanceDue);
      const alloc = Decimal.min(remaining, due);
      next[inv.id] = alloc.toFixed(2);
      remaining = remaining.minus(alloc);
    }
    setAllocations(next);
  };

  const createReceiptMutation = useMutation({
    mutationFn: createClientPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-ledger'] });
      showToast({ title: t('payments.receiptSavedToast'), tone: 'success' });
      setReceiptDrawerOpen(false);
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to record receipt',
        tone: 'danger',
      });
    },
  });

  const voidReceiptMutation = useMutation({
    mutationFn: (params: { id: number; reason: string }) =>
      voidPayment(params.id, { reason: params.reason }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-ledger'] });
      setSelectedReceipt(updated);
      setVoidReason('');
      showToast({ title: t('payments.voidedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to void receipt',
        tone: 'danger',
      });
    },
  });

  const updateChequeMutation = useMutation({
    mutationFn: (params: {
      id: number;
      status: 'DEPOSITED' | 'CLEARED' | 'BOUNCED';
      depositDate?: string;
      depositBank?: string;
      clearedDate?: string;
      bouncedDate?: string;
      bounceReason?: string;
      bounceFee: string;
      notes?: string;
    }) =>
      updateChequeStatus(params.id, {
        status: params.status,
        depositDate: params.depositDate,
        depositBank: params.depositBank,
        clearedDate: params.clearedDate,
        bouncedDate: params.bouncedDate,
        bounceReason: params.bounceReason,
        bounceFee: params.bounceFee,
        notes: params.notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ledger'] });
      setChequeActionModal(null);
      showToast({ title: t('payments.chequeUpdatedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to update cheque status',
        tone: 'danger',
      });
    },
  });

  const handleSaveReceipt = () => {
    if (!clientId) {
      showToast({ title: t('payments.selectClient'), tone: 'danger' });
      return;
    }

    if (method !== 'CASH' && !proofDataUrl) {
      showToast({
        title: 'Proof upload is mandatory for non-cash payments',
        tone: 'danger',
      });
      return;
    }

    if (method === 'CHEQUE' && (!referenceNo.trim() || !bankName.trim() || !chequeDate)) {
      showToast({
        title: 'Cheque number, bank name, and cheque due date are required',
        tone: 'danger',
      });
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
        invoiceType: 'SALE_INVOICE' as const,
        invoiceId: Number(invId),
        amount: new Decimal(amt).toFixed(2),
      }));

    createReceiptMutation.mutate({
      clientId,
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

  const receiptColumns: ColumnDef<PaymentDto, unknown>[] = useMemo(
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
        size: 145,
        cell: ({ row }) => (
          <EntityLink mono onClick={() => setSelectedReceipt(row.original)}>
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
        id: 'client',
        header: t('payments.colClient'),
        size: 190,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityLink
            onClick={() => onOpenClient360(row.original.partyId)}
            subtitle={row.original.partyNameUr}
          >
            {row.original.partyName}
          </EntityLink>
        ),
      },
      {
        id: 'method',
        header: t('payments.colMethod'),
        size: 125,
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge tone="neutral">{t(`payments.methods.${row.original.method}`)}</StatusBadge>
        ),
      },
      {
        id: 'referenceNo',
        header: t('payments.colReference'),
        size: 155,
        enableSorting: false,
        cell: ({ row }) =>
          [row.original.bankName, row.original.referenceNo].filter(Boolean).join(' · ') || '—',
      },
      {
        id: 'allocations',
        header: t('payments.colAllocated'),
        size: 165,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.allocations.length === 0 ? (
            <span className="text-xs text-[#8c8980]">On Account</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.allocations.map((al) => (
                <EntityLink key={al.id} mono onClick={() => onViewSaleInvoice(al.invoiceId)}>
                  {al.invoiceNo || `#${al.invoiceId}`}
                </EntityLink>
              ))}
            </div>
          ),
      },
      {
        id: 'amount',
        header: t('payments.colAmount'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold text-[#1f6f43]">
            <MoneyText value={row.original.amount} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('payments.colStatus'),
        size: 110,
        enableSorting: false,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.status === 'POSTED'
                ? 'success'
                : row.original.status === 'BOUNCED'
                  ? 'warning'
                  : 'danger'
            }
          >
            {row.original.chequeStatus
              ? `${row.original.status} (${row.original.chequeStatus})`
              : row.original.status}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 150,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'print',
                label: 'Print',
                inline: true,
                onClick: () => setPrintDoc({ type: 'PAYMENT_IN', data: row.original }),
              },
              {
                id: 'view',
                label: t('common.view'),
                inline: true,
                onClick: () => setSelectedReceipt(row.original),
              },
              {
                id: 'ledger',
                label: t('suppliers.actionLedger'),
                inline: true,
                onClick: () => onOpenClient360(row.original.partyId),
              },
              {
                id: 'void',
                label: t('common.void'),
                tone: 'danger',
                disabled: !canVoid || row.original.status !== 'POSTED',
                onClick: () => {
                  setSelectedReceipt(row.original);
                  setVoidReason('');
                },
              },
            ]}
          />
        ),
      },
    ],
    [t, canVoid, onOpenClient360, onViewSaleInvoice],
  );

  const chequeColumns: ColumnDef<ChequeDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('payments.colId'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'chequeNo',
        header: t('payments.colChequeNo'),
        size: 125,
        cell: ({ row }) => <span className="erp-num font-semibold">{row.original.chequeNo}</span>,
      },
      {
        id: 'bankName',
        header: t('payments.colBank'),
        size: 140,
        enableSorting: false,
        cell: ({ row }) => row.original.bankName,
      },
      {
        id: 'chequeDate',
        header: t('payments.colChequeDate'),
        size: 105,
        cell: ({ row }) => <span className="erp-num">{row.original.chequeDate}</span>,
      },
      {
        id: 'party',
        header: t('payments.colParty'),
        size: 185,
        enableSorting: false,
        cell: ({ row }) => (
          <EntityLink
            subtitle={row.original.partyNameUr}
            onClick={() => {
              if (row.original.partyType === 'CLIENT') {
                onOpenClient360(row.original.partyId);
              } else {
                onOpenSupplier360(row.original.partyId);
              }
            }}
          >
            {row.original.partyName}
          </EntityLink>
        ),
      },
      {
        id: 'paymentNo',
        header: t('payments.colPaymentNo'),
        size: 135,
        enableSorting: false,
        cell: ({ row }) => <span className="erp-num text-[#5c5a53]">{row.original.paymentNo}</span>,
      },
      {
        id: 'amount',
        header: t('payments.colAmount'),
        size: 130,
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
        size: 130,
        enableSorting: false,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const tone =
            row.original.status === 'CLEARED'
              ? 'success'
              : row.original.status === 'DEPOSITED'
                ? 'info'
                : row.original.status === 'RECEIVED'
                  ? 'warning'
                  : 'danger';
          return (
            <StatusBadge tone={tone}>
              {t(`payments.chequeStatuses.${row.original.status}`)}
            </StatusBadge>
          );
        },
      },
      {
        id: 'dates',
        header: t('payments.colClearedBounced'),
        size: 160,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.status === 'CLEARED') {
            return (
              <span className="erp-num text-xs text-[#1f6f43]">{row.original.clearedDate}</span>
            );
          }
          if (row.original.status === 'BOUNCED') {
            return (
              <div className="text-xs text-[#9e2b2b]">
                <div className="erp-num font-medium">{row.original.bouncedDate}</div>
                {row.original.bounceReason && (
                  <div className="truncate">{row.original.bounceReason}</div>
                )}
              </div>
            );
          }
          if (row.original.depositDate) {
            return (
              <span className="erp-num text-xs text-[#5c5a53]">
                Dep: {row.original.depositDate}
              </span>
            );
          }
          return '—';
        },
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 210,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          const canDeposit = canEdit && c.status === 'RECEIVED';
          const canClearOrBounce = canEdit && (c.status === 'RECEIVED' || c.status === 'DEPOSITED');
          return (
            <RowActions
              actions={[
                {
                  id: 'deposit',
                  label: t('payments.actionDeposit'),
                  inline: true,
                  disabled: !canDeposit,
                  onClick: () => {
                    setActionDate(new Date().toISOString().slice(0, 10));
                    setDepositBankInput('');
                    setActionNotesInput('');
                    setChequeActionModal({ cheque: c, targetStatus: 'DEPOSITED' });
                  },
                },
                {
                  id: 'clear',
                  label: t('payments.actionClear'),
                  inline: true,
                  disabled: !canClearOrBounce,
                  onClick: () => {
                    setActionDate(new Date().toISOString().slice(0, 10));
                    setActionNotesInput('');
                    setChequeActionModal({ cheque: c, targetStatus: 'CLEARED' });
                  },
                },
                {
                  id: 'bounce',
                  label: t('payments.actionBounce'),
                  tone: 'danger',
                  disabled: !canClearOrBounce,
                  onClick: () => {
                    setActionDate(new Date().toISOString().slice(0, 10));
                    setBounceReasonInput('');
                    setBounceFeeInput('0.00');
                    setActionNotesInput('');
                    setChequeActionModal({ cheque: c, targetStatus: 'BOUNCED' });
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [t, canEdit, onOpenClient360, onOpenSupplier360],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabsBar
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as 'receipts-in' | 'cheques' | 'payments-out')}
        tabs={[
          { id: 'receipts-in', label: t('payments.tabReceiptsIn') },
          { id: 'cheques', label: t('payments.tabCheques') },
          { id: 'payments-out', label: t('payments.tabPaymentsOut') },
        ]}
      />

      {activeTab === 'payments-out' ? (
        <PaymentsOutScreen
          canCreate={canCreate}
          canVoid={canVoid}
          prefillSupplierId={prefillSupplierId}
          prefillPurchaseId={prefillPurchaseId}
          onClearPrefill={onClearPrefill}
          onOpenSupplier360={onOpenSupplier360}
          onViewPurchaseInvoice={onViewPurchaseInvoice}
        />
      ) : activeTab === 'cheques' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <PageHeader title={t('payments.tabCheques')} subtitle={t('payments.subtitle')} />

          <FilterBar
            searchValue={chequeSearch}
            searchPlaceholder={t('payments.searchCheques')}
            onSearchChange={(val) => {
              setChequeSearch(val);
              setChequePage(1);
            }}
            dateFrom={chequeDateFrom}
            dateTo={chequeDateTo}
            dateFromLabel={t('common.from')}
            dateToLabel={t('common.to')}
            onDateFromChange={(val) => {
              setChequeDateFrom(val);
              setChequePage(1);
            }}
            onDateToChange={(val) => {
              setChequeDateTo(val);
              setChequePage(1);
            }}
            selects={[
              {
                id: 'status',
                label: t('payments.colStatus'),
                value: chequeStatusFilter,
                allLabel: t('purchases.allStatuses'),
                options: CHEQUE_STATUSES.map((s) => ({
                  value: s,
                  label: t(`payments.chequeStatuses.${s}`),
                })),
                onChange: (val) => {
                  setChequeStatusFilter(val);
                  setChequePage(1);
                },
              },
              {
                id: 'direction',
                label: t('payments.colDirection'),
                value: chequeDirectionFilter,
                allLabel: t('payments.allDirections'),
                options: [
                  { value: 'IN', label: 'Client Cheque (IN)' },
                  { value: 'OUT', label: 'Supplier Cheque (OUT)' },
                ],
                onChange: (val) => {
                  setChequeDirectionFilter(val);
                  setChequePage(1);
                },
              },
            ]}
            clearLabel={t('common.clear')}
            onClear={() => {
              setChequeSearch('');
              setChequeStatusFilter('');
              setChequeDirectionFilter('');
              setChequeDateFrom('');
              setChequeDateTo('');
              setChequePage(1);
            }}
          />

          <DataTable
            columns={chequeColumns}
            data={chequesQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            sortBy={chequeSortBy}
            sortOrder={chequeSortOrder}
            onSortChange={(col, order) => {
              setChequeSortBy(col);
              setChequeSortOrder(order);
            }}
            isLoading={chequesQuery.isLoading}
            zebra
            emptyTitle={t('payments.emptyChequesTitle')}
            emptyDescription={t('payments.emptyChequesDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />

          <Pagination
            page={chequePage}
            pageSize={chequePageSize}
            total={chequesQuery.data?.total ?? 0}
            onPageChange={setChequePage}
            onPageSizeChange={(size) => {
              setChequePageSize(size);
              setChequePage(1);
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
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <PageHeader
            title={t('payments.tabReceiptsIn')}
            subtitle={t('payments.subtitle')}
            primaryAction={
              canCreate
                ? {
                    label: t('payments.newReceipt'),
                    shortcutHint: 'Ctrl+N',
                    onClick: () => openReceiptDrawer(),
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
                  { value: 'BOUNCED', label: 'BOUNCED' },
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
            columns={receiptColumns}
            data={receiptsQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(col, order) => {
              setSortBy(col);
              setSortOrder(order);
            }}
            onRowClick={(r) => setSelectedReceipt(r)}
            isLoading={receiptsQuery.isLoading}
            zebra
            emptyTitle={t('payments.emptyReceiptsTitle')}
            emptyDescription={t('payments.emptyReceiptsDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />

          <Pagination
            page={page}
            pageSize={pageSize}
            total={receiptsQuery.data?.total ?? 0}
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

      {/* Receive Client Payment (Payment In) Drawer */}
      <Drawer
        open={receiptDrawerOpen}
        title={t('payments.newReceipt')}
        widthClass="max-w-3xl"
        onClose={() => setReceiptDrawerOpen(false)}
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            cancel: t('common.cancel'),
          }}
          isSubmitting={createReceiptMutation.isPending}
          onSubmit={handleSaveReceipt}
          onCancel={() => setReceiptDrawerOpen(false)}
          footerSlot={
            openSaleInvoices.length > 0 && (
              <div className="mt-2 rounded border border-[#e4e2da] bg-[#faf9f5] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1f1e1b]">
                    {t('payments.allocateSalesTitle')}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleAutoAllocateSales}>
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
                    {openSaleInvoices.map((inv) => (
                      <tr key={inv.id} className="h-9 border-b border-[#e4e2da]">
                        <td className="erp-num px-2.5 font-medium">{inv.invoiceNo}</td>
                        <td className="erp-num px-2.5">{inv.saleDate.slice(0, 10)}</td>
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
          <FormField label={t('payments.client')} required>
            <Select
              value={clientId ? String(clientId) : ''}
              onChange={(e) => {
                setClientId(Number(e.target.value));
                setAllocations({});
              }}
              options={clients.map((c) => ({
                value: String(c.id),
                label: `${c.name} (Receivable: ${c.currentBalance})`,
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

          <FormField label={t('payments.referenceNo')} required={method === 'CHEQUE'}>
            <TextInput value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
          </FormField>

          <FormField label={t('payments.bankName')} required={method === 'CHEQUE'}>
            <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </FormField>

          {method === 'CHEQUE' && (
            <FormField label={t('payments.chequeDate')} required>
              <DatePicker value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </FormField>
          )}

          <FormField
            label={
              method === 'CASH' ? t('payments.proofUploadOptional') : t('payments.proofUpload')
            }
            required={method !== 'CASH'}
            fullWidth
          >
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

      {/* Receipt Detail & Void Drawer */}
      <Drawer
        open={Boolean(selectedReceipt)}
        title={selectedReceipt ? selectedReceipt.paymentNo : ''}
        onClose={() => setSelectedReceipt(null)}
      >
        {selectedReceipt && (
          <div className="flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between rounded border border-[#e4e2da] bg-[#faf9f5] p-3">
              <div>
                <EntityLink
                  onClick={() => {
                    const cId = selectedReceipt.partyId;
                    setSelectedReceipt(null);
                    onOpenClient360(cId);
                  }}
                >
                  {selectedReceipt.partyName}
                </EntityLink>
                <p className="mt-1 text-[#5c5a53]">
                  {selectedReceipt.paymentDate.slice(0, 10)} ·{' '}
                  {t(`payments.methods.${selectedReceipt.method}`)}
                </p>
              </div>
              <div className="text-end">
                <div className="text-base font-semibold text-[#1f6f43]">
                  <MoneyText value={selectedReceipt.amount} />
                </div>
                <StatusBadge
                  tone={
                    selectedReceipt.status === 'POSTED'
                      ? 'success'
                      : selectedReceipt.status === 'BOUNCED'
                        ? 'warning'
                        : 'danger'
                  }
                >
                  {selectedReceipt.status}
                </StatusBadge>
              </div>
            </div>

            {selectedReceipt.allocations.length > 0 && (
              <SurfaceCard title={t('payments.colAllocated')}>
                <div className="flex flex-col gap-1.5">
                  {selectedReceipt.allocations.map((al) => (
                    <div key={al.id} className="flex items-center justify-between">
                      <EntityLink
                        mono
                        onClick={() => {
                          setSelectedReceipt(null);
                          onViewSaleInvoice(al.invoiceId);
                        }}
                      >
                        {al.invoiceNo || `#${al.invoiceId}`}
                      </EntityLink>
                      <MoneyText value={al.amount} />
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}

            {selectedReceipt.attachments.length > 0 && (
              <SurfaceCard title={t('payments.proofUpload')}>
                <div className="flex flex-wrap gap-3">
                  {selectedReceipt.attachments.map((att) => (
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

            {canVoid && selectedReceipt.status === 'POSTED' && (
              <SurfaceCard title={t('common.void')}>
                <div className="flex flex-col gap-3">
                  <FormField label={t('purchases.voidReasonLabel')} required>
                    <TextInput value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                  </FormField>
                  <div className="flex justify-end">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={voidReason.trim().length < 3 || voidReceiptMutation.isPending}
                      onClick={() =>
                        voidReceiptMutation.mutate({
                          id: selectedReceipt.id,
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

      {/* Cheque Lifecycle Action Dialog */}
      <Dialog
        open={Boolean(chequeActionModal)}
        title={
          chequeActionModal?.targetStatus === 'DEPOSITED'
            ? t('payments.depositDialogTitle', { no: chequeActionModal.cheque.chequeNo })
            : chequeActionModal?.targetStatus === 'CLEARED'
              ? t('payments.clearDialogTitle', { no: chequeActionModal.cheque.chequeNo })
              : t('payments.bounceDialogTitle', { no: chequeActionModal?.cheque.chequeNo ?? '' })
        }
        onClose={() => setChequeActionModal(null)}
        maxWidthClass="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChequeActionModal(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={chequeActionModal?.targetStatus === 'BOUNCED' ? 'danger' : 'primary'}
              disabled={
                updateChequeMutation.isPending ||
                (chequeActionModal?.targetStatus === 'BOUNCED' &&
                  bounceReasonInput.trim().length < 3)
              }
              onClick={() => {
                if (!chequeActionModal) return;
                updateChequeMutation.mutate({
                  id: chequeActionModal.cheque.id,
                  status: chequeActionModal.targetStatus,
                  depositDate:
                    chequeActionModal.targetStatus === 'DEPOSITED' ? actionDate : undefined,
                  depositBank:
                    chequeActionModal.targetStatus === 'DEPOSITED'
                      ? depositBankInput.trim() || undefined
                      : undefined,
                  clearedDate:
                    chequeActionModal.targetStatus === 'CLEARED' ? actionDate : undefined,
                  bouncedDate:
                    chequeActionModal.targetStatus === 'BOUNCED' ? actionDate : undefined,
                  bounceReason:
                    chequeActionModal.targetStatus === 'BOUNCED'
                      ? bounceReasonInput.trim()
                      : undefined,
                  bounceFee: chequeActionModal.targetStatus === 'BOUNCED' ? bounceFeeInput : '0.00',
                  notes: actionNotesInput.trim() || undefined,
                });
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {chequeActionModal && (
          <div className="flex flex-col gap-3 p-4 text-xs">
            <div className="rounded border border-[#e4e2da] bg-[#faf9f5] p-2.5">
              <div className="font-semibold text-[#1f1e1b]">
                {chequeActionModal.cheque.partyName} — {chequeActionModal.cheque.bankName} #
                {chequeActionModal.cheque.chequeNo}
              </div>
              <div className="mt-1 text-[#5c5a53]">
                Amount: <MoneyText value={chequeActionModal.cheque.amount} /> · Receipt:{' '}
                {chequeActionModal.cheque.paymentNo}
              </div>
            </div>

            {chequeActionModal.targetStatus === 'DEPOSITED' && (
              <>
                <FormField label={t('payments.depositDateLabel')} required>
                  <DatePicker value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
                </FormField>
                <FormField label={t('payments.depositBankLabel')}>
                  <TextInput
                    value={depositBankInput}
                    onChange={(e) => setDepositBankInput(e.target.value)}
                  />
                </FormField>
              </>
            )}

            {chequeActionModal.targetStatus === 'CLEARED' && (
              <FormField label={t('payments.clearedDateLabel')} required>
                <DatePicker value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
              </FormField>
            )}

            {chequeActionModal.targetStatus === 'BOUNCED' && (
              <>
                <FormField label={t('payments.bouncedDateLabel')} required>
                  <DatePicker value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
                </FormField>
                <FormField label={t('payments.bounceReasonLabel')} required>
                  <TextInput
                    value={bounceReasonInput}
                    onChange={(e) => setBounceReasonInput(e.target.value)}
                  />
                </FormField>
                {chequeActionModal.cheque.direction === 'IN' && (
                  <FormField label={t('payments.bounceFeeLabel')}>
                    <NumberInput
                      precision="money"
                      value={bounceFeeInput}
                      onChange={setBounceFeeInput}
                    />
                  </FormField>
                )}
              </>
            )}

            <FormField label={t('common.notes')}>
              <TextArea
                rows={2}
                value={actionNotesInput}
                onChange={(e) => setActionNotesInput(e.target.value)}
              />
            </FormField>
          </div>
        )}
      </Dialog>

      <PrintDocumentDialog
        open={Boolean(printDoc)}
        document={printDoc}
        onClose={() => setPrintDoc(null)}
      />
    </div>
  );
}
