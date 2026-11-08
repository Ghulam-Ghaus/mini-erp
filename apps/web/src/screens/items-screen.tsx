import { zodResolver } from '@hookform/resolvers/zod';
import {
  createItemSchema,
  type CreateItemInput,
  type ItemDto,
  type ItemUnitInput,
  type PageSizeOption,
  type SortOrder,
} from '@mini-erp/shared';
import {
  Button,
  CheckboxField,
  DataTable,
  Drawer,
  FilterBar,
  FormField,
  FormLayout,
  IntegerText,
  MoneyText,
  NumberInput,
  PageHeader,
  Pagination,
  RowActions,
  StatusBadge,
  TextArea,
  TextInput,
  useHotkeys,
  useToast,
  WeightText,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { createItem, fetchItems, updateItem } from '../lib/api.js';

export interface ItemsScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
}

export function ItemsScreen({ canCreate, canEdit }: ItemsScreenProps) {
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
  const [editingItem, setEditingItem] = useState<ItemDto | null>(null);
  const [altUnits, setAltUnits] = useState<ItemUnitInput[]>([]);

  const itemsQuery = useQuery({
    queryKey: ['items', { page, pageSize, search, statusFilter, sortBy, sortOrder }],
    queryFn: () =>
      fetchItems({
        page,
        pageSize,
        search: search.trim() || undefined,
        isActive: statusFilter === '' ? undefined : statusFilter === 'true',
        sortBy,
        sortOrder,
      }),
  });

  const form = useForm<CreateItemInput>({
    resolver: zodResolver(createItemSchema) as Resolver<CreateItemInput>,
    defaultValues: {
      code: '',
      name: '',
      nameUr: '',
      category: '',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      notes: '',
      isActive: true,
      alternateUnits: [],
    },
  });

  const openCreateDrawer = () => {
    if (!canCreate) return;
    setEditingItem(null);
    setAltUnits([
      {
        unitName: 'BAG',
        unitNameUr: 'بوری',
        conversionFactor: '50.000',
        isDefaultForPurchase: true,
        isDefaultForSale: false,
      },
    ]);
    form.reset({
      code: '',
      name: '',
      nameUr: '',
      category: '',
      baseUnit: 'KG',
      defaultTaxRate: '0.00',
      notes: '',
      isActive: true,
      alternateUnits: [],
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (item: ItemDto) => {
    if (!canEdit) return;
    setEditingItem(item);
    setAltUnits(
      item.alternateUnits.map((u) => ({
        unitName: u.unitName,
        unitNameUr: u.unitNameUr ?? '',
        conversionFactor: u.conversionFactor,
        isDefaultForPurchase: u.isDefaultForPurchase,
        isDefaultForSale: u.isDefaultForSale,
      })),
    );
    form.reset({
      code: item.code ?? '',
      name: item.name,
      nameUr: item.nameUr ?? '',
      category: item.category ?? '',
      baseUnit: item.baseUnit,
      defaultTaxRate: item.defaultTaxRate,
      notes: item.notes ?? '',
      isActive: item.isActive,
      alternateUnits: [],
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
    mutationFn: async (values: CreateItemInput) => {
      const payload: CreateItemInput = {
        ...values,
        alternateUnits: altUnits.filter((u) => u.unitName.trim().length > 0),
      };
      if (editingItem) {
        return updateItem(editingItem.id, payload);
      }
      return createItem(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      showToast({ title: t('items.savedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to save item',
        tone: 'danger',
      });
    },
  });

  const handleSave = (keepOpen: boolean) =>
    form.handleSubmit(async (values) => {
      await saveMutation.mutateAsync(values);
      if (keepOpen && !editingItem) {
        openCreateDrawer();
      } else {
        setDrawerOpen(false);
      }
    });

  const columns: ColumnDef<ItemDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('items.colId'),
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'code',
        header: t('items.colCode'),
        size: 95,
        cell: ({ row }) => (
          <span className="erp-num text-xs text-[#5c5a53]">{row.original.code || '—'}</span>
        ),
      },
      {
        id: 'name',
        header: t('items.colName'),
        size: 190,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: 'nameUr',
        header: t('items.colNameUr'),
        size: 140,
        enableSorting: false,
        cell: ({ row }) => row.original.nameUr || '—',
      },
      {
        id: 'category',
        header: t('items.colCategory'),
        size: 120,
        cell: ({ row }) => row.original.category || '—',
      },
      {
        id: 'baseUnit',
        header: t('items.colBaseUnit'),
        size: 85,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge tone="neutral">{row.original.baseUnit}</StatusBadge>,
      },
      {
        id: 'alternateUnits',
        header: t('items.colAlternateUnits'),
        size: 210,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.alternateUnits.length === 0 ? (
            <span className="text-xs text-[#8c8980]">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.alternateUnits.map((u) => (
                <span
                  key={u.id}
                  className="erp-num rounded border border-[#e4e2da] bg-[#faf9f5] px-1.5 py-0.5 text-[11px]"
                >
                  1 {u.unitName} = {u.conversionFactor} {row.original.baseUnit}
                </span>
              ))}
            </div>
          ),
      },
      {
        id: 'rawStockQtyBase',
        header: t('items.colRawStock'),
        size: 150,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <WeightText value={row.original.rawStockQtyBase} unit={row.original.baseUnit} />
        ),
      },
      {
        id: 'lastPurchaseRatePerBase',
        header: t('items.colLastRate'),
        size: 135,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.lastPurchaseRatePerBase ? (
            <MoneyText value={row.original.lastPurchaseRatePerBase} />
          ) : (
            <span className="text-xs text-[#8c8980]">—</span>
          ),
      },
      {
        id: 'status',
        header: t('items.colStatus'),
        size: 100,
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
        size: 100,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'edit',
                label: t('common.edit'),
                inline: true,
                disabled: !canEdit,
                onClick: () => openEditDrawer(row.original),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canEdit],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('items.title')}
        subtitle={t('items.subtitle')}
        primaryAction={
          canCreate
            ? {
                label: t('items.newItem'),
                shortcutHint: 'Ctrl+N',
                onClick: openCreateDrawer,
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder={t('items.searchPlaceholder')}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        selects={[
          {
            id: 'status',
            label: t('items.colStatus'),
            value: statusFilter,
            allLabel: t('items.allStatuses'),
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
        data={itemsQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        onRowClick={canEdit ? openEditDrawer : undefined}
        isLoading={itemsQuery.isLoading}
        zebra
        emptyTitle={t('items.emptyTitle')}
        emptyDescription={t('items.emptyDescription')}
        columnsButtonLabel={t('common.columns')}
        loadingLabel={t('common.loading')}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={itemsQuery.data?.total ?? 0}
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
        title={editingItem ? t('items.editItem') : t('items.newItem')}
        onClose={() => setDrawerOpen(false)}
      >
        <FormLayout
          labels={{
            save: t('common.save'),
            saveAndNew: !editingItem ? t('common.saveAndNew') : undefined,
            cancel: t('common.cancel'),
          }}
          isSubmitting={saveMutation.isPending}
          onSubmit={() => void handleSave(false)()}
          onSaveAndNew={!editingItem ? () => void handleSave(true)() : undefined}
          onCancel={() => setDrawerOpen(false)}
          footerSlot={
            <div className="mt-2 rounded border border-[#e4e2da] bg-[#faf9f5] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1f1e1b]">
                  {t('items.alternateUnitsTitle')}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setAltUnits((prev) => [
                      ...prev,
                      {
                        unitName: '',
                        unitNameUr: '',
                        conversionFactor: '50.000',
                        isDefaultForPurchase: false,
                        isDefaultForSale: false,
                      },
                    ])
                  }
                >
                  {t('items.addAlternateUnit')}
                </Button>
              </div>
              {altUnits.length > 0 && (
                <div className="flex flex-col gap-2">
                  {altUnits.map((unit, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 items-center gap-2 rounded border border-[#e4e2da] bg-white p-2 text-xs"
                    >
                      <div className="col-span-3">
                        <TextInput
                          placeholder={t('items.unitName')}
                          value={unit.unitName}
                          onChange={(e) =>
                            setAltUnits((prev) =>
                              prev.map((u, i) =>
                                i === idx ? { ...u, unitName: e.target.value.toUpperCase() } : u,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <TextInput
                          placeholder={t('items.unitNameUr')}
                          value={unit.unitNameUr ?? ''}
                          onChange={(e) =>
                            setAltUnits((prev) =>
                              prev.map((u, i) =>
                                i === idx ? { ...u, unitNameUr: e.target.value } : u,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-3">
                        <NumberInput
                          precision="weight"
                          placeholder={t('items.conversionFactor')}
                          value={unit.conversionFactor}
                          onChange={(val) =>
                            setAltUnits((prev) =>
                              prev.map((u, i) => (i === idx ? { ...u, conversionFactor: val } : u)),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-3 flex flex-col gap-1">
                        <CheckboxField
                          label={t('items.defaultPurchase')}
                          checked={unit.isDefaultForPurchase}
                          onChange={(checked) =>
                            setAltUnits((prev) =>
                              prev.map((u, i) => ({
                                ...u,
                                isDefaultForPurchase: i === idx ? checked : false,
                              })),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAltUnits((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          }
        >
          <FormField
            label={t('items.name')}
            htmlFor="item-name"
            required
            error={form.formState.errors.name?.message}
          >
            <TextInput
              id="item-name"
              hasError={Boolean(form.formState.errors.name)}
              {...form.register('name')}
            />
          </FormField>

          <FormField label={t('items.nameUr')} htmlFor="item-name-ur">
            <TextInput id="item-name-ur" {...form.register('nameUr')} />
          </FormField>

          <FormField label={t('items.code')} htmlFor="item-code">
            <TextInput id="item-code" {...form.register('code')} />
          </FormField>

          <FormField label={t('items.category')} htmlFor="item-category">
            <TextInput
              id="item-category"
              placeholder="Daal / Pulses"
              {...form.register('category')}
            />
          </FormField>

          <FormField label={t('items.baseUnit')} htmlFor="item-base-unit" required>
            <TextInput id="item-base-unit" {...form.register('baseUnit')} />
          </FormField>

          <FormField label={t('items.defaultTaxRate')} htmlFor="item-tax-rate">
            <TextInput id="item-tax-rate" {...form.register('defaultTaxRate')} />
          </FormField>

          <FormField label={t('common.notes')} htmlFor="item-notes" fullWidth>
            <TextArea id="item-notes" rows={2} {...form.register('notes')} />
          </FormField>

          <FormField label={t('items.colStatus')} fullWidth>
            <CheckboxField
              label={t('items.isActive')}
              checked={form.watch('isActive')}
              onChange={(checked) => form.setValue('isActive', checked)}
            />
          </FormField>
        </FormLayout>
      </Drawer>
    </div>
  );
}
