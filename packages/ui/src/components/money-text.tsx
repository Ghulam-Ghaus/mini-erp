import {
  formatInteger,
  formatMoney,
  formatWeight,
  isNegativeAmount,
  type NumericInput,
} from '@mini-erp/shared';

export interface MoneyTextProps {
  readonly value: NumericInput;
  readonly currency?: string;
  /** Highlight negative or overdue amounts in muted red (Section 10). Default true for negative. */
  readonly highlightNegative?: boolean;
  readonly overdue?: boolean;
  readonly className?: string;
}

export function MoneyText({
  value,
  currency,
  highlightNegative = true,
  overdue = false,
  className = '',
}: MoneyTextProps) {
  const isNeg = isNegativeAmount(value);
  const isRed = overdue || (highlightNegative && isNeg);
  return (
    <span
      className={`erp-num inline-block text-right ${isRed ? 'text-[#9e3b33] font-medium' : 'text-[#1f1e1b]'} ${className}`}
    >
      {formatMoney(value, currency)}
    </span>
  );
}

export interface WeightTextProps {
  readonly value: NumericInput;
  readonly unit?: string;
  readonly highlightNegative?: boolean;
  readonly className?: string;
}

export function WeightText({
  value,
  unit,
  highlightNegative = true,
  className = '',
}: WeightTextProps) {
  const isNeg = isNegativeAmount(value);
  return (
    <span
      className={`erp-num inline-block text-right ${highlightNegative && isNeg ? 'text-[#9e3b33] font-medium' : 'text-[#1f1e1b]'} ${className}`}
    >
      {formatWeight(value, unit)}
    </span>
  );
}

export interface IntegerTextProps {
  readonly value: NumericInput;
  readonly className?: string;
}

export function IntegerText({ value, className = '' }: IntegerTextProps) {
  return (
    <span className={`erp-num inline-block text-right text-[#1f1e1b] ${className}`}>
      {formatInteger(value)}
    </span>
  );
}
