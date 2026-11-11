import {
  RECOVERY_DAYS,
  type ClientDto,
  type CreateClientInput,
  type PageSizeOption,
  type SortOrder,
  type UpdateClientInput,
} from '@mini-erp/shared';
import {
  Combobox,
  DataTable,
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
  RowActions,
  Select,
  StatusBadge,
  TextInput,
  useHotkeys,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient, fetchClients, fetchRoutes, updateClient } from '../lib/api.js';

export interface ClientsScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly onOpenClient360: (clientId: number) => void;
  readonly onCreateSaleForClient: (clientId: number) => void;
}

export function ClientsScreen({
  canCreate,
  canEdit,
  onOpenClient360,
  onCreateSaleForClient,
}: ClientsScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientDto | null>(null);

  // Form fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [routeId, setRouteId] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNo, setTaxNo] = useState('');
  const [creditLimit, setCreditLimit] = useState('0.00');
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [recoveryDay, setRecoveryDay] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const clientsQuery = useQuery({
    queryKey: ['clients', { page, pageSize, search, routeFilter, statusFilter, sortBy, sortOrder }],
    queryFn: () =>
      fetchClients({
        page,
        pageSize,
        search: search.trim() || undefined,
        routeId: routeFilter ? Number(routeFilter) : undefined,
        isActive: statusFilter === '' ? undefined : statusFilter === 'active',
        sortBy,
        sortOrder,
      }),
  });

  const routesQuery = useQuery({
    queryKey: ['routes', 'dropdown'],
    queryFn: () => fetchRoutes({ page: 1, pageSize: 100, isActive: true }),
  });

  const routes = useMemo(() => routesQuery.data?.data ?? [], [routesQuery.data?.data]);

  const openCreateDrawer = () => {
    setEditingClient(null);
    setCode('');
    setName('');
    setNameUr('');
    setRouteId('');
    setContactPerson('');
    setPhone('');
    setAddress('');
    setTaxNo('');
    setCreditLimit('0.00');
    setOpeningBalance('0.00');
    setRecoveryDay('');
    setNotes('');
    setIsActive(true);
    setDrawerOpen(true);
  };

  const openEditDrawer = (client: ClientDto) => {
    setEditingClient(client);
    setCode(client.code ?? '');
    setName(client.name);
    setNameUr(client.nameUr ?? '');
    setRouteId(client.routeId ? String(client.routeId) : '');
    setContactPerson(client.contactPerson ?? '');
    setPhone(client.phone ?? '');
    setAddress(client.address ?? '');
    setTaxNo(client.taxNo ?? '');
    setCreditLimit(client.creditLimit);
    setOpeningBalance(client.openingBalance);
    setRecoveryDay(client.recoveryDay ?? '');
    setNotes(client.notes ?? '');
    setIsActive(client.isActive);
    setDrawerOpen(true);
  };

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !drawerOpen) openCreateDrawer();
      },
    },
  ]);

  const saveMutation = useMutation({
    mutationFn: async (andNew: boolean) => {
      if (!name.trim()) throw new Error('Client name is required');

      if (editingClient) {
        const payload: UpdateClientInput = {
          code: code.trim() || undefined,
          name: name.trim(),
          nameUr: nameUr.trim() || undefined,
          routeId: routeId ? Number(routeId) : null,
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          taxNo: taxNo.trim() || undefined,
          creditLimit,
          recoveryDay: recoveryDay || null,
          notes: notes.trim() || undefined,
          isActive,
        };
        await updateClient(editingClient.id, payload);
      } else {
        const payload: CreateClientInput = {
          code: code.trim() || undefined,
          name: name.trim(),
          nameUr: nameUr.trim() || undefined,
          routeId: routeId ? Number(routeId) : undefined,
          contactPerson: contactPerson.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          taxNo: taxNo.trim() || undefined,
          creditLimit,
          openingBalance,
          recoveryDay: recoveryDay || undefined,
          notes: notes.trim() || undefined,
          isActive,
        };
        await createClient(payload);
      }

      return andNew;
    },
    onSuccess: (andNew) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      showToast({
        title: editingClient ? 'Client updated' : 'Client created',
        tone: 'success',
      });
      if (andNew) {
        openCreateDrawer();
      } else {
        setDrawerOpen(false);
      }
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const columns = useMemo<ColumnDef<ClientDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Code',
        size: 85,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[#5c5a53]">{row.original.code ?? '—'}</span>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Client Name',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <EntityLink
              onClick={() => onOpenClient360(row.original.id)}
              subtitle={row.original.nameUr}
            >
              {row.original.name}
            </EntityLink>
          </div>
        ),
      },
      {
        id: 'route',
        header: 'Route',
        cell: ({ row }) =>
          row.original.routeName ? (
            <span className="inline-flex items-center rounded border border-[#d6d3c9] bg-[#f7f6f1] px-2 py-0.5 text-[11px] font-medium text-[#1f1e1b]">
              {row.original.routeName}
            </span>
          ) : (
            <span className="text-xs text-[#8c8980]">No route</span>
          ),
      },
      {
        id: 'contact',
        header: 'Contact & Phone',
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <span>{row.original.contactPerson ?? '—'}</span>
            {row.original.phone && (
              <span className="font-mono text-[11px] text-[#6f6c64]">{row.original.phone}</span>
            )}
          </div>
        ),
      },
      {
        id: 'recoveryDay',
        accessorKey: 'recoveryDay',
        header: 'Recovery Day',
        size: 110,
        cell: ({ row }) => (
          <span className="text-xs text-[#5c5a53]">{row.original.recoveryDay ?? '—'}</span>
        ),
      },
      {
        id: 'creditLimit',
        accessorKey: 'creditLimit',
        header: 'Credit Limit',
        size: 120,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.creditLimit} />,
      },
      {
        id: 'currentBalance',
        accessorKey: 'currentBalance',
        header: 'Receivable Balance',
        size: 140,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const bal = new Decimal(row.original.currentBalance);
          const limit = new Decimal(row.original.creditLimit);
          const isOverLimit = limit.gt(0) && bal.gt(limit);
          return (
            <div className="flex flex-col items-end">
              <span
                className={`font-semibold ${
                  bal.gt(0) ? 'text-[#9e3b33]' : bal.lt(0) ? 'text-[#2c6b48]' : 'text-[#5c5a53]'
                }`}
              >
                <MoneyText value={row.original.currentBalance} />
              </span>
              {isOverLimit && (
                <span className="text-[10px] font-medium text-[#9e3b33]">Over credit limit</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorKey: 'isActive',
        header: 'Status',
        size: 85,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.isActive ? 'success' : 'neutral'}>
            {row.original.isActive ? 'Active' : 'Inactive'}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 165,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <RowActions
              actions={[
                {
                  id: '360',
                  label: 'Ledger',
                  inline: true,
                  onClick: () => onOpenClient360(c.id),
                },
                {
                  id: 'sale',
                  label: 'Sale',
                  inline: true,
                  onClick: () => onCreateSaleForClient(c.id),
                },
                {
                  id: 'edit',
                  label: 'Edit',
                  disabled: !canEdit,
                  onClick: () => openEditDrawer(c),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, onOpenClient360, onCreateSaleForClient],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Clients"
        subtitle="Customer accounts, credit limits, receivable balances, and recovery assignments"
        primaryAction={
          canCreate
            ? {
                label: 'New Client',
                shortcutHint: 'Ctrl+N',
                onClick: openCreateDrawer,
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder="Search clients by name, code, contact, or phone…"
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        selects={[
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
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        clearLabel="Clear"
        onClear={() => {
          setSearch('');
          setRouteFilter('');
          setStatusFilter('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={clientsQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        onRowClick={(r) => onOpenClient360(r.id)}
        isLoading={clientsQuery.isLoading}
        zebra
        emptyTitle="No clients found"
        emptyDescription="Add clients to start recording sales, setting credit limits, and tracking receivables."
        columnsButtonLabel="Columns"
        loadingLabel="Loading clients…"
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={clientsQuery.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        labels={{
          rowsPerPage: 'Clients per page',
          showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
          firstPage: 'First',
          previousPage: 'Prev',
          nextPage: 'Next',
          lastPage: 'Last',
        }}
      />

      {/* New / Edit Client Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingClient ? `Edit Client: ${editingClient.name}` : 'New Client'}
        widthClass="max-w-2xl"
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            saveAndNew: t('common.saveAndNew'),
            cancel: t('common.cancel'),
          }}
          onSubmit={() => saveMutation.mutate(false)}
          onSaveAndNew={editingClient ? undefined : () => saveMutation.mutate(true)}
          onCancel={() => setDrawerOpen(false)}
          isSubmitting={saveMutation.isPending}
        >
          <FormField label="Client Name (English)" required>
            <TextInput
              placeholder="e.g. Client Business name Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField label="Client Name (Urdu)">
            <TextInput
              dir="rtl"
              className="font-urdu"
              placeholder="کلا ینٹ بزنس نام سٹور"
              value={nameUr}
              onChange={(e) => setNameUr(e.target.value)}
            />
          </FormField>

          <FormField label="Route / Territory">
            <Combobox
              allowClear
              value={routeId}
              placeholder="Select route…"
              searchPlaceholder="Type route name…"
              onChange={(val) => setRouteId(val)}
              options={routes.map((r) => ({
                value: String(r.id),
                label: r.name,
                subtitle: r.assignedOfficerName ? `Officer: ${r.assignedOfficerName}` : undefined,
              }))}
            />
          </FormField>

          <FormField label="Client Code">
            <TextInput
              placeholder="e.g. CLI-001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </FormField>

          <FormField label="Contact Person">
            <TextInput
              placeholder="e.g. Haji Muhammad Aslam"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </FormField>

          <FormField label="Phone Number">
            <TextInput
              placeholder="e.g. 0300-1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>

          <FormField label="Credit Limit (PKR)">
            <NumberInput precision="money" value={creditLimit} onChange={setCreditLimit} />
          </FormField>

          {!editingClient && (
            <FormField label="Opening Receivable Balance (PKR)">
              <NumberInput precision="money" value={openingBalance} onChange={setOpeningBalance} />
            </FormField>
          )}

          <FormField label="Preferred Recovery Day">
            <Select
              value={recoveryDay}
              onChange={(e) => setRecoveryDay(e.target.value)}
              options={[
                { value: '', label: 'None / Any Day' },
                ...RECOVERY_DAYS.map((d) => ({ value: d, label: d })),
              ]}
            />
          </FormField>

          <FormField label="Tax / NTN No.">
            <TextInput
              placeholder="e.g. 1234567-8"
              value={taxNo}
              onChange={(e) => setTaxNo(e.target.value)}
            />
          </FormField>

          <div className="sm:col-span-2">
            <FormField label="Address / Shop Location">
              <TextInput
                placeholder="Shop #, Street, Commercial Market"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormField>
          </div>

          <div className="sm:col-span-2">
            <FormField label="Notes">
              <TextInput
                placeholder="Any special remarks or delivery guidelines"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>
          </div>

          <div className="sm:col-span-2 flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="client-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-[#d6d3c9]"
            />
            <label
              htmlFor="client-active"
              className="text-xs font-medium text-[#1f1e1b] cursor-pointer"
            >
              Active client account
            </label>
          </div>
        </FormLayout>
      </Drawer>
    </div>
  );
}
