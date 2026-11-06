import { zodResolver } from '@hookform/resolvers/zod';
import { type PageSizeOption, type SortOrder } from '@mini-erp/shared';
import {
  AppShell,
  Button,
  Combobox,
  CommandPalette,
  ConfirmDialog,
  DataTable,
  DatePicker,
  Drawer,
  FileUpload,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
  LineItemGrid,
  MoneyText,
  NumberInput,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  ToastProvider,
  WeightText,
  useHotkeys,
  useToast,
  type ColumnDef,
  type CommandPaletteItem,
  type DataTableColumnMeta,
  type NavItem,
  type StatusTone,
} from '@mini-erp/ui';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { fetchHealth } from './lib/api.js';

interface DemoSaleRow {
  readonly id: number;
  readonly invoiceNo: string;
  readonly date: string;
  readonly client: string;
  readonly batch: string;
  readonly item: string;
  readonly qtyKg: string;
  readonly costRate: string;
  readonly saleRate: string;
  readonly amount: string;
  readonly profit: string;
  readonly status: 'PAID' | 'PARTIAL' | 'OVERDUE';
}

interface DemoLineItem {
  readonly key: string;
  readonly batch: string;
  readonly item: string;
  readonly qtyKg: string;
  readonly costRate: string;
  readonly saleRate: string;
}

/**
 * Sample rows based on the notebook verification numbers from PROJECT_START.md:
 * 1000 kg raw -> 20% wastage -> 800 kg output -> cost 68.75/kg.
 * Selling 100 kg @ 80.00 = 8,000.00 amount, 6,875.00 cost, 1,125.00 profit.
 */
const INITIAL_DEMO_ROWS: readonly DemoSaleRow[] = [
  {
    id: 1,
    invoiceNo: 'INV-2026-0001',
    date: '2026-11-01',
    client: 'Gohar Traders',
    batch: 'Batch 1',
    item: 'Daal Chana',
    qtyKg: '100.000',
    costRate: '68.75',
    saleRate: '80.00',
    amount: '8000.00',
    profit: '1125.00',
    status: 'PAID',
  },
  {
    id: 2,
    invoiceNo: 'INV-2026-0002',
    date: '2026-11-02',
    client: 'Al-Madina Store',
    batch: 'Batch 1',
    item: 'Daal Chana',
    qtyKg: '250.000',
    costRate: '68.75',
    saleRate: '82.00',
    amount: '20500.00',
    profit: '3312.50',
    status: 'PARTIAL',
  },
  {
    id: 3,
    invoiceNo: 'INV-2026-0003',
    date: '2026-11-03',
    client: 'Bismillah Kiryana',
    batch: 'Batch 2',
    item: 'Daal Masoor',
    qtyKg: '150.500',
    costRate: '95.00',
    saleRate: '110.00',
    amount: '16555.00',
    profit: '2257.50',
    status: 'OVERDUE',
  },
  {
    id: 4,
    invoiceNo: 'INV-2026-0004',
    date: '2026-11-04',
    client: 'Saddar Wholesale',
    batch: 'Batch 2',
    item: 'Daal Masoor',
    qtyKg: '80.000',
    costRate: '95.00',
    saleRate: '92.00',
    amount: '7360.00',
    profit: '-240.00',
    status: 'PAID',
  },
  {
    id: 5,
    invoiceNo: 'INV-2026-0005',
    date: '2026-11-05',
    client: 'Gohar Traders',
    batch: 'Batch 3',
    item: 'Daal Moong',
    qtyKg: '300.000',
    costRate: '120.00',
    saleRate: '138.50',
    amount: '41550.00',
    profit: '5550.00',
    status: 'PARTIAL',
  },
];

const CLIENT_OPTIONS = [
  { value: 'Gohar Traders', label: 'Gohar Traders', subtitle: 'Saddar Route' },
  { value: 'Al-Madina Store', label: 'Al-Madina Store', subtitle: 'City Route' },
  { value: 'Bismillah Kiryana', label: 'Bismillah Kiryana', subtitle: 'Mandi Route' },
  { value: 'Saddar Wholesale', label: 'Saddar Wholesale', subtitle: 'Saddar Route' },
] as const;

const ROUTE_OPTIONS = [
  { value: 'Saddar Route', label: 'Saddar Route' },
  { value: 'City Route', label: 'City Route' },
  { value: 'Mandi Route', label: 'Mandi Route' },
] as const;

const BATCH_COSTS: Record<string, { readonly item: string; readonly costRate: string }> = {
  'Batch 1': { item: 'Daal Chana', costRate: '68.75' },
  'Batch 2': { item: 'Daal Masoor', costRate: '95.00' },
  'Batch 3': { item: 'Daal Moong', costRate: '120.00' },
};

const statusToneMap: Record<DemoSaleRow['status'], StatusTone> = {
  PAID: 'success',
  PARTIAL: 'warning',
  OVERDUE: 'danger',
};

function DotIcon() {
  return <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />;
}

function DemoWorkspace() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 10_000 });

  const [activeNavId, setActiveNavId] = useState('sales-invoices');
  const [commandOpen, setCommandOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // List filters, sorting & pagination state
  const [rows, setRows] = useState<readonly DemoSaleRow[]>(INITIAL_DEMO_ROWS);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<string>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Form state (React Hook Form + Zod + LineItemGrid)
  const formSchema = useMemo(
    () =>
      z.object({
        date: z.string().min(1, t('demo.form.validation.dateRequired')),
        client: z.string().min(1, t('demo.form.validation.clientRequired')),
        route: z.string().min(1),
        notes: z.string().optional(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: '2026-11-06',
      client: 'Gohar Traders',
      route: 'Saddar Route',
      notes: '',
    },
  });

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [lines, setLines] = useState<readonly DemoLineItem[]>([
    {
      key: 'line-1',
      batch: 'Batch 1',
      item: 'Daal Chana',
      qtyKg: '100.000',
      costRate: '68.75',
      saleRate: '80.00',
    },
  ]);

  useEffect(() => {
    document.title = t('app.name');
  }, [t]);

  const toggleLanguage = useCallback(() => {
    const next = i18n.language === 'ur' ? 'en' : 'ur';
    void i18n.changeLanguage(next);
  }, [i18n]);

  // Global keyboard shortcuts (Section 10: Ctrl+N new, Ctrl+S save, Ctrl+P print)
  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => setDrawerOpen(true),
    },
    {
      key: 'p',
      ctrlOrMeta: true,
      handler: () => showToast({ title: t('demo.form.printedToast'), tone: 'neutral' }),
    },
    {
      key: 's',
      ctrlOrMeta: true,
      handler: () => {
        if (drawerOpen) {
          void handleSave(false)();
        }
      },
    },
  ]);

  // Navigation items from Section 5.2
  const navItems: readonly NavItem[] = useMemo(
    () => [
      { id: 'dashboard', label: t('nav.dashboard'), icon: <DotIcon /> },
      {
        id: 'sales',
        label: t('nav.sales'),
        icon: <DotIcon />,
        children: [
          { id: 'sales-invoices', label: t('nav.salesInvoices') },
          { id: 'sale-returns', label: t('nav.saleReturns') },
          { id: 'challans', label: t('nav.challans') },
        ],
      },
      {
        id: 'purchases',
        label: t('nav.purchases'),
        icon: <DotIcon />,
        children: [
          { id: 'purchase-invoices', label: t('nav.purchaseInvoices') },
          { id: 'purchase-returns', label: t('nav.purchaseReturns') },
        ],
      },
      { id: 'batches', label: t('nav.batches'), icon: <DotIcon /> },
      { id: 'inventory', label: t('nav.inventory'), icon: <DotIcon /> },
      {
        id: 'clients',
        label: t('nav.clients'),
        icon: <DotIcon />,
        children: [
          { id: 'client-list', label: t('nav.clientList') },
          { id: 'client-ledger', label: t('nav.clientLedger') },
          { id: 'routes', label: t('nav.routes') },
        ],
      },
      {
        id: 'recovery',
        label: t('nav.recovery'),
        icon: <DotIcon />,
        badgeCount: 3,
        children: [
          { id: 'todays-recovery', label: t('nav.todaysRecovery') },
          { id: 'recovery-entries', label: t('nav.recoveryEntries') },
          { id: 'recovery-schedule', label: t('nav.recoverySchedule') },
        ],
      },
      {
        id: 'suppliers',
        label: t('nav.suppliers'),
        icon: <DotIcon />,
        children: [
          { id: 'supplier-list', label: t('nav.supplierList') },
          { id: 'supplier-ledger', label: t('nav.supplierLedger') },
        ],
      },
      { id: 'payments-cheques', label: t('nav.paymentsCheques'), icon: <DotIcon /> },
      { id: 'expenses', label: t('nav.expenses'), icon: <DotIcon /> },
      { id: 'payroll', label: t('nav.payroll'), icon: <DotIcon /> },
      { id: 'reports', label: t('nav.reports'), icon: <DotIcon /> },
      { id: 'notifications', label: t('nav.notifications'), icon: <DotIcon />, badgeCount: 2 },
      { id: 'users-roles', label: t('nav.usersRoles'), icon: <DotIcon /> },
      { id: 'settings', label: t('nav.settings'), icon: <DotIcon /> },
    ],
    [t],
  );

  // Filter + sort + paginate rows
  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (q) {
        const hit =
          r.invoiceNo.toLowerCase().includes(q) ||
          r.client.toLowerCase().includes(q) ||
          r.batch.toLowerCase().includes(q) ||
          r.item.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (batchFilter && r.batch !== batchFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });

    return [...matched].sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'qtyKg' || sortBy === 'amount' || sortBy === 'profit') {
        return new Decimal(a[sortBy]).comparedTo(new Decimal(b[sortBy])) * dir;
      }
      if (sortBy === 'date' || sortBy === 'invoiceNo' || sortBy === 'client') {
        return a[sortBy].localeCompare(b[sortBy]) * dir;
      }
      return (a.id - b.id) * dir;
    });
  }, [rows, search, dateFrom, dateTo, batchFilter, statusFilter, sortBy, sortOrder]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, page, pageSize]);

  // Exact Decimal totals for the visible dataset
  const totals = useMemo(() => {
    let qty = new Decimal(0);
    let amount = new Decimal(0);
    let profit = new Decimal(0);
    for (const r of filteredAndSorted) {
      qty = qty.plus(r.qtyKg);
      amount = amount.plus(r.amount);
      profit = profit.plus(r.profit);
    }
    return {
      qty: qty.toFixed(3),
      amount: amount.toFixed(2),
      profit: profit.toFixed(2),
    };
  }, [filteredAndSorted]);

  const columns: ColumnDef<DemoSaleRow, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('demo.columns.id'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'invoiceNo',
        header: t('demo.columns.invoiceNo'),
        size: 130,
        cell: ({ row }) => <span className="font-medium">{row.original.invoiceNo}</span>,
      },
      {
        id: 'date',
        header: t('demo.columns.date'),
        size: 105,
        cell: ({ row }) => <span className="erp-num">{row.original.date}</span>,
      },
      {
        id: 'client',
        header: t('demo.columns.client'),
        size: 170,
        cell: ({ row }) => row.original.client,
      },
      {
        id: 'batch',
        header: t('demo.columns.batch'),
        size: 95,
        cell: ({ row }) => row.original.batch,
      },
      {
        id: 'item',
        header: t('demo.columns.item'),
        size: 130,
        meta: { footer: t('common.totals') } satisfies DataTableColumnMeta,
        cell: ({ row }) => row.original.item,
      },
      {
        id: 'qtyKg',
        header: t('demo.columns.qtyKg'),
        size: 115,
        meta: {
          align: 'right',
          footer: <WeightText value={totals.qty} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <WeightText value={row.original.qtyKg} />,
      },
      {
        id: 'costRate',
        header: t('demo.columns.costRate'),
        size: 105,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.costRate} />,
      },
      {
        id: 'saleRate',
        header: t('demo.columns.saleRate'),
        size: 105,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.saleRate} />,
      },
      {
        id: 'amount',
        header: t('demo.columns.amount'),
        size: 125,
        meta: {
          align: 'right',
          footer: <MoneyText value={totals.amount} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.amount} />,
      },
      {
        id: 'profit',
        header: t('demo.columns.profit'),
        size: 125,
        meta: {
          align: 'right',
          footer: <MoneyText value={totals.profit} />,
        } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.profit} />,
      },
      {
        id: 'status',
        header: t('demo.columns.status'),
        size: 105,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge tone={statusToneMap[row.original.status]}>
            {t(`demo.status.${row.original.status}`)}
          </StatusBadge>
        ),
      },
    ],
    [t, totals],
  );

  // Line-item helpers using exact Decimal arithmetic
  const updateLine = (index: number, patch: Partial<DemoLineItem>) => {
    setLines((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        if (patch.batch && BATCH_COSTS[patch.batch]) {
          const info = BATCH_COSTS[patch.batch];
          if (info) {
            next.item = info.item;
            next.costRate = info.costRate;
          }
        }
        return next;
      }),
    );
  };

  const computeLineNumbers = (line: DemoLineItem) => {
    try {
      const qty = new Decimal(line.qtyKg || '0');
      const cost = new Decimal(line.costRate || '0');
      const sale = new Decimal(line.saleRate || '0');
      const amount = qty.mul(sale).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const cogs = qty.mul(cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const profit = amount.minus(cogs);
      return { amount: amount.toFixed(2), profit: profit.toFixed(2) };
    } catch {
      return { amount: '0.00', profit: '0.00' };
    }
  };

  const handleSave = (keepOpen: boolean) =>
    form.handleSubmit((values) => {
      const firstLine: DemoLineItem = lines[0] ?? {
        key: 'line-default',
        batch: 'Batch 1',
        item: 'Daal Chana',
        qtyKg: '100.000',
        costRate: '68.75',
        saleRate: '80.00',
      };
      const { amount, profit } = computeLineNumbers(firstLine);
      const nextId = rows.length + 1;
      const created: DemoSaleRow = {
        id: nextId,
        invoiceNo: `INV-2026-${String(nextId).padStart(4, '0')}`,
        date: values.date,
        client: values.client,
        batch: firstLine.batch,
        item: firstLine.item,
        qtyKg: new Decimal(firstLine.qtyKg || '0').toFixed(3),
        costRate: new Decimal(firstLine.costRate || '0').toFixed(2),
        saleRate: new Decimal(firstLine.saleRate || '0').toFixed(2),
        amount,
        profit,
        status: 'PAID',
      };
      setRows((prev) => [created, ...prev]);
      showToast({
        title: t('demo.form.savedToast'),
        description: `${created.invoiceNo} · ${created.client}`,
        tone: 'success',
      });
      if (keepOpen) {
        form.reset({
          date: '2026-11-06',
          client: 'Gohar Traders',
          route: 'Saddar Route',
          notes: '',
        });
        setProofFile(null);
      } else {
        setDrawerOpen(false);
      }
    });

  const commandItems: readonly CommandPaletteItem[] = useMemo(
    () => [
      {
        id: 'cmd-new',
        label: t('common.new'),
        shortcut: 'Ctrl+N',
        onSelect: () => setDrawerOpen(true),
      },
      {
        id: 'cmd-lang',
        label: t('shell.languageToggle'),
        onSelect: toggleLanguage,
      },
      ...navItems.map((n) => ({
        id: `nav-${n.id}`,
        label: n.label,
        group: t('app.name'),
        onSelect: () => setActiveNavId(n.id),
      })),
    ],
    [t, navItems, toggleLanguage],
  );

  const healthTone: StatusTone = health.isError
    ? 'danger'
    : health.data?.db === 'up'
      ? 'success'
      : 'warning';
  const healthLabel = health.isError
    ? t('health.unreachable')
    : !health.data
      ? t('health.checking')
      : health.data.db === 'up'
        ? t('health.ok')
        : t('health.dbDown');

  return (
    <AppShell
      navItems={navItems}
      activeNavId={activeNavId}
      onSelectNav={setActiveNavId}
      user={{
        name: t('shell.userName'),
        role: t('shell.userRole'),
        initials: 'AD',
      }}
      onUserMenuAction={(action) => showToast({ title: `User action: ${action}`, tone: 'neutral' })}
      onOpenSearch={() => setCommandOpen(true)}
      onToggleLanguage={toggleLanguage}
      notificationCount={2}
      statusBanner={<StatusBadge tone={healthTone}>{healthLabel}</StatusBadge>}
      labels={{
        appName: t('app.name'),
        toggleSidebar: t('shell.toggleSidebar'),
        quickSearch: t('shell.quickSearch'),
        notifications: t('shell.notifications'),
        languageToggle: t('shell.languageToggle'),
        userMenu: {
          profile: t('shell.userMenu.profile'),
          changePin: t('shell.userMenu.changePin'),
          lock: t('shell.userMenu.lock'),
          logout: t('shell.userMenu.logout'),
        },
      }}
    >
      {/* Standard List Page Structure: PageHeader + FilterBar + DataTable + Pagination */}
      <PageHeader
        title={t('demo.title')}
        subtitle={t('demo.subtitle')}
        primaryAction={{
          label: t('common.new'),
          shortcutHint: 'Ctrl+N',
          onClick: () => setDrawerOpen(true),
        }}
        secondaryActions={
          <>
            <Button
              variant="secondary"
              onClick={() => showToast({ title: t('common.export'), tone: 'neutral' })}
            >
              {t('common.export')}
            </Button>
            <Button
              variant="secondary"
              shortcutHint="Ctrl+P"
              onClick={() => showToast({ title: t('demo.form.printedToast'), tone: 'neutral' })}
            >
              {t('common.print')}
            </Button>
          </>
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder={t('demo.searchPlaceholder')}
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
            id: 'batch',
            label: t('demo.columns.batch'),
            value: batchFilter,
            allLabel: t('demo.allBatches'),
            options: [
              { value: 'Batch 1', label: 'Batch 1' },
              { value: 'Batch 2', label: 'Batch 2' },
              { value: 'Batch 3', label: 'Batch 3' },
            ],
            onChange: (val) => {
              setBatchFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: t('demo.columns.status'),
            value: statusFilter,
            allLabel: t('demo.allStatuses'),
            options: [
              { value: 'PAID', label: t('demo.status.PAID') },
              { value: 'PARTIAL', label: t('demo.status.PARTIAL') },
              { value: 'OVERDUE', label: t('demo.status.OVERDUE') },
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
          setDateFrom('');
          setDateTo('');
          setBatchFilter('');
          setStatusFilter('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={pagedRows}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        onRowClick={(row) =>
          showToast({
            title: `${row.invoiceNo} — ${row.client}`,
            description: `${row.batch} · ${row.item}`,
            tone: 'neutral',
          })
        }
        zebra
        emptyTitle={t('demo.emptyTitle')}
        emptyDescription={t('demo.emptyDescription')}
        columnsButtonLabel={t('common.columns')}
        loadingLabel={t('common.loading')}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filteredAndSorted.length}
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

      {/* Standard Form inside Drawer (2-column grid + LineItemGrid + Save / Save & New / Cancel) */}
      <Drawer
        open={drawerOpen}
        title={t('demo.form.drawerTitle')}
        subtitle={t('demo.form.drawerSubtitle')}
        onClose={() => setConfirmDiscardOpen(true)}
        widthClass="max-w-3xl"
      >
        <FormLayout
          onSubmit={() => void handleSave(false)()}
          onSaveAndNew={() => void handleSave(true)()}
          onCancel={() => setConfirmDiscardOpen(true)}
          labels={{
            save: t('common.save'),
            saveAndNew: t('common.saveAndNew'),
            cancel: t('common.cancel'),
          }}
          footerSlot={
            <LineItemGrid
              title={t('demo.form.linesTitle')}
              rows={lines}
              getRowKey={(row) => row.key}
              addRowLabel={t('demo.form.addLine')}
              removeRowLabel={t('common.delete')}
              onAddRow={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    key: `line-${Date.now()}-${prev.length}`,
                    batch: 'Batch 1',
                    item: 'Daal Chana',
                    qtyKg: '50.000',
                    costRate: '68.75',
                    saleRate: '80.00',
                  },
                ])
              }
              onRemoveRow={(idx) => setLines((prev) => prev.filter((_, i) => i !== idx))}
              columns={[
                {
                  id: 'batch',
                  header: t('demo.form.colBatch'),
                  width: '130px',
                  editable: true,
                  renderCell: ({ row, rowIndex, inputProps }) => (
                    <Select
                      {...inputProps}
                      value={row.batch}
                      onChange={(e) => updateLine(rowIndex, { batch: e.target.value })}
                      options={[
                        { value: 'Batch 1', label: 'Batch 1' },
                        { value: 'Batch 2', label: 'Batch 2' },
                        { value: 'Batch 3', label: 'Batch 3' },
                      ]}
                    />
                  ),
                },
                {
                  id: 'item',
                  header: t('demo.form.colItem'),
                  width: '150px',
                  editable: true,
                  renderCell: ({ row, rowIndex, inputProps }) => (
                    <TextInput
                      {...inputProps}
                      value={row.item}
                      onChange={(e) => updateLine(rowIndex, { item: e.target.value })}
                    />
                  ),
                },
                {
                  id: 'qtyKg',
                  header: t('demo.form.colQtyKg'),
                  width: '125px',
                  align: 'right',
                  editable: true,
                  renderCell: ({ row, rowIndex, inputProps }) => (
                    <NumberInput
                      {...inputProps}
                      precision="weight"
                      value={row.qtyKg}
                      onChange={(val) => updateLine(rowIndex, { qtyKg: val })}
                    />
                  ),
                },
                {
                  id: 'costRate',
                  header: t('demo.form.colCostRate'),
                  width: '115px',
                  align: 'right',
                  editable: false,
                  renderCell: ({ row }) => <MoneyText value={row.costRate} />,
                },
                {
                  id: 'saleRate',
                  header: t('demo.form.colSaleRate'),
                  width: '125px',
                  align: 'right',
                  editable: true,
                  renderCell: ({ row, rowIndex, inputProps }) => (
                    <NumberInput
                      {...inputProps}
                      precision="money"
                      value={row.saleRate}
                      onChange={(val) => updateLine(rowIndex, { saleRate: val })}
                    />
                  ),
                },
                {
                  id: 'amount',
                  header: t('demo.form.colAmount'),
                  width: '115px',
                  align: 'right',
                  editable: false,
                  renderCell: ({ row }) => <MoneyText value={computeLineNumbers(row).amount} />,
                },
                {
                  id: 'profit',
                  header: t('demo.form.colProfit'),
                  width: '115px',
                  align: 'right',
                  editable: false,
                  renderCell: ({ row }) => <MoneyText value={computeLineNumbers(row).profit} />,
                },
              ]}
            />
          }
        >
          <FormField
            label={t('demo.form.invoiceDate')}
            htmlFor="demo-date"
            required
            error={form.formState.errors.date?.message}
          >
            <DatePicker
              id="demo-date"
              hasError={Boolean(form.formState.errors.date)}
              {...form.register('date')}
            />
          </FormField>

          <FormField
            label={t('demo.form.client')}
            htmlFor="demo-client"
            required
            error={form.formState.errors.client?.message}
          >
            <Combobox
              id="demo-client"
              value={form.watch('client')}
              onChange={(val) => form.setValue('client', val, { shouldValidate: true })}
              options={CLIENT_OPTIONS}
              placeholder={t('demo.form.clientPlaceholder')}
              hasError={Boolean(form.formState.errors.client)}
            />
          </FormField>

          <FormField label={t('demo.form.route')} htmlFor="demo-route" required>
            <Select id="demo-route" options={ROUTE_OPTIONS} {...form.register('route')} />
          </FormField>

          <FormField label={t('demo.form.paymentProof')} htmlFor="demo-proof">
            <FileUpload
              id="demo-proof"
              value={proofFile}
              onChange={setProofFile}
              chooseLabel={t('demo.form.chooseFile')}
              removeLabel={t('common.delete')}
              hintLabel={t('demo.form.proofHint')}
            />
          </FormField>

          <FormField label={t('demo.form.notes')} htmlFor="demo-notes" fullWidth>
            <TextArea
              id="demo-notes"
              rows={2}
              placeholder={t('demo.form.notesPlaceholder')}
              {...form.register('notes')}
            />
          </FormField>
        </FormLayout>
      </Drawer>

      <ConfirmDialog
        open={confirmDiscardOpen}
        title={t('demo.form.discardTitle')}
        message={t('demo.form.discardMessage')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          setDrawerOpen(false);
        }}
        onCancel={() => setConfirmDiscardOpen(false)}
      />

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        placeholder={t('shell.searchPlaceholder')}
        emptyText={t('shell.searchEmpty')}
        items={commandItems}
      />
    </AppShell>
  );
}

export function App() {
  return (
    <ToastProvider>
      <DemoWorkspace />
    </ToastProvider>
  );
}
