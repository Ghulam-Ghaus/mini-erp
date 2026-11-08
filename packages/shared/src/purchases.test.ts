import { describe, expect, it } from 'vitest';
import { convertToBaseUnitQty } from './items.js';
import { formatDocumentNumber } from './numbering.js';
import { calculatePurchaseLineAmounts } from './purchases.js';

describe('Phase 3 shared calculations & formatting', () => {
  it('formats gapless document numbers with zero-padded sequence', () => {
    expect(formatDocumentNumber('PUR', 2026, 1)).toBe('PUR-2026-0001');
    expect(formatDocumentNumber('PAY-OUT', 2026, 42, 4)).toBe('PAY-OUT-2026-0042');
  });

  it('converts alternate units (e.g. Bags to KG) to 3 decimal places without float drift', () => {
    expect(convertToBaseUnitQty('10', '50.000')).toBe('500.000');
    expect(convertToBaseUnitQty('3.5', '40')).toBe('140.000');
  });

  it('calculates purchase line subtotal, ratePerBase, tax and total accurately', () => {
    // 10 Bags at 11,000 per Bag, actual weighed kg = 498.500 kg, 0% tax
    const line = calculatePurchaseLineAmounts({
      enteredQty: '10',
      qtyBase: '498.500',
      ratePerEnteredUnit: '11000',
      taxRate: '0',
    });

    expect(line.lineSubtotal).toBe('110000.00');
    expect(line.ratePerBase).toBe('220.6620'); // 110000 / 498.5 = 220.6619859...
    expect(line.taxAmount).toBe('0.00');
    expect(line.lineTotal).toBe('110000.00');
  });

  it('calculates optional GST tax on purchase lines', () => {
    const line = calculatePurchaseLineAmounts({
      enteredQty: '100',
      qtyBase: '100',
      ratePerEnteredUnit: '150.25',
      taxRate: '18',
    });

    expect(line.lineSubtotal).toBe('15025.00');
    expect(line.taxAmount).toBe('2704.50');
    expect(line.lineTotal).toBe('17729.50');
  });
});
