import { PAGE_SIZE_OPTIONS, type PageSizeOption } from '@mini-erp/shared';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button.js';

export interface PaginationLabels {
  readonly rowsPerPage: string;
  readonly showingRange: (from: number, to: number, total: number) => string;
  readonly firstPage: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly lastPage: string;
}

export interface PaginationProps {
  readonly page: number;
  readonly pageSize: PageSizeOption;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: PageSizeOption) => void;
  readonly labels: PaginationLabels;
}

/**
 * Standard bottom Pagination bar (Section 10):
 * rows per page 10/25/50/100, "1-25 of 340", first/prev/next/last.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  labels,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, safePage * pageSize);

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e2da] bg-white px-5 py-2 text-xs text-[#5c5a53]">
      <div className="flex items-center gap-2">
        <span>{labels.rowsPerPage}</span>
        <select
          aria-label={labels.rowsPerPage}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSizeOption)}
          className="h-7 rounded border border-[#d6d3c9] bg-white px-2 text-xs text-[#1f1e1b] focus:border-[#2c2b28] focus:outline-none"
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <span className="erp-num">{labels.showingRange(from, to, total)}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-label={labels.firstPage}
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
            icon={<ChevronFirst className="h-3.5 w-3.5 rtl:rotate-180" />}
          />
          <Button
            variant="secondary"
            size="sm"
            aria-label={labels.previousPage}
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            icon={<ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />}
          />
          <Button
            variant="secondary"
            size="sm"
            aria-label={labels.nextPage}
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            icon={<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />}
          />
          <Button
            variant="secondary"
            size="sm"
            aria-label={labels.lastPage}
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            icon={<ChevronLast className="h-3.5 w-3.5 rtl:rotate-180" />}
          />
        </div>
      </div>
    </footer>
  );
}
