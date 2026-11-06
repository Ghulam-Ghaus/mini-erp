import { Decimal } from 'decimal.js';
import { forwardRef, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from 'react';

export type NumberPrecision = 'money' | 'weight' | 'integer' | 'percent';

export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly precision?: NumberPrecision;
  readonly suffix?: string;
  readonly hasError?: boolean;
}

const decimalsByPrecision: Record<NumberPrecision, number> = {
  money: 2,
  weight: 3,
  percent: 2,
  integer: 0,
};

/**
 * Right-aligned decimal string input for money (2 dp), weight/kg (3 dp), or integer.
 * Keeps values as exact strings so floating-point rounding never occurs.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value,
    onChange,
    precision = 'money',
    suffix,
    hasError = false,
    className = '',
    onBlur,
    ...rest
  },
  ref,
) {
  const maxDecimals = decimalsByPrecision[precision];

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.replace(/,/g, '');
    if (raw === '' || raw === '-') {
      onChange(raw);
      return;
    }
    const pattern =
      maxDecimals === 0 ? /^-?\d*$/ : new RegExp(`^-?\\d*(\\.\\d{0,${maxDecimals}})?$`);
    if (pattern.test(raw)) {
      onChange(raw);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const trimmed = value.trim();
    if (trimmed !== '' && trimmed !== '-') {
      try {
        const d = new Decimal(trimmed).toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_UP);
        onChange(d.toFixed(maxDecimals));
      } catch {
        // leave value untouched so Zod reports validation error
      }
    }
    onBlur?.(event);
  };

  return (
    <div className="relative flex items-center">
      <input
        ref={ref}
        type="text"
        inputMode={maxDecimals === 0 ? 'numeric' : 'decimal'}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`erp-num h-8 w-full rounded border bg-white px-2.5 text-right text-sm text-[#1f1e1b] placeholder:text-[#8c8980] focus:outline-none disabled:bg-[#f1efe9] disabled:text-[#8c8980] ${
          suffix ? 'pe-11' : ''
        } ${
          hasError
            ? 'border-[#9e3b33] focus:border-[#9e3b33]'
            : 'border-[#d6d3c9] focus:border-[#2c2b28]'
        } ${className}`}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute end-2.5 text-xs text-[#8c8980]">
          {suffix}
        </span>
      )}
    </div>
  );
});
