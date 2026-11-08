import { describe, expect, it } from 'vitest';
import { calculateSaleLineAmounts } from './sales.js';
import { calculateSaleReturnAmounts } from './sale-returns.js';

describe('Sales Calculations', () => {
  it('calculates line subtotal, tax, cogs from snapshot, and profit correctly', () => {
    // 50 kg sold at 150/kg, batch cost snapshot is 120/kg, tax 10%
    const res = calculateSaleLineAmounts({
      enteredQty: '50.000',
      conversionFactor: '1.000',
      ratePerEnteredUnit: '150.00',
      taxRate: '10.00',
      batchCostRateSnapshot: '120.00',
    });

    expect(res.qtyBase).toBe('50.000');
    expect(res.lineSubtotal).toBe('7500.00'); // 50 * 150
    expect(res.taxAmount).toBe('750.00'); // 10% of 7500
    expect(res.lineTotal).toBe('8250.00'); // 7500 + 750
    expect(res.lineCogs).toBe('6000.00'); // 50 * 120
    expect(res.lineProfit).toBe('1500.00'); // 7500 - 6000
  });

  it('handles alternate units with conversion factor correctly', () => {
    // 2 bags (50 kg each = 100 kg total) sold at 8000 per bag
    const res = calculateSaleLineAmounts({
      enteredQty: '2.000',
      conversionFactor: '50.000',
      ratePerEnteredUnit: '8000.00',
      taxRate: '0.00',
      batchCostRateSnapshot: '140.00',
    });

    expect(res.qtyBase).toBe('100.000');
    expect(res.lineSubtotal).toBe('16000.00');
    expect(res.lineCogs).toBe('14000.00'); // 100 * 140
    expect(res.lineProfit).toBe('2000.00'); // 16000 - 14000
  });
});

describe('Sale Return Calculations', () => {
  it('reverses COGS for resaleable returns', () => {
    const res = calculateSaleReturnAmounts({
      enteredQty: '10.000',
      conversionFactor: '1.000',
      ratePerBase: '150.00',
      taxRate: '10.00',
      batchCostRateSnapshot: '120.00',
      condition: 'RESALEABLE',
    });

    expect(res.lineSubtotal).toBe('1500.00');
    expect(res.taxAmount).toBe('150.00');
    expect(res.lineTotal).toBe('1650.00');
    expect(res.cogsReversed).toBe('1200.00'); // 10 * 120
    expect(res.lossAmount).toBe('0.00');
  });

  it('records cost as loss for damaged returns without reversing COGS', () => {
    const res = calculateSaleReturnAmounts({
      enteredQty: '5.000',
      conversionFactor: '1.000',
      ratePerBase: '150.00',
      taxRate: '0.00',
      batchCostRateSnapshot: '120.00',
      condition: 'DAMAGED',
    });

    expect(res.lineSubtotal).toBe('750.00');
    expect(res.lineTotal).toBe('750.00');
    expect(res.cogsReversed).toBe('0.00');
    expect(res.lossAmount).toBe('600.00'); // 5 * 120 becomes return damage loss
  });
});
