import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHALLAN_STATUSES,
  formatWeight,
  type ChallanDto,
  type ChallanStatus,
  type PageSizeOption,
} from '@mini-erp/shared';
import {
  Button,
  DataTable,
  DatePicker,
  Dialog,
  FilterBar,
  FormField,
  IntegerText,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  TextInput,
  useToast,
  type ColumnDef,
  type DataTableColumnMeta,
} from '@mini-erp/ui';
import { createChallan, fetchChallans, fetchSales, updateChallanStatus } from '../lib/api';
import { PrintDocumentDialog, type PrintableDocument } from '../components/print-document-dialog';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ChallansScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Create Challan Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [challanDate, setChallanDate] = useState<string>(todayIso());
  const [riderName, setRiderName] = useState<string>('');
  const [vehicleNo, setVehicleNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Update Status Dialog state
  const [statusTarget, setStatusTarget] = useState<ChallanDto | null>(null);
  const [nextStatus, setNextStatus] = useState<'DISPATCHED' | 'DELIVERED' | 'CANCELLED'>(
    'DISPATCHED',
  );
  const [receivedBy, setReceivedBy] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Print Dialog state
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);

  const challansQuery = useQuery({
    queryKey: ['challans', { page, pageSize, search, statusFilter, dateFrom, dateTo }],
    queryFn: () =>
      fetchChallans({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: (statusFilter || undefined) as ChallanStatus | undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const salesQuery = useQuery({
    queryKey: ['sales-for-challan'],
    queryFn: () => fetchSales({ page: 1, pageSize: 100 }),
    enabled: createOpen,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createChallan({
        saleId: Number(selectedSaleId),
        challanDate,
        riderName: riderName.trim() || null,
        vehicleNo: vehicleNo.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (created) => {
      showToast({
        tone: 'success',
        title: t('challans.createdToast', 'Delivery Challan {{no}} created', {
          no: created.challanNo,
        }),
      });
      setCreateOpen(false);
      setSelectedSaleId('');
      setRiderName('');
      setVehicleNo('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['challans'] });
      setPrintDoc({ type: 'CHALLAN', data: created });
    },
    onError: (err: Error) => {
      showToast({ tone: 'danger', title: err.message });
    },
  });

  const statusMutation = useMutation({
    mutationFn: () => {
      if (!statusTarget) throw new Error('No challan selected');
      return updateChallanStatus(statusTarget.id, {
        status: nextStatus,
        receivedBy: receivedBy.trim() || null,
        cancelReason: cancelReason.trim() || null,
      });
    },
    onSuccess: (updated) => {
      showToast({
        tone: 'success',
        title: t('challans.statusUpdatedToast', 'Challan {{no}} updated to {{status}}', {
          no: updated.challanNo,
          status: updated.status,
        }),
      });
      setStatusTarget(null);
      setReceivedBy('');
      setCancelReason('');
      void queryClient.invalidateQueries({ queryKey: ['challans'] });
    },
    onError: (err: Error) => {
      showToast({ tone: 'danger', title: err.message });
    },
  });

  const columns = useMemo<ColumnDef<ChallanDto, unknown>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        size: 55,
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <IntegerText value={row.original.id} />,
      },
      {
        accessorKey: 'challanNo',
        header: t('challans.challanNo', 'Challan No'),
        cell: ({ row }) => (
          <span className="font-mono font-medium text-neutral-900">{row.original.challanNo}</span>
        ),
      },
      {
        accessorKey: 'challanDate',
        header: t('common.date', 'Date'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.challanDate}</span>,
      },
      {
        accessorKey: 'invoiceNo',
        header: t('challans.invoiceNo', 'Linked Invoice'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.invoiceNo}</span>,
      },
      {
        accessorKey: 'clientName',
        header: t('sales.client', 'Client'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-neutral-900">{row.original.clientName}</div>
            {row.original.routeName && (
              <div className="text-xs text-neutral-500">{row.original.routeName}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'riderName',
        header: t('challans.riderVehicle', 'Rider / Vehicle'),
        cell: ({ row }) => (
          <div className="text-xs">
            <div>{row.original.riderName || '—'}</div>
            {row.original.vehicleNo && (
              <div className="font-mono text-neutral-500">{row.original.vehicleNo}</div>
            )}
          </div>
        ),
      },
      {
        id: 'totalWeight',
        header: () => <div className="text-right">{t('challans.totalKg', 'Total KG')}</div>,
        cell: ({ row }) => {
          const totalKg = row.original.items.reduce((sum: number, i) => sum + Number(i.qtyBase), 0);
          return (
            <div className="text-right font-mono font-medium">
              {formatWeight(totalKg.toFixed(3))} KG
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('common.status', 'Status'),
        cell: ({ row }) => {
          const st = row.original.status;
          const tone =
            st === 'DELIVERED'
              ? 'success'
              : st === 'DISPATCHED'
                ? 'info'
                : st === 'CANCELLED'
                  ? 'danger'
                  : 'warning';
          return <StatusBadge tone={tone}>{st}</StatusBadge>;
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-right">{t('common.actions', 'Actions')}</div>,
        cell: ({ row }) => {
          const ch = row.original;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setPrintDoc({ type: 'CHALLAN', data: ch });
                }}
              >
                {t('print.printButtonShort', 'Print')}
              </Button>
              {ch.status !== 'CANCELLED' && ch.status !== 'DELIVERED' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatusTarget(ch);
                    setNextStatus(ch.status === 'PENDING' ? 'DISPATCHED' : 'DELIVERED');
                    setReceivedBy(ch.receivedBy ?? '');
                    setCancelReason('');
                  }}
                >
                  {ch.status === 'PENDING'
                    ? t('challans.dispatch', 'Dispatch')
                    : t('challans.deliver', 'Mark Delivered')}
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t],
  );

  const activeSales = useMemo(
    () => (salesQuery.data?.data ?? []).filter((s) => s.status !== 'VOIDED'),
    [salesQuery.data],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('challans.title', 'Delivery Challans (Gate Passes)')}
        subtitle={t(
          'challans.subtitle',
          'Dispatch goods to clients with rider & vehicle tracking (prints quantities only, without prices)',
        )}
        primaryAction={{
          label: t('challans.newChallan', 'New Delivery Challan'),
          onClick: () => setCreateOpen(true),
        }}
      />

      <FilterBar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder={t(
          'challans.searchPlaceholder',
          'Search challan no, invoice no, client, rider, or vehicle...',
        )}
        selects={[
          {
            id: 'status',
            label: t('common.status', 'Status'),
            value: statusFilter,
            allLabel: t('common.allStatuses', 'All Statuses'),
            options: CHALLAN_STATUSES.map((st) => ({ value: st, label: st })),
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
          },
        ]}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(val) => {
          setDateFrom(val);
          setPage(1);
        }}
        onDateToChange={(val) => {
          setDateTo(val);
          setPage(1);
        }}
        clearLabel={t('common.clear', 'Clear')}
        onClear={() => {
          setSearch('');
          setStatusFilter('');
          setDateFrom('');
          setDateTo('');
          setPage(1);
        }}
      />

      <DataTable
        columns={columns}
        data={challansQuery.data?.data ?? []}
        isLoading={challansQuery.isLoading}
        emptyTitle={t('challans.emptyTitle', 'No delivery challans found')}
        emptyDescription={t(
          'challans.emptyDescription',
          'Create a delivery challan from any posted sale invoice to print a rider gate pass.',
        )}
        onRowClick={(row) => setPrintDoc({ type: 'CHALLAN', data: row })}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={challansQuery.data?.total ?? 0}
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

      {/* Create Challan Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('challans.newChallan', 'New Delivery Challan')}
        maxWidthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!selectedSaleId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {t('challans.createAndPrint', 'Create & Print Challan')}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label={t('challans.selectInvoice', 'Sale Invoice')} required>
              <Select
                value={selectedSaleId}
                onChange={(e) => setSelectedSaleId(e.target.value)}
                options={[
                  { value: '', label: t('challans.chooseInvoice', 'Select a sale invoice...') },
                  ...activeSales.map((s) => ({
                    value: String(s.id),
                    label: `${s.invoiceNo} — ${s.clientName} (${s.saleDate})`,
                  })),
                ]}
              />
            </FormField>
          </div>
          <FormField label={t('common.date', 'Challan Date')} required>
            <DatePicker value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
          </FormField>
          <FormField label={t('challans.riderName', 'Rider / Driver Name')}>
            <TextInput
              value={riderName}
              onChange={(e) => setRiderName(e.target.value)}
              placeholder="e.g. Muhammad Aslam"
            />
          </FormField>
          <FormField label={t('challans.vehicleNo', 'Vehicle / Loader No')}>
            <TextInput
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="e.g. LHR-4521"
            />
          </FormField>
          <FormField label={t('common.notes', 'Delivery Instructions / Notes')}>
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('common.optional', 'Optional')}
            />
          </FormField>
        </div>
      </Dialog>

      {/* Update Challan Status Dialog */}
      <Dialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={t('challans.updateStatusTitle', 'Update Challan Status — {{no}}', {
          no: statusTarget?.challanNo ?? '',
        })}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate()}
            >
              {t('common.save', 'Save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormField label={t('common.status', 'New Status')} required>
            <Select
              value={nextStatus}
              onChange={(e) =>
                setNextStatus(e.target.value as 'DISPATCHED' | 'DELIVERED' | 'CANCELLED')
              }
              options={[
                { value: 'DISPATCHED', label: 'DISPATCHED' },
                { value: 'DELIVERED', label: 'DELIVERED' },
                { value: 'CANCELLED', label: 'CANCELLED' },
              ]}
            />
          </FormField>
          {nextStatus === 'DELIVERED' && (
            <FormField label={t('challans.receivedBy', 'Received By (Client / Store Person)')}>
              <TextInput
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="e.g. Haji Tariq"
              />
            </FormField>
          )}
          {nextStatus === 'CANCELLED' && (
            <FormField label={t('common.cancelReason', 'Cancel Reason')} required>
              <TextInput
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation"
              />
            </FormField>
          )}
        </div>
      </Dialog>

      {/* Print Document Dialog */}
      <PrintDocumentDialog
        open={Boolean(printDoc)}
        document={printDoc}
        onClose={() => setPrintDoc(null)}
        onPrinted={() => {
          void queryClient.invalidateQueries({ queryKey: ['challans'] });
        }}
      />
    </div>
  );
}
