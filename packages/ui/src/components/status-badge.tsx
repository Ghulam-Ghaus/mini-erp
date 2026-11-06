import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusBadgeProps {
  readonly tone?: StatusTone;
  readonly children: ReactNode;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-[#f1efe9] text-[#5c5a53] border-[#dcd9cf]',
  success: 'bg-[#f1f8f4] text-[#2c6b48] border-[#cce3d5]',
  warning: 'bg-[#fcf7ee] text-[#8f5f1a] border-[#ead8b8]',
  danger: 'bg-[#fbf2f1] text-[#9e3b33] border-[#ead0cd]',
  info: 'bg-[#f1f6fa] text-[#2d5a7b] border-[#c9dceb]',
};

export function StatusBadge({ tone = 'neutral', children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium leading-none ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
