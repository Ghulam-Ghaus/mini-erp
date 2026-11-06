import type { SortOrder } from '@mini-erp/shared';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './button.js';
import { EmptyState } from './empty-state.js';

export type { ColumnDef };

export type ColumnAlign = 'left' | 'right' | 'center';

export interface DataTableColumnMeta {
  readonly align?: ColumnAlign;
  readonly footer?: ReactNode;
}

export interface DataTableProps<TData> {
  readonly columns: ColumnDef<TData, unknown>[];
  readonly data: readonly TData[];
  readonly getRowId?: (row: TData, index: number) => string;
  readonly sortBy?: string;
  readonly sortOrder?: SortOrder;
  readonly onSortChange?: (columnId: string, order: SortOrder) => void;
  readonly onRowClick?: (row: TData) => void;
  readonly zebra?: boolean;
  readonly isLoading?: boolean;
  readonly emptyTitle: string;
  readonly emptyDescription?: string;
  readonly columnsButtonLabel?: string;
  readonly loadingLabel?: string;
}

/**
 * Excel-like compact DataTable built on TanStack Table (Section 10):
 * compact rows, sticky header, column sort, column resize, show/hide columns,
 * optional zebra striping, row click -> detail, keyboard ArrowUp/ArrowDown/Enter nav,
 * and optional totals footer row.
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  sortBy,
  sortOrder = 'desc',
  onSortChange,
  onRowClick,
  zebra = false,
  isLoading = false,
  emptyTitle,
  emptyDescription,
  columnsButtonLabel = 'Columns',
  loadingLabel = 'Loading…',
}: DataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  const table = useReactTable({
    data: data as TData[],
    columns,
    getRowId,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const hasFooter = visibleLeafColumns.some((col) => {
    const meta = col.columnDef.meta as DataTableColumnMeta | undefined;
    return meta?.footer !== undefined;
  });

  const handleHeaderSort = (colId: string, canSort: boolean) => {
    if (!canSort || !onSortChange) return;
    const nextOrder: SortOrder = sortBy === colId && sortOrder === 'asc' ? 'desc' : 'asc';
    onSortChange(colId, nextOrder);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedRowIndex((prev) => Math.min(rows.length - 1, prev + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedRowIndex((prev) => Math.max(0, prev <= 0 ? 0 : prev - 1));
    } else if (event.key === 'Enter' && focusedRowIndex >= 0) {
      const targetRow = rows[focusedRowIndex];
      if (targetRow && onRowClick) {
        event.preventDefault();
        onRowClick(targetRow.original);
      }
    }
  };

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden bg-white focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Column visibility menu trigger */}
      <div className="flex items-center justify-end border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-1">
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            icon={<Columns3 className="h-3.5 w-3.5" />}
            onClick={() => setShowColumnMenu((v) => !v)}
          >
            {columnsButtonLabel}
          </Button>
          {showColumnMenu && (
            <div className="absolute end-0 top-8 z-30 w-48 rounded border border-[#d6d3c9] bg-white p-2 shadow-sm">
              {table.getAllLeafColumns().map((column) => {
                if (!column.getCanHide()) return null;
                const headerText =
                  typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-[#1f1e1b] hover:bg-[#f1efe9]"
                  >
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                      className="accent-[#2c2b28]"
                    />
                    <span className="truncate">{headerText}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Table container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[#f1efe9] text-[#5c5a53]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-[#d6d3c9]">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as DataTableColumnMeta | undefined;
                  const align = meta?.align ?? 'left';
                  const canSort = Boolean(onSortChange) && header.column.getCanSort();
                  const isSorted = sortBy === header.column.id;
                  const alignClass =
                    align === 'right'
                      ? 'text-right justify-end'
                      : align === 'center'
                        ? 'text-center justify-center'
                        : 'text-left justify-start';

                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="relative h-8 border-e border-[#e4e2da] last:border-e-0 px-2.5 font-semibold select-none"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!canSort}
                          onClick={() => handleHeaderSort(header.column.id, canSort)}
                          className={`flex w-full items-center gap-1 ${alignClass} ${canSort ? 'cursor-pointer hover:text-[#1f1e1b]' : 'cursor-default'}`}
                        >
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {canSort && (
                            <span className="text-[#8c8980]">
                              {!isSorted ? (
                                <ArrowUpDown className="h-3 w-3" />
                              ) : sortOrder === 'asc' ? (
                                <ArrowUp className="h-3 w-3 text-[#1f1e1b]" />
                              ) : (
                                <ArrowDown className="h-3 w-3 text-[#1f1e1b]" />
                              )}
                            </span>
                          )}
                        </button>
                      )}
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className="absolute end-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-[#8c8980]"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={visibleLeafColumns.length || 1}
                  className="py-10 text-center text-xs text-[#8c8980]"
                >
                  {loadingLabel}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleLeafColumns.length || 1}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
                const isFocused = rowIndex === focusedRowIndex;
                const zebraBg = zebra && rowIndex % 2 === 1 ? 'bg-[#faf9f5]' : 'bg-white';
                return (
                  <tr
                    key={row.id}
                    onClick={() => {
                      setFocusedRowIndex(rowIndex);
                      onRowClick?.(row.original);
                    }}
                    className={`h-8 border-b border-[#e4e2da] transition-colors ${
                      isFocused ? 'bg-[#eae8e1]' : zebraBg
                    } ${onRowClick ? 'cursor-pointer hover:bg-[#f1efe9]' : ''}`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as DataTableColumnMeta | undefined;
                      const align = meta?.align ?? 'left';
                      const alignClass =
                        align === 'right'
                          ? 'text-right'
                          : align === 'center'
                            ? 'text-center'
                            : 'text-left';
                      return (
                        <td
                          key={cell.id}
                          className={`border-e border-[#efede7] last:border-e-0 px-2.5 py-1 text-[#1f1e1b] ${alignClass}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {hasFooter && rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-[#f1efe9] font-semibold text-[#1f1e1b]">
              <tr className="h-8 border-t border-[#d6d3c9]">
                {visibleLeafColumns.map((col) => {
                  const meta = col.columnDef.meta as DataTableColumnMeta | undefined;
                  const align = meta?.align ?? 'left';
                  const alignClass =
                    align === 'right'
                      ? 'text-right'
                      : align === 'center'
                        ? 'text-center'
                        : 'text-left';
                  return (
                    <td
                      key={col.id}
                      className={`border-e border-[#e4e2da] last:border-e-0 px-2.5 py-1 ${alignClass}`}
                    >
                      {meta?.footer ?? null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
