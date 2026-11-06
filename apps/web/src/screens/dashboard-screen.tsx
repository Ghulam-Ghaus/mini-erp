import { Button, EmptyState, MoneyText, PageHeader, StatCard, SurfaceCard } from '@mini-erp/ui';
import { useTranslation } from 'react-i18next';

export interface DashboardScreenProps {
  readonly orgName: string;
  readonly currency: string;
  readonly canManageUsers: boolean;
  readonly canManageSettings: boolean;
  readonly onNavigate: (navId: string) => void;
}

export function DashboardScreen({
  orgName,
  currency,
  canManageUsers,
  canManageSettings,
  onNavigate,
}: DashboardScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle', { orgName })} />

      <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-4">
        <StatCard
          label={t('dashboard.totalSales')}
          value={<MoneyText value="0.00" currency={currency} />}
        />
        <StatCard
          label={t('dashboard.totalReceived')}
          value={<MoneyText value="0.00" currency={currency} />}
        />
        <StatCard
          label={t('dashboard.totalReceivable')}
          value={<MoneyText value="0.00" currency={currency} />}
        />
        <StatCard
          label={t('dashboard.grossProfit')}
          value={<MoneyText value="0.00" currency={currency} />}
        />
      </div>

      <div className="px-5 pb-5">
        <SurfaceCard>
          <EmptyState
            title={t('dashboard.emptyTitle')}
            description={t('dashboard.emptyDescription')}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {canManageUsers && (
                  <Button variant="primary" onClick={() => onNavigate('users-roles')}>
                    {t('dashboard.manageUsers')}
                  </Button>
                )}
                {canManageSettings && (
                  <Button variant="secondary" onClick={() => onNavigate('settings')}>
                    {t('dashboard.orgSettings')}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => onNavigate('sales-invoices')}>
                  {t('dashboard.uiShowcase')}
                </Button>
              </div>
            }
          />
        </SurfaceCard>
      </div>
    </div>
  );
}
