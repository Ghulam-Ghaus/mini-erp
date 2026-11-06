import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: ReactNode;
  readonly shortcutHint?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[#2c2b28] text-white border border-[#2c2b28] hover:bg-[#181715] disabled:opacity-50',
  secondary:
    'bg-white text-[#1f1e1b] border border-[#d6d3c9] hover:bg-[#f1efe9] disabled:opacity-50',
  ghost:
    'bg-transparent text-[#5c5a53] border border-transparent hover:bg-[#eae8e1] hover:text-[#1f1e1b] disabled:opacity-50',
  danger:
    'bg-[#fbf2f1] text-[#9e3b33] border border-[#ead0cd] hover:bg-[#f5e3e1] disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-1.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  shortcutHint,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded font-medium transition-colors select-none cursor-pointer disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
      {shortcutHint && (
        <kbd className="ms-1 rounded border border-current/20 px-1 py-0.5 text-[10px] font-normal opacity-75">
          {shortcutHint}
        </kbd>
      )}
    </button>
  );
}
