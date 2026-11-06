import type { ReactNode } from 'react';

export interface FormFieldProps {
  readonly label: string;
  readonly htmlFor?: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly hint?: string;
  /** Span both columns in the standard 2-column form layout. */
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
}

/**
 * Standard FormField (Section 10): label above field, required `*`, inline validation error.
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  fullWidth = false,
  children,
}: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#1f1e1b]">
        <span>{label}</span>
        {required && (
          <span aria-hidden="true" className="ms-0.5 text-[#9e3b33]">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-[#9e3b33]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[#8c8980]">{hint}</p>
      ) : null}
    </div>
  );
}
