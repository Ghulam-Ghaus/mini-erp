import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface RowActionItem {
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly tone?: 'default' | 'primary' | 'danger';
  readonly disabled?: boolean;
  /** If true, renders as a visible compact inline button instead of only inside the ⋯ menu. */
  readonly inline?: boolean;
}

export interface RowActionsProps {
  readonly actions: readonly RowActionItem[];
  readonly moreLabel?: string;
}

/**
 * Standard right-most table cell component providing 1-2 compact inline action buttons
 * (e.g. "Print Invoice", "Print Challan", "Ledger", "+ Payment") plus a "⋯" overflow menu.
 * Automatically stops row-click event propagation.
 */
export function RowActions({ actions, moreLabel = 'More' }: RowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const inlineActions = actions.filter((a) => a.inline);
  const menuActions = actions.filter((a) => !a.inline);

  return (
    <div
      className="inline-flex items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {inlineActions.map((act) => {
        const toneClasses =
          act.tone === 'primary'
            ? 'border-[#2c2b28] bg-[#2c2b28] text-white hover:bg-[#1f1e1b]'
            : act.tone === 'danger'
              ? 'border-[#e6c3c3] bg-[#fdf3f3] text-[#9e2b2b] hover:bg-[#fae6e6]'
              : 'border-[#d6d3c9] bg-white text-[#1f1e1b] hover:bg-[#f1efe9]';
        return (
          <button
            key={act.id}
            type="button"
            disabled={act.disabled}
            onClick={() => act.onClick()}
            className={`h-6 rounded border px-2 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${toneClasses}`}
          >
            {act.label}
          </button>
        );
      })}

      {menuActions.length > 0 && (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label={moreLabel}
            title={moreLabel}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#d6d3c9] bg-white text-xs font-bold text-[#5c5a53] hover:bg-[#f1efe9] hover:text-[#1f1e1b] cursor-pointer"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute end-0 top-7 z-30 min-w-40 rounded border border-[#d6d3c9] bg-white py-1 shadow-sm">
              {menuActions.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  disabled={act.disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    act.onClick();
                  }}
                  className={`flex w-full items-center px-3 py-1.5 text-start text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    act.tone === 'danger'
                      ? 'text-[#9e2b2b] hover:bg-[#fdf3f3]'
                      : 'text-[#1f1e1b] hover:bg-[#f1efe9]'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface EntityLinkProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly subtitle?: string | null;
  readonly mono?: boolean;
  readonly title?: string;
}

/**
 * Clickable drill-down link for Supplier Name, Client Name, Invoice No, or Batch Name
 * inside any table or summary view. Stops row-click propagation so clicking a Supplier Name
 * on an Invoice row opens the Supplier 360° Ledger view directly.
 */
export function EntityLink({ children, onClick, subtitle, mono = false, title }: EntityLinkProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`group inline-flex flex-col items-start text-start cursor-pointer ${
        mono ? 'erp-num' : ''
      }`}
    >
      <span className="font-medium text-[#1f1e1b] underline decoration-[#d6d3c9] underline-offset-2 group-hover:text-[#2c6b48] group-hover:decoration-[#2c6b48]">
        {children}
      </span>
      {subtitle && <span className="text-[11px] text-[#8c8980]">{subtitle}</span>}
    </button>
  );
}
