import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditLogDto,
  type PageSizeOption,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  Dialog,
  FilterBar,
  IntegerText,
  PageHeader,
  Pagination,
  StatusBadge,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAuditLogs } from '../lib/api.js';

function actionTone(action: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  switch (action) {
    case 'CREATE':
    case 'CREATE_BACKUP':
    case 'SETUP':
      return 'success';
    case 'CANCEL':
    case 'VOID':
    case 'VOID_COST':
      return 'danger';
    case 'CLOSE':
    case 'RESTORE_DATABASE':
      return 'warning';
    case 'UPDATE':
    case 'ALLOCATE_PURCHASE':
    case 'ADD_COST':
    case 'UPDATE_WASTAGE':
    case 'ADJUST_STOCK':
      return 'info';
    default:
      return 'neutral';
  }
}

export function AuditScreen() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedLog, setSelectedLog] = useState<AuditLogDto | null>(null);

  const query = useQuery({
    queryKey: ['audit-logs', page, pageSize, search, actionFilter, entityFilter, dateFrom, dateTo],
    queryFn: () =>
      fetchAuditLogs({
        page,
        pageSize,
        search: search.trim() || undefined,
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const columns = useMemo<ColumnDef<AuditLogDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'createdAt',
        header: t('audit.colTime', 'Timestamp'),
        cell: ({ row }) => {
          const d = new Date(row.original.createdAt);
          return (
            <span className="font-mono text-xs text-[#5c5a53]">
              {d.toLocaleDateString()}{' '}
              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          );
        },
      },
      {
        accessorKey: 'action',
        header: t('audit.colAction', 'Action'),
        cell: ({ row }) => (
          <StatusBadge tone={actionTone(row.original.action)}>{row.original.action}</StatusBadge>
        ),
      },
      {
        accessorKey: 'entity',
        header: t('audit.colEntity', 'Entity'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-xs text-[#1f1e1b]">{row.original.entity}</span>
            {row.original.entityId && (
              <span className="font-mono text-[11px] text-[#8c8980]">#{row.original.entityId}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'user',
        header: t('audit.colUser', 'User'),
        cell: ({ row }) => {
          const user = row.original.user;
          return (
            <span className="text-xs text-[#5c5a53]">
              {user ? `${user.fullName} (@${user.username})` : '— (System)'}
            </span>
          );
        },
      },
      {
        id: 'diff',
        header: t('common.details', 'Details'),
        cell: ({ row }) => {
          const hasDiff =
            row.original.beforeJson !== undefined || row.original.afterJson !== undefined;
          if (!hasDiff) return <span className="text-xs text-[#8c8980]">—</span>;
          return (
            <Button size="sm" variant="ghost" onClick={() => setSelectedLog(row.original)}>
              {t('audit.viewDiff', 'Inspect Diff')}
            </Button>
          );
        },
      },
    ],
    [t],
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('audit.title', 'Audit Log')}
        subtitle={t(
          'audit.subtitle',
          'Complete immutable record of all data modifications, deletions, financial postings, and system actions',
        )}
      />

      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder={t('audit.searchPlaceholder', 'Search action, entity, or username...')}
        dateFrom={dateFrom}
        onDateFromChange={(val) => {
          setDateFrom(val);
          setPage(1);
        }}
        dateTo={dateTo}
        onDateToChange={(val) => {
          setDateTo(val);
          setPage(1);
        }}
        selects={[
          {
            id: 'action',
            label: t('audit.action', 'Action'),
            value: actionFilter,
            allLabel: t('audit.allActions', 'All Actions'),
            options: AUDIT_ACTIONS.map((a: AuditAction) => ({ value: a, label: a })),
            onChange: (val) => {
              setActionFilter(val);
              setPage(1);
            },
          },
        ]}
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setSearch('');
          setActionFilter('');
          setEntityFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <div className="flex-1 overflow-auto">
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          isLoading={query.isLoading}
          emptyTitle={t('audit.emptyTitle', 'No audit entries found')}
          emptyDescription={t(
            'audit.emptyDescription',
            'All administrative, financial, and operational operations will appear here.',
          )}
        />
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={query.data?.total ?? 0}
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

      {selectedLog && (
        <Dialog
          open={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={t('audit.diffTitle', 'Audit Record #{{id}} — {{action}} on {{entity}}', {
            id: selectedLog.id,
            action: selectedLog.action,
            entity: selectedLog.entity,
          })}
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="grid grid-cols-2 gap-2 border-b border-[#eae8e1] pb-3 text-[#5c5a53]">
              <div>
                <span className="font-semibold text-[#1f1e1b]">{t('audit.colUser', 'User')}: </span>
                {selectedLog.user
                  ? `${selectedLog.user.fullName} (@${selectedLog.user.username})`
                  : 'System'}
              </div>
              <div>
                <span className="font-semibold text-[#1f1e1b]">
                  {t('audit.colTime', 'Timestamp')}:{' '}
                </span>
                {new Date(selectedLog.createdAt).toLocaleString()}
              </div>
              {selectedLog.entityId && (
                <div>
                  <span className="font-semibold text-[#1f1e1b]">
                    {t('audit.entityId', 'Entity ID')}:{' '}
                  </span>
                  #{selectedLog.entityId}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-[#9e3b33]">
                  {t('audit.beforeJson', 'Before Change (Snapshot)')}
                </span>
                <pre className="h-64 overflow-auto rounded border border-[#eae8e1] bg-[#faf9f5] p-2.5 font-mono text-[11px] text-[#2c2b28]">
                  {selectedLog.beforeJson !== undefined && selectedLog.beforeJson !== null
                    ? JSON.stringify(selectedLog.beforeJson, null, 2)
                    : t('audit.noBefore', '(None / Newly created)')}
                </pre>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-[#2c6b48]">
                  {t('audit.afterJson', 'After Change (Result)')}
                </span>
                <pre className="h-64 overflow-auto rounded border border-[#eae8e1] bg-[#faf9f5] p-2.5 font-mono text-[11px] text-[#2c2b28]">
                  {selectedLog.afterJson !== undefined && selectedLog.afterJson !== null
                    ? JSON.stringify(selectedLog.afterJson, null, 2)
                    : t('audit.noAfter', '(None / Deleted or Voided)')}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                {t('common.close', 'Close')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
