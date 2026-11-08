import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserSchema,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type CreateUserInput,
  type PageSizeOption,
  type SortOrder,
  type UserDto,
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
  PageHeader,
  Pagination,
  PermissionMatrixGrid,
  Select,
  StatusBadge,
  SurfaceCard,
  TabsBar,
  TextInput,
  useHotkeys,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createUser,
  fetchRoles,
  fetchUsers,
  updateRolePermissions,
  updateUser,
} from '../lib/api.js';

export interface UsersRolesScreenProps {
  readonly canCreate: boolean;
  readonly canEdit: boolean;
}

const editUserFormSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  roleId: z.coerce.number().int().positive(),
  isActive: z.boolean(),
  newPin: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4,8}$/.test(v), 'PIN must be 4 to 8 digits'),
});

type EditUserFormValues = z.infer<typeof editUserFormSchema>;

export function UsersRolesScreen({ canCreate, canEdit }: UsersRolesScreenProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');

  // Users list state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: fetchRoles,
  });

  const usersQuery = useQuery({
    queryKey: ['users', { page, pageSize, search, roleFilter, statusFilter, sortBy, sortOrder }],
    queryFn: () =>
      fetchUsers({
        page,
        pageSize,
        search: search.trim() || undefined,
        roleId: roleFilter ? Number(roleFilter) : undefined,
        isActive: statusFilter === '' ? undefined : statusFilter === 'true',
        sortBy,
        sortOrder,
      }),
  });

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const defaultRoleId = roles.find((r) => r.code === 'SALES')?.id ?? roles[0]?.id ?? 1;

  const createForm = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema) as Resolver<CreateUserInput>,
    defaultValues: {
      firstName: '',
      lastName: '',
      username: '',
      pin: '',
      roleId: defaultRoleId,
      isActive: true,
    },
  });

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema) as Resolver<EditUserFormValues>,
    defaultValues: {
      firstName: '',
      lastName: '',
      roleId: defaultRoleId,
      isActive: true,
      newPin: '',
    },
  });

  const openCreateDrawer = () => {
    if (!canCreate) return;
    setEditingUser(null);
    createForm.reset({
      firstName: '',
      lastName: '',
      username: '',
      pin: '',
      roleId: defaultRoleId,
      isActive: true,
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (user: UserDto) => {
    if (!canEdit) return;
    setEditingUser(user);
    editForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      roleId: user.role.id,
      isActive: user.isActive,
      newPin: '',
    });
    setDrawerOpen(true);
  };

  useHotkeys([
    {
      key: 'n',
      ctrlOrMeta: true,
      handler: () => {
        if (activeTab === 'users' && canCreate) openCreateDrawer();
      },
    },
  ]);

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast({ title: t('users.userSavedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to create user',
        tone: 'danger',
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: (params: { id: number; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(params.id, params.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast({ title: t('users.userSavedToast'), tone: 'success' });
      setDrawerOpen(false);
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to update user',
        tone: 'danger',
      });
    },
  });

  const handleSaveCreate = (keepOpen: boolean) =>
    createForm.handleSubmit(async (values) => {
      await createUserMutation.mutateAsync(values);
      if (keepOpen) {
        createForm.reset({
          firstName: '',
          lastName: '',
          username: '',
          pin: '',
          roleId: values.roleId,
          isActive: true,
        });
      } else {
        setDrawerOpen(false);
      }
    });

  const handleSaveEdit = editForm.handleSubmit((values) => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      id: editingUser.id,
      data: {
        firstName: values.firstName,
        lastName: values.lastName,
        roleId: values.roleId,
        isActive: values.isActive,
        ...(values.newPin ? { newPin: values.newPin } : {}),
      },
    });
  });

  const columns: ColumnDef<UserDto, unknown>[] = useMemo(
    () => [
      {
        id: 'id',
        header: t('users.colId'),
        size: 60,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        id: 'firstName',
        header: t('users.colName'),
        size: 200,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </span>
        ),
      },
      {
        id: 'username',
        header: t('users.colUsername'),
        size: 150,
        cell: ({ row }) => row.original.username,
      },
      {
        id: 'role',
        header: t('users.colRole'),
        size: 160,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original.role;
          return (
            <StatusBadge tone={r.code === 'ADMIN' ? 'info' : 'neutral'}>
              {i18n.language === 'ur' && r.nameUr ? r.nameUr : r.name}
            </StatusBadge>
          );
        },
      },
      {
        id: 'status',
        header: t('users.colStatus'),
        size: 110,
        enableSorting: false,
        meta: { align: 'center' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.isActive ? 'success' : 'danger'}>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </StatusBadge>
        ),
      },
      {
        id: 'lastLoginAt',
        header: t('users.colLastLogin'),
        size: 170,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.lastLoginAt
            ? new Date(row.original.lastLoginAt).toLocaleString()
            : t('users.neverLoggedIn'),
      },
    ],
    [t, i18n.language],
  );

  // Roles & Permissions Matrix state
  const [selectedRoleId, setSelectedRoleId] = useState<number>(0);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const activeRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? roles[0],
    [roles, selectedRoleId],
  );

  useEffect(() => {
    if (activeRole) {
      setSelectedRoleId(activeRole.id);
      setSelectedPerms(new Set(activeRole.permissions));
    }
  }, [activeRole]);

  const updateMatrixMutation = useMutation({
    mutationFn: (params: { roleId: number; permissions: string[] }) =>
      updateRolePermissions(params.roleId, { permissions: params.permissions }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      showToast({ title: t('users.matrixSavedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to update permissions',
        tone: 'danger',
      });
    },
  });

  const togglePermissionKey = (key: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModuleRow = (moduleKey: string, allSelected: boolean) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      for (const act of PERMISSION_ACTIONS) {
        const key = `${moduleKey}.${act}`;
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const roleSelectOptions = useMemo(
    () =>
      roles.map((r) => ({
        value: String(r.id),
        label: i18n.language === 'ur' && r.nameUr ? r.nameUr : r.name,
      })),
    [roles, i18n.language],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        primaryAction={
          activeTab === 'users' && canCreate
            ? {
                label: t('users.newUser'),
                shortcutHint: 'Ctrl+N',
                onClick: openCreateDrawer,
              }
            : undefined
        }
      />

      <TabsBar
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as 'users' | 'roles')}
        tabs={[
          { id: 'users', label: t('users.tabUsers'), badge: usersQuery.data?.total },
          { id: 'roles', label: t('users.tabRoles'), badge: roles.length },
        ]}
      />

      {activeTab === 'users' ? (
        <>
          <FilterBar
            searchValue={search}
            searchPlaceholder={t('users.searchPlaceholder')}
            onSearchChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            selects={[
              {
                id: 'role',
                label: t('users.colRole'),
                value: roleFilter,
                allLabel: t('users.allRoles'),
                options: roleSelectOptions,
                onChange: (val) => {
                  setRoleFilter(val);
                  setPage(1);
                },
              },
              {
                id: 'status',
                label: t('users.colStatus'),
                value: statusFilter,
                allLabel: t('users.allStatuses'),
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
              setRoleFilter('');
              setStatusFilter('');
              setPage(1);
            }}
          />

          <DataTable
            columns={columns}
            data={usersQuery.data?.data ?? []}
            getRowId={(u) => String(u.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(col, order) => {
              setSortBy(col);
              setSortOrder(order);
            }}
            onRowClick={canEdit ? openEditDrawer : undefined}
            isLoading={usersQuery.isLoading}
            zebra
            emptyTitle={t('users.emptyTitle')}
            emptyDescription={t('users.emptyDescription')}
            columnsButtonLabel={t('common.columns')}
            loadingLabel={t('common.loading')}
          />

          <Pagination
            page={page}
            pageSize={pageSize}
            total={usersQuery.data?.total ?? 0}
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
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          <SurfaceCard
            title={t('users.tabRoles')}
            subtitle={t('users.selectRole')}
            headerAction={
              activeRole && activeRole.code !== 'ADMIN' && canEdit ? (
                <Button
                  variant="primary"
                  disabled={updateMatrixMutation.isPending}
                  onClick={() =>
                    updateMatrixMutation.mutate({
                      roleId: activeRole.id,
                      permissions: [...selectedPerms],
                    })
                  }
                >
                  {t('users.saveMatrix')}
                </Button>
              ) : undefined
            }
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="w-64">
                <Select
                  value={activeRole ? String(activeRole.id) : ''}
                  options={roleSelectOptions}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const found = roles.find((r) => r.id === id);
                    setSelectedRoleId(id);
                    if (found) setSelectedPerms(new Set(found.permissions));
                  }}
                />
              </div>
              {activeRole?.code === 'ADMIN' && (
                <StatusBadge tone="info">{t('users.adminLockedNotice')}</StatusBadge>
              )}
            </div>

            <PermissionMatrixGrid
              moduleHeader={t('users.moduleColumn')}
              rows={PERMISSION_MODULES.map((m) => ({
                key: m,
                label: t(`users.modules.${m}`),
              }))}
              columns={PERMISSION_ACTIONS.map((a) => ({
                key: a,
                label: t(`users.actions.${a}`),
              }))}
              selectedKeys={selectedPerms}
              disabled={!canEdit || activeRole?.code === 'ADMIN'}
              onToggle={togglePermissionKey}
              onToggleRow={toggleModuleRow}
            />
          </SurfaceCard>
        </div>
      )}

      {/* Create / Edit User Drawer */}
      <Drawer
        open={drawerOpen}
        title={editingUser ? t('users.editUser') : t('users.newUser')}
        onClose={() => setDrawerOpen(false)}
      >
        {editingUser ? (
          <FormLayout
            onSubmit={() => void handleSaveEdit()}
            onCancel={() => setDrawerOpen(false)}
            isSubmitting={updateUserMutation.isPending}
            labels={{
              save: t('common.save'),
              cancel: t('common.cancel'),
            }}
          >
            <FormField
              label={t('users.firstName')}
              htmlFor="edit-first-name"
              required
              error={editForm.formState.errors.firstName?.message}
            >
              <TextInput
                id="edit-first-name"
                hasError={Boolean(editForm.formState.errors.firstName)}
                {...editForm.register('firstName')}
              />
            </FormField>

            <FormField
              label={t('users.lastName')}
              htmlFor="edit-last-name"
              required
              error={editForm.formState.errors.lastName?.message}
            >
              <TextInput
                id="edit-last-name"
                hasError={Boolean(editForm.formState.errors.lastName)}
                {...editForm.register('lastName')}
              />
            </FormField>

            <FormField label={t('users.username')} htmlFor="edit-username">
              <TextInput id="edit-username" value={editingUser.username} disabled />
            </FormField>

            <FormField label={t('users.role')} htmlFor="edit-role" required>
              <Select
                id="edit-role"
                options={roleSelectOptions}
                {...editForm.register('roleId', { valueAsNumber: true })}
              />
            </FormField>

            <FormField
              label={t('users.resetPin')}
              htmlFor="edit-new-pin"
              fullWidth
              error={editForm.formState.errors.newPin?.message}
            >
              <TextInput
                id="edit-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                hasError={Boolean(editForm.formState.errors.newPin)}
                {...editForm.register('newPin')}
              />
            </FormField>

            <div className="md:col-span-2">
              <CheckboxField
                id="edit-is-active"
                label={t('users.isActive')}
                checked={editForm.watch('isActive')}
                onChange={(checked) => editForm.setValue('isActive', checked)}
              />
            </div>
          </FormLayout>
        ) : (
          <FormLayout
            onSubmit={() => void handleSaveCreate(false)()}
            onSaveAndNew={() => void handleSaveCreate(true)()}
            onCancel={() => setDrawerOpen(false)}
            isSubmitting={createUserMutation.isPending}
            labels={{
              save: t('common.save'),
              saveAndNew: t('common.saveAndNew'),
              cancel: t('common.cancel'),
            }}
          >
            <FormField
              label={t('users.firstName')}
              htmlFor="create-first-name"
              required
              error={createForm.formState.errors.firstName?.message}
            >
              <TextInput
                id="create-first-name"
                hasError={Boolean(createForm.formState.errors.firstName)}
                {...createForm.register('firstName')}
              />
            </FormField>

            <FormField
              label={t('users.lastName')}
              htmlFor="create-last-name"
              required
              error={createForm.formState.errors.lastName?.message}
            >
              <TextInput
                id="create-last-name"
                hasError={Boolean(createForm.formState.errors.lastName)}
                {...createForm.register('lastName')}
              />
            </FormField>

            <FormField
              label={t('users.username')}
              htmlFor="create-username"
              required
              error={createForm.formState.errors.username?.message}
            >
              <TextInput
                id="create-username"
                hasError={Boolean(createForm.formState.errors.username)}
                {...createForm.register('username')}
              />
            </FormField>

            <FormField label={t('users.role')} htmlFor="create-role" required>
              <Select
                id="create-role"
                options={roleSelectOptions}
                {...createForm.register('roleId', { valueAsNumber: true })}
              />
            </FormField>

            <FormField
              label={t('users.pin')}
              htmlFor="create-pin"
              required
              error={createForm.formState.errors.pin?.message}
            >
              <TextInput
                id="create-pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                hasError={Boolean(createForm.formState.errors.pin)}
                {...createForm.register('pin')}
              />
            </FormField>

            <div className="flex items-center pt-5">
              <CheckboxField
                id="create-is-active"
                label={t('users.isActive')}
                checked={createForm.watch('isActive')}
                onChange={(checked) => createForm.setValue('isActive', checked)}
              />
            </div>
          </FormLayout>
        )}
      </Drawer>
    </div>
  );
}
