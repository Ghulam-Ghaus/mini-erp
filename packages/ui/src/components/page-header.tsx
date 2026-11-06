import type { ReactNode } from 'react';
import { Button } from './button.js';

export interface PageHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly primaryAction?: {
    readonly label: string;
    readonly onClick: () => void;
    readonly icon?: ReactNode;
    readonly shortcutHint?: string;
    readonly disabled?: boolean;
  };
  readonly secondaryActions?: ReactNode;
}

export function PageHeader({ title, subtitle, primaryAction, secondaryActions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e2da] bg-white px-5 py-3">
      <div>
        <h1 className="text-base font-semibold text-[#1f1e1b]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-[#5c5a53]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {secondaryActions}
        {primaryAction && (
          <Button
            variant="primary"
            onClick={primaryAction.onClick}
            icon={primaryAction.icon}
            shortcutHint={primaryAction.shortcutHint}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </Button>
        )}
      </div>
    </header>
  );
}
