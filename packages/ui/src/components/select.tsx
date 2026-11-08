import { ChevronDown, Search, X } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

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
  readonly allowClear?: boolean;
  readonly 'data-grid-cell'?: string;
  readonly onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Searchable Combobox for selecting clients, suppliers, batches, purchases, or items.
 * Uses a portal for the dropdown menu so it is never clipped inside tables or drawers.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyText = 'No matching items found',
  hasError = false,
  disabled = false,
  allowClear = false,
  'data-grid-cell': dataGridCell,
  onKeyDown,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((opt) => opt.value === value && opt.value !== '');
  const filtered = options.filter((opt) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      opt.label.toLowerCase().includes(q) ||
      Boolean(opt.subtitle && opt.subtitle.toLowerCase().includes(q))
    );
  });

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 320),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  const handleSelectOption = (nextVal: string) => {
    onChange(nextVal);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex w-full items-center">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          data-grid-cell={dataGridCell}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
              setQuery('');
              return;
            }
            onKeyDown?.(e);
          }}
          onClick={() => {
            setOpen((o) => !o);
            setQuery('');
          }}
          className={`flex h-8 w-full items-center justify-between rounded border bg-white px-2.5 text-xs focus:outline-none disabled:bg-[#f1efe9] cursor-pointer ${
            hasError
              ? 'border-[#9e3b33] focus:border-[#9e3b33]'
              : 'border-[#d6d3c9] focus:border-[#2c2b28]'
          }`}
        >
          <span className={`truncate text-start ${selected ? 'text-[#1f1e1b]' : 'text-[#8c8980]'}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="ms-1.5 h-3.5 w-3.5 shrink-0 text-[#8c8980]" />
        </button>

        {allowClear && selected && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="absolute end-6 rounded p-0.5 text-[#8c8980] hover:bg-[#f1efe9] hover:text-[#1f1e1b] cursor-pointer"
            aria-label="Clear selection"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open &&
        menuRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 9999,
            }}
            className="rounded border border-[#d6d3c9] bg-white shadow-md"
          >
            <div className="flex items-center border-b border-[#e4e2da] bg-[#faf9f5] px-2.5 py-1.5">
              <Search className="me-1.5 h-3.5 w-3.5 shrink-0 text-[#8c8980]" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const picked = filtered[highlightIndex];
                    if (picked) {
                      handleSelectOption(picked.value);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-[#1f1e1b] placeholder:text-[#8c8980] focus:outline-none"
              />
            </div>
            <ul className="max-h-56 overflow-auto py-1 text-xs">
              {filtered.length === 0 ? (
                <li className="px-2.5 py-2 text-[#8c8980]">{emptyText}</li>
              ) : (
                filtered.map((opt, idx) => (
                  <li key={opt.value || '__empty__'}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightIndex(idx)}
                      onClick={() => handleSelectOption(opt.value)}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-start cursor-pointer ${
                        idx === highlightIndex
                          ? 'bg-[#f1efe9]'
                          : opt.value === value
                            ? 'bg-[#eae8e1] font-medium'
                            : ''
                      }`}
                    >
                      <span className="truncate font-medium text-[#1f1e1b]">{opt.label}</span>
                      {opt.subtitle && (
                        <span className="shrink-0 font-mono text-[11px] text-[#6f6c64]">
                          {opt.subtitle}
                        </span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
