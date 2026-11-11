import {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
  type NotificationDto,
  type NotificationSeverity,
  type NotificationType,
  type PageSizeOption,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  FilterBar,
  IntegerText,
  PageHeader,
  Pagination,
  StatusBadge,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  triggerNotificationScan,
} from '../lib/api.js';

export interface NotificationsScreenProps {
  readonly onNavigate?: (navId: string) => void;
}

export function NotificationsScreen({ onNavigate }: NotificationsScreenProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ['notifications', page, pageSize, search, typeFilter, severityFilter, unreadOnly],
    queryFn: () =>
      fetchNotifications({
        page,
        pageSize,
        search: search.trim() || undefined,
        type: typeFilter ? (typeFilter as NotificationType) : undefined,
        severity: severityFilter ? (severityFilter as NotificationSeverity) : undefined,
        unreadOnly,
      }),
  });

  const scanMutation = useMutation({
    mutationFn: triggerNotificationScan,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({
        title:
          res.createdCount > 0
            ? t('notifications.scanNewAlerts', {
                count: res.createdCount,
                defaultValue: `Alert scan complete: ${res.createdCount} new notifications generated.`,
              })
            : t('notifications.scanNoNewAlerts', 'Alert scan complete: all records up to date.'),
        tone: res.createdCount > 0 ? 'neutral' : 'success',
      });
    },
    onError: (err: Error) => {
      showToast({ title: err.message, tone: 'danger' });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({
        title: t('notifications.allMarkedRead', {
          count: res.count,
          defaultValue: `Marked ${res.count} notifications as read.`,
        }),
        tone: 'success',
      });
    },
  });

  const handleNavigateRef = useCallback(
    (row: NotificationDto) => {
      if (!onNavigate) return;
      if (row.refType === 'CHEQUE') {
        onNavigate('cheques-register');
      } else if (row.refType === 'CLIENT') {
        onNavigate('todays-recovery');
      } else if (row.refType === 'BATCH') {
        onNavigate('batches');
      } else if (row.refType === 'BACKUP') {
        onNavigate('backup');
      }
    },
    [onNavigate],
  );

  const columns = useMemo<ColumnDef<NotificationDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'severity',
        header: t('notifications.colSeverity', 'Severity'),
        cell: ({ row }) => {
          const sev = row.original.severity;
          const tone = sev === 'CRITICAL' ? 'danger' : sev === 'WARNING' ? 'warning' : 'neutral';
          return <StatusBadge tone={tone}>{sev}</StatusBadge>;
        },
      },
      {
        accessorKey: 'title',
        header: t('notifications.colTitle', 'Notification'),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span
              className={`text-xs ${
                row.original.isRead ? 'text-[#5c5a53]' : 'font-semibold text-[#1f1e1b]'
              }`}
            >
              {row.original.title}
            </span>
            <span className="text-[11px] text-[#8c8980]">{row.original.body}</span>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: t('notifications.colType', 'Type'),
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-[#5c5a53]">{row.original.type}</span>
        ),
      },
      {
        accessorKey: 'dueAt',
        header: t('notifications.colDueAt', 'Due Date'),
        cell: ({ row }) => (
          <span className="text-xs text-[#5c5a53]">{row.original.dueAt ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: t('notifications.colCreatedAt', 'Time'),
        cell: ({ row }) => {
          const date = new Date(row.original.createdAt);
          return (
            <span className="text-xs text-[#8c8980]">
              {date.toLocaleDateString()}{' '}
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          );
        },
      },
      {
        accessorKey: 'isRead',
        header: t('notifications.colStatus', 'Status'),
        cell: ({ row }) => (
          <StatusBadge tone={row.original.isRead ? 'neutral' : 'info'}>
            {row.original.isRead
              ? t('notifications.read', 'Read')
              : t('notifications.unread', 'Unread')}
          </StatusBadge>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {!row.original.isRead && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markReadMutation.mutate(row.original.id)}
              >
                {t('notifications.markRead', 'Mark Read')}
              </Button>
            )}
            {row.original.refType && onNavigate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!row.original.isRead) {
                    markReadMutation.mutate(row.original.id);
                  }
                  handleNavigateRef(row.original);
                }}
              >
                {t('notifications.viewRecord', 'View')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, markReadMutation, handleNavigateRef, onNavigate],
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('notifications.title', 'Notifications & Alerts')}
        subtitle={t(
          'notifications.subtitle',
          'Hourly automated checks for cheques due, bounced cheques, recovery due, low batch stock, credit limits, and backup status',
        )}
        secondaryActions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              {t('notifications.markAllRead', 'Mark All Read')}
            </Button>
            <Button
              variant="primary"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {t('notifications.scanNow', 'Scan For Alerts Now')}
            </Button>
          </div>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder={t(
          'notifications.searchPlaceholder',
          'Search notification title or message...',
        )}
        selects={[
          {
            id: 'severity',
            label: t('notifications.severity', 'Severity'),
            value: severityFilter,
            allLabel: t('notifications.allSeverities', 'All Severities'),
            options: NOTIFICATION_SEVERITIES.map((sev) => ({ value: sev, label: sev })),
            onChange: (val) => {
              setSeverityFilter(val);
              setPage(1);
            },
          },
          {
            id: 'type',
            label: t('notifications.type', 'Type'),
            value: typeFilter,
            allLabel: t('notifications.allTypes', 'All Types'),
            options: NOTIFICATION_TYPES.map((type) => ({ value: type, label: type })),
            onChange: (val) => {
              setTypeFilter(val);
              setPage(1);
            },
          },
        ]}
        extra={
          <label className="flex items-center gap-1.5 text-xs text-[#5c5a53] cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-[#d6d3c9] text-[#2c2b28]"
            />
            <span>{t('notifications.unreadOnly', 'Unread Only')}</span>
          </label>
        }
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setSearch('');
          setTypeFilter('');
          setSeverityFilter('');
          setUnreadOnly(false);
          setPage(1);
        }}
      />

      <div className="flex-1 overflow-auto">
        <DataTable
          columns={columns}
          data={notificationsQuery.data?.data ?? []}
          isLoading={notificationsQuery.isLoading}
          emptyTitle={t('notifications.emptyTitle', 'No notifications found')}
          emptyDescription={t(
            'notifications.emptyDescription',
            'All operational alerts and automated reminders will appear here.',
          )}
        />
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={notificationsQuery.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        labels={{
          rowsPerPage: t('pagination.rowsPerPage', 'Rows per page'),
          showingRange: (from, to, total) => `${from}-${to} of ${total}`,
          firstPage: t('pagination.firstPage', 'First page'),
          previousPage: t('pagination.previousPage', 'Previous page'),
          nextPage: t('pagination.nextPage', 'Next page'),
          lastPage: t('pagination.lastPage', 'Last page'),
        }}
      />
    </div>
  );
}
