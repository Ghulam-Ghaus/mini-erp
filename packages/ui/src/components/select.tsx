import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly subtitle?: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly hasError?: boolean;
}

export function Select({
  options,
  placeholder,
  hasError = false,
  className = '',
  ...rest
}: SelectProps) {
  return (
    <select
      className={`h-8 w-full rounded border bg-white px-2.5 text-sm text-[#1f1e1b] focus:outline-none disabled:bg-[#f1efe9] ${
        hasError
          ? 'border-[#9e3b33] focus:border-[#9e3b33]'
          : 'border-[#d6d3c9] focus:border-[#2c2b28]'
      } ${className}`}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export interface ComboboxProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  readonly hasError?: boolean;
  readonly disabled?: boolean;
}

/**
 * Searchable Combobox for selecting clients, suppliers, batches, or items.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  hasError = false,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((opt) => opt.value === value);
  const filtered = options.filter((opt) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      opt.label.toLowerCase().includes(q) ||
      Boolean(opt.subtitle && opt.subtitle.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQuery('');
        }}
        className={`flex h-8 w-full items-center justify-between rounded border bg-white px-2.5 text-sm focus:outline-none disabled:bg-[#f1efe9] ${
          hasError
            ? 'border-[#9e3b33] focus:border-[#9e3b33]'
            : 'border-[#d6d3c9] focus:border-[#2c2b28]'
        }`}
      >
        <span className={`truncate ${selected ? 'text-[#1f1e1b]' : 'text-[#8c8980]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8c8980]" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded border border-[#d6d3c9] bg-white shadow-sm">
          <div className="flex items-center border-b border-[#e4e2da] px-2 py-1.5">
            <Search className="me-1.5 h-3.5 w-3.5 text-[#8c8980]" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-[#1f1e1b] placeholder:text-[#8c8980] focus:outline-none"
            />
          </div>
          <ul className="max-h-48 overflow-auto py-1 text-xs">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-[#8c8980]">{emptyText}</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-2.5 py-1.5 text-start hover:bg-[#f1efe9] ${
                      opt.value === value ? 'bg-[#eae8e1] font-medium' : ''
                    }`}
                  >
                    <span className="text-[#1f1e1b]">{opt.label}</span>
                    {opt.subtitle && <span className="text-[#8c8980]">{opt.subtitle}</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
