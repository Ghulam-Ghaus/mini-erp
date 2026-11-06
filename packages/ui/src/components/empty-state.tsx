import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-2 text-[#8c8980]">{icon}</div>}
      <p className="text-sm font-medium text-[#1f1e1b]">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-[#5c5a53]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
