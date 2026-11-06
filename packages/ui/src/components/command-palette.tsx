import { Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export interface CommandPaletteItem {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly icon?: ReactNode;
  readonly shortcut?: string;
  readonly onSelect: () => void;
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly placeholder: string;
  readonly emptyText: string;
  readonly items: readonly CommandPaletteItem[];
}

/**
 * Quick search CommandPalette opened with `Ctrl+K` (Section 10).
 */
export function CommandPalette({
  open,
  onClose,
  placeholder,
  emptyText,
  items,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!q) return true;
    return (
      item.label.toLowerCase().includes(q) ||
      Boolean(item.group && item.group.toLowerCase().includes(q))
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-20 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) => Math.min(Math.max(0, filtered.length - 1), prev + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) => Math.max(0, prev - 1));
        } else if (e.key === 'Enter' && filtered[activeIndex]) {
          e.preventDefault();
          filtered[activeIndex].onSelect();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded border border-[#d6d3c9] bg-white shadow-sm">
        <div className="flex items-center border-b border-[#e4e2da] px-3 py-2.5">
          <Search className="me-2 h-4 w-4 text-[#8c8980]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-[#1f1e1b] placeholder:text-[#8c8980] focus:outline-none"
          />
          <kbd className="rounded border border-[#d6d3c9] px-1.5 py-0.5 text-[10px] text-[#8c8980]">
            Esc
          </kbd>
        </div>

        <ul className="max-h-72 overflow-y-auto py-1 text-xs">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[#8c8980]">{emptyText}</li>
          ) : (
            filtered.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-start ${
                    idx === activeIndex ? 'bg-[#eae8e1]' : 'hover:bg-[#f1efe9]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.icon && <span className="text-[#5c5a53]">{item.icon}</span>}
                    <span className="font-medium text-[#1f1e1b]">{item.label}</span>
                    {item.group && <span className="text-[#8c8980]">· {item.group}</span>}
                  </div>
                  {item.shortcut && (
                    <kbd className="rounded border border-[#d6d3c9] px-1 py-0.5 text-[10px] text-[#5c5a53]">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
