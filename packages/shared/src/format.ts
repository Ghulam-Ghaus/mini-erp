import { Decimal } from 'decimal.js';

export type NumericInput = Decimal | number | string;

function toDecimal(value: NumericInput): Decimal {
  if (value instanceof Decimal) return value;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (trimmed === '' || trimmed === null || trimmed === undefined) {
    return new Decimal(0);
  }
  return new Decimal(trimmed);
}

function addThousandSeparators(fixed: string): string {
  const isNegative = fixed.startsWith('-');
  const unsigned = isNegative ? fixed.slice(1) : fixed;
  const [intPart = '0', decPart] = unsigned.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
  return isNegative && unsigned !== '0' && !/^0(\.0+)?$/.test(unsigned)
    ? `-${formatted}`
    : formatted;
}

/**
 * Formats a money amount to 2 decimal places with thousand separators using Decimal (no floating point).
 * Example: "12345.6" -> "12,345.60"
 */
export function formatMoney(value: NumericInput, currency?: string): string {
  const d = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const formatted = addThousandSeparators(d.toFixed(2));
  return currency ? `${currency} ${formatted}` : formatted;
}

/**
 * Formats a base-unit weight (kg) to 3 decimal places with thousand separators using Decimal.
 * Example: "1000" -> "1,000.000"
 */
export function formatWeight(value: NumericInput, unit?: string): string {
  const d = toDecimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const formatted = addThousandSeparators(d.toFixed(3));
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Formats an integer quantity/count with thousand separators.
 */
export function formatInteger(value: NumericInput): string {
  const d = toDecimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return addThousandSeparators(d.toFixed(0));
}

/**
 * Returns true if the numeric value is strictly less than zero.
 */
export function isNegativeAmount(value: NumericInput): boolean {
  try {
    return toDecimal(value).isNegative() && !toDecimal(value).isZero();
  } catch {
    return false;
  }
}
