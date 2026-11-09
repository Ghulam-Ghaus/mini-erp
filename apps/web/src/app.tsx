import { zodResolver } from '@hookform/resolvers/zod';
import {
  changePinSchema,
  hasPermission,
  type AuthSessionResponse,
  type ChangePinInput,
  type PermissionModule,
} from '@mini-erp/shared';
import {
  AppShell,
  Button,
  CommandPalette,
  Dialog,
  FormField,
  StatusBadge,
  TextInput,
  ToastProvider,
  useToast,
  type CommandPaletteItem,
  type NavItem,
  type StatusTone,
  type UserMenuAction,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  changeCurrentPin,
  fetchCurrentSession,
  fetchHealth,
  fetchNotifications,
  fetchSetupStatus,
  getStoredToken,
  setStoredToken,
} from './lib/api.js';
import { DashboardScreen } from './screens/dashboard-screen.js';
import { AuditScreen } from './screens/audit-screen.js';
import { BackupScreen } from './screens/backup-screen.js';
import { BatchesScreen } from './screens/batches-screen.js';
import { ChallansScreen } from './screens/challans-screen.js';
import { Client360Screen } from './screens/client-360-screen.js';
import { ClientsScreen } from './screens/clients-screen.js';
import { ExpensesScreen } from './screens/expenses-screen.js';
import { InventoryScreen } from './screens/inventory-screen.js';
import { ItemsScreen } from './screens/items-screen.js';
import { LockScreen, LoginScreen } from './screens/login-screen.js';
import { NotificationsScreen } from './screens/notifications-screen.js';
import { PaymentsChequesScreen } from './screens/payments-cheques-screen.js';
import { PayrollScreen } from './screens/payroll-screen.js';
import { PurchaseInvoicesScreen } from './screens/purchase-invoices-screen.js';
import { PurchaseReturnsScreen } from './screens/purchase-returns-screen.js';
import { RecoveryScreen } from './screens/recovery-screen.js';
import { ReportsScreen } from './screens/reports-screen.js';
import { RoutesScreen } from './screens/routes-screen.js';
import { SaleReturnsScreen } from './screens/sale-returns-screen.js';
import { SalesInvoicesScreen } from './screens/sales-invoices-screen.js';
import { SettingsScreen } from './screens/settings-screen.js';
import { SetupWizardScreen } from './screens/setup-wizard-screen.js';
import { SupplierLedgerScreen } from './screens/supplier-ledger-screen.js';
import { SuppliersScreen } from './screens/suppliers-screen.js';
import { UsersRolesScreen } from './screens/users-roles-screen.js';

function DotIcon() {
  return <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />;
}

function RootApplication() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(getStoredToken()));
  const [locked, setLocked] = useState(false);
  const [activeNavId, setActiveNavId] = useState('dashboard');
  const [commandOpen, setCommandOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Cross-screen 360° drill-down & prefill state
  const [selectedSupplierIdFor360, setSelectedSupplierIdFor360] = useState<number | null>(null);
  const [prefillSupplierForPurchase, setPrefillSupplierForPurchase] = useState<number | null>(null);
  const [inspectPurchaseId, setInspectPurchaseId] = useState<number | null>(null);
  const [inspectBatchId, setInspectBatchId] = useState<number | null>(null);
  const [prefillPurchaseForReturn, setPrefillPurchaseForReturn] = useState<number | null>(null);
  const [prefillPaymentContext, setPrefillPaymentContext] = useState<{
    supplierId: number;
    purchaseId?: number;
  } | null>(null);

  const [selectedClientIdFor360, setSelectedClientIdFor360] = useState<number | null>(null);
  const [prefillClientForSale, setPrefillClientForSale] = useState<number | null>(null);
  const [inspectSaleId, setInspectSaleId] = useState<number | null>(null);
  const [prefillSaleForReturn, setPrefillSaleForReturn] = useState<number | null>(null);
  const [prefillReceiptContext, setPrefillReceiptContext] = useState<{
    clientId: number;
    saleId?: number;
  } | null>(null);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });

  const setupStatus = useQuery({
    queryKey: ['setup-status'],
    queryFn: fetchSetupStatus,
  });

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: fetchCurrentSession,
    enabled: Boolean(setupStatus.data?.isInitialized && hasToken),
    retry: false,
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => fetchNotifications({ pageSize: 10, unreadOnly: true }),
    enabled: Boolean(hasToken && sessionQuery.data),
    refetchInterval: 60_000,
  });
  const unreadNotificationsCount = notificationsQuery.data?.unreadCount ?? 0;

  useEffect(() => {
    if (sessionQuery.isError && hasToken) {
      setStoredToken(null);
      setHasToken(false);
    }
  }, [sessionQuery.isError, hasToken]);

  useEffect(() => {
    document.title = t('app.name');
  }, [t]);

  const toggleLanguage = useCallback(() => {
    const next = i18n.language === 'ur' ? 'en' : 'ur';
    void i18n.changeLanguage(next);
  }, [i18n]);

  // Auto-lock after inactivity (Section 5.1)
  const lockMinutes = sessionQuery.data?.organization.settings.inactivityLockMinutes ?? 15;
  useEffect(() => {
    if (!sessionQuery.data || locked) return;
    const timeoutMs = Math.max(1, lockMinutes) * 60 * 1000;
    let timer = window.setTimeout(() => setLocked(true), timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLocked(true), timeoutMs);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
    };
  }, [sessionQuery.data, locked, lockMinutes]);

  const changePinForm = useForm<ChangePinInput>({
    resolver: zodResolver(changePinSchema),
    defaultValues: {
      currentPin: '',
      newPin: '',
      confirmPin: '',
    },
  });

  const changePinMutation = useMutation({
    mutationFn: changeCurrentPin,
    onSuccess: () => {
      changePinForm.reset();
      setChangePinOpen(false);
      showToast({ title: t('auth.pinChangedToast'), tone: 'success' });
    },
    onError: (err: unknown) => {
      showToast({
        title: err instanceof Error ? err.message : 'Failed to change PIN',
        tone: 'danger',
      });
    },
  });

  const handleLogout = useCallback(() => {
    setStoredToken(null);
    setHasToken(false);
    setLocked(false);
    queryClient.removeQueries({ queryKey: ['session'] });
    showToast({ title: t('auth.loggedOutToast'), tone: 'neutral' });
  }, [queryClient, showToast, t]);

  const handleLoggedIn = (session: AuthSessionResponse) => {
    setStoredToken(session.accessToken);
    setHasToken(true);
    setLocked(false);
    queryClient.setQueryData(['session'], {
      user: session.user,
      organization: session.organization,
      permissions: session.permissions,
    });
    setActiveNavId('dashboard');
  };

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
  const statusBadge = <StatusBadge tone={healthTone}>{healthLabel}</StatusBadge>;

  const session = sessionQuery.data;

  const can = useCallback(
    (
      module: PermissionModule,
      action: 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'print',
    ) => {
      const userPerms = session?.permissions ?? [];
      const roleCode = session?.user.role.code ?? '';
      return hasPermission(userPerms, roleCode, module, action);
    },
    [session],
  );

  // Filter sidebar items based on user permissions (Section 5.1 & 11 #12)
  const navItems: readonly NavItem[] = useMemo(() => {
    const items: NavItem[] = [];
    if (can('dashboard', 'view')) {
      items.push({ id: 'dashboard', label: t('nav.dashboard'), icon: <DotIcon /> });
    }
    if (can('sales', 'view') || can('returns', 'view') || can('challans', 'view')) {
      items.push({
        id: 'sales',
        label: t('nav.sales'),
        icon: <DotIcon />,
        children: [
          ...(can('sales', 'view')
            ? [{ id: 'sales-invoices', label: t('nav.salesInvoices') }]
            : []),
          ...(can('returns', 'view') ? [{ id: 'sale-returns', label: t('nav.saleReturns') }] : []),
          ...(can('challans', 'view') ? [{ id: 'challans', label: t('nav.challans') }] : []),
        ],
      });
    }
    if (can('purchases', 'view')) {
      items.push({
        id: 'purchases',
        label: t('nav.purchases'),
        icon: <DotIcon />,
        children: [
          { id: 'purchase-invoices', label: t('nav.purchaseInvoices') },
          { id: 'purchase-returns', label: t('nav.purchaseReturns') },
        ],
      });
    }
    if (can('batches', 'view')) {
      items.push({ id: 'batches', label: t('nav.batches'), icon: <DotIcon /> });
    }
    if (can('inventory', 'view')) {
      items.push({ id: 'items', label: t('nav.items'), icon: <DotIcon /> });
      items.push({ id: 'inventory', label: t('nav.inventory'), icon: <DotIcon /> });
    }
    if (can('clients', 'view')) {
      items.push({
        id: 'clients',
        label: t('nav.clients'),
        icon: <DotIcon />,
        children: [
          { id: 'client-list', label: t('nav.clientList') },
          { id: 'client-ledger', label: t('nav.clientLedger') },
          { id: 'routes', label: t('nav.routes') },
        ],
      });
    }
    if (can('recovery', 'view')) {
      items.push({
        id: 'recovery',
        label: t('nav.recovery'),
        icon: <DotIcon />,
        children: [
          { id: 'todays-recovery', label: t('nav.todaysRecovery') },
          { id: 'recovery-entries', label: t('nav.recoveryEntries') },
          { id: 'recovery-schedule', label: t('nav.recoverySchedule') },
        ],
      });
    }
    if (can('suppliers', 'view')) {
      items.push({
        id: 'suppliers',
        label: t('nav.suppliers'),
        icon: <DotIcon />,
        children: [
          { id: 'supplier-list', label: t('nav.supplierList') },
          { id: 'supplier-ledger', label: t('nav.supplierLedger') },
        ],
      });
    }
    if (can('payments', 'view')) {
      items.push({ id: 'payments-cheques', label: t('nav.paymentsCheques'), icon: <DotIcon /> });
    }
    if (can('expenses', 'view')) {
      items.push({ id: 'expenses', label: t('nav.expenses'), icon: <DotIcon /> });
    }
    if (can('payroll', 'view')) {
      items.push({ id: 'payroll', label: t('nav.payroll'), icon: <DotIcon /> });
    }
    if (can('reports', 'view')) {
      items.push({ id: 'reports', label: t('nav.reports'), icon: <DotIcon /> });
    }
    if (can('notifications', 'view')) {
      items.push({
        id: 'notifications',
        label: t('nav.notifications'),
        icon: <DotIcon />,
        badgeCount: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
      });
    }
    if (can('users', 'view')) {
      items.push({ id: 'users-roles', label: t('nav.usersRoles'), icon: <DotIcon /> });
    }
    if (can('audit', 'view')) {
      items.push({ id: 'audit-logs', label: t('nav.auditLogs'), icon: <DotIcon /> });
    }
    if (can('backup', 'view')) {
      items.push({ id: 'backup', label: t('nav.backup'), icon: <DotIcon /> });
    }
    if (can('settings', 'view')) {
      items.push({ id: 'settings', label: t('nav.settings'), icon: <DotIcon /> });
    }
    return items;
  }, [t, can, unreadNotificationsCount]);

  const commandItems: readonly CommandPaletteItem[] = useMemo(
    () => [
      {
        id: 'cmd-lang',
        label: t('shell.languageToggle'),
        onSelect: toggleLanguage,
      },
      {
        id: 'cmd-lock',
        label: t('shell.userMenu.lock'),
        onSelect: () => setLocked(true),
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

  // 1. Loading setup status
  if (setupStatus.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6f2] text-xs text-[#5c5a53]">
        {t('common.loading')}
      </div>
    );
  }

  // 2. First-run wizard when DB has no organization
  if (setupStatus.data && !setupStatus.data.isInitialized) {
    return (
      <SetupWizardScreen
        statusBadge={statusBadge}
        onToggleLanguage={toggleLanguage}
        onInitialized={() => {
          void queryClient.invalidateQueries({ queryKey: ['setup-status'] });
        }}
      />
    );
  }

  // 3. Login screen when not authenticated
  if (!hasToken || !session) {
    return (
      <LoginScreen
        statusBadge={statusBadge}
        onToggleLanguage={toggleLanguage}
        onLoggedIn={handleLoggedIn}
      />
    );
  }

  // 4. Lock screen when locked manually or by inactivity
  if (locked) {
    return (
      <LockScreen
        username={session.user.username}
        statusBadge={statusBadge}
        onToggleLanguage={toggleLanguage}
        onUnlocked={() => setLocked(false)}
        onLogout={handleLogout}
      />
    );
  }

  const handleUserMenuAction = (action: UserMenuAction) => {
    if (action === 'lock') setLocked(true);
    else if (action === 'logout') handleLogout();
    else if (action === 'change-pin') setChangePinOpen(true);
    else if (action === 'profile') setProfileOpen(true);
  };

  const initials =
    `${session.user.firstName[0] ?? ''}${session.user.lastName[0] ?? ''}`.toUpperCase();
  const displayOrgName =
    i18n.language === 'ur' && session.organization.nameUr
      ? session.organization.nameUr
      : session.organization.name;
  const displayRoleName =
    i18n.language === 'ur' && session.user.role.nameUr
      ? session.user.role.nameUr
      : session.user.role.name;

  return (
    <AppShell
      navItems={navItems}
      activeNavId={activeNavId}
      onSelectNav={setActiveNavId}
      user={{
        name: `${session.user.firstName} ${session.user.lastName}`,
        role: displayRoleName,
        initials: initials || 'U',
      }}
      onUserMenuAction={handleUserMenuAction}
      onOpenSearch={() => setCommandOpen(true)}
      onToggleLanguage={toggleLanguage}
      notificationCount={unreadNotificationsCount}
      statusBanner={statusBadge}
      labels={{
        appName: displayOrgName,
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
      {activeNavId === 'users-roles' && can('users', 'view') ? (
        <UsersRolesScreen canCreate={can('users', 'create')} canEdit={can('users', 'edit')} />
      ) : activeNavId === 'settings' && can('settings', 'view') ? (
        <SettingsScreen
          organization={session.organization}
          canEdit={can('settings', 'edit')}
          onUpdated={(updatedOrg) => {
            queryClient.setQueryData(['session'], {
              ...session,
              organization: updatedOrg,
            });
          }}
        />
      ) : activeNavId === 'items' && can('inventory', 'view') ? (
        <ItemsScreen canCreate={can('inventory', 'create')} canEdit={can('inventory', 'edit')} />
      ) : activeNavId === 'batches' && can('batches', 'view') ? (
        <BatchesScreen
          canCreate={can('batches', 'create')}
          canEdit={can('batches', 'edit')}
          inspectBatchId={inspectBatchId}
          onClearInspect={() => setInspectBatchId(null)}
          onOpenSupplier360={(supId) => {
            setSelectedSupplierIdFor360(supId);
            setActiveNavId('supplier-ledger');
          }}
          onOpenPurchaseDetail={(purId) => {
            setInspectPurchaseId(purId);
            setActiveNavId('purchase-invoices');
          }}
        />
      ) : activeNavId === 'inventory' && can('inventory', 'view') ? (
        <InventoryScreen
          onOpenBatch360={(bId) => {
            setInspectBatchId(bId);
            setActiveNavId('batches');
          }}
        />
      ) : (activeNavId === 'suppliers' || activeNavId === 'supplier-list') &&
        can('suppliers', 'view') ? (
        <SuppliersScreen
          canCreate={can('suppliers', 'create')}
          canEdit={can('suppliers', 'edit')}
          canPay={can('payments', 'create')}
          canPurchase={can('purchases', 'create')}
          onOpenSupplier360={(supId) => {
            setSelectedSupplierIdFor360(supId);
            setActiveNavId('supplier-ledger');
          }}
          onRecordPaymentForSupplier={(supId) => {
            setPrefillPaymentContext({ supplierId: supId });
            setActiveNavId('payments-cheques');
          }}
          onNewPurchaseForSupplier={(supId) => {
            setPrefillSupplierForPurchase(supId);
            setActiveNavId('purchase-invoices');
          }}
        />
      ) : activeNavId === 'supplier-ledger' && can('suppliers', 'view') ? (
        <SupplierLedgerScreen
          initialSupplierId={selectedSupplierIdFor360}
          canPay={can('payments', 'create')}
          canPurchase={can('purchases', 'create')}
          onRecordPayment={(supId, purId) => {
            setPrefillPaymentContext({ supplierId: supId, purchaseId: purId });
            setActiveNavId('payments-cheques');
          }}
          onNewPurchase={(supId) => {
            setPrefillSupplierForPurchase(supId);
            setActiveNavId('purchase-invoices');
          }}
          onViewPurchaseInvoice={(purId) => {
            setInspectPurchaseId(purId);
            setActiveNavId('purchase-invoices');
          }}
        />
      ) : (activeNavId === 'purchases' || activeNavId === 'purchase-invoices') &&
        can('purchases', 'view') ? (
        <PurchaseInvoicesScreen
          canCreate={can('purchases', 'create')}
          canVoid={can('purchases', 'delete')}
          canPay={can('payments', 'create')}
          canReturn={can('purchases', 'create')}
          taxEnabled={session.organization.settings.taxEnabled}
          defaultTaxRate={session.organization.settings.defaultTaxRate}
          prefillSupplierId={prefillSupplierForPurchase}
          inspectPurchaseId={inspectPurchaseId}
          onClearPrefill={() => {
            setPrefillSupplierForPurchase(null);
            setInspectPurchaseId(null);
          }}
          onOpenSupplier360={(supId) => {
            setSelectedSupplierIdFor360(supId);
            setActiveNavId('supplier-ledger');
          }}
          onRecordPayment={(supId, purId) => {
            setPrefillPaymentContext({ supplierId: supId, purchaseId: purId });
            setActiveNavId('payments-cheques');
          }}
          onCreateReturnFromPurchase={(purId) => {
            setPrefillPurchaseForReturn(purId);
            setActiveNavId('purchase-returns');
          }}
        />
      ) : activeNavId === 'purchase-returns' && can('purchases', 'view') ? (
        <PurchaseReturnsScreen
          canCreate={can('purchases', 'create')}
          prefillPurchaseId={prefillPurchaseForReturn}
          onClearPrefill={() => setPrefillPurchaseForReturn(null)}
          onOpenSupplier360={(supId) => {
            setSelectedSupplierIdFor360(supId);
            setActiveNavId('supplier-ledger');
          }}
          onViewPurchaseInvoice={(purId) => {
            setInspectPurchaseId(purId);
            setActiveNavId('purchase-invoices');
          }}
        />
      ) : activeNavId === 'payments-cheques' && can('payments', 'view') ? (
        <PaymentsChequesScreen
          canCreate={can('payments', 'create')}
          canEdit={can('payments', 'edit')}
          canVoid={can('payments', 'delete')}
          prefillClientId={prefillReceiptContext?.clientId ?? null}
          prefillSaleId={prefillReceiptContext?.saleId ?? null}
          prefillSupplierId={prefillPaymentContext?.supplierId ?? null}
          prefillPurchaseId={prefillPaymentContext?.purchaseId ?? null}
          onClearPrefill={() => {
            setPrefillPaymentContext(null);
            setPrefillReceiptContext(null);
          }}
          onOpenClient360={(cId) => {
            setSelectedClientIdFor360(cId);
            setActiveNavId('client-ledger');
          }}
          onViewSaleInvoice={(sId) => {
            setInspectSaleId(sId);
            setActiveNavId('sales-invoices');
          }}
          onOpenSupplier360={(supId) => {
            setSelectedSupplierIdFor360(supId);
            setActiveNavId('supplier-ledger');
          }}
          onViewPurchaseInvoice={(purId) => {
            setInspectPurchaseId(purId);
            setActiveNavId('purchase-invoices');
          }}
        />
      ) : (activeNavId === 'sales' || activeNavId === 'sales-invoices') && can('sales', 'view') ? (
        <SalesInvoicesScreen
          canCreate={can('sales', 'create')}
          canVoid={can('sales', 'delete')}
          canReceivePayment={can('payments', 'create')}
          taxEnabled={session.organization.settings.taxEnabled}
          defaultTaxRate={session.organization.settings.defaultTaxRate}
          initialClientIdForNewSale={prefillClientForSale}
          inspectSaleId={inspectSaleId}
          onClearInitial={() => {
            setPrefillClientForSale(null);
            setInspectSaleId(null);
          }}
          onOpenClient360={(cId) => {
            setSelectedClientIdFor360(cId);
            setActiveNavId('client-ledger');
          }}
          onOpenBatchWorkspace={(bId) => {
            setInspectBatchId(bId);
            setActiveNavId('batches');
          }}
          onCreateCreditNote={(sId) => {
            setPrefillSaleForReturn(sId);
            setActiveNavId('sale-returns');
          }}
          onReceivePayment={(cId, sId) => {
            setPrefillReceiptContext({ clientId: cId, saleId: sId });
            setActiveNavId('payments-cheques');
          }}
        />
      ) : activeNavId === 'sale-returns' && can('returns', 'view') ? (
        <SaleReturnsScreen
          canCreate={can('returns', 'create')}
          canVoid={can('returns', 'delete')}
          initialSaleIdForReturn={prefillSaleForReturn}
          onClearInitialSale={() => setPrefillSaleForReturn(null)}
          onOpenClient360={(cId) => {
            setSelectedClientIdFor360(cId);
            setActiveNavId('client-ledger');
          }}
          onViewSaleInvoice={(sId) => {
            setInspectSaleId(sId);
            setActiveNavId('sales-invoices');
          }}
        />
      ) : (activeNavId === 'clients' || activeNavId === 'client-list') && can('clients', 'view') ? (
        <ClientsScreen
          canCreate={can('clients', 'create')}
          canEdit={can('clients', 'edit')}
          onOpenClient360={(cId) => {
            setSelectedClientIdFor360(cId);
            setActiveNavId('client-ledger');
          }}
          onCreateSaleForClient={(cId) => {
            setPrefillClientForSale(cId);
            setActiveNavId('sales-invoices');
          }}
        />
      ) : activeNavId === 'client-ledger' && can('clients', 'view') ? (
        <Client360Screen
          initialClientId={selectedClientIdFor360}
          canCreateSale={can('sales', 'create')}
          canReceivePayment={can('payments', 'create')}
          onNewSale={(cId) => {
            setPrefillClientForSale(cId);
            setActiveNavId('sales-invoices');
          }}
          onReceivePayment={(cId) => {
            setPrefillReceiptContext({ clientId: cId });
            setActiveNavId('payments-cheques');
          }}
          onViewSaleInvoice={(sId) => {
            setInspectSaleId(sId);
            setActiveNavId('sales-invoices');
          }}
          onCreateCreditNote={(sId) => {
            setPrefillSaleForReturn(sId);
            setActiveNavId('sale-returns');
          }}
        />
      ) : activeNavId === 'routes' && can('clients', 'view') ? (
        <RoutesScreen canCreate={can('clients', 'create')} canEdit={can('clients', 'edit')} />
      ) : activeNavId === 'challans' && can('sales', 'view') ? (
        <ChallansScreen />
      ) : activeNavId === 'expenses' && can('expenses', 'view') ? (
        <ExpensesScreen />
      ) : activeNavId === 'payroll' && can('payroll', 'view') ? (
        <PayrollScreen />
      ) : activeNavId === 'reports' && can('reports', 'view') ? (
        <ReportsScreen />
      ) : activeNavId === 'notifications' && can('notifications', 'view') ? (
        <NotificationsScreen onNavigate={setActiveNavId} />
      ) : activeNavId === 'audit-logs' && can('audit', 'view') ? (
        <AuditScreen />
      ) : activeNavId === 'backup' && can('backup', 'view') ? (
        <BackupScreen />
      ) : (activeNavId === 'recovery' ||
          activeNavId === 'todays-recovery' ||
          activeNavId === 'recovery-entries' ||
          activeNavId === 'recovery-schedule') &&
        can('recovery', 'view') ? (
        <RecoveryScreen
          activeSubView={
            activeNavId === 'recovery-entries'
              ? 'recovery-entries'
              : activeNavId === 'recovery-schedule'
                ? 'recovery-schedule'
                : 'todays-recovery'
          }
          onChangeSubView={(sub) => setActiveNavId(sub)}
          canCreate={can('recovery', 'create')}
          onOpenClient360={(cId) => {
            setSelectedClientIdFor360(cId);
            setActiveNavId('client-ledger');
          }}
        />
      ) : (
        <DashboardScreen
          orgName={displayOrgName}
          currency={session.organization.currency}
          canManageUsers={can('users', 'view')}
          canManageSettings={can('settings', 'view')}
          onNavigate={setActiveNavId}
        />
      )}

      {/* Change PIN Dialog */}
      <Dialog
        open={changePinOpen}
        title={t('auth.changePinTitle')}
        onClose={() => setChangePinOpen(false)}
        maxWidthClass="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChangePinOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={changePinMutation.isPending}
              onClick={() =>
                void changePinForm.handleSubmit((vals) => changePinMutation.mutate(vals))()
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 p-4">
          <FormField
            label={t('auth.currentPin')}
            htmlFor="chg-current-pin"
            required
            error={changePinForm.formState.errors.currentPin?.message}
          >
            <TextInput
              id="chg-current-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              hasError={Boolean(changePinForm.formState.errors.currentPin)}
              {...changePinForm.register('currentPin')}
            />
          </FormField>

          <FormField
            label={t('auth.newPin')}
            htmlFor="chg-new-pin"
            required
            error={changePinForm.formState.errors.newPin?.message}
          >
            <TextInput
              id="chg-new-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              hasError={Boolean(changePinForm.formState.errors.newPin)}
              {...changePinForm.register('newPin')}
            />
          </FormField>

          <FormField
            label={t('auth.confirmNewPin')}
            htmlFor="chg-confirm-pin"
            required
            error={changePinForm.formState.errors.confirmPin?.message}
          >
            <TextInput
              id="chg-confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              hasError={Boolean(changePinForm.formState.errors.confirmPin)}
              {...changePinForm.register('confirmPin')}
            />
          </FormField>
        </div>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog
        open={profileOpen}
        title={t('auth.profileTitle')}
        onClose={() => setProfileOpen(false)}
        maxWidthClass="max-w-sm"
        footer={
          <Button variant="secondary" onClick={() => setProfileOpen(false)}>
            {t('common.cancel')}
          </Button>
        }
      >
        <dl className="grid grid-cols-1 gap-2.5 p-4 text-xs">
          <div>
            <dt className="text-[#8c8980]">{t('users.colName')}</dt>
            <dd className="font-semibold text-[#1f1e1b]">
              {session.user.firstName} {session.user.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-[#8c8980]">{t('users.colUsername')}</dt>
            <dd className="font-semibold text-[#1f1e1b]">{session.user.username}</dd>
          </div>
          <div>
            <dt className="text-[#8c8980]">{t('users.colRole')}</dt>
            <dd className="font-semibold text-[#1f1e1b]">{displayRoleName}</dd>
          </div>
          <div>
            <dt className="text-[#8c8980]">{t('setup.orgName')}</dt>
            <dd className="font-semibold text-[#1f1e1b]">{displayOrgName}</dd>
          </div>
        </dl>
      </Dialog>

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
      <RootApplication />
    </ToastProvider>
  );
}
