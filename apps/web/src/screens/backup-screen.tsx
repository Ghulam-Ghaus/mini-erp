import {
  BACKUP_STATUSES,
  BACKUP_TYPES,
  type BackupLogDto,
  type BackupStatus,
  type BackupType,
  type PageSizeOption,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  Dialog,
  FilterBar,
  FormField,
  IntegerText,
  PageHeader,
  Pagination,
  StatusBadge,
  TextInput,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createManualBackup,
  downloadBackupArchive,
  fetchBackupLogs,
  fetchBackupSummary,
  openBackupFolderApi,
  restoreBackup,
  restoreBackupFromFile,
} from '../lib/api.js';

function typeTone(type: BackupType): 'info' | 'neutral' | 'warning' {
  switch (type) {
    case 'MANUAL':
      return 'info';
    case 'PRE_RESTORE':
      return 'warning';
    case 'AUTO':
    default:
      return 'neutral';
  }
}

function statusTone(status: BackupStatus): 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'RUNNING':
    default:
      return 'warning';
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function BackupScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [restoreTarget, setRestoreTarget] = useState<BackupLogDto | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConfirmInput, setImportConfirmInput] = useState('');

  const summaryQuery = useQuery({
    queryKey: ['backup-summary'],
    queryFn: fetchBackupSummary,
  });

  const logsQuery = useQuery({
    queryKey: ['backup-logs', page, pageSize, typeFilter, statusFilter],
    queryFn: () =>
      fetchBackupLogs({
        page,
        pageSize,
        type: typeFilter ? (typeFilter as BackupType) : undefined,
        status: statusFilter ? (statusFilter as BackupStatus) : undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: () => createManualBackup('MANUAL'),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['backup-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['backup-summary'] });
      showToast({
        title: t('backup.createSuccess', 'Database backup completed successfully ({{size}})', {
          size: res.sizeFormatted ?? 'OK',
        }),
        tone: 'success',
      });
    },
    onError: (err: Error) => {
      showToast({
        title: err.message || t('backup.createFailed', 'Backup generation failed'),
        tone: 'danger',
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => restoreBackup(id, 'RESTORE'),
    onSuccess: (res) => {
      void queryClient.invalidateQueries();
      setRestoreTarget(null);
      setConfirmInput('');
      showToast({
        title: t(
          'backup.restoreSuccess',
          'Database restored successfully. Pre-restore safety backup #{{preId}} created.',
          { preId: res.preRestoreBackupId },
        ),
        tone: 'success',
      });
    },
    onError: (err: Error) => {
      showToast({
        title: err.message || t('backup.restoreFailed', 'Restore failed'),
        tone: 'danger',
      });
    },
  });

  const importRestoreMutation = useMutation({
    mutationFn: (file: File) => restoreBackupFromFile(file, 'RESTORE'),
    onSuccess: (res) => {
      void queryClient.invalidateQueries();
      setImportOpen(false);
      setImportFile(null);
      setImportConfirmInput('');
      showToast({
        title: t(
          'backup.restoreSuccess',
          'Database restored successfully. Pre-restore safety backup #{{preId}} created.',
          { preId: res.preRestoreBackupId },
        ),
        tone: 'success',
      });
    },
    onError: (err: Error) => {
      showToast({
        title: err.message || t('backup.restoreFailed', 'Restore failed'),
        tone: 'danger',
      });
    },
  });

  const summary = summaryQuery.data;

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownload = useCallback(
    async (id: number) => {
      try {
        setDownloadingId(id);
        await downloadBackupArchive(id);
      } catch (err) {
        showToast({
          title: err instanceof Error ? err.message : t('backup.downloadFailed', 'Download failed'),
          tone: 'danger',
        });
      } finally {
        setDownloadingId(null);
      }
    },
    [showToast, t],
  );

  const handleOpenFolder = useCallback(
    async (folderPath?: string | null) => {
      const target = folderPath || summary?.backupDir;
      if (window.desktop?.openFolder && target) {
        const ok = await window.desktop.openFolder(target);
        if (ok) return;
      }
      try {
        const res = await openBackupFolderApi();
        if (res.opened) {
          showToast({ title: `Opened folder: ${res.path}`, tone: 'success' });
          return;
        }
        await navigator.clipboard?.writeText(res.path);
        showToast({ title: `Backup folder path copied: ${res.path}`, tone: 'neutral' });
      } catch {
        if (target) {
          await navigator.clipboard?.writeText(target).catch(() => undefined);
          showToast({ title: `Backup folder path: ${target}`, tone: 'neutral' });
        } else {
          showToast({
            title: t('backup.folderUnavailable', 'Backup folder path not available yet'),
            tone: 'warning',
          });
        }
      }
    },
    [summary?.backupDir, showToast, t],
  );

  const columns = useMemo<ColumnDef<BackupLogDto, unknown>[]>(
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
        header: t('backup.colTime', 'Created At'),
        cell: ({ row }) => {
          const d = new Date(row.original.createdAt);
          return (
            <span className="font-mono text-xs text-[#5c5a53]">
              {d.toLocaleDateString()}{' '}
              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          );
        },
      },
      {
        accessorKey: 'type',
        header: t('backup.colType', 'Type'),
        cell: ({ row }) => (
          <StatusBadge tone={typeTone(row.original.type)}>{row.original.type}</StatusBadge>
        ),
      },
      {
        accessorKey: 'status',
        header: t('backup.colStatus', 'Status'),
        cell: ({ row }) => (
          <StatusBadge tone={statusTone(row.original.status)}>{row.original.status}</StatusBadge>
        ),
      },
      {
        accessorKey: 'sizeBytes',
        header: t('backup.colSize', 'Size'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[#1f1e1b]">
            {row.original.sizeFormatted ??
              (row.original.sizeBytes ? formatBytes(row.original.sizeBytes) : '—')}
          </span>
        ),
      },
      {
        accessorKey: 'error',
        header: t('backup.colNotes', 'Details / Error'),
        cell: ({ row }) => (
          <span className="text-xs text-[#8c8980]">
            {row.original.error ||
              (row.original.finishedAt ? t('backup.completed', 'Completed') : '—')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          if (row.original.status !== 'SUCCESS') return null;
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={downloadingId === row.original.id}
                onClick={() => void handleDownload(row.original.id)}
              >
                {downloadingId === row.original.id
                  ? t('backup.downloading', 'Downloading...')
                  : t('backup.download', 'Download ZIP')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRestoreTarget(row.original)}>
                {t('backup.restore', 'Restore')}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, downloadingId, handleDownload],
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('backup.title', 'Database Backup & Restore')}
        subtitle={t(
          'backup.subtitle',
          'Automated daily backups, compressed archive generation with proofs/uploads, retention management, and secure database restore',
        )}
        secondaryActions={
          <div className="flex items-center gap-2">
            {summary?.backupDir && (
              <Button variant="secondary" onClick={() => void handleOpenFolder(summary.backupDir)}>
                {t('backup.openFolder', 'Open Backup Folder')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setImportFile(null);
                setImportConfirmInput('');
                setImportOpen(true);
              }}
            >
              {t('backup.importRestore', 'Import & Restore .zip')}
            </Button>
            <Button
              variant="primary"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? t('backup.creating', 'Generating Backup...')
                : t('backup.createNow', 'Create Backup Now')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border-b border-[#eae8e1] bg-white">
        <div className="flex flex-col gap-1 rounded border border-[#eae8e1] p-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#8c8980]">
            {t('backup.lastBackup', 'Last Successful Backup')}
          </span>
          <span className="font-mono text-sm font-semibold text-[#1f1e1b]">
            {summary?.lastBackupAt
              ? new Date(summary.lastBackupAt).toLocaleString()
              : t('backup.never', 'Never')}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded border border-[#eae8e1] p-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#8c8980]">
            {t('backup.totalBackups', 'Total Stored Backups')}
          </span>
          <span className="font-mono text-sm font-semibold text-[#1f1e1b]">
            {summary?.totalBackups ?? 0}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded border border-[#eae8e1] p-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#8c8980]">
            {t('backup.totalSize', 'Total Archive Size')}
          </span>
          <span className="font-mono text-sm font-semibold text-[#1f1e1b]">
            {summary ? formatBytes(summary.totalSizeBytes) : '0 B'}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded border border-[#eae8e1] p-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[#8c8980]">
            {t('backup.retentionPolicy', 'Retention Policy')}
          </span>
          <span className="text-xs text-[#5c5a53]">
            {t('backup.retentionNotice', 'Last {{count}} backups preserved automatically.', {
              count: summary?.retentionCount ?? 30,
            })}
          </span>
        </div>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('backup.searchPlaceholder', 'Filter backups...')}
        selects={[
          {
            id: 'type',
            label: t('backup.type', 'Type'),
            value: typeFilter,
            allLabel: t('backup.allTypes', 'All Types'),
            options: BACKUP_TYPES.map((type: BackupType) => ({ value: type, label: type })),
            onChange: (val) => {
              setTypeFilter(val);
              setPage(1);
            },
          },
          {
            id: 'status',
            label: t('backup.status', 'Status'),
            value: statusFilter,
            allLabel: t('backup.allStatuses', 'All Statuses'),
            options: BACKUP_STATUSES.map((status: BackupStatus) => ({
              value: status,
              label: status,
            })),
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setTypeFilter('');
          setStatusFilter('');
          setPage(1);
        }}
      />

      <div className="flex-1 overflow-auto">
        <DataTable
          columns={columns}
          data={logsQuery.data?.data ?? []}
          isLoading={logsQuery.isLoading}
          emptyTitle={t('backup.emptyTitle', 'No backup archives found')}
          emptyDescription={t(
            'backup.emptyDescription',
            'Click "Create Backup Now" to generate an immediate backup archive.',
          )}
        />
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={logsQuery.data?.total ?? 0}
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

      {restoreTarget && (
        <Dialog
          open={Boolean(restoreTarget)}
          onClose={() => {
            if (!restoreMutation.isPending) {
              setRestoreTarget(null);
              setConfirmInput('');
            }
          }}
          title={t('backup.restoreConfirmTitle', 'Confirm Database Restore')}
          maxWidthClass="max-w-md"
          footer={
            <>
              <Button
                variant="secondary"
                disabled={restoreMutation.isPending}
                onClick={() => {
                  setRestoreTarget(null);
                  setConfirmInput('');
                }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={confirmInput !== 'RESTORE' || restoreMutation.isPending}
                onClick={() => restoreMutation.mutate(restoreTarget.id)}
              >
                {restoreMutation.isPending
                  ? t('backup.restoring', 'Restoring...')
                  : t('backup.confirmRestore', 'Confirm & Restore')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 p-4 text-xs">
            <div className="rounded border border-[#ead0cd] bg-[#fbf2f1] p-3 text-[#9e3b33]">
              <p className="font-semibold">
                {t('backup.restoreWarningTitle', 'High Risk Action: Database Snapshot Overwrite')}
              </p>
              <p className="mt-1 leading-relaxed">
                {t(
                  'backup.restoreWarningBody',
                  'Restoring this backup (ID: {{id}}, created: {{date}}) will replace existing database records. An automated pre-restore backup will be created immediately before restore to protect current data.',
                  {
                    id: restoreTarget.id,
                    date: new Date(restoreTarget.createdAt).toLocaleString(),
                  },
                )}
              </p>
            </div>

            <FormField
              label={t('backup.typeRestoreToConfirm', 'Type "RESTORE" to confirm:')}
              required
            >
              <TextInput
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="RESTORE"
                autoFocus
              />
            </FormField>
          </div>
        </Dialog>
      )}

      <Dialog
        open={importOpen}
        onClose={() => {
          if (!importRestoreMutation.isPending) {
            setImportOpen(false);
            setImportFile(null);
            setImportConfirmInput('');
          }
        }}
        title={t('backup.importRestoreTitle', 'Import & Restore Backup (.zip)')}
        maxWidthClass="max-w-md"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={importRestoreMutation.isPending}
              onClick={() => {
                setImportOpen(false);
                setImportFile(null);
                setImportConfirmInput('');
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={
                !importFile || importConfirmInput !== 'RESTORE' || importRestoreMutation.isPending
              }
              onClick={() => {
                if (importFile) importRestoreMutation.mutate(importFile);
              }}
            >
              {importRestoreMutation.isPending
                ? t('backup.restoring', 'Restoring...')
                : t('backup.confirmImportRestore', 'Import & Restore')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 p-4 text-xs">
          <div className="rounded border border-[#ead0cd] bg-[#fbf2f1] p-3 text-[#9e3b33]">
            <p className="font-semibold">
              {t('backup.restoreWarningTitle', 'High Risk Action: Database Snapshot Overwrite')}
            </p>
            <p className="mt-1 leading-relaxed">
              {t(
                'backup.importWarningBody',
                'Select a .zip backup archive from USB or another folder. Existing database records and uploads will be replaced with the snapshot inside the file. An automated pre-restore backup will be created first.',
              )}
            </p>
          </div>

          <FormField label={t('backup.selectZipFile', 'Backup Archive (.zip)')} required>
            <div className="flex flex-col gap-1.5">
              <input
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded border border-[#d6d3c9] bg-white px-2.5 py-1.5 text-xs text-[#1f1e1b] file:me-3 file:cursor-pointer file:rounded file:border file:border-[#d6d3c9] file:bg-[#f1efe9] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[#1f1e1b] hover:file:bg-[#e7e4dc]"
              />
              {importFile && (
                <span className="font-mono text-[11px] text-[#5c5a53]">
                  {importFile.name} ({formatBytes(importFile.size)})
                </span>
              )}
            </div>
          </FormField>

          <FormField
            label={t('backup.typeRestoreToConfirm', 'Type "RESTORE" to confirm:')}
            required
          >
            <TextInput
              value={importConfirmInput}
              onChange={(e) => setImportConfirmInput(e.target.value)}
              placeholder="RESTORE"
            />
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}
