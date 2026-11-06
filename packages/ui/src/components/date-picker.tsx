import { forwardRef, type InputHTMLAttributes } from 'react';

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly hasError?: boolean;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { hasError = false, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      className={`h-8 w-full rounded border bg-white px-2.5 text-sm text-[#1f1e1b] focus:outline-none disabled:bg-[#f1efe9] ${
        hasError
          ? 'border-[#9e3b33] focus:border-[#9e3b33]'
          : 'border-[#d6d3c9] focus:border-[#2c2b28]'
      } ${className}`}
      {...rest}
    />
  );
});
