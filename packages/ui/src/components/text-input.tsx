import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly hasError?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { hasError = false, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`h-8 w-full rounded border bg-white px-2.5 text-sm text-[#1f1e1b] placeholder:text-[#8c8980] focus:outline-none disabled:bg-[#f1efe9] disabled:text-[#8c8980] ${
        hasError
          ? 'border-[#9e3b33] focus:border-[#9e3b33]'
          : 'border-[#d6d3c9] focus:border-[#2c2b28]'
      } ${className}`}
      {...rest}
    />
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly hasError?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { hasError = false, className = '', rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`w-full rounded border bg-white p-2.5 text-sm text-[#1f1e1b] placeholder:text-[#8c8980] focus:outline-none disabled:bg-[#f1efe9] disabled:text-[#8c8980] ${
        hasError
          ? 'border-[#9e3b33] focus:border-[#9e3b33]'
          : 'border-[#d6d3c9] focus:border-[#2c2b28]'
      } ${className}`}
      {...rest}
    />
  );
});
