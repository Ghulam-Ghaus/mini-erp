import {
  PAYMENT_METHODS,
  RECOVERY_DAYS,
  RECOVERY_OUTCOMES,
  type ClientAgingRowDto,
  type PageSizeOption,
  type PaymentMethod,
  type RecoveryDueClientDto,
  type RecoveryEntryDto,
  type RecoveryOutcome,
  type SortOrder,
} from '@mini-erp/shared';
import {
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
  StatCard,
  StatusBadge,
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
import {
  createRecoveryEntry,
  fetchClients,
  fetchRecoveryAging,
  fetchRecoveryEntries,
  fetchRoutes,
  fetchTodaysRecovery,
} from '../lib/api.js';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read proof file'));
    reader.readAsDataURL(file);
  });
}

export interface RecoveryScreenProps {
  readonly activeSubView: 'todays-recovery' | 'recovery-entries' | 'recovery-schedule';
  readonly onChangeSubView: (
    view: 'todays-recovery' | 'recovery-entries' | 'recovery-schedule',
  ) => void;
  readonly canCreate: boolean;
  readonly onOpenClient360: (clientId: number) => void;
}

export function RecoveryScreen({
  activeSubView,
  onChangeSubView,
  canCreate,
  onOpenClient360,
}: RecoveryScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // --- Today's Recovery Filter State ---
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [todayRouteId, setTodayRouteId] = useState('');
  const [todayRecoveryDay, setTodayRecoveryDay] = useState('');
  const [todaySearch, setTodaySearch] = useState('');

  // --- Recovery Entries Filter State ---
  const [entriesSearch, setEntriesSearch] = useState('');
  const [entriesOutcome, setEntriesOutcome] = useState('');
  const [entriesRouteId, setEntriesRouteId] = useState('');
  const [entriesDateFrom, setEntriesDateFrom] = useState('');
  const [entriesDateTo, setEntriesDateTo] = useState('');
  const [entriesSortOrder, setEntriesSortOrder] = useState<SortOrder>('desc');
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesPageSize, setEntriesPageSize] = useState<PageSizeOption>(25);

  // --- Aging Filter State ---
  const [agingAsOfDate, setAgingAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [agingRouteId, setAgingRouteId] = useState('');
  const [agingSearch, setAgingSearch] = useState('');

  // --- Log Recovery Visit / Collection Drawer State ---
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clientId, setClientId] = useState<number>(0);
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outcome, setOutcome] = useState<RecoveryOutcome>('COLLECTED');
  const [amount, setAmount] = useState('0.00');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | undefined>(undefined);
  const [nextPromisedDate, setNextPromisedDate] = useState('');
  const [promisedAmount, setPromisedAmount] = useState('');
  const [remarks, setRemarks] = useState('');

  const routesQuery = useQuery({
    queryKey: ['routes', 'dropdown'],
    queryFn: () => fetchRoutes({ page: 1, pageSize: 100, isActive: true, sortOrder: 'asc' }),
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', 'dropdown'],
    queryFn: () => fetchClients({ page: 1, pageSize: 100, isActive: true, sortOrder: 'asc' }),
  });

  const todaysQuery = useQuery({
    queryKey: ['recovery', 'today', { targetDate, todayRouteId, todayRecoveryDay, todaySearch }],
    queryFn: () =>
      fetchTodaysRecovery({
        targetDate,
        routeId: todayRouteId ? Number(todayRouteId) : undefined,
        recoveryDay: todayRecoveryDay || undefined,
        search: todaySearch.trim() || undefined,
      }),
    enabled: activeSubView === 'todays-recovery',
  });

  const entriesQuery = useQuery({
    queryKey: [
      'recovery',
      'entries',
      {
        page: entriesPage,
        pageSize: entriesPageSize,
        search: entriesSearch,
        outcome: entriesOutcome,
        routeId: entriesRouteId,
        dateFrom: entriesDateFrom,
        dateTo: entriesDateTo,
        sortOrder: entriesSortOrder,
      },
    ],
    queryFn: () =>
      fetchRecoveryEntries({
        page: entriesPage,
        pageSize: entriesPageSize,
        search: entriesSearch.trim() || undefined,
        outcome: (entriesOutcome || undefined) as RecoveryOutcome | undefined,
        routeId: entriesRouteId ? Number(entriesRouteId) : undefined,
        dateFrom: entriesDateFrom || undefined,
        dateTo: entriesDateTo || undefined,
        sortOrder: entriesSortOrder,
      }),
    enabled: activeSubView === 'recovery-entries',
  });

  const agingQuery = useQuery({
    queryKey: ['recovery', 'aging', { agingAsOfDate, agingRouteId, agingSearch }],
    queryFn: () =>
      fetchRecoveryAging({
        asOfDate: agingAsOfDate,
        routeId: agingRouteId ? Number(agingRouteId) : undefined,
        search: agingSearch.trim() || undefined,
      }),
    enabled: activeSubView === 'recovery-schedule',
  });

  const routes = useMemo(() => routesQuery.data?.data ?? [], [routesQuery.data?.data]);
  const clients = useMemo(() => clientsQuery.data?.data ?? [], [clientsQuery.data?.data]);

  const openVisitDrawer = (prefill?: { clientId: number; balance?: string }) => {
    if (!canCreate) return;
    const cId = prefill?.clientId ?? clients[0]?.id ?? 0;
    const matchedClient = clients.find((c) => c.id === cId);
    const defaultBal = prefill?.balance ?? matchedClient?.currentBalance ?? '0.00';

    setClientId(cId);
    setVisitDate(targetDate || new Date().toISOString().slice(0, 10));
    setOutcome('COLLECTED');
    setAmount(new Decimal(defaultBal).gt(0) ? defaultBal : '0.00');
    setMethod('CASH');
    setReferenceNo('');
    setBankName('');
    setChequeDate('');
    setProofFile(null);
    setProofDataUrl(undefined);
    setNextPromisedDate('');
    setPromisedAmount('');
    setRemarks('');
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (drawerOpen && clientId > 0) {
      const matched = clients.find((c) => c.id === clientId);
      if (matched && outcome === 'COLLECTED' && new Decimal(amount || '0').lte(0)) {
        setAmount(matched.currentBalance);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !drawerOpen) {
          openVisitDrawer();
        }
      },
    },
  ]);

  const createEntryMutation = useMutation({
    mutationFn: createRecoveryEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recovery'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client-ledger'] });
      showToast({ title: t('recovery.savedToast'), tone: 'success' });
      setDrawerOpen(false);
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to record recovery entry',
        tone: 'danger',
      });
    },
  });

  const handleSaveEntry = () => {
    if (!clientId) {
      showToast({ title: t('payments.selectClient'), tone: 'danger' });
      return;
    }

    const isMoneyCollected = outcome === 'COLLECTED' || outcome === 'PARTIAL';
    if (isMoneyCollected && method !== 'CASH' && !proofDataUrl) {
      showToast({
        title: 'Proof upload is mandatory for non-cash collections',
        tone: 'danger',
      });
      return;
    }

    if (outcome === 'PROMISED' && !nextPromisedDate) {
      showToast({
        title: 'Next promised date is required when outcome is PROMISED',
        tone: 'danger',
      });
      return;
    }

    createEntryMutation.mutate({
      clientId,
      visitDate,
      outcome,
      amount: isMoneyCollected ? amount : '0.00',
      method: isMoneyCollected ? method : undefined,
      referenceNo: isMoneyCollected && referenceNo.trim() ? referenceNo.trim() : undefined,
      bankName: isMoneyCollected && bankName.trim() ? bankName.trim() : undefined,
      chequeDate: isMoneyCollected && chequeDate ? chequeDate : undefined,
      proofDataUrl: isMoneyCollected ? proofDataUrl : undefined,
      proofFileName: isMoneyCollected ? proofFile?.name : undefined,
      nextPromisedDate: nextPromisedDate || undefined,
      promisedAmount:
        promisedAmount && new Decimal(promisedAmount || '0').gt(0)
          ? new Decimal(promisedAmount).toFixed(2)
          : undefined,
      remarks: remarks.trim() || undefined,
      allocations: [],
    });
  };

  const todayColumns: ColumnDef<RecoveryDueClientDto, unknown>[] = useMemo(
    () => [
      {
        id: 'client',
        header: t('recovery.colClient'),
        size: 195,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <EntityLink
              subtitle={row.original.clientNameUr}
              onClick={() => onOpenClient360(row.original.clientId)}
            >
              {row.original.clientName}
            </EntityLink>
            {row.original.phone && (
              <span className="erp-num text-[11px] text-[#6f6c64]">{row.original.phone}</span>
            )}
          </div>
        ),
      },
      {
        id: 'route',
        header: t('recovery.colRoute'),
        size: 155,
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span className="font-medium text-[#1f1e1b]">{row.original.routeName ?? '—'}</span>
            {row.original.assignedOfficerName && (
              <span className="text-[11px] text-[#6f6c64]">{row.original.assignedOfficerName}</span>
            )}
          </div>
        ),
      },
      {
        id: 'dueReason',
        header: t('recovery.colDueReason'),
        size: 135,
        cell: ({ row }) => {
          const r = row.original.dueReason;
          const tone =
            r === 'OVERDUE_PROMISE' ? 'danger' : r === 'PROMISED_DUE' ? 'warning' : 'info';
          return (
            <div className="flex flex-col gap-0.5">
              <StatusBadge tone={tone}>{t(`recovery.dueReasons.${r}`)}</StatusBadge>
              {row.original.promisedDate && (
                <span className="erp-num text-[11px] text-[#6f6c64]">
                  {row.original.promisedDate}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'oldestInvoiceDays',
        header: t('recovery.colOldestAge'),
        size: 105,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span
            className={`erp-num font-medium ${
              row.original.oldestInvoiceDays > 30 ? 'text-[#9e2b2b]' : 'text-[#1f1e1b]'
            }`}
          >
            {row.original.oldestInvoiceDays}d
          </span>
        ),
      },
      {
        id: 'lastPayment',
        header: t('recovery.colLastPayment'),
        size: 145,
        cell: ({ row }) =>
          row.original.lastPaymentDate ? (
            <div className="flex flex-col text-xs">
              <MoneyText value={row.original.lastPaymentAmount ?? '0.00'} />
              <span className="erp-num text-[11px] text-[#6f6c64]">
                {row.original.lastPaymentDate}
              </span>
            </div>
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'lastVisit',
        header: t('recovery.colLastVisit'),
        size: 185,
        cell: ({ row }) =>
          row.original.lastVisitDate ? (
            <div className="flex flex-col text-xs">
              <span className="font-medium text-[#1f1e1b]">
                {row.original.lastVisitOutcome
                  ? t(`recovery.outcomes.${row.original.lastVisitOutcome}`)
                  : ''}{' '}
                ({row.original.lastVisitDate})
              </span>
              {row.original.lastVisitRemarks && (
                <span className="truncate text-[11px] text-[#6f6c64]">
                  {row.original.lastVisitRemarks}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'currentBalance',
        header: t('recovery.colBalance'),
        size: 140,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex flex-col items-end">
            <span className="font-semibold text-[#9e2b2b]">
              <MoneyText value={row.original.currentBalance} />
            </span>
            {row.original.isOverCreditLimit && (
              <span className="text-[10px] font-medium text-[#9e2b2b]">Over Limit</span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 175,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'collect',
                label: t('recovery.actionCollect'),
                inline: true,
                disabled: !canCreate,
                onClick: () =>
                  openVisitDrawer({
                    clientId: row.original.clientId,
                    balance: row.original.currentBalance,
                  }),
              },
              {
                id: 'ledger',
                label: t('suppliers.actionLedger'),
                inline: true,
                onClick: () => onOpenClient360(row.original.clientId),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canCreate, onOpenClient360],
  );

  const entriesColumns: ColumnDef<RecoveryEntryDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'visitDate',
        header: t('recovery.colVisitDate'),
        size: 105,
        cell: ({ row }) => <span className="erp-num">{row.original.visitDate}</span>,
      },
      {
        id: 'client',
        header: t('recovery.colClient'),
        size: 185,
        cell: ({ row }) => (
          <EntityLink
            subtitle={row.original.clientNameUr}
            onClick={() => onOpenClient360(row.original.clientId)}
          >
            {row.original.clientName}
          </EntityLink>
        ),
      },
      {
        id: 'route',
        header: t('recovery.colRoute'),
        size: 145,
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span>{row.original.routeName ?? '—'}</span>
            <span className="text-[11px] text-[#6f6c64]">{row.original.officerName}</span>
          </div>
        ),
      },
      {
        id: 'outcome',
        header: t('recovery.colOutcome'),
        size: 145,
        cell: ({ row }) => {
          const o = row.original.outcome;
          const tone =
            o === 'COLLECTED'
              ? 'success'
              : o === 'PARTIAL'
                ? 'info'
                : o === 'PROMISED'
                  ? 'warning'
                  : 'danger';
          return <StatusBadge tone={tone}>{t(`recovery.outcomes.${o}`)}</StatusBadge>;
        },
      },
      {
        id: 'amount',
        header: t('recovery.colCollected'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          new Decimal(row.original.amount).gt(0) ? (
            <span className="font-semibold text-[#1f6f43]">
              <MoneyText value={row.original.amount} />
            </span>
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'paymentNo',
        header: t('recovery.colReceiptNo'),
        size: 135,
        cell: ({ row }) =>
          row.original.paymentNo ? (
            <span className="erp-num font-medium text-[#1f1e1b]">{row.original.paymentNo}</span>
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'nextPromisedDate',
        header: t('recovery.colNextPromise'),
        size: 120,
        cell: ({ row }) =>
          row.original.nextPromisedDate ? (
            <span className="erp-num font-medium text-[#b56b16]">
              {row.original.nextPromisedDate}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'remarks',
        header: t('recovery.colRemarks'),
        size: 200,
        cell: ({ row }) => (
          <span className="truncate text-xs text-[#5c5a53]">{row.original.remarks ?? '—'}</span>
        ),
      },
    ],
    [t, onOpenClient360],
  );

  const agingColumns: ColumnDef<ClientAgingRowDto, unknown>[] = useMemo(
    () => [
      {
        id: 'client',
        header: t('recovery.colClient'),
        size: 195,
        cell: ({ row }) => (
          <EntityLink
            subtitle={row.original.clientNameUr}
            onClick={() => onOpenClient360(row.original.clientId)}
          >
            {row.original.clientName}
          </EntityLink>
        ),
      },
      {
        id: 'route',
        header: t('recovery.colRoute'),
        size: 140,
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span>{row.original.routeName ?? '—'}</span>
            {row.original.recoveryDay && (
              <span className="text-[11px] text-[#6f6c64]">{row.original.recoveryDay}</span>
            )}
          </div>
        ),
      },
      {
        id: 'promisedDate',
        header: t('recovery.colPromised'),
        size: 115,
        cell: ({ row }) =>
          row.original.promisedDate ? (
            <span className="erp-num font-medium text-[#b56b16]">{row.original.promisedDate}</span>
          ) : (
            '—'
          ),
      },
      {
        id: 'bucket0to7',
        header: t('recovery.colBucket0to7'),
        size: 115,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.bucket0to7} />,
      },
      {
        id: 'bucket8to15',
        header: t('recovery.colBucket8to15'),
        size: 115,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.bucket8to15} />,
      },
      {
        id: 'bucket16to30',
        header: t('recovery.colBucket16to30'),
        size: 115,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.bucket16to30} />,
      },
      {
        id: 'bucket31to60',
        header: t('recovery.colBucket31to60'),
        size: 115,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <MoneyText
            value={row.original.bucket31to60}
            className={new Decimal(row.original.bucket31to60).gt(0) ? 'text-[#b56b16]' : ''}
          />
        ),
      },
      {
        id: 'bucket60Plus',
        header: t('recovery.colBucket60Plus'),
        size: 115,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <MoneyText
            value={row.original.bucket60Plus}
            className={
              new Decimal(row.original.bucket60Plus).gt(0) ? 'font-semibold text-[#9e2b2b]' : ''
            }
          />
        ),
      },
      {
        id: 'totalReceivable',
        header: t('recovery.colBalance'),
        size: 130,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold text-[#1f1e1b]">
            <MoneyText value={row.original.totalReceivable} />
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 145,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'collect',
                label: t('recovery.actionCollect'),
                inline: true,
                disabled: !canCreate,
                onClick: () =>
                  openVisitDrawer({
                    clientId: row.original.clientId,
                    balance: row.original.totalReceivable,
                  }),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canCreate, onOpenClient360],
  );

  const isMoneyCollected = outcome === 'COLLECTED' || outcome === 'PARTIAL';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabsBar
        activeId={activeSubView}
        onChange={(id) =>
          onChangeSubView(id as 'todays-recovery' | 'recovery-entries' | 'recovery-schedule')
        }
        tabs={[
          { id: 'todays-recovery', label: t('recovery.tabToday') },
          { id: 'recovery-entries', label: t('recovery.tabEntries') },
          { id: 'recovery-schedule', label: t('recovery.tabAging') },
        ]}
      />

      {activeSubView === 'todays-recovery' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <PageHeader
            title={t('recovery.tabToday')}
            subtitle={t('recovery.subtitle')}
            primaryAction={
              canCreate
                ? {
                    label: t('recovery.logVisitBtn'),
                    shortcutHint: 'Ctrl+N',
                    onClick: () => openVisitDrawer(),
                  }
                : undefined
            }
          />

          <div className="grid grid-cols-2 gap-3 border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-3 md:grid-cols-4">
            <StatCard
              label={t('recovery.statDueTotal')}
              value={<MoneyText value={todaysQuery.data?.totalReceivableDue ?? '0.00'} />}
              hint={`${todaysQuery.data?.weekday ?? ''} (${todaysQuery.data?.targetDate ?? targetDate})`}
            />
            <StatCard
              label={t('recovery.statDueClients')}
              value={<IntegerText value={todaysQuery.data?.clientsDueCount ?? 0} />}
            />
            <StatCard
              label={t('recovery.statCollectedToday')}
              value={
                <span className="text-[#1f6f43]">
                  <MoneyText value={todaysQuery.data?.collectedTodayTotal ?? '0.00'} />
                </span>
              }
            />
            <StatCard
              label={t('recovery.statPromisedToday')}
              value={<IntegerText value={todaysQuery.data?.promisedTodayCount ?? 0} />}
            />
          </div>

          <FilterBar
            searchValue={todaySearch}
            searchPlaceholder={t('recovery.searchToday')}
            onSearchChange={setTodaySearch}
            dateFrom={targetDate}
            dateFromLabel={t('common.date')}
            onDateFromChange={(val) => setTargetDate(val || new Date().toISOString().slice(0, 10))}
            selects={[
              {
                id: 'route',
                label: t('recovery.colRoute'),
                value: todayRouteId,
                allLabel: t('recovery.allRoutes'),
                options: routes.map((r) => ({ value: String(r.id), label: r.name })),
                onChange: setTodayRouteId,
              },
              {
                id: 'recoveryDay',
                label: 'Recovery Day',
                value: todayRecoveryDay,
                allLabel: t('recovery.allDays'),
                options: RECOVERY_DAYS.map((d) => ({ value: d, label: d })),
                onChange: setTodayRecoveryDay,
              },
            ]}
            clearLabel={t('common.clear')}
            onClear={() => {
              setTodaySearch('');
              setTodayRouteId('');
              setTodayRecoveryDay('');
              setTargetDate(new Date().toISOString().slice(0, 10));
            }}
          />

          <DataTable
            columns={todayColumns}
            data={todaysQuery.data?.items ?? []}
            getRowId={(r) => String(r.clientId)}
            isLoading={todaysQuery.isLoading}
            zebra
            emptyTitle={t('recovery.emptyTodayTitle')}
            emptyDescription={t('recovery.emptyTodayDesc')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />
        </div>
      ) : activeSubView === 'recovery-entries' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <PageHeader
            title={t('recovery.tabEntries')}
            subtitle={t('recovery.subtitle')}
            primaryAction={
              canCreate
                ? {
                    label: t('recovery.logVisitBtn'),
                    shortcutHint: 'Ctrl+N',
                    onClick: () => openVisitDrawer(),
                  }
                : undefined
            }
          />

          <FilterBar
            searchValue={entriesSearch}
            searchPlaceholder={t('recovery.searchEntries')}
            onSearchChange={(val) => {
              setEntriesSearch(val);
              setEntriesPage(1);
            }}
            dateFrom={entriesDateFrom}
            dateTo={entriesDateTo}
            dateFromLabel={t('common.from')}
            dateToLabel={t('common.to')}
            onDateFromChange={(val) => {
              setEntriesDateFrom(val);
              setEntriesPage(1);
            }}
            onDateToChange={(val) => {
              setEntriesDateTo(val);
              setEntriesPage(1);
            }}
            selects={[
              {
                id: 'outcome',
                label: t('recovery.colOutcome'),
                value: entriesOutcome,
                allLabel: t('recovery.allOutcomes'),
                options: RECOVERY_OUTCOMES.map((o) => ({
                  value: o,
                  label: t(`recovery.outcomes.${o}`),
                })),
                onChange: (val) => {
                  setEntriesOutcome(val);
                  setEntriesPage(1);
                },
              },
              {
                id: 'route',
                label: t('recovery.colRoute'),
                value: entriesRouteId,
                allLabel: t('recovery.allRoutes'),
                options: routes.map((r) => ({ value: String(r.id), label: r.name })),
                onChange: (val) => {
                  setEntriesRouteId(val);
                  setEntriesPage(1);
                },
              },
            ]}
            clearLabel={t('common.clear')}
            onClear={() => {
              setEntriesSearch('');
              setEntriesOutcome('');
              setEntriesRouteId('');
              setEntriesDateFrom('');
              setEntriesDateTo('');
              setEntriesPage(1);
            }}
          />

          <DataTable
            columns={entriesColumns}
            data={entriesQuery.data?.data ?? []}
            getRowId={(r) => String(r.id)}
            sortBy="visitDate"
            sortOrder={entriesSortOrder}
            onSortChange={(_, order) => setEntriesSortOrder(order)}
            isLoading={entriesQuery.isLoading}
            zebra
            emptyTitle={t('recovery.emptyEntriesTitle')}
            emptyDescription={t('recovery.emptyEntriesDesc')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />

          <Pagination
            page={entriesPage}
            pageSize={entriesPageSize}
            total={entriesQuery.data?.total ?? 0}
            onPageChange={setEntriesPage}
            onPageSizeChange={(size) => {
              setEntriesPageSize(size);
              setEntriesPage(1);
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
            title={t('recovery.tabAging')}
            subtitle={t('recovery.subtitle')}
            primaryAction={
              canCreate
                ? {
                    label: t('recovery.logVisitBtn'),
                    shortcutHint: 'Ctrl+N',
                    onClick: () => openVisitDrawer(),
                  }
                : undefined
            }
          />

          <div className="grid grid-cols-2 gap-3 border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-3 md:grid-cols-6">
            <StatCard
              label={t('recovery.colBucket0to7')}
              value={<MoneyText value={agingQuery.data?.totalBucket0to7 ?? '0.00'} />}
            />
            <StatCard
              label={t('recovery.colBucket8to15')}
              value={<MoneyText value={agingQuery.data?.totalBucket8to15 ?? '0.00'} />}
            />
            <StatCard
              label={t('recovery.colBucket16to30')}
              value={<MoneyText value={agingQuery.data?.totalBucket16to30 ?? '0.00'} />}
            />
            <StatCard
              label={t('recovery.colBucket31to60')}
              value={
                <span className="text-[#b56b16]">
                  <MoneyText value={agingQuery.data?.totalBucket31to60 ?? '0.00'} />
                </span>
              }
            />
            <StatCard
              label={t('recovery.colBucket60Plus')}
              value={
                <span className="text-[#9e2b2b]">
                  <MoneyText value={agingQuery.data?.totalBucket60Plus ?? '0.00'} />
                </span>
              }
            />
            <StatCard
              label={t('recovery.colBalance')}
              value={
                <span className="font-bold text-[#1f1e1b]">
                  <MoneyText value={agingQuery.data?.grandTotalReceivable ?? '0.00'} />
                </span>
              }
            />
          </div>

          <FilterBar
            searchValue={agingSearch}
            searchPlaceholder={t('recovery.searchToday')}
            onSearchChange={setAgingSearch}
            dateFrom={agingAsOfDate}
            dateFromLabel={t('common.date')}
            onDateFromChange={(val) =>
              setAgingAsOfDate(val || new Date().toISOString().slice(0, 10))
            }
            selects={[
              {
                id: 'route',
                label: t('recovery.colRoute'),
                value: agingRouteId,
                allLabel: t('recovery.allRoutes'),
                options: routes.map((r) => ({ value: String(r.id), label: r.name })),
                onChange: setAgingRouteId,
              },
            ]}
            clearLabel={t('common.clear')}
            onClear={() => {
              setAgingSearch('');
              setAgingRouteId('');
              setAgingAsOfDate(new Date().toISOString().slice(0, 10));
            }}
          />

          <DataTable
            columns={agingColumns}
            data={agingQuery.data?.rows ?? []}
            getRowId={(r) => String(r.clientId)}
            isLoading={agingQuery.isLoading}
            zebra
            emptyTitle={t('recovery.emptyAgingTitle')}
            emptyDescription={t('recovery.emptyAgingDesc')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />
        </div>
      )}

      {/* Record Recovery Visit / Collection Drawer */}
      <Drawer
        open={drawerOpen}
        title={t('recovery.drawerTitle')}
        widthClass="max-w-2xl"
        onClose={() => setDrawerOpen(false)}
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            cancel: t('common.cancel'),
          }}
          isSubmitting={createEntryMutation.isPending}
          onSubmit={handleSaveEntry}
          onCancel={() => setDrawerOpen(false)}
        >
          <FormField label={t('payments.client')} required>
            <Select
              value={clientId ? String(clientId) : ''}
              onChange={(e) => {
                const cId = Number(e.target.value);
                setClientId(cId);
                const c = clients.find((item) => item.id === cId);
                if (c) setAmount(c.currentBalance);
              }}
              options={clients.map((c) => ({
                value: String(c.id),
                label: `${c.name} (Receivable: ${c.currentBalance})`,
              }))}
            />
          </FormField>

          <FormField label={t('recovery.visitDate')} required>
            <DatePicker value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </FormField>

          <FormField label={t('recovery.outcome')} required>
            <Select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as RecoveryOutcome)}
              options={RECOVERY_OUTCOMES.map((o) => ({
                value: o,
                label: t(`recovery.outcomes.${o}`),
              }))}
            />
          </FormField>

          {isMoneyCollected && (
            <>
              <FormField label={t('recovery.amountCollected')} required>
                <NumberInput precision="money" value={amount} onChange={setAmount} />
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
            </>
          )}

          {outcome !== 'COLLECTED' && (
            <>
              <FormField label={t('recovery.nextPromisedDate')} required={outcome === 'PROMISED'}>
                <DatePicker
                  value={nextPromisedDate}
                  onChange={(e) => setNextPromisedDate(e.target.value)}
                />
              </FormField>

              <FormField label={t('recovery.promisedAmount')}>
                <NumberInput
                  precision="money"
                  value={promisedAmount}
                  onChange={setPromisedAmount}
                />
              </FormField>
            </>
          )}

          <FormField label={t('recovery.remarks')} fullWidth>
            <TextArea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormField>
        </FormLayout>
      </Drawer>
    </div>
  );
}
