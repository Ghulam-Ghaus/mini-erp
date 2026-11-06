import type { ReactNode } from 'react';

export interface SurfaceCardProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly headerAction?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

export function SurfaceCard({
  title,
  subtitle,
  headerAction,
  className = '',
  children,
}: SurfaceCardProps) {
  return (
    <section className={`rounded border border-[#e4e2da] bg-white ${className}`}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between gap-2 border-b border-[#e4e2da] px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-[#1f1e1b]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-[#5c5a53]">{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded border border-[#e4e2da] bg-white p-3.5">
      <p className="text-xs text-[#5c5a53]">{label}</p>
      <div className="mt-1.5 text-base font-semibold text-[#1f1e1b]">{value}</div>
      {hint && <p className="mt-1 text-[11px] text-[#8c8980]">{hint}</p>}
    </div>
  );
}

export interface TabOption {
  readonly id: string;
  readonly label: string;
  readonly badge?: number;
}

export interface TabsBarProps {
  readonly tabs: readonly TabOption[];
  readonly activeId: string;
  readonly onChange: (id: string) => void;
}

export function TabsBar({ tabs, activeId, onChange }: TabsBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[#e4e2da] bg-[#faf9f5] px-5 pt-2">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              active
                ? 'border-[#2c2b28] text-[#1f1e1b]'
                : 'border-transparent text-[#5c5a53] hover:text-[#1f1e1b]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="erp-num rounded bg-[#e2dfd6] px-1.5 py-0.5 text-[10px] text-[#1f1e1b]">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface StepItem {
  readonly id: number;
  readonly label: string;
}

export interface StepIndicatorProps {
  readonly steps: readonly StepItem[];
  readonly currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((step, idx) => {
        const isCurrent = step.id === currentStep;
        const isDone = step.id < currentStep;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`erp-num inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold ${
                isCurrent
                  ? 'border-[#2c2b28] bg-[#2c2b28] text-white'
                  : isDone
                    ? 'border-[#2c6b48] bg-[#f1f8f4] text-[#2c6b48]'
                    : 'border-[#d6d3c9] bg-white text-[#8c8980]'
              }`}
            >
              {step.id}
            </span>
            <span className={isCurrent ? 'font-semibold text-[#1f1e1b]' : 'text-[#5c5a53]'}>
              {step.label}
            </span>
            {idx < steps.length - 1 && <span className="text-[#d6d3c9]">/</span>}
          </li>
        );
      })}
    </ol>
  );
}

export interface CheckboxFieldProps {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function CheckboxField({
  id,
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: CheckboxFieldProps) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-start gap-2 text-xs ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[#2c2b28]"
      />
      <span>
        <span className="font-medium text-[#1f1e1b]">{label}</span>
        {description && <span className="block text-[11px] text-[#5c5a53]">{description}</span>}
      </span>
    </label>
  );
}

export interface AuthScreenLayoutProps {
  readonly appName: string;
  readonly tagline: string;
  readonly languageLabel: string;
  readonly onToggleLanguage: () => void;
  readonly statusBadge?: ReactNode;
  readonly maxWidthClass?: string;
  readonly children: ReactNode;
}

/**
 * Centered calm layout used by the First-Run Setup Wizard, Login screen, and Auto-Lock screen.
 */
export function AuthScreenLayout({
  appName,
  tagline,
  languageLabel,
  onToggleLanguage,
  statusBadge,
  maxWidthClass = 'max-w-md',
  children,
}: AuthScreenLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f6f2] text-[#1f1e1b]">
      <header className="flex h-12 items-center justify-between border-b border-[#e4e2da] bg-white px-5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{appName}</span>
          <span className="text-xs text-[#8c8980]">{tagline}</span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <button
            type="button"
            onClick={onToggleLanguage}
            className="h-7 rounded border border-[#d6d3c9] bg-white px-2.5 text-xs font-medium text-[#1f1e1b] hover:bg-[#f1efe9] cursor-pointer"
          >
            {languageLabel}
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-5">
        <div className={`w-full ${maxWidthClass}`}>{children}</div>
      </main>
    </div>
  );
}

export interface MatrixColumn {
  readonly key: string;
  readonly label: string;
}

export interface MatrixRow {
  readonly key: string;
  readonly label: string;
}

export interface PermissionMatrixGridProps {
  readonly moduleHeader: string;
  readonly rows: readonly MatrixRow[];
  readonly columns: readonly MatrixColumn[];
  readonly selectedKeys: ReadonlySet<string>;
  readonly disabled?: boolean;
  readonly onToggle: (permissionKey: string) => void;
  readonly onToggleRow: (moduleKey: string, allSelected: boolean) => void;
}

/**
 * Standard interactive Role x Permission Matrix table (Section 5.1).
 */
export function PermissionMatrixGrid({
  moduleHeader,
  rows,
  columns,
  selectedKeys,
  disabled = false,
  onToggle,
  onToggleRow,
}: PermissionMatrixGridProps) {
  return (
    <div className="overflow-x-auto rounded border border-[#d6d3c9] bg-white">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-[#f1efe9] text-[#5c5a53]">
          <tr className="h-8 border-b border-[#d6d3c9]">
            <th className="border-e border-[#e4e2da] px-3 text-start font-semibold">
              {moduleHeader}
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="w-24 border-e border-[#e4e2da] last:border-e-0 px-2 text-center font-semibold"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKeys = columns.map((c) => `${row.key}.${c.key}`);
            const allSelected = rowKeys.every((k) => selectedKeys.has(k));
            return (
              <tr key={row.key} className="h-8 border-b border-[#e4e2da] hover:bg-[#faf9f5]">
                <td className="border-e border-[#efede7] px-3 font-medium text-[#1f1e1b]">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggleRow(row.key, allSelected)}
                    className="text-start hover:underline disabled:no-underline cursor-pointer disabled:cursor-default"
                  >
                    {row.label}
                  </button>
                </td>
                {columns.map((col) => {
                  const key = `${row.key}.${col.key}`;
                  const checked = selectedKeys.has(key);
                  return (
                    <td
                      key={col.key}
                      className="border-e border-[#efede7] last:border-e-0 px-2 text-center"
                    >
                      <input
                        type="checkbox"
                        aria-label={`${row.label} ${col.label}`}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => onToggle(key)}
                        className="h-3.5 w-3.5 accent-[#2c2b28] cursor-pointer disabled:cursor-not-allowed"
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
