import { Plus, Trash2 } from 'lucide-react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './button.js';

export interface LineItemColumn<TRow> {
  readonly id: string;
  readonly header: string;
  readonly width?: string;
  readonly align?: 'left' | 'right' | 'center';
  /** If true, this column contains an editable input that participates in Tab/Enter cell navigation. */
  readonly editable?: boolean;
  readonly renderCell: (params: {
    readonly row: TRow;
    readonly rowIndex: number;
    readonly inputProps: {
      readonly 'data-grid-cell': string;
      readonly onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
    };
  }) => ReactNode;
  readonly footer?: ReactNode;
}

export interface LineItemGridProps<TRow> {
  readonly title?: string;
  readonly columns: readonly LineItemColumn<TRow>[];
  readonly rows: readonly TRow[];
  readonly getRowKey: (row: TRow, index: number) => string;
  readonly onAddRow: () => void;
  readonly onRemoveRow: (index: number) => void;
  readonly addRowLabel: string;
  readonly removeRowLabel: string;
  readonly minRows?: number;
}

export interface GridCoords {
  readonly rowIndex: number;
  readonly colIndex: number;
}

/**
 * Pure helper tested in unit tests: computes the next cell coordinates on Enter / Tab.
 */
export function computeNextGridCell(
  current: GridCoords,
  rowCount: number,
  editableColCount: number,
  shiftKey = false,
): { readonly next: GridCoords | null; readonly shouldAddRow: boolean } {
  if (rowCount <= 0 || editableColCount <= 0) {
    return { next: null, shouldAddRow: false };
  }

  if (shiftKey) {
    if (current.colIndex > 0) {
      return {
        next: { rowIndex: current.rowIndex, colIndex: current.colIndex - 1 },
        shouldAddRow: false,
      };
    }
    if (current.rowIndex > 0) {
      return {
        next: { rowIndex: current.rowIndex - 1, colIndex: editableColCount - 1 },
        shouldAddRow: false,
      };
    }
    return { next: null, shouldAddRow: false };
  }

  if (current.colIndex < editableColCount - 1) {
    return {
      next: { rowIndex: current.rowIndex, colIndex: current.colIndex + 1 },
      shouldAddRow: false,
    };
  }

  if (current.rowIndex < rowCount - 1) {
    return {
      next: { rowIndex: current.rowIndex + 1, colIndex: 0 },
      shouldAddRow: false,
    };
  }

  // Last editable cell of the last row -> append a new row and focus its first editable cell
  return {
    next: { rowIndex: rowCount, colIndex: 0 },
    shouldAddRow: true,
  };
}

/**
 * Spreadsheet-like line-item grid for invoice/batch lines (Section 10):
 * Tab/Enter moves to the next editable cell; Enter on the last cell of the last row appends a new row.
 */
export function LineItemGrid<TRow>({
  title,
  columns,
  rows,
  getRowKey,
  onAddRow,
  onRemoveRow,
  addRowLabel,
  removeRowLabel,
  minRows = 1,
}: LineItemGridProps<TRow>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editableColumns = columns.filter((col) => col.editable !== false);

  const focusCell = (rowIndex: number, editableColIndex: number) => {
    const selector = `[data-grid-cell="${rowIndex}:${editableColIndex}"]`;
    const el = containerRef.current?.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    rowIndex: number,
    editableColIndex: number,
  ) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const { next, shouldAddRow } = computeNextGridCell(
      { rowIndex, colIndex: editableColIndex },
      rows.length,
      editableColumns.length,
      event.shiftKey,
    );
    if (shouldAddRow) {
      onAddRow();
      if (next) {
        setTimeout(() => focusCell(next.rowIndex, next.colIndex), 15);
      }
    } else if (next) {
      focusCell(next.rowIndex, next.colIndex);
    }
  };

  const hasFooter = columns.some((c) => c.footer !== undefined);

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#1f1e1b]">{title}</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={onAddRow}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            {addRowLabel}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-[#d6d3c9] bg-white">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-[#f1efe9] text-[#5c5a53]">
            <tr className="h-8 border-b border-[#d6d3c9]">
              <th className="w-9 border-e border-[#e4e2da] px-2 text-center font-semibold">#</th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width }}
                  className={`border-e border-[#e4e2da] px-2.5 font-semibold ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
              <th className="w-10 px-2 text-center font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              let editableCounter = -1;
              return (
                <tr key={getRowKey(row, rowIndex)} className="h-9 border-b border-[#e4e2da]">
                  <td className="erp-num border-e border-[#efede7] px-2 text-center text-[#8c8980]">
                    {rowIndex + 1}
                  </td>
                  {columns.map((col) => {
                    const isEditable = col.editable !== false;
                    if (isEditable) editableCounter += 1;
                    const currentEditableIndex = editableCounter;
                    return (
                      <td
                        key={col.id}
                        className={`border-e border-[#efede7] px-1.5 py-1 ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        }`}
                      >
                        {col.renderCell({
                          row,
                          rowIndex,
                          inputProps: {
                            'data-grid-cell': isEditable
                              ? `${rowIndex}:${currentEditableIndex}`
                              : '',
                            onKeyDown: (e) => {
                              if (isEditable) {
                                handleCellKeyDown(e, rowIndex, currentEditableIndex);
                              }
                            },
                          },
                        })}
                      </td>
                    );
                  })}
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      disabled={rows.length <= minRows}
                      aria-label={removeRowLabel}
                      onClick={() => onRemoveRow(rowIndex)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-[#8c8980] hover:bg-[#fbf2f1] hover:text-[#9e3b33] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {hasFooter && (
            <tfoot className="bg-[#f1efe9] font-semibold text-[#1f1e1b]">
              <tr className="h-8 border-t border-[#d6d3c9]">
                <td className="border-e border-[#e4e2da]" />
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`border-e border-[#e4e2da] px-2.5 py-1 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                    }`}
                  >
                    {col.footer ?? null}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
