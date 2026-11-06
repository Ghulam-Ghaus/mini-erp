import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button.js';

export interface FilterSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface FilterSelectConfig {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly FilterSelectOption[];
  readonly allLabel: string;
  readonly onChange: (value: string) => void;
}

export interface FilterBarProps {
  readonly searchValue: string;
  readonly searchPlaceholder: string;
  readonly onSearchChange: (value: string) => void;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly dateFromLabel?: string;
  readonly dateToLabel?: string;
  readonly onDateFromChange?: (value: string) => void;
  readonly onDateToChange?: (value: string) => void;
  readonly selects?: readonly FilterSelectConfig[];
  readonly clearLabel: string;
  readonly onClear: () => void;
  readonly extra?: ReactNode;
}

/**
 * Standard FilterBar placed directly under PageHeader on every list page (Section 10).
 */
export function FilterBar({
  searchValue,
  searchPlaceholder,
  onSearchChange,
  dateFrom,
  dateTo,
  dateFromLabel,
  dateToLabel,
  onDateFromChange,
  onDateToChange,
  selects = [],
  clearLabel,
  onClear,
  extra,
}: FilterBarProps) {
  const hasActiveFilters =
    searchValue.trim().length > 0 ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    selects.some((s) => s.value !== '');

  return (
    <section
      aria-label="Filters"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e2da] bg-[#faf9f5] px-5 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[#8c8980]" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 w-56 rounded border border-[#d6d3c9] bg-white ps-8 pe-2.5 text-xs text-[#1f1e1b] placeholder:text-[#8c8980] focus:border-[#2c2b28] focus:outline-none"
          />
        </div>

        {onDateFromChange && (
          <label className="flex items-center gap-1.5 text-xs text-[#5c5a53]">
            {dateFromLabel && <span>{dateFromLabel}</span>}
            <input
              type="date"
              value={dateFrom ?? ''}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-7 rounded border border-[#d6d3c9] bg-white px-2 text-xs text-[#1f1e1b] focus:border-[#2c2b28] focus:outline-none"
            />
          </label>
        )}

        {onDateToChange && (
          <label className="flex items-center gap-1.5 text-xs text-[#5c5a53]">
            {dateToLabel && <span>{dateToLabel}</span>}
            <input
              type="date"
              value={dateTo ?? ''}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-7 rounded border border-[#d6d3c9] bg-white px-2 text-xs text-[#1f1e1b] focus:border-[#2c2b28] focus:outline-none"
            />
          </label>
        )}

        {selects.map((select) => (
          <label key={select.id} className="flex items-center gap-1.5 text-xs text-[#5c5a53]">
            <span className="sr-only">{select.label}</span>
            <select
              aria-label={select.label}
              value={select.value}
              onChange={(e) => select.onChange(e.target.value)}
              className="h-7 rounded border border-[#d6d3c9] bg-white px-2 text-xs text-[#1f1e1b] focus:border-[#2c2b28] focus:outline-none"
            >
              <option value="">{select.allLabel}</option>
              {select.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClear} icon={<X className="h-3.5 w-3.5" />}>
            {clearLabel}
          </Button>
        )}
      </div>

      {extra && <div className="flex items-center gap-2">{extra}</div>}
    </section>
  );
}
