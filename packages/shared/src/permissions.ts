export const SYSTEM_ROLE_CODES = [
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'SALES',
  'RECOVERY_OFFICER',
  'STORE_RIDER',
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

export const PERMISSION_MODULES = [
  'dashboard',
  'sales',
  'returns',
  'challans',
  'purchases',
  'batches',
  'inventory',
  'clients',
  'recovery',
  'suppliers',
  'payments',
  'expenses',
  'payroll',
  'reports',
  'notifications',
  'users',
  'settings',
  'backup',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'print'] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionKey = `${PermissionModule}.${PermissionAction}`;

export function formatPermissionKey(
  module: PermissionModule,
  action: PermissionAction,
): PermissionKey {
  return `${module}.${action}`;
}

export function hasPermission(
  userPermissions: readonly string[],
  roleCode: string,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  if (roleCode === 'ADMIN') return true;
  return userPermissions.includes(formatPermissionKey(module, action));
}

export interface DefaultRoleDefinition {
  readonly code: SystemRoleCode;
  readonly name: string;
  readonly nameUr: string;
  readonly permissions: readonly PermissionKey[];
}

const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_MODULES.flatMap((mod) =>
  PERMISSION_ACTIONS.map((act) => formatPermissionKey(mod, act)),
);

export const DEFAULT_SYSTEM_ROLES: readonly DefaultRoleDefinition[] = [
  {
    code: 'ADMIN',
    name: 'Administrator',
    nameUr: 'ایڈمنسٹریٹر',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    nameUr: 'مینیجر',
    permissions: ALL_PERMISSION_KEYS.filter(
      (key) => !key.startsWith('users.') && !key.startsWith('backup.'),
    ),
  },
  {
    code: 'ACCOUNTANT',
    name: 'Accountant',
    nameUr: 'اکاؤنٹنٹ',
    permissions: [
      'dashboard.view',
      'sales.view',
      'sales.print',
      'returns.view',
      'returns.create',
      'returns.print',
      'purchases.view',
      'purchases.create',
      'purchases.edit',
      'purchases.print',
      'batches.view',
      'inventory.view',
      'clients.view',
      'recovery.view',
      'suppliers.view',
      'suppliers.create',
      'suppliers.edit',
      'payments.view',
      'payments.create',
      'payments.edit',
      'payments.print',
      'expenses.view',
      'expenses.create',
      'expenses.edit',
      'payroll.view',
      'payroll.create',
      'payroll.edit',
      'payroll.print',
      'reports.view',
      'reports.print',
      'notifications.view',
    ],
  },
  {
    code: 'SALES',
    name: 'Sales Officer',
    nameUr: 'سیلز آفیسر',
    permissions: [
      'dashboard.view',
      'sales.view',
      'sales.create',
      'sales.print',
      'returns.view',
      'returns.create',
      'returns.print',
      'challans.view',
      'challans.create',
      'challans.print',
      'inventory.view',
      'clients.view',
      'clients.create',
      'clients.edit',
      'notifications.view',
    ],
  },
  {
    code: 'RECOVERY_OFFICER',
    name: 'Recovery Officer',
    nameUr: 'ریکوری آفیسر',
    // Section 11 #12: Recovery officer only sees recovery & clients, not profit figures or batches
    permissions: [
      'clients.view',
      'recovery.view',
      'recovery.create',
      'recovery.edit',
      'recovery.print',
      'payments.view',
      'payments.create',
      'payments.print',
      'notifications.view',
    ],
  },
  {
    code: 'STORE_RIDER',
    name: 'Store / Rider',
    nameUr: 'اسٹور / رائیڈر',
    permissions: [
      'challans.view',
      'challans.edit',
      'challans.print',
      'returns.view',
      'inventory.view',
      'notifications.view',
    ],
  },
];
