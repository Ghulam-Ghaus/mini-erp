import {
  type CreateRouteInput,
  type PageSizeOption,
  type RouteDto,
  type SortOrder,
  type UpdateRouteInput,
  type UserDto,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  Dialog,
  FilterBar,
  FormField,
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
import { useMemo, useState } from 'react';
import { createRoute, fetchRoutes, fetchUsers, updateRoute } from '../lib/api.js';

export interface RoutesScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
}

export function RoutesScreen({ canCreate, canEdit }: RoutesScreenProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteDto | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameUr, setNameUr] = useState('');
  const [description, setDescription] = useState('');
  const [assignedOfficerId, setAssignedOfficerId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  const routesQuery = useQuery({
    queryKey: ['routes', { page, pageSize, search, statusFilter, sortBy, sortOrder }],
    queryFn: () =>
      fetchRoutes({
        page,
        pageSize,
        search: search.trim() || undefined,
        isActive: statusFilter === '' ? undefined : statusFilter === 'active',
        sortBy,
        sortOrder,
      }),
  });

  const usersQuery = useQuery({
    queryKey: ['users', 'officers'],
    queryFn: () => fetchUsers({ page: 1, pageSize: 100 }),
  });

  const officers = useMemo(() => {
    const allUsers: readonly UserDto[] = usersQuery.data?.data ?? [];
    return allUsers.filter((u) => u.isActive);
  }, [usersQuery.data?.data]);

  const openCreateDialog = () => {
    setEditingRoute(null);
    setCode('');
    setName('');
    setNameUr('');
    setDescription('');
    setAssignedOfficerId('');
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (route: RouteDto) => {
    setEditingRoute(route);
    setCode(route.code ?? '');
    setName(route.name);
    setNameUr(route.nameUr ?? '');
    setDescription(route.description ?? '');
    setAssignedOfficerId(route.assignedOfficerId ? String(route.assignedOfficerId) : '');
    setIsActive(route.isActive);
    setDialogOpen(true);
  };

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (canCreate && !dialogOpen) openCreateDialog();
      },
    },
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error('Route name is required');
      }

      if (editingRoute) {
        const payload: UpdateRouteInput = {
          code: code.trim() || undefined,
          name: name.trim(),
          nameUr: nameUr.trim() || undefined,
          description: description.trim() || undefined,
          assignedOfficerId: assignedOfficerId ? Number(assignedOfficerId) : null,
          isActive,
        };
        return updateRoute(editingRoute.id, payload);
      }

      const payload: CreateRouteInput = {
        code: code.trim() || undefined,
        name: name.trim(),
        nameUr: nameUr.trim() || undefined,
        description: description.trim() || undefined,
        assignedOfficerId: assignedOfficerId ? Number(assignedOfficerId) : undefined,
        isActive,
      };
      return createRoute(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      showToast({
        title: editingRoute ? 'Route updated successfully' : 'Route created successfully',
        tone: 'success',
      });
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const columns = useMemo<ColumnDef<RouteDto, unknown>[]>(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Code',
        size: 90,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[#5c5a53]">{row.original.code ?? '—'}</span>
        ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Route Name',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-[#1f1e1b]">{row.original.name}</span>
            {row.original.nameUr ? (
              <span className="font-urdu text-xs text-[#6f6c64]">{row.original.nameUr}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'assignedOfficer',
        header: 'Assigned Officer',
        cell: ({ row }) =>
          row.original.assignedOfficerName ?? <span className="text-[#8c8980]">Unassigned</span>,
      },
      {
        id: 'clientCount',
        accessorKey: 'clientCount',
        header: 'Clients',
        size: 100,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="erp-num font-medium text-[#1f1e1b]">{row.original.clientCount}</span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'isActive',
        header: 'Status',
        size: 90,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.isActive ? 'success' : 'neutral'}>
            {row.original.isActive ? 'Active' : 'Inactive'}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 90,
        enableSorting: false,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                id: 'edit',
                label: 'Edit',
                inline: true,
                disabled: !canEdit,
                onClick: () => openEditDialog(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [canEdit],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Delivery & Recovery Routes"
        subtitle="Manage distribution territories and assign recovery officers"
        primaryAction={
          canCreate
            ? {
                label: 'New Route',
                shortcutHint: 'Ctrl+N',
                onClick: openCreateDialog,
              }
            : undefined
        }
      />

      <FilterBar
        searchValue={search}
        searchPlaceholder="Search routes by name or code…"
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        selects={[
          {
            id: 'status',
            label: 'Status',
            value: statusFilter,
            allLabel: 'All Routes',
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
          setStatusFilter('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={routesQuery.data?.data ?? []}
        getRowId={(r) => String(r.id)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(col, order) => {
          setSortBy(col);
          setSortOrder(order);
        }}
        isLoading={routesQuery.isLoading}
        zebra
        emptyTitle="No routes found"
        emptyDescription="Create your first distribution route to organize clients by geographical territory."
        columnsButtonLabel="Columns"
        loadingLabel="Loading routes…"
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={routesQuery.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        labels={{
          rowsPerPage: 'Routes per page',
          showingRange: (from, to, total) => `Showing ${from}–${to} of ${total}`,
          firstPage: 'First',
          previousPage: 'Prev',
          nextPage: 'Next',
          lastPage: 'Last',
        }}
      />

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingRoute ? `Edit Route: ${editingRoute.name}` : 'New Route'}
      >
        <div className="space-y-3 p-4">
          <FormField label="Route Name (English)" required>
            <TextInput
              placeholder="e.g. Saddar Market Route"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField label="Route Name (Urdu)">
            <TextInput
              dir="rtl"
              className="font-urdu"
              placeholder="صدر مارکیٹ روٹ"
              value={nameUr}
              onChange={(e) => setNameUr(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Route Code">
              <TextInput
                placeholder="e.g. R-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </FormField>

            <FormField label="Assigned Recovery Officer">
              <Select
                value={assignedOfficerId}
                onChange={(e) => setAssignedOfficerId(e.target.value)}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...officers.map((u) => ({
                    value: String(u.id),
                    label: `${u.firstName} ${u.lastName} (${u.role.code})`,
                  })),
                ]}
              />
            </FormField>
          </div>

          <FormField label="Description">
            <TextInput
              placeholder="Territory notes, streets, or coverage details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="route-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-[#d6d3c9]"
            />
            <label
              htmlFor="route-active"
              className="text-xs font-medium text-[#1f1e1b] cursor-pointer"
            >
              Active route
            </label>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-[#e4e2da] pt-3">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={saveMutation.isPending || !name.trim()}
              onClick={() => saveMutation.mutate()}
            >
              Save Route
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
