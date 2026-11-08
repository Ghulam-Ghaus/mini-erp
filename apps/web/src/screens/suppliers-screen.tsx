import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSupplierSchema,
  type CreateSupplierInput,
  type PageSizeOption,
  type SortOrder,
  type SupplierDto,
} from '@mini-erp/shared';
import {
  CheckboxField,
  DataTable,
  Drawer,
  EntityLink,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
  MoneyText,
  PageHeader,
  Pagination,
  RowActions,
  StatusBadge,
  TextArea,
  TextInput,
  useHotkeys,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { createSupplier, fetchSuppliers, updateSupplier } from '../lib/api.js';

export interface SuppliersScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly canPay: boolean;
  readonly canPurchase: boolean;
  readonly onOpenSupplier360: (supplierId: number) => void;
  readonly onRecordPaymentForSupplier: (supplierId: number) => void;
  readonly onNewPurchaseForSupplier: (supplierId: number) => void;
}

export function SuppliersScreen({
  canCreate,
  canEdit,
  canPay,
  canPurchase,
  onOpenSupplier360,
  onRecordPaymentForSupplier,
  onNewPurchaseForSupplier,
}: SuppliersScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', { page, pageSize, search, statusFilter, sortBy, sortOrder }],
    queryFn: () =>
      fetchSuppliers({
        page,
        pageSize,
        search: search.trim() || undefined,
        isActive: statusFilter === '' ? undefined : statusFilter === 'true',
        sortBy,
        sortOrder,
      }),
  });

  const form = useForm<CreateSupplierInput>({
    resolver: zodResolver(createSupplierSchema) as Resolver<CreateSupplierInput>,
    defaultValues: {
      code: '',
      name: '',
      nameUr: '',
      contactPerson: '',
      phone: '',
      address: '',
      taxNo: '',
      openingBalance: '0.00',
      notes: '',
      isActive: true,
    },
  });

  const openCreateDrawer = () => {
    if (!canCreate) return;
    setEditingSupplier(null);
    form.reset({
      code: '',
      name: '',
      nameUr: '',
      contactPerson: '',
      phone: '',
      address: '',
      taxNo: '',
      openingBalance: '0.00',
      notes: '',
      isActive: true,
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (supplier: SupplierDto) => {
    if (!canEdit) return;
    setEditingSupplier(supplier);
    form.reset({
      code: supplier.code ?? '',
      name: supplier.name,
      nameUr: supplier.nameUr ?? '',
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      taxNo: supplier.taxNo ?? '',
      openingBalance: supplier.openingBalance,
      notes: supplier.notes ?? '',
      isActive: supplier.isActive,
    });
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
    mutationFn: async (values: CreateSupplierInput) => {
      if (editingSupplier) {
        return updateSupplier(editingSupplier.id, {
          code: values.code,
          name: values.name,
          nameUr: values.nameUr,
          contactPerson: values.contactPerson,
          phone: values.phone,
          address: values.address,
          taxNo: values.taxNo,
          notes: values.notes,
          isActive: values.isActive,
        });
      }
      return createSupplier(values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      showToast({ title: t('suppliers.savedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to save supplier',
        tone: 'danger',
      });
    },
  });

  const handleSave = (keepOpen: boolean) =>
    form.handleSubmit(async (values) => {
      await saveMutation.mutateAsync(values);
      if (keepOpen && !editingSupplier) {
        openCreateDrawer();
      } else {
        setDrawerOpen(false);
      }
    });

  const columns: ColumnDef<SupplierDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('suppliers.colId'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'code',
        header: t('suppliers.colCode'),
        size: 90,
        cell: ({ row }) => (
          <span className="erp-num text-xs text-[#5c5a53]">{row.original.code || '—'}</span>
        ),
      },
      {
        id: 'name',
        header: t('suppliers.colName'),
        size: 210,
        cell: ({ row }) => (
          <EntityLink
            onClick={() => onOpenSupplier360(row.original.id)}
            subtitle={row.original.nameUr}
          >
            {row.original.name}
          </EntityLink>
        ),
      },
      {
        id: 'contactPerson',
        header: t('suppliers.colContact'),
        size: 140,
        enableSorting: false,
        cell: ({ row }) => row.original.contactPerson || '—',
      },
      {
        id: 'phone',
        header: t('suppliers.colPhone'),
        size: 130,
        cell: ({ row }) => <span className="erp-num">{row.original.phone || '—'}</span>,
      },
      {
        id: 'totalPurchased',
        header: t('suppliers.colPurchased'),
        size: 130,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.totalPurchased} />,
      },
      {
        id: 'totalPaid',
        header: t('suppliers.colPaid'),
        size: 130,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <MoneyText value={row.original.totalPaid} />,
      },
      {
        id: 'currentBalance',
        header: t('suppliers.colBalance'),
        size: 145,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="font-semibold">
            <MoneyText value={row.original.currentBalance} />
          </span>
        ),
      },
      {
        id: 'status',
        header: t('suppliers.colStatus'),
        size: 95,
        enableSorting: false,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.isActive ? 'success' : 'danger'}>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        size: 195,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'ledger',
                label: t('suppliers.actionLedger'),
                inline: true,
                onClick: () => onOpenSupplier360(row.original.id),
              },
              {
                id: 'pay',
                label: t('suppliers.actionPay'),
                inline: true,
                disabled: !canPay,
                onClick: () => onRecordPaymentForSupplier(row.original.id),
              },
              {
                id: 'purchase',
                label: t('suppliers.actionNewPurchase'),
                disabled: !canPurchase,
                onClick: () => onNewPurchaseForSupplier(row.original.id),
              },
              {
                id: 'edit',
                label: t('common.edit'),
                disabled: !canEdit,
                onClick: () => openEditDrawer(row.original),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      t,
      canEdit,
      canPay,
      canPurchase,
      onOpenSupplier360,
      onRecordPaymentForSupplier,
      onNewPurchaseForSupplier,
    ],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('suppliers.title')}
        subtitle={t('suppliers.subtitle')}
        primaryAction={
          canCreate
            ? {
                label: t('suppliers.newSupplier'),
                shortcutHint: 'Ctrl+N',
                onClick: openCreateDrawer,
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder={t('suppliers.searchPlaceholder')}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        selects={[
          {
            id: 'status',
            label: t('suppliers.colStatus'),
            value: statusFilter,
            allLabel: t('suppliers.allStatuses'),
            options: [
              { value: 'true', label: t('common.active') },
              { value: 'false', label: t('common.inactive') },
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
          setStatusFilter('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={suppliersQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        onRowClick={(r) => onOpenSupplier360(r.id)}
        isLoading={suppliersQuery.isLoading}
        zebra
        emptyTitle={t('suppliers.emptyTitle')}
        emptyDescription={t('suppliers.emptyDescription')}
        columnsButtonLabel={t('common.columns')}
        loadingLabel={t('common.loading')}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={suppliersQuery.data?.total ?? 0}
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
        title={editingSupplier ? t('suppliers.editSupplier') : t('suppliers.newSupplier')}
        onClose={() => setDrawerOpen(false)}
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            saveAndNew: !editingSupplier ? t('common.saveAndNew') : undefined,
            cancel: t('common.cancel'),
          }}
          isSubmitting={saveMutation.isPending}
          onSubmit={() => void handleSave(false)()}
          onSaveAndNew={!editingSupplier ? () => void handleSave(true)() : undefined}
          onCancel={() => setDrawerOpen(false)}
        >
          <FormField
            label={t('suppliers.name')}
            htmlFor="sup-name"
            required
            error={form.formState.errors.name?.message}
          >
            <TextInput
              id="sup-name"
              hasError={Boolean(form.formState.errors.name)}
              {...form.register('name')}
            />
          </FormField>

          <FormField label={t('suppliers.nameUr')} htmlFor="sup-name-ur">
            <TextInput id="sup-name-ur" {...form.register('nameUr')} />
          </FormField>

          <FormField label={t('suppliers.code')} htmlFor="sup-code">
            <TextInput id="sup-code" {...form.register('code')} />
          </FormField>

          <FormField label={t('suppliers.contactPerson')} htmlFor="sup-contact">
            <TextInput id="sup-contact" {...form.register('contactPerson')} />
          </FormField>

          <FormField label={t('suppliers.phone')} htmlFor="sup-phone">
            <TextInput id="sup-phone" {...form.register('phone')} />
          </FormField>

          <FormField label={t('suppliers.taxNo')} htmlFor="sup-tax">
            <TextInput id="sup-tax" {...form.register('taxNo')} />
          </FormField>

          {!editingSupplier && (
            <FormField
              label={t('suppliers.openingBalance')}
              htmlFor="sup-opening"
              error={form.formState.errors.openingBalance?.message}
            >
              <TextInput id="sup-opening" {...form.register('openingBalance')} />
            </FormField>
          )}

          <FormField label={t('suppliers.address')} htmlFor="sup-address" fullWidth>
            <TextArea id="sup-address" rows={2} {...form.register('address')} />
          </FormField>

          <FormField label={t('common.notes')} htmlFor="sup-notes" fullWidth>
            <TextArea id="sup-notes" rows={2} {...form.register('notes')} />
          </FormField>

          <FormField label={t('suppliers.colStatus')} fullWidth>
            <CheckboxField
              label={t('suppliers.isActive')}
              checked={form.watch('isActive')}
              onChange={(checked) => form.setValue('isActive', checked)}
            />
          </FormField>
        </FormLayout>
      </Drawer>
    </div>
  );
}
