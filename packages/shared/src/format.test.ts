import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { formatInteger, formatMoney, formatWeight, isNegativeAmount } from './format.js';
import { paginationQuerySchema } from './pagination.js';

describe('formatMoney', () => {
  it('formats to 2 decimal places with thousand separators', () => {
    expect(formatMoney('50000')).toBe('50,000.00');
    expect(formatMoney(new Decimal('68.75'))).toBe('68.75');
    expect(formatMoney('1234567.891')).toBe('1,234,567.89');
  });

  it('includes currency prefix when provided', () => {
    expect(formatMoney('1125.5', 'PKR')).toBe('PKR 1,125.50');
  });

  it('handles negative and zero values cleanly', () => {
    expect(formatMoney('-1250.5')).toBe('-1,250.50');
    expect(formatMoney('-0.0001')).toBe('0.00');
    expect(isNegativeAmount('-1250.5')).toBe(true);
    expect(isNegativeAmount('0')).toBe(false);
  });
});

describe('formatWeight', () => {
  it('formats to 3 decimal places with thousand separators', () => {
    expect(formatWeight('1000')).toBe('1,000.000');
    expect(formatWeight(new Decimal('800.25'), 'KG')).toBe('800.250 KG');
  });
});

describe('formatInteger', () => {
  it('formats integers with thousand separators', () => {
    expect(formatInteger(25000)).toBe('25,000');
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults and validates allowed pageSizes', () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sortOrder: 'desc',
    });
    expect(paginationQuerySchema.safeParse({ pageSize: 33 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: 2, pageSize: 50 }).success).toBe(true);
  });
});
